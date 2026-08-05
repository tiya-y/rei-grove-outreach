import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getDomainMetrics, isAhrefsEnabled } from '@/lib/ahrefs';

// POST /api/ahrefs/lookup — Body: { prospectId }
// Pulls Domain Rating + organic traffic for the prospect's website and saves
// it to the row, so the scoring UI can use real numbers for the
// "Audience Size" / "Content Presence" dimensions instead of a guess.
export async function POST(req: NextRequest) {
  if (!isAhrefsEnabled()) {
    return NextResponse.json({ error: 'Ahrefs is not configured (AHREFS_API_KEY missing). This step is optional — score manually instead.' }, { status: 400 });
  }

  const db = createServiceClient();
  const { prospectId } = await req.json();
  const { data: prospect, error } = await db.from('prospects').select('id,website').eq('id', prospectId).single();
  if (error || !prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  if (!prospect.website) return NextResponse.json({ error: 'Prospect has no website on file' }, { status: 400 });

  const domain = prospect.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const [metrics] = await getDomainMetrics([domain]);

  const { data: updated, error: updateErr } = await db
    .from('prospects')
    .update({ domain_rating: metrics.domainRating, organic_traffic_est: metrics.organicTraffic })
    .eq('id', prospectId)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ prospect: updated, metrics });
}
