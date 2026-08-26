import { NextRequest, NextResponse } from 'next/server';
import { searchChannelsForKeyword, isYoutubeEnabled } from '@/lib/youtube';
import { insertDiscoveredCandidates, type DiscoveryCandidate } from '@/lib/discoveryInsert';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';

// POST /api/discovery/youtube — Body: { nicheKey }
// Finds real YouTube channels for a niche's keywords via YouTube's own
// search (youtube.com/api), not Ahrefs — a free, separate discovery source.
// Reuses the same real-estate-anchored keyword lists as the Ahrefs keyword
// search so there's one keyword list per niche, not two to keep in sync.
export async function POST(req: NextRequest) {
  if (!isYoutubeEnabled()) {
    return NextResponse.json(
      { error: 'YouTube isn’t configured (YOUTUBE_API_KEY missing) — add a free YouTube Data API key to enable this.' },
      { status: 400 }
    );
  }

  const { nicheKey } = (await req.json()) as { nicheKey: string };
  const niche = CREATOR_DISCOVERY_NICHES.find((n) => n.key === nicheKey);
  if (!niche) return NextResponse.json({ error: 'Unknown niche' }, { status: 400 });

  const byChannel = new Map<string, DiscoveryCandidate>();
  const errors: string[] = [];
  let totalChecked = 0;

  for (const keyword of niche.keywords) {
    try {
      const { candidates, totalResults } = await searchChannelsForKeyword(keyword, niche.targetCount);
      totalChecked += totalResults;
      for (const c of candidates) {
        if (c.website && !byChannel.has(c.website)) byChannel.set(c.website, c);
      }
    } catch (err) {
      errors.push(`"${keyword}" — ${err instanceof Error ? err.message : 'YouTube search failed'}`);
    }
  }

  const candidates = Array.from(byChannel.values()).slice(0, niche.targetCount);

  if (candidates.length === 0) {
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' | ') }, { status: 502 });
    }
    const message =
      totalChecked === 0
        ? `YouTube found no channels across ${niche.keywords.length} keyword(s) for this niche — try a different niche.`
        : `Checked ${totalChecked} channel result(s) across ${niche.keywords.length} keyword(s) but none had usable data — try a different niche.`;
    return NextResponse.json({ results: [], created: 0, batchId: null, message });
  }

  try {
    const { results, created, batchId } = await insertDiscoveredCandidates(
      candidates,
      `YouTube: ${niche.label}`,
      niche.key,
      niche.key,
      'youtube api',
      'discovery'
    );
    return NextResponse.json({ results, created, batchId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save results' }, { status: 500 });
  }
}
