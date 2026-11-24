import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { generateInitialDraft } from '@/lib/outreachDraft';
import { saveDraft } from '@/lib/draftStore';
import { isProgramKey, PROGRAMS, type ProgramKey } from '@/lib/affiliatePrograms';
import { firstEmailBlocker } from '@/lib/eligibility';
import type { Prospect } from '@/types';

export const maxDuration = 60;

// POST /api/outreach/generate — the Outreach tab's "Generate initial emails".
// Generates the first affiliate email for ONE prospect and ONE program
// (REI Grove or Innago) and stores it as their draft for that program. The tab
// calls this once per checked row per chosen program. Eligibility (email on
// file, not disqualified/unsubscribed, that program's first email not yet
// sent) is enforced here too, so a bulk run can't produce an email for someone
// who shouldn't get one.
// Body: { prospectId, program }
export async function POST(req: NextRequest) {
  const { prospectId, program: rawProgram } = await req.json();
  if (!prospectId) return NextResponse.json({ error: 'prospectId is required' }, { status: 400 });
  if (!isProgramKey(rawProgram)) return NextResponse.json({ error: 'program must be "reigrove" or "innago"' }, { status: 400 });
  const program: ProgramKey = rawProgram;

  let prospect;
  try {
    [prospect] = await sql`select * from prospects where id = ${prospectId}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  let alreadySent: ProgramKey[];
  try {
    const sent = await sql`
      select distinct case when offer_type = 'innago_affiliate' then 'innago' else 'reigrove' end as program
      from messages where prospect_id = ${prospectId} and direction = 'outbound' and sequence_step = 1 and status = 'sent'
    `;
    alreadySent = sent.map((r) => r.program as ProgramKey);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  const blocker = firstEmailBlocker(prospect as Prospect, program, alreadySent);
  if (blocker) return NextResponse.json({ error: `${blocker}.` }, { status: 400 });

  try {
    const draft = await generateInitialDraft(prospect as Prospect, program);
    const saved = await saveDraft(prospect.id, {
      subject: draft.subject,
      body: draft.body,
      program,
      offerType: PROGRAMS[program].offerType,
      sequenceStep: 1,
      aiGenerated: draft.source === 'examples',
      source: draft.source,
    });
    return NextResponse.json({ draft: saved });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Draft generation failed' }, { status: 500 });
  }
}
