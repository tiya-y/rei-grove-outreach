import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { computeScore, type ScoreDimensionInput, type ProspectType, type CreatorChannel } from '@/lib/scoring';
import { suggestScore } from '@/lib/claude';

// POST /api/prospects/:id/score
// Body: { dimensions: [{key, points, estimated?, notes?}], channel? }
//   -> saves a manually-set (or AI-assisted, then edited) score.
// POST /api/prospects/:id/score?assist=1
// Body: { researchNotes: string, channel? }
//   -> asks Claude to suggest dimension points from free-text research notes;
//      returns the suggestion WITHOUT saving, so the team can review/edit first.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServiceClient();
  const { searchParams } = new URL(req.url);
  const assist = searchParams.get('assist') === '1';
  const body = await req.json();

  const { data: prospect, error: fetchErr } = await db.from('prospects').select('*').eq('id', params.id).single();
  if (fetchErr || !prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  const prospectType = prospect.prospect_type as ProspectType;
  const channel = (body.channel ?? prospect.category ?? null) as CreatorChannel | null;

  if (assist) {
    if (!body.researchNotes) return NextResponse.json({ error: 'researchNotes is required for assist mode' }, { status: 400 });
    try {
      const suggestion = await suggestScore({
        prospectType,
        channel,
        name: prospect.name,
        website: prospect.website ?? undefined,
        researchNotes: body.researchNotes,
        domainRating: prospect.domain_rating,
        organicTraffic: prospect.organic_traffic_est,
        audienceSizeEst: prospect.audience_size_est,
      });
      return NextResponse.json({ suggestion });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Scoring assist failed' }, { status: 500 });
    }
  }

  const dimensions = (body.dimensions ?? []) as ScoreDimensionInput[];
  const result = computeScore(prospectType, channel, dimensions);

  const { data, error } = await db
    .from('prospects')
    .update({ score: result.total, score_breakdown: result })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('activity_log').insert({
    prospect_id: params.id,
    event_type: 'scored',
    detail: `Score set to ${result.total} (${result.tier})`,
  });

  return NextResponse.json({ prospect: data, score: result });
}
