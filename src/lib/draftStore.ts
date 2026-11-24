// ============================================================
// Saved outreach drafts: one current draft per prospect PER AFFILIATE PROGRAM
// (a person can have both a REI Grove and an Innago email waiting), so a
// draft generated from the Outreach tab is still there when the prospect page
// is opened, and vice versa. Deleted when that email is marked as sent.
// ============================================================

import { sql } from './db';
import { ensureOutreachSchema } from './schema';
import type { ProgramKey } from './affiliatePrograms';

export interface SavedDraft {
  prospect_id: string;
  program: ProgramKey;
  subject: string;
  body: string;
  offer_type: string | null;
  sequence_step: number;
  ai_generated: boolean;
  source: string | null;
  outlook_saved_at: string | null;
  updated_at: string;
}

export async function getDraft(prospectId: string, program: ProgramKey = 'reigrove'): Promise<SavedDraft | null> {
  await ensureOutreachSchema();
  const [row] = await sql`select * from outreach_drafts where prospect_id = ${prospectId} and program = ${program}`;
  return (row as SavedDraft | undefined) ?? null;
}

export async function saveDraft(
  prospectId: string,
  d: { subject: string; body: string; program?: ProgramKey; offerType?: string | null; sequenceStep?: number; aiGenerated?: boolean; source?: string | null }
): Promise<SavedDraft> {
  await ensureOutreachSchema();
  // Editing the text invalidates "saved to Outlook", so the flag is reset
  // unless the text is unchanged (see markDraftInOutlook for setting it).
  const [row] = await sql`
    insert into outreach_drafts (prospect_id, program, subject, body, offer_type, sequence_step, ai_generated, source)
    values (${prospectId}, ${d.program ?? 'reigrove'}, ${d.subject}, ${d.body}, ${d.offerType ?? null}, ${d.sequenceStep ?? 1}, ${Boolean(d.aiGenerated)}, ${d.source ?? null})
    on conflict (prospect_id, program) do update set
      subject = excluded.subject,
      body = excluded.body,
      offer_type = excluded.offer_type,
      sequence_step = excluded.sequence_step,
      ai_generated = excluded.ai_generated,
      source = coalesce(excluded.source, outreach_drafts.source),
      outlook_saved_at = case when outreach_drafts.subject = excluded.subject and outreach_drafts.body = excluded.body then outreach_drafts.outlook_saved_at else null end,
      updated_at = now()
    returning *
  `;
  return row as SavedDraft;
}

export async function markDraftInOutlook(prospectId: string, program: ProgramKey = 'reigrove'): Promise<void> {
  await ensureOutreachSchema();
  await sql`update outreach_drafts set outlook_saved_at = now() where prospect_id = ${prospectId} and program = ${program}`;
}

export async function deleteDraft(prospectId: string, program: ProgramKey = 'reigrove'): Promise<void> {
  await ensureOutreachSchema();
  await sql`delete from outreach_drafts where prospect_id = ${prospectId} and program = ${program}`;
}

export async function listDraftSummaries(): Promise<Pick<SavedDraft, 'prospect_id' | 'program' | 'subject' | 'source' | 'outlook_saved_at' | 'updated_at'>[]> {
  await ensureOutreachSchema();
  const rows = await sql`select prospect_id, program, subject, source, outlook_saved_at, updated_at from outreach_drafts`;
  return rows as never;
}

/** Which programs' first emails have already been marked sent, per prospect. */
export async function listSentPrograms(): Promise<{ prospect_id: string; program: ProgramKey }[]> {
  const rows = await sql`
    select prospect_id,
           case when offer_type = 'innago_affiliate' then 'innago' else 'reigrove' end as program
    from messages
    where direction = 'outbound' and sequence_step = 1 and status = 'sent'
    group by 1, 2
  `;
  return rows as never;
}
