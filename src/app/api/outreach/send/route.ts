import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getActiveMailboxConnection, getValidAccessTokenForConnection, sendAndRecordOutreach } from '@/lib/outreachSend';

// POST /api/outreach/send — actually sends via the connected Outlook mailbox
// and logs the message. Advances the prospect's stage to "reached_out" only
// if this is the initial send (stage was "approved"); a manual reply sent
// from a later stage like "replied" leaves the stage as-is.
// Body: { prospectId, subject, body (plain text or HTML), offerType?, sequenceStep? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prospectId, subject, body: emailBody, offerType, sequenceStep } = body;

  if (!prospectId || !subject || !emailBody) {
    return NextResponse.json({ error: 'prospectId, subject, and body are required' }, { status: 400 });
  }

  let prospect, connection;
  try {
    [prospect] = await sql`select * from prospects where id = ${prospectId}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  if (!prospect.email) return NextResponse.json({ error: 'Prospect has no email address on file' }, { status: 400 });
  if (prospect.disqualified) return NextResponse.json({ error: `Prospect is disqualified (${prospect.disqualify_reason})` }, { status: 400 });
  if (prospect.unsubscribed) return NextResponse.json({ error: 'This prospect has unsubscribed — sending is blocked.' }, { status: 400 });

  try {
    connection = await getActiveMailboxConnection();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!connection) {
    return NextResponse.json({ error: 'No connected Outlook mailbox. Connect one in Settings first.' }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessTokenForConnection(connection);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to get a valid Outlook access token' }, { status: 400 });
  }

  try {
    const message = await sendAndRecordOutreach({
      prospect: prospect as { id: string; email: string; contact_first_name: string | null; contact_last_name: string | null; name: string },
      connection,
      accessToken,
      subject,
      bodyText: emailBody,
      offerType,
      sequenceStep: sequenceStep ?? 1,
      aiGenerated: Boolean(body.aiGenerated),
      activityDetail: `Sent "${subject}" via ${connection.email}`,
    });
    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Send via Outlook failed' }, { status: 502 });
  }
}
