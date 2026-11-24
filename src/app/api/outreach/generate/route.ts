import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { generateInitialDraft } from '@/lib/outreachDraft';
import { saveDraft } from '@/lib/draftStore';
import type { Prospect } from '@/types';

export const maxDuration = 60;

// POST /api/outreach/generate — the Outreach tab's "Generate initial emails".
// Generates the first affiliate email for ONE prospect and stores it as their
// current draft (the tab calls this once per checked row). Only prospects that
// are approved, have an email, are not disqualified or unsubscribed, and have
// not been contacted yet are eligible, so a bulk run can't produce an email
// for someone who shouldn't get one.
// Body: { prospectId }
export async function POST(req: NextRequest) {
  const { prospectId } = await req.json();
  if (!prospectId) return NextResponse.json({ error: 'prospectId is required' }, { status: 400 });

  let prospect;
  try {
    [prospect] = await sql`select * from prospects where id = ${prospectId}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  if (prospect.disqualified) return NextResponse.json({ error: `Disqualified (${prospect.disqualify_reason}).` }, { status: 400 });
  if (prospect.unsubscribed) return NextResponse.json({ error: 'This prospect has unsubscribed.' }, { status: 400 });
  if (!prospect.email) return NextResponse.json({ error: 'No email address yet. Reveal it first.' }, { status: 400 });
  if (prospect.stage !== 'approved') {
    return NextResponse.json({ error: `Already past the first email (stage: ${prospect.stage}). Use the prospect's page for follow-ups.` }, { status: 400 });
  }

  try {
    const draft = await generateInitialDraft(prospect as Prospect);
    const saved = await saveDraft(prospect.id, {
      subject: draft.subject,
      body: draft.body,
      offerType: 'affiliate_terms',
      sequenceStep: 1,
      aiGenerated: draft.source === 'examples',
      source: draft.source,
    });
    return NextResponse.json({ draft: saved });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Draft generation failed' }, { status: 500 });
  }
}
