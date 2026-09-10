import { NextRequest, NextResponse } from 'next/server';
import { searchPodcastsForKeyword } from '@/lib/podcasts';
import { insertDiscoveredCandidates } from '@/lib/discoveryInsert';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';

// POST /api/discovery/podcasts — Body: { keyword, nicheKey? }
// Searches Apple's public Podcasts directory (iTunes Search API — no key or
// auth required) for real podcasts matching a keyword, and adds each host
// directly as a prospect when their name looks like an individual rather
// than a show/network brand. See lib/podcasts.ts for that filter and its
// known limits. Same dedupe/batch/insert path as every other discovery
// source (see lib/discoveryInsert.ts).
export async function POST(req: NextRequest) {
  const { keyword, nicheKey } = (await req.json()) as { keyword: string; nicheKey?: string };
  if (!keyword?.trim()) return NextResponse.json({ error: 'keyword is required' }, { status: 400 });

  const niche = nicheKey ? CREATOR_DISCOVERY_NICHES.find((n) => n.key === nicheKey) : undefined;

  let result;
  try {
    result = await searchPodcastsForKeyword(keyword.trim());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Podcast search failed' }, { status: 502 });
  }

  if (result.candidates.length === 0) {
    return NextResponse.json({
      results: [],
      created: 0,
      batchId: null,
      message: `Checked ${result.totalResults} podcast(s) for "${keyword}" — none had a host name that looked like an individual (network/branded shows are filtered out). Try a different keyword.`,
    });
  }

  try {
    const { results, created, batchId } = await insertDiscoveredCandidates(
      result.candidates,
      `Podcasts: ${keyword}`,
      keyword,
      niche?.key ?? null,
      `itunes podcast search (${keyword})`,
      'discovery'
    );
    return NextResponse.json({ results, created, batchId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save results' }, { status: 500 });
  }
}
