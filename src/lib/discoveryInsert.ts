// ============================================================
// Shared "dedupe, batch, insert" loop used by every discovery source
// (keyword SERP search, backlink search, and previously the n8n webhook's
// own copy of this logic) so new prospects always land the same way: one
// prospect_batches row per run, checked against the competitor blocklist,
// deduped against existing prospects by name/website.
// ============================================================

import { sql } from './db';
import { checkDisqualifiers } from './scoring';
import type { DiscoveredDomain } from './ahrefs';

export interface InsertDiscoveredResult {
  results: { name: string; status: 'created' | 'skipped_duplicate' | 'error'; reason?: string }[];
  created: number;
  batchId: string | null;
}

export async function insertDiscoveredCandidates(
  candidates: DiscoveredDomain[],
  batchLabel: string,
  batchSourceRef: string | null,
  nicheKey: string | null,
  sourceRefTag: string
): Promise<InsertDiscoveredResult> {
  const [settings] = await sql`select competitor_blocklist from app_settings where id = 1`;
  const extraBlocklist = (settings?.competitor_blocklist ?? []) as { name: string; reason: string }[];

  const results: InsertDiscoveredResult['results'] = [];
  let batchId: string | null = null;

  for (const c of candidates) {
    try {
      const [dupe] = await sql`select id from prospects where name ilike ${c.name} or website ilike ${c.website} limit 1`;
      if (dupe) {
        results.push({ name: c.name, status: 'skipped_duplicate' });
        continue;
      }

      const dq = checkDisqualifiers({ name: c.name, website: c.website }, extraBlocklist);

      if (!batchId) {
        const [batch] = await sql`
          insert into prospect_batches (source, label, source_ref)
          values ('discovery', ${batchLabel}, ${batchSourceRef})
          returning id
        `;
        batchId = batch.id;
      }

      await sql`
        insert into prospects (
          prospect_type, name, website, category, niche, content_presence,
          source, source_ref, batch_id, disqualified, disqualify_reason, stage
        ) values (
          'creator', ${c.name}, ${c.website}, ${c.category}, ${nicheKey}, ${c.contentPresence},
          'discovery', ${sourceRefTag}, ${batchId},
          ${dq.disqualified}, ${dq.reason ?? null}, ${dq.disqualified ? 'pass' : 'new'}
        )
      `;
      results.push({ name: c.name, status: 'created', reason: dq.disqualified ? dq.reason : undefined });
    } catch (err) {
      results.push({ name: c.name, status: 'error', reason: err instanceof Error ? err.message : 'Insert failed' });
    }
  }

  return { results, created: results.filter((r) => r.status === 'created').length, batchId };
}
