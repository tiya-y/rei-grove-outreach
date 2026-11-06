// ============================================================
// Adds the qualification columns to an existing database the first time
// anything needs them, so deploying new code never depends on someone
// remembering to run SQL by hand first. Idempotent (add column if not
// exists) and memoized, so it runs once per server instance. db/schema.sql
// carries the same columns for fresh installs.
// ============================================================

import { sql } from './db';

let ensured: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await sql`
        alter table prospects
          add column if not exists company_name text,
          add column if not exists company_domain text,
          add column if not exists round1_status text,
          add column if not exists round1_reason text,
          add column if not exists round2_status text,
          add column if not exists round2_reason text,
          add column if not exists round3_status text,
          add column if not exists round3_reason text,
          add column if not exists qualification_evidence jsonb default '{}'
      `;
    })().catch((err) => {
      ensured = null;
      throw new Error(`Could not add qualification columns to the prospects table (${err instanceof Error ? err.message : 'unknown error'}). Run the migration in db/schema.sql by hand.`);
    });
  }
  return ensured;
}
