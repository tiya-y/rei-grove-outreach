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

import { createServiceClient } from './supabase';
import { refreshAccessToken, listRecentMessages, type GraphMessage } from './ms365';
import { classifyReply } from './claude';

async function getValidAccessToken(connection: {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}) {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const isExpired = !connection.access_token || expiresAt < Date.now() + 60_000;

  if (!isExpired) return connection.access_token!;

  if (!connection.refresh_token) throw new Error('No refresh token on file — reconnect Outlook in Settings.');

  const refreshed = await refreshAccessToken(connection.refresh_token);
  const db = createServiceClient();
  await db
    .from('mailbox_connections')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    })
    .eq('id', connection.id);

  return refreshed.access_token;
}

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
  const db = createServiceClient();
  const errors: string[] = [];

  const { data: connection } = await db
    .from('mailbox_connections')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connection) {
    return { connectionEmail: null, messagesScanned: 0, newMessages: 0, matchedProspects: 0, errors: ['No active mailbox connection. Connect Outlook in Settings first.'] };
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(connection);
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

  const { data: prospects } = await db.from('prospects').select('id,name,email,stage').not('email', 'is', null);
  const prospectByEmail = new Map((prospects ?? []).map((p) => [p.email!.toLowerCase(), p]));

  let newMessages = 0;
  const matchedProspectIds = new Set<string>();

  for (const msg of messages) {
    const direction: 'inbound' | 'outbound' = msg.from?.emailAddress?.address?.toLowerCase() === connection.email?.toLowerCase() ? 'outbound' : 'inbound';
    const counterpartAddress = extractAddress(msg, direction);
    if (!counterpartAddress) continue;

    const prospect = prospectByEmail.get(counterpartAddress);
    if (!prospect) continue; // not someone we're tracking

    const { data: existing } = await db.from('messages').select('id').eq('ms_message_id', msg.id).maybeSingle();
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

    await db.from('messages').insert({
      prospect_id: prospect.id,
      direction,
      subject: msg.subject,
      body_html: msg.body?.contentType === 'html' ? msg.body.content : null,
      body_text: msg.body?.contentType === 'text' ? msg.body.content : bodyText,
      status: direction === 'inbound' ? 'replied' : 'sent',
      ms_message_id: msg.id,
      ms_conversation_id: msg.conversationId,
      from_address: msg.from?.emailAddress?.address ?? null,
      to_address: msg.toRecipients?.[0]?.emailAddress?.address ?? null,
      ai_classification: aiClassification,
      ai_confidence: aiConfidence,
      ai_suggested_response: aiSuggested,
      sent_at: direction === 'outbound' ? msg.sentDateTime : null,
      received_at: direction === 'inbound' ? msg.receivedDateTime : null,
    });

    newMessages += 1;
    matchedProspectIds.add(prospect.id);

    if (direction === 'inbound') {
      await db
        .from('prospects')
        .update({ stage: 'replied', last_reply_at: msg.receivedDateTime ?? new Date().toISOString() })
        .eq('id', prospect.id);
      await db.from('activity_log').insert({ prospect_id: prospect.id, event_type: 'email_received', detail: `Reply synced from Outlook: "${msg.subject}"` });
    }
  }

  await db.from('mailbox_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', connection.id);

  return {
    connectionEmail: connection.email,
    messagesScanned: messages.length,
    newMessages,
    matchedProspects: matchedProspectIds.size,
    errors,
  };
}
