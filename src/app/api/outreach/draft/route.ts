import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { generateOutreachEmail } from '@/lib/claude';
import { generateInitialDraft } from '@/lib/outreachDraft';
import { saveDraft } from '@/lib/draftStore';
import { toProgram, PROGRAMS } from '@/lib/affiliatePrograms';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';
import type { Prospect } from '@/types';

export const maxDuration = 60;

// POST /api/outreach/draft — generate copy for one prospect (used by the
// composer on a prospect's page). Nothing is sent.
// Body: { prospectId, offerType?, sequenceStep?, program?, save? }
//
// The initial email (sequenceStep 1) to a creator/affiliate prospect is built
// by lib/outreachDraft.ts: the fixed affiliate template, or Claude writing from
// the example emails the team uploaded, with the offer terms and links checked
// in code. Partner-type prospects and every follow-up step go through Claude's
// general drafting prompt. With save: true the result is also stored as the
// prospect's current draft.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.prospectId) return NextResponse.json({ error: 'prospectId is required' }, { status: 400 });

  let prospect;
  try {
    [prospect] = await sql`select * from prospects where id = ${body.prospectId}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  if (prospect.disqualified) {
    return NextResponse.json({ error: `This prospect is disqualified (${prospect.disqualify_reason}). Remove the disqualification before drafting outreach.` }, { status: 400 });
  }

  const sequenceStep = body.sequenceStep ?? 1;
  const program = toProgram(body.program);
  const isCreatorOrAffiliate = prospect.prospect_type === 'creator' || prospect.prospect_type === 'affiliate';

  try {
    let draft: { subject: string; body: string; source?: string };
    let aiGenerated = true;

    if (isCreatorOrAffiliate && sequenceStep === 1) {
      draft = await generateInitialDraft(prospect as Prospect, program);
      aiGenerated = draft.source === 'examples';
    } else {
      draft = {
        ...(await generateOutreachEmail({
          prospectName: prospect.name,
          prospectType: prospect.prospect_type,
          contactFirstName: prospect.contact_first_name ?? undefined,
          category: prospect.category ?? undefined,
          niche: CREATOR_DISCOVERY_NICHES.find((n) => n.key === prospect.niche)?.label ?? prospect.niche ?? undefined,
          website: prospect.website ?? undefined,
          contentNotes: prospect.content_presence ?? prospect.notes ?? undefined,
          offerType: body.offerType,
          sequenceStep,
        })),
        source: 'claude',
      };
    }

    if (body.save) {
      await saveDraft(prospect.id, { subject: draft.subject, body: draft.body, program: isCreatorOrAffiliate && sequenceStep === 1 ? program : 'reigrove', offerType: isCreatorOrAffiliate && sequenceStep === 1 ? PROGRAMS[program].offerType : body.offerType, sequenceStep, aiGenerated, source: draft.source });
    }
    return NextResponse.json({ draft: { ...draft, aiGenerated } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Draft generation failed' }, { status: 500 });
  }
}
