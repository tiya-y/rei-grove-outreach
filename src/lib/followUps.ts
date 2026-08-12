// ============================================================
// Automated follow-up sequence — shared by:
//  - /api/outreach/follow-ups/run   (external trigger, requires
//                                     N8N_WEBHOOK_SECRET — point an n8n
//                                     Schedule Trigger at this daily)
//  - /api/internal/follow-ups/run   (the "Run follow-ups now" button in
//                                     Settings)
//
// Cadence: for any prospect still sitting in "reached_out" (initial email
// sent, no reply yet) and not unsubscribed, send the next step once enough
// time has passed since their last outbound message — step 1->2 at 7 days,
// step 2->3 at 7 more days, step 3->4 at 30 more days. After step 4 sends
// with still no reply, the sequence is done and the prospect moves to
// "stalled". Any reply (which flips stage away from "reached_out" during
// mailbox sync) or an unsubscribe stops it immediately, since both are
// checked again on every run.
// ============================================================

import { sql } from './db';
import { generateOutreachEmail } from './claude';
import { getActiveMailboxConnection, getValidAccessTokenForConnection, sendAndRecordOutreach } from './outreachSend';
import { CREATOR_DISCOVERY_NICHES } from './rei-grove-content';

// Days to wait AFTER sending this step before the next one is due.
const STEP_INTERVAL_DAYS: Record<number, number> = { 1: 7, 2: 7, 3: 30 };
const FINAL_STEP = 4;

export interface FollowUpResult {
  checked: number;
  sent: number;
  stalled: number;
  errors: string[];
}

export async function runFollowUps(): Promise<FollowUpResult> {
  const candidates = await sql`
    select p.*, m.sequence_step as last_step, m.sent_at as last_sent_at
    from prospects p
    join lateral (
      select sequence_step, sent_at from messages
      where prospect_id = p.id and direction = 'outbound'
      order by sequence_step desc, sent_at desc
      limit 1
    ) m on true
    where p.stage = 'reached_out' and p.unsubscribed = false and p.email is not null
  `;

  const due = candidates.filter((p) => {
    const lastStep = p.last_step as number;
    if (lastStep >= FINAL_STEP) return false;
    const waitDays = STEP_INTERVAL_DAYS[lastStep] ?? 30;
    const dueAt = new Date(p.last_sent_at as string).getTime() + waitDays * 86400000;
    return Date.now() >= dueAt;
  });

  if (due.length === 0) {
    return { checked: candidates.length, sent: 0, stalled: 0, errors: [] };
  }

  const connection = await getActiveMailboxConnection();
  if (!connection) {
    return { checked: candidates.length, sent: 0, stalled: 0, errors: ['No active mailbox connection — connect Outlook in Settings first.'] };
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessTokenForConnection(connection);
  } catch (err) {
    return { checked: candidates.length, sent: 0, stalled: 0, errors: [err instanceof Error ? err.message : 'Failed to refresh access token'] };
  }

  let sent = 0;
  let stalled = 0;
  const errors: string[] = [];

  for (const prospect of due) {
    const nextStep = (prospect.last_step as number) + 1;
    try {
      const draft = await generateOutreachEmail({
        prospectName: prospect.name,
        prospectType: prospect.prospect_type,
        contactFirstName: prospect.contact_first_name ?? undefined,
        category: prospect.category ?? undefined,
        niche: CREATOR_DISCOVERY_NICHES.find((n) => n.key === prospect.niche)?.label ?? prospect.niche ?? undefined,
        website: prospect.website ?? undefined,
        contentNotes: prospect.content_presence ?? prospect.notes ?? undefined,
        sequenceStep: nextStep,
      });

      await sendAndRecordOutreach({
        prospect: prospect as { id: string; email: string; contact_first_name: string | null; contact_last_name: string | null; name: string },
        connection,
        accessToken,
        subject: draft.subject,
        bodyText: draft.body,
        sequenceStep: nextStep,
        aiGenerated: true,
        activityDetail: `Automated follow-up #${nextStep} sent via ${connection.email}`,
      });
      sent += 1;

      if (nextStep >= FINAL_STEP) {
        await sql`update prospects set stage = 'stalled' where id = ${prospect.id}`;
        await sql`
          insert into activity_log (prospect_id, event_type, detail)
          values (${prospect.id}, 'stage_change', 'reached_out -> stalled (sequence complete, no reply after 4 touches)')
        `;
        stalled += 1;
      }
    } catch (err) {
      errors.push(`Follow-up failed for ${prospect.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return { checked: candidates.length, sent, stalled, errors };
}
