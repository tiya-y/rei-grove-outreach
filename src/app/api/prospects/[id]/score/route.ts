import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
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
  const { searchParams } = new URL(req.url);
  const assist = searchParams.get('assist') === '1';
  const body = await req.json();

  let prospect;
  try {
    [prospect] = await sql`select * from prospects where id = ${params.id}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

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

  try {
    const [updated] = await sql`
      update prospects set score = ${result.total}, score_breakdown = ${JSON.stringify(result)}
      where id = ${params.id}
      returning *
    `;

    await sql`
      insert into activity_log (prospect_id, event_type, detail)
      values (${params.id}, 'scored', ${`Score set to ${result.total} (${result.tier})`})
    `;

    return NextResponse.json({ prospect: updated, score: result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 500 });
  }
}
