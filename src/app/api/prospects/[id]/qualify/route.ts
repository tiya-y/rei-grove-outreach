import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';
import { isSearchEnabled } from '@/lib/search';
import { runRound, type Round } from '@/lib/qualify';
import type { Prospect } from '@/types';

// Each round makes a couple of searches and one model call.
export const maxDuration = 60;

const ROUNDS: Round[] = [1, 2, 3];

function statusOf(p: Prospect, round: Round) {
  return round === 1 ? p.round1_status : round === 2 ? p.round2_status : p.round3_status;
}

// POST /api/prospects/:id/qualify — Body: { round?: 1 | 2 | 3 }
// With no round, runs the first round that has no result yet. Rounds run in
// order and a round only runs if the one before it passed. Re-running a
// round (explicit `round`) clears the rounds after it, since their
// evidence no longer applies. Returns `next`: the round a caller looping
// over this prospect should run next, or null when the chain is finished
// (all three passed, or one failed).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 400 });
  }
  if (!isSearchEnabled()) {
    return NextResponse.json({ error: 'SERPER_API_KEY is not configured. Qualification needs it to gather evidence.' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { round?: number };
  if (body.round !== undefined && !ROUNDS.includes(body.round as Round)) {
    return NextResponse.json({ error: 'round must be 1, 2, or 3' }, { status: 400 });
  }

  let prospect: Prospect | undefined;
  let extraBlocklist: { name: string; reason: string }[] = [];
  try {
    await ensureSchema();
    [prospect] = (await sql`select * from prospects where id = ${params.id}`) as Prospect[];
    const [settings] = await sql`select competitor_blocklist from app_settings where id = 1`;
    extraBlocklist = settings?.competitor_blocklist ?? [];
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  let round: Round;
  if (body.round) {
    round = body.round as Round;
    if (round > 1 && statusOf(prospect, (round - 1) as Round) !== 'pass') {
      return NextResponse.json({ error: `Round ${round - 1} has to pass before round ${round} can run.` }, { status: 400 });
    }
  } else {
    const nextPending = ROUNDS.find((r) => !statusOf(prospect as Prospect, r));
    if (!nextPending) return NextResponse.json({ prospect, result: null, next: null, skipped: 'All three rounds already have a result.' });
    round = nextPending;
    if (round > 1 && statusOf(prospect, (round - 1) as Round) !== 'pass') {
      return NextResponse.json({ prospect, result: null, next: null, skipped: `Stopped at round ${round - 1}, which failed.` });
    }
  }

  let result;
  try {
    result = await runRound(round, prospect, extraBlocklist);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Qualification failed' }, { status: 502 });
  }

  const later = ROUNDS.filter((r) => r > round);
  const values: unknown[] = [result.status, result.reason, JSON.stringify(result.evidence)];
  const sets = [
    `round${round}_status = $1`,
    `round${round}_reason = $2`,
    `qualification_evidence = (coalesce(qualification_evidence, '{}'::jsonb)${later.map((r) => ` - 'round${r}'`).join('')}) || jsonb_build_object('round${round}', $3::jsonb)`,
  ];
  for (const r of later) sets.push(`round${r}_status = null`, `round${r}_reason = null`);
  if (result.linkedinUrl) {
    values.push(result.linkedinUrl);
    sets.push(`linkedin_url = coalesce(linkedin_url, $${values.length})`);
  }
  if (result.contactTitle) {
    values.push(result.contactTitle);
    sets.push(`contact_title = coalesce(contact_title, $${values.length})`);
  }
  values.push(params.id);

  try {
    const [updated] = await sql.query(`update prospects set ${sets.join(', ')} where id = $${values.length} returning *`, values);
    await sql`
      insert into activity_log (prospect_id, event_type, detail)
      values (${params.id}, 'qualification', ${`Round ${round} ${result.status}: ${result.reason}`})
    `;
    return NextResponse.json({
      prospect: updated,
      result: { round, status: result.status, reason: result.reason },
      next: result.status === 'pass' && round < 3 ? round + 1 : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 500 });
  }
}
