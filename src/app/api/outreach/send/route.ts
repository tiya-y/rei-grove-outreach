import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendMailViaGraph, refreshAccessToken } from '@/lib/ms365';

// POST /api/outreach/send — actually sends via the connected Outlook mailbox
// and logs the message + advances the prospect's stage to "reached_out".
// Body: { prospectId, subject, body (plain text or HTML), offerType?, sequenceStep? }
export async function POST(req: NextRequest) {
  const db = createServiceClient();
  const body = await req.json();
  const { prospectId, subject, body: emailBody, offerType, sequenceStep } = body;

  if (!prospectId || !subject || !emailBody) {
    return NextResponse.json({ error: 'prospectId, subject, and body are required' }, { status: 400 });
  }

  const { data: prospect, error: prospectErr } = await db.from('prospects').select('*').eq('id', prospectId).single();
  if (prospectErr || !prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  if (!prospect.email) return NextResponse.json({ error: 'Prospect has no email address on file' }, { status: 400 });
  if (prospect.disqualified) return NextResponse.json({ error: `Prospect is disqualified (${prospect.disqualify_reason})` }, { status: 400 });

  const { data: connection, error: connErr } = await db
    .from('mailbox_connections')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connErr || !connection) {
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
    await db
      .from('mailbox_connections')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq('id', connection.id);
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

  const { data: message, error: msgErr } = await db
    .from('messages')
    .insert({
      prospect_id: prospectId,
      direction: 'outbound',
      subject,
      body_html: bodyHtml,
      body_text: emailBody,
      offer_type: offerType ?? null,
      sequence_step: sequenceStep ?? 1,
      ai_generated: Boolean(body.aiGenerated),
      status: 'sent',
      ms_message_id: sentMessage?.id ?? null,
      ms_conversation_id: sentMessage?.conversationId ?? null,
      from_address: connection.email,
      to_address: prospect.email,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  await db
    .from('prospects')
    .update({ stage: 'reached_out', last_contacted_at: new Date().toISOString() })
    .eq('id', prospectId);

  await db.from('activity_log').insert({
    prospect_id: prospectId,
    event_type: 'email_sent',
    detail: `Sent "${subject}" via ${connection.email}`,
  });

  return NextResponse.json({ message });
}
