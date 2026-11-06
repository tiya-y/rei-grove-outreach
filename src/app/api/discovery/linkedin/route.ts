import { NextRequest, NextResponse } from 'next/server';
import { findLinkedInProfiles, isSearchEnabled } from '@/lib/search';
import { insertDiscoveredCandidates, splitName } from '@/lib/discoveryInsert';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';

// POST /api/discovery/linkedin — Body: { title, topic?, location?, nicheKey? }
// Finds public LinkedIn profiles by job title and topic through Google
// results (LinkedIn has no public API, and this never touches LinkedIn
// itself, only what Google shows for each profile). Each person lands with
// name, title, company, and the full profile URL exactly as Google returned
// it. See lib/search.ts for the title parsing and its limits.
export async function POST(req: NextRequest) {
  if (!isSearchEnabled()) {
    return NextResponse.json({ error: 'SERPER_API_KEY is not configured. Needed to search Google for LinkedIn profiles.' }, { status: 400 });
  }

  const { title, topic, location, nicheKey } = (await req.json()) as { title?: string; topic?: string; location?: string; nicheKey?: string };
  if (!title?.trim()) return NextResponse.json({ error: 'A job title keyword is required.' }, { status: 400 });

  const niche = nicheKey ? CREATOR_DISCOVERY_NICHES.find((n) => n.key === nicheKey) : undefined;

  let found;
  try {
    found = await findLinkedInProfiles(title, topic ?? '', location ?? '');
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'LinkedIn search failed' }, { status: 502 });
  }

  if (found.profiles.length === 0) {
    return NextResponse.json({
      results: [],
      created: 0,
      batchId: null,
      message: `Google returned ${found.totalResults} result(s) but none were public LinkedIn profiles with a readable name. Try different keywords.`,
    });
  }

  const candidates = found.profiles.map((p) => {
    const { first, last } = splitName(p.name);
    return {
      name: p.name,
      domain: null,
      website: p.url,
      category: 'other',
      contentPresence: `LinkedIn profile found through Google: ${[p.title, p.company].filter(Boolean).join(' at ') || 'headline not shown'}.`,
      contactFirstName: first,
      contactLastName: last,
      contactTitle: p.title,
      linkedinUrl: p.url,
      companyName: p.company,
    };
  });

  try {
    const label = [title, topic, location].filter(Boolean).join(', ');
    const { results, created, batchId } = await insertDiscoveredCandidates(
      candidates,
      `LinkedIn: ${label}`,
      label,
      niche?.key ?? null,
      `linkedin via google (${label})`,
      'discovery'
    );
    return NextResponse.json({ results, created, batchId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save results' }, { status: 500 });
  }
}
