import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendMailViaGraph, refreshAccessToken } from '@/lib/ms365';

// POST /api/outreach/send — actually sends via the connected Outlook mailbox
// and logs the message + advances the prospect's stage to "reached_out".
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

  try {
    [connection] = await sql`
      select * from mailbox_connections where is_active = true order by created_at desc limit 1
    `;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!connection) {
    return NextResponse.json({ error: 'No connected Outlook mailbox. Connect one in Settings first.' }, { status: 400 });
  }

  let accessToken = connection.access_token as string | null;
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (!accessToken || expiresAt < Date.now() + 60_000) {
    if (!connection.refresh_token) {
      return NextResponse.json({ error: 'Outlook connection expired. Reconnect in Settings.' }, { status: 400 });
    }
    const refreshed = await refreshAccessToken(connection.refresh_token);
    accessToken = refreshed.access_token;
    try {
      await sql`
        update mailbox_connections
        set access_token = ${refreshed.access_token}, refresh_token = ${refreshed.refresh_token}, token_expires_at = ${new Date(Date.now() + refreshed.expires_in * 1000).toISOString()}
        where id = ${connection.id}
      `;
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to persist refreshed token' }, { status: 500 });
    }
  }

  const bodyHtml = /<[a-z][\s\S]*>/i.test(emailBody) ? emailBody : emailBody.replace(/\n/g, '<br/>');

  let sentMessage;
  try {
    sentMessage = await sendMailViaGraph(accessToken!, {
      toEmail: prospect.email,
      toName: [prospect.contact_first_name, prospect.contact_last_name].filter(Boolean).join(' ') || prospect.name,
      subject,
      bodyHtml,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Send via Outlook failed' }, { status: 502 });
  }

  try {
    const [message] = await sql`
      insert into messages (
        prospect_id, direction, subject, body_html, body_text, offer_type, sequence_step,
        ai_generated, status, ms_message_id, ms_conversation_id, from_address, to_address, sent_at
      ) values (
        ${prospectId}, 'outbound', ${subject}, ${bodyHtml}, ${emailBody}, ${offerType ?? null}, ${sequenceStep ?? 1},
        ${Boolean(body.aiGenerated)}, 'sent', ${sentMessage?.id ?? null}, ${sentMessage?.conversationId ?? null}, ${connection.email}, ${prospect.email}, ${new Date().toISOString()}
      )
      returning *
    `;

    await sql`
      update prospects set stage = 'reached_out', last_contacted_at = ${new Date().toISOString()} where id = ${prospectId}
    `;

    await sql`
      insert into activity_log (prospect_id, event_type, detail)
      values (${prospectId}, 'email_sent', ${`Sent "${subject}" via ${connection.email}`})
    `;

    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to record sent message' }, { status: 500 });
  }
}
