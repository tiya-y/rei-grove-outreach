// ============================================================
// Records an outreach email as sent. There's no mailbox connection and no
// actual email transmission from this app — whoever is running outreach
// generates the draft, copies it, sends it from their own inbox, and clicks
// "Mark as sent" here to log it and advance the pipeline. Shared by the
// manual send route so the recording logic lives in one place.
// ============================================================

import { sql } from './db';

export interface RecordSentOutreachParams {
  prospectId: string;
  subject: string;
  bodyText: string;
  offerType?: string | null;
  sequenceStep?: number;
  aiGenerated?: boolean;
  activityDetail: string;
}

/** Plain-text opt-out footer appended to every recorded send. */
export function unsubscribeFooter(prospectId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `\n\n---\nDon't want future emails from us? Unsubscribe: ${appUrl}/api/unsubscribe/${prospectId}`;
}

/**
 * Records a message as sent, advances the prospect's stage (approved ->
 * reached_out only — marking a later-stage reply/follow-up sent should not
 * regress the stage), and logs activity. No email is actually transmitted;
 * this is purely bookkeeping for the manual-send workflow.
 */
export async function recordSentOutreach(params: RecordSentOutreachParams) {
  const bodyText = params.bodyText + unsubscribeFooter(params.prospectId);

  const [message] = await sql`
    insert into messages (
      prospect_id, direction, subject, body_text, offer_type, sequence_step,
      ai_generated, status, to_address, sent_at
    ) values (
      ${params.prospectId}, 'outbound', ${params.subject}, ${bodyText}, ${params.offerType ?? null}, ${params.sequenceStep ?? 1},
      ${Boolean(params.aiGenerated)}, 'sent',
      (select email from prospects where id = ${params.prospectId}),
      ${new Date().toISOString()}
    )
    returning *
  `;

  await sql`
    update prospects
    set stage = case when stage = 'approved' then 'reached_out' else stage end, last_contacted_at = ${new Date().toISOString()}
    where id = ${params.prospectId}
  `;

  await sql`
    insert into activity_log (prospect_id, event_type, detail)
    values (${params.prospectId}, 'email_sent', ${params.activityDetail})
  `;

  return message;
}
