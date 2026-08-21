import { NextRequest, NextResponse } from 'next/server';
import { discoverDomainsForNiche, isAhrefsEnabled, type DiscoveryResultType } from '@/lib/ahrefs';
import { insertDiscoveredCandidates } from '@/lib/discoveryInsert';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';

// POST /api/discovery/search — Body: { nicheKey, resultType? }
// Runs the niche's keywords through Ahrefs SERP Overview to find real,
// currently-ranking sites, YouTube videos, and/or forum threads (no LLM
// guessing), dedupes against existing prospects, and inserts the new ones
// as "new" prospects tagged with that niche, grouped into one batch
// (visible under History) — same pattern as the n8n bulk-import webhook.
export async function POST(req: NextRequest) {
  if (!isAhrefsEnabled()) {
    return NextResponse.json({ error: 'Ahrefs is not configured (AHREFS_API_KEY missing) — required for creator discovery. Add prospects manually or via n8n instead.' }, { status: 400 });
  }

  const { nicheKey, resultType } = (await req.json()) as { nicheKey: string; resultType?: DiscoveryResultType };
  const niche = CREATOR_DISCOVERY_NICHES.find((n) => n.key === nicheKey);
  if (!niche) return NextResponse.json({ error: 'Unknown niche' }, { status: 400 });

  const { candidates, errors, debug } = await discoverDomainsForNiche(niche.keywords, niche.targetCount, resultType ?? 'all');

  if (candidates.length === 0) {
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' | ') }, { status: 502 });
    }
    const message =
      debug.rawPositions === 0
        ? `Ahrefs returned zero results across all ${niche.keywords.length} keyword(s) for this niche — try a different "Where to look" filter.`
        : `Checked ${debug.rawPositions} result(s) across ${niche.keywords.length} keyword(s): ${debug.droppedAsPlatform} were general platforms (Reddit, Wikipedia, etc.), ${debug.droppedNoRating} had no Domain Rating data. Nothing usable was left — try a different "Where to look" filter.`;
    return NextResponse.json({ results: [], created: 0, batchId: null, message });
  }

  try {
    const { results, created, batchId } = await insertDiscoveredCandidates(
      candidates,
      `Discovery: ${niche.label}`,
      niche.key,
      niche.key,
      'ahrefs serp'
    );
    return NextResponse.json({ results, created, batchId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save results' }, { status: 500 });
  }
}
