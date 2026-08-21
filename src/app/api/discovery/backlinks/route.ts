import { NextRequest, NextResponse } from 'next/server';
import { getReferringDomains, isAhrefsEnabled } from '@/lib/ahrefs';
import { insertDiscoveredCandidates } from '@/lib/discoveryInsert';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';

function normalizeDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

// POST /api/discovery/backlinks — Body: { referenceDomain, nicheKey? }
// Finds real domains that already link to `referenceDomain` (e.g.
// biggerpockets.com) via Ahrefs' backlink data — sites already engaging
// with a comparable real-estate resource are natural partnership targets.
// Same dedupe/batch/insert path as keyword search (see
// lib/discoveryInsert.ts).
export async function POST(req: NextRequest) {
  if (!isAhrefsEnabled()) {
    return NextResponse.json({ error: 'Ahrefs is not configured (AHREFS_API_KEY missing) — required for backlink discovery.' }, { status: 400 });
  }

  const { referenceDomain, nicheKey } = (await req.json()) as { referenceDomain: string; nicheKey?: string };
  if (!referenceDomain?.trim()) return NextResponse.json({ error: 'referenceDomain is required' }, { status: 400 });

  const domain = normalizeDomain(referenceDomain);
  const niche = nicheKey ? CREATOR_DISCOVERY_NICHES.find((n) => n.key === nicheKey) : undefined;

  let candidates;
  try {
    candidates = await getReferringDomains(domain, 50);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Backlink lookup failed' }, { status: 502 });
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      results: [],
      created: 0,
      batchId: null,
      message: `No usable referring domains found for "${domain}" — it may be too small for Ahrefs to have backlink data, or everything found was a general platform. Try a different reference domain.`,
    });
  }

  try {
    const { results, created, batchId } = await insertDiscoveredCandidates(
      candidates,
      `Backlinks: ${domain}`,
      domain,
      niche?.key ?? null,
      `ahrefs backlinks (${domain})`
    );
    return NextResponse.json({ results, created, batchId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save results' }, { status: 500 });
  }
}
