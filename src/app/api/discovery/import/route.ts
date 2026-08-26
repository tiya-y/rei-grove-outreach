import { NextRequest, NextResponse } from 'next/server';
import { domainFromUrl } from '@/lib/ahrefs';
import { insertDiscoveredCandidates, type DiscoveryCandidate } from '@/lib/discoveryInsert';
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

// POST /api/discovery/import — Body: { text, sourceLabel, nicheKey? }
// For creators found by browsing a paywalled tool with no public API
// (Heepsy, Google Ads' YouTube Creator Partnerships hub, or anything else) —
// paste "Name, link" one per line and it runs through the same
// dedupe/blocklist/batch pipeline as every automated discovery source.
export async function POST(req: NextRequest) {
  const { text, sourceLabel, nicheKey } = (await req.json()) as { text: string; sourceLabel: string; nicheKey?: string };
  if (!text?.trim()) return NextResponse.json({ error: 'Paste at least one prospect first.' }, { status: 400 });
  if (!sourceLabel?.trim()) return NextResponse.json({ error: 'sourceLabel is required' }, { status: 400 });

  const niche = nicheKey ? CREATOR_DISCOVERY_NICHES.find((n) => n.key === nicheKey) : undefined;

  const candidates: DiscoveryCandidate[] = [];
  const skipped: string[] = [];
  for (const line of text.split('\n')) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (!parsed.link) {
      skipped.push(`"${parsed.name}" — no link, skipped (need at least a URL to dedupe and follow up on)`);
      continue;
    }
    candidates.push({
      name: parsed.name,
      domain: domainFromUrl(parsed.link),
      website: parsed.link,
      category: isYouTubeUrl(parsed.link) ? 'youtube' : null,
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
