import { NextRequest, NextResponse } from 'next/server';
import { domainFromUrl } from '@/lib/ahrefs';
import { insertDiscoveredCandidates, type DiscoveryCandidate } from '@/lib/discoveryInsert';
import { parseCreatorCsv } from '@/lib/csvImport';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';

function isYouTubeUrl(url: string): boolean {
  const domain = domainFromUrl(url);
  return domain === 'youtube.com' || domain === 'm.youtube.com' || domain === 'youtu.be';
}

// Splits "Name, https://..." or "Name<TAB>https://..." into [name, link].
// A bare name with no link is still accepted (link stays undefined).
function parseLine(line: string): { name: string; link: string | undefined } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const sepIndex = trimmed.includes('\t') ? trimmed.indexOf('\t') : trimmed.indexOf(',');
  if (sepIndex === -1) return { name: trimmed, link: undefined };
  const name = trimmed.slice(0, sepIndex).trim();
  const link = trimmed.slice(sepIndex + 1).trim();
  if (!name) return null;
  return { name, link: link || undefined };
}

// POST /api/discovery/import — Body: { text, sourceLabel, nicheKey? } OR { csv, sourceLabel, nicheKey? }
// For creators found by browsing a paywalled tool with no public API
// (Heepsy, Google Ads' YouTube Creator Partnerships hub, or anything else) —
// either paste "Name, link" one per line, or (for Heepsy, which does export
// CSV/XLS) upload that export directly via `csv`. Both paths run through the
// same dedupe/blocklist/batch pipeline as every automated discovery source.
export async function POST(req: NextRequest) {
  const { text, csv, sourceLabel, nicheKey } = (await req.json()) as {
    text?: string;
    csv?: string;
    sourceLabel: string;
    nicheKey?: string;
  };
  if (!text?.trim() && !csv?.trim()) return NextResponse.json({ error: 'Paste at least one prospect, or upload a CSV, first.' }, { status: 400 });
  if (!sourceLabel?.trim()) return NextResponse.json({ error: 'sourceLabel is required' }, { status: 400 });

  const niche = nicheKey ? CREATOR_DISCOVERY_NICHES.find((n) => n.key === nicheKey) : undefined;

  let candidates: DiscoveryCandidate[] = [];
  let skipped: string[] = [];

  if (csv?.trim()) {
    let parsed;
    try {
      parsed = parseCreatorCsv(csv);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not read that CSV' }, { status: 400 });
    }
    candidates = parsed.candidates;
    skipped = parsed.skipped;
    if (candidates.length === 0) {
      const { name, link, email, audience } = parsed.detectedHeaders;
      return NextResponse.json({
        results: [],
        created: 0,
        batchId: null,
        message: `Nothing usable in that CSV. Detected columns — name: ${name ?? 'not found'}, link: ${link ?? 'not found'}, email: ${email ?? 'none'}, audience: ${audience ?? 'none'}.${skipped.length > 0 ? ` (${skipped.join('; ')})` : ''}`,
      });
    }
  } else {
    for (const line of (text as string).split('\n')) {
      const parsedLine = parseLine(line);
      if (!parsedLine) continue;
      if (!parsedLine.link) {
        skipped.push(`"${parsedLine.name}" — no link, skipped (need at least a URL to dedupe and follow up on)`);
        continue;
      }
      candidates.push({
        name: parsedLine.name,
        domain: domainFromUrl(parsedLine.link),
        website: parsedLine.link,
        category: isYouTubeUrl(parsedLine.link) ? 'youtube' : null,
        contentPresence: `Manually added from ${sourceLabel}.`,
      });
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        results: [],
        created: 0,
        batchId: null,
        message: skipped.length > 0 ? `Nothing added — ${skipped.join('; ')}` : 'Nothing to add — paste one prospect per line as "Name, link".',
      });
    }
  }

  try {
    const { results, created, batchId } = await insertDiscoveredCandidates(
      candidates,
      `Manual import: ${sourceLabel}`,
      null,
      niche?.key ?? null,
      `manual (${sourceLabel})`,
      'manual'
    );
    return NextResponse.json({ results: [...results, ...skipped.map((s) => ({ name: s, status: 'error' as const }))], created, batchId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save results' }, { status: 500 });
  }
}
