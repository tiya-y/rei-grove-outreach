// ============================================================
// Shared "send an outbound email and record it" path, used by both the
// manual compose-and-send route (app/api/outreach/send) and the automated
// follow-up runner (app/api/outreach/follow-ups/run) so token refresh and
// message-recording logic lives in exactly one place.
// ============================================================

import { sql } from './db';
import { sendMailViaGraph, refreshAccessToken } from './ms365';

export interface MailboxConnectionRow {
  id: string;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

export async function getActiveMailboxConnection(): Promise<MailboxConnectionRow | null> {
  const [connection] = await sql`
    select * from mailbox_connections where is_active = true order by created_at desc limit 1
  `;
  return (connection as MailboxConnectionRow | undefined) ?? null;
}

/** Returns a valid access token for the connection, refreshing (and persisting) it first if needed. */
export async function getValidAccessTokenForConnection(connection: MailboxConnectionRow): Promise<string> {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const isExpired = !connection.access_token || expiresAt < Date.now() + 60_000;

  if (!isExpired) return connection.access_token!;
  if (!connection.refresh_token) throw new Error('Outlook connection expired. Reconnect in Settings.');

  const refreshed = await refreshAccessToken(connection.refresh_token);
  await sql`
    update mailbox_connections
    set access_token = ${refreshed.access_token}, refresh_token = ${refreshed.refresh_token}, token_expires_at = ${new Date(Date.now() + refreshed.expires_in * 1000).toISOString()}
    where id = ${connection.id}
  `;
  return refreshed.access_token;
}

export interface SendOutreachParams {
  prospect: { id: string; email: string; contact_first_name: string | null; contact_last_name: string | null; name: string };
  connection: { id: string; email: string | null };
  accessToken: string;
  subject: string;
  bodyText: string;
  offerType?: string | null;
  sequenceStep?: number;
  aiGenerated?: boolean;
  activityDetail: string;
}

/** Plain-text opt-out footer appended to every outbound send. */
export function unsubscribeFooter(prospectId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `\n\n---\nDon't want future emails from us? Unsubscribe: ${appUrl}/api/unsubscribe/${prospectId}`;
}

// Plain-text bodies are sent as HTML (see ms365.ts's sendMailViaGraph), so a
// bare URL needs to become a real <a href> or it shows up dead in the
// recipient's inbox — email clients only auto-linkify true plain-text mail.
function autoLinkUrls(text: string): string {
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}

/**
 * Sends via Graph, records the message row, advances the prospect's stage
 * (approved -> reached_out only — a manual reply/follow-up sent from a
 * later stage like "replied" should not regress the stage), and logs
 * activity. Shared by the manual send route and the automated follow-up
 * runner. Every send gets the unsubscribe footer appended automatically so
 * it can never be forgotten by a caller.
 */
export async function sendAndRecordOutreach(params: SendOutreachParams) {
  const bodyText = params.bodyText + unsubscribeFooter(params.prospect.id);
  const bodyHtml = /<[a-z][\s\S]*>/i.test(bodyText) ? bodyText : autoLinkUrls(bodyText).replace(/\n/g, '<br/>');

  const sentMessage = await sendMailViaGraph(params.accessToken, {
    toEmail: params.prospect.email,
    toName: [params.prospect.contact_first_name, params.prospect.contact_last_name].filter(Boolean).join(' ') || params.prospect.name,
    subject: params.subject,
    bodyHtml,
  });

  const [message] = await sql`
    insert into messages (
      prospect_id, direction, subject, body_html, body_text, offer_type, sequence_step,
      ai_generated, status, ms_message_id, ms_conversation_id, from_address, to_address, sent_at
    ) values (
      ${params.prospect.id}, 'outbound', ${params.subject}, ${bodyHtml}, ${bodyText}, ${params.offerType ?? null}, ${params.sequenceStep ?? 1},
      ${Boolean(params.aiGenerated)}, 'sent', ${sentMessage?.id ?? null}, ${sentMessage?.conversationId ?? null}, ${params.connection.email}, ${params.prospect.email}, ${new Date().toISOString()}
    )
    returning *
  `;

  await sql`
    update prospects
    set stage = case when stage = 'approved' then 'reached_out' else stage end, last_contacted_at = ${new Date().toISOString()}
    where id = ${params.prospect.id}
  `;

  await sql`
    insert into activity_log (prospect_id, event_type, detail)
    values (${params.prospect.id}, 'email_sent', ${params.activityDetail})
  `;

  return message;
}
