import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { recordSentOutreach } from '@/lib/outreachSend';

// POST /api/outreach/send — records an outreach email as "sent" and
// advances the pipeline. This app never sends email itself — whoever is
// running outreach copies the generated draft and sends it from their own
// inbox, then calls this to log it. Advances the prospect's stage to
// "reached_out" only if this is the initial send (stage was "approved");
// marking a manual follow-up sent from a later stage like "replied" leaves
// the stage as-is.
// Body: { prospectId, subject, body, offerType?, sequenceStep? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prospectId, subject, body: emailBody, offerType, sequenceStep } = body;

  if (!prospectId || !subject || !emailBody) {
    return NextResponse.json({ error: 'prospectId, subject, and body are required' }, { status: 400 });
  }

  let prospect;
  try {
    [prospect] = await sql`select * from prospects where id = ${prospectId}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  if (!prospect.email) return NextResponse.json({ error: 'Prospect has no email address on file' }, { status: 400 });
  if (prospect.disqualified) return NextResponse.json({ error: `Prospect is disqualified (${prospect.disqualify_reason})` }, { status: 400 });
  if (prospect.unsubscribed) return NextResponse.json({ error: 'This prospect has unsubscribed — recording a send is blocked.' }, { status: 400 });

  try {
    const message = await recordSentOutreach({
      prospectId,
      subject,
      bodyText: emailBody,
      offerType,
      sequenceStep: sequenceStep ?? 1,
      aiGenerated: Boolean(body.aiGenerated),
      activityDetail: `Marked "${subject}" as sent`,
    });
    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to record sent message' }, { status: 500 });
  }
}
