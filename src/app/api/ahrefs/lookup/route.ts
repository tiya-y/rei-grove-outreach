import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getDomainMetrics, isAhrefsEnabled } from '@/lib/ahrefs';

// POST /api/ahrefs/lookup — Body: { prospectId }
// Pulls Domain Rating + organic traffic for the prospect's website and saves
// it to the row, so the scoring UI can use real numbers for the
// "Audience Size" / "Content Presence" dimensions instead of a guess.
export async function POST(req: NextRequest) {
  if (!isAhrefsEnabled()) {
    return NextResponse.json({ error: 'Ahrefs is not configured (AHREFS_API_KEY missing). This step is optional — score manually instead.' }, { status: 400 });
  }

  const { prospectId } = await req.json();
  let prospect;
  try {
    [prospect] = await sql`select id, website from prospects where id = ${prospectId}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  if (!prospect.website) return NextResponse.json({ error: 'Prospect has no website on file' }, { status: 400 });

  const domain = prospect.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const [metrics] = await getDomainMetrics([domain]);

  try {
    const [updated] = await sql`
      update prospects set domain_rating = ${metrics.domainRating}, organic_traffic_est = ${metrics.organicTraffic}
      where id = ${prospectId}
      returning *
    `;
    return NextResponse.json({ prospect: updated, metrics });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 });
  }
}
