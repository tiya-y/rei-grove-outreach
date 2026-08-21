import { NextRequest, NextResponse } from 'next/server';
import { getOrganicCompetitors, isAhrefsEnabled } from '@/lib/ahrefs';

// POST /api/discovery/competitors — Body: { domain }
// Read-only helper for the backlinks-search UI: suggests other real
// organic-search competitor domains of `domain`, so Mose can pick a
// different reference domain to run backlink discovery against. Does not
// write anything to the database.
export async function POST(req: NextRequest) {
  if (!isAhrefsEnabled()) {
    return NextResponse.json({ error: 'Ahrefs is not configured (AHREFS_API_KEY missing).' }, { status: 400 });
  }

  const { domain } = (await req.json()) as { domain: string };
  if (!domain?.trim()) return NextResponse.json({ error: 'domain is required' }, { status: 400 });

  try {
    const competitors = await getOrganicCompetitors(domain.trim().replace(/^https?:\/\//, '').replace(/^www\./, ''), 10);
    return NextResponse.json({ competitors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Competitor lookup failed' }, { status: 502 });
  }
}
