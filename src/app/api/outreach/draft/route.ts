import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { generateOutreachEmail } from '@/lib/claude';
import { renderAffiliateInitialEmail } from '@/lib/outreachTemplates';
import { CREATOR_DISCOVERY_NICHES, DEFAULT_AUDIENCE_LABEL } from '@/lib/rei-grove-content';

// POST /api/outreach/draft — generate copy without sending or saving.
// Body: { prospectId, offerType?, sequenceStep? }
//
// The initial email (sequenceStep 1) to a creator/affiliate prospect uses
// the team's fixed affiliate-offer template (see lib/outreachTemplates.ts)
// rather than an AI draft, so the compensation terms and links never drift.
// Partner-type prospects, and every follow-up step, still go through Claude.
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
  const isCreatorOrAffiliate = prospect.prospect_type === 'creator' || prospect.prospect_type === 'affiliate';

  if (isCreatorOrAffiliate && sequenceStep === 1) {
    const audienceLabel = CREATOR_DISCOVERY_NICHES.find((n) => n.key === prospect.niche)?.audienceLabel ?? DEFAULT_AUDIENCE_LABEL;
    const draft = renderAffiliateInitialEmail({
      firstName: prospect.contact_first_name ?? 'there',
      audienceLabel,
    });
    return NextResponse.json({ draft });
  }

  try {
    const draft = await generateOutreachEmail({
      prospectName: prospect.name,
      prospectType: prospect.prospect_type,
      contactFirstName: prospect.contact_first_name ?? undefined,
      category: prospect.category ?? undefined,
      niche: CREATOR_DISCOVERY_NICHES.find((n) => n.key === prospect.niche)?.label ?? prospect.niche ?? undefined,
      website: prospect.website ?? undefined,
      contentNotes: prospect.content_presence ?? prospect.notes ?? undefined,
      offerType: body.offerType,
      sequenceStep,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Draft generation failed' }, { status: 500 });
  }
}
