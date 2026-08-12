// ============================================================
// Core mailbox sync logic — shared by:
//  - /api/graph/sync        (external trigger, requires N8N_WEBHOOK_SECRET —
//                             point an n8n Schedule Trigger + HTTP Request
//                             node at this on whatever cadence you want)
//  - /api/internal/sync     (the "Sync now" button in Settings)
//
// What it does: for the active mailbox connection, lists everything new in
// Inbox + Sent Items since the last sync, matches each message to a prospect
// by email address, upserts it into `messages` (deduped by ms_message_id),
// and — for new inbound messages — runs Claude reply classification and
// flips the prospect's stage to "replied".
// ============================================================

import { sql } from './db';
import { listRecentMessages, type GraphMessage } from './ms365';
import { classifyReply } from './claude';
import { getValidAccessTokenForConnection } from './outreachSend';

function extractAddress(msg: GraphMessage, direction: 'inbound' | 'outbound') {
  if (direction === 'inbound') return msg.from?.emailAddress?.address?.toLowerCase() ?? null;
  return msg.toRecipients?.[0]?.emailAddress?.address?.toLowerCase() ?? null;
}

export interface SyncResult {
  connectionEmail: string | null;
  messagesScanned: number;
  newMessages: number;
  matchedProspects: number;
  errors: string[];
}

export async function syncMailbox(): Promise<SyncResult> {
  const errors: string[] = [];

  const [connection] = await sql`
    select * from mailbox_connections where is_active = true order by created_at desc limit 1
  `;

  if (!connection) {
    return { connectionEmail: null, messagesScanned: 0, newMessages: 0, matchedProspects: 0, errors: ['No active mailbox connection. Connect Outlook in Settings first.'] };
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessTokenForConnection(connection as {
      id: string;
      email: string | null;
      access_token: string | null;
      refresh_token: string | null;
      token_expires_at: string | null;
    });
  } catch (err) {
    return {
      connectionEmail: connection.email,
      messagesScanned: 0,
      newMessages: 0,
      matchedProspects: 0,
      errors: [err instanceof Error ? err.message : 'Failed to refresh access token'],
    };
  }

  const since = connection.last_synced_at ?? new Date(Date.now() - 30 * 86400000).toISOString();
  let messages: GraphMessage[] = [];
  try {
    messages = await listRecentMessages(accessToken, since);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Failed to list messages from Graph');
  }

  const prospects = await sql`select id, name, email, stage from prospects where email is not null`;
  const prospectByEmail = new Map((prospects ?? []).map((p) => [(p.email as string).toLowerCase(), p]));

  let newMessages = 0;
  const matchedProspectIds = new Set<string>();

  for (const msg of messages) {
    const direction: 'inbound' | 'outbound' = msg.from?.emailAddress?.address?.toLowerCase() === connection.email?.toLowerCase() ? 'outbound' : 'inbound';
    const counterpartAddress = extractAddress(msg, direction);
    if (!counterpartAddress) continue;

    const prospect = prospectByEmail.get(counterpartAddress);
    if (!prospect) continue; // not someone we're tracking

    const [existing] = await sql`select id from messages where ms_message_id = ${msg.id}`;
    if (existing) continue;

    const bodyText = msg.body?.content ?? msg.bodyPreview ?? '';

    let aiClassification: string | null = null;
    let aiConfidence: number | null = null;
    let aiSuggested: string | null = null;

    if (direction === 'inbound' && process.env.ANTHROPIC_API_KEY) {
      try {
        const result = await classifyReply(bodyText, prospect.name);
        aiClassification = result.classification;
        aiConfidence = result.confidence;
        aiSuggested = result.suggestedResponse;
      } catch (err) {
        errors.push(`Reply classification failed for message ${msg.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    await sql`
      insert into messages (
        prospect_id, direction, subject, body_html, body_text, status,
        ms_message_id, ms_conversation_id, from_address, to_address,
        ai_classification, ai_confidence, ai_suggested_response, sent_at, received_at
      ) values (
        ${prospect.id}, ${direction}, ${msg.subject ?? null},
        ${msg.body?.contentType === 'html' ? msg.body.content : null},
        ${msg.body?.contentType === 'text' ? msg.body.content : bodyText},
        ${direction === 'inbound' ? 'replied' : 'sent'},
        ${msg.id}, ${msg.conversationId ?? null},
        ${msg.from?.emailAddress?.address ?? null}, ${msg.toRecipients?.[0]?.emailAddress?.address ?? null},
        ${aiClassification}, ${aiConfidence}, ${aiSuggested},
        ${direction === 'outbound' ? msg.sentDateTime ?? null : null},
        ${direction === 'inbound' ? msg.receivedDateTime ?? null : null}
      )
    `;

    newMessages += 1;
    matchedProspectIds.add(prospect.id as string);

    if (direction === 'inbound') {
      await sql`
        update prospects set stage = 'replied', last_reply_at = ${msg.receivedDateTime ?? new Date().toISOString()}
        where id = ${prospect.id}
      `;
      await sql`
        insert into activity_log (prospect_id, event_type, detail)
        values (${prospect.id}, 'email_received', ${`Reply synced from Outlook: "${msg.subject}"`})
      `;

      // A "stop emailing me" reply is functionally an unsubscribe — stop the
      // automated follow-up sequence immediately rather than waiting for a
      // human to notice the classification.
      if (aiClassification === 'do_not_contact') {
        await sql`
          update prospects set unsubscribed = true, unsubscribed_at = now() where id = ${prospect.id}
        `;
        await sql`
          insert into activity_log (prospect_id, event_type, detail)
          values (${prospect.id}, 'unsubscribed', 'Auto-unsubscribed: reply classified as do_not_contact')
        `;
      }
    }
  }

  await sql`update mailbox_connections set last_synced_at = ${new Date().toISOString()} where id = ${connection.id}`;

  return {
    connectionEmail: connection.email,
    messagesScanned: messages.length,
    newMessages,
    matchedProspects: matchedProspectIds.size,
    errors,
  };
}
