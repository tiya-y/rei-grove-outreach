// ============================================================
// Shared "dedupe, batch, insert" loop used by every discovery source
// (backlink contact search, YouTube Data API search, and manual paste
// import) so new prospects always land the same way: one prospect_batches
// row per run, checked against the competitor blocklist, deduped against
// existing prospects by name/website.
// ============================================================

import { sql } from './db';
import { checkDisqualifiers } from './scoring';

// Structurally compatible with ahrefs.ts's BacklinkContact (its narrower
// `category` union satisfies `string` here) — kept separate so this file
// doesn't need to know about Ahrefs specifically.
export interface DiscoveryCandidate {
  name: string;
  domain: string | null;
  website: string | null;
  category: string | null;
  contentPresence: string;
  domainRating?: number | null;
  audienceSizeEst?: number | null;
  email?: string | null;
  // Set when the candidate IS a named individual (e.g. backlink-contact
  // discovery) rather than a company/publication — `name` stays the full
  // name either way, these just split it for personalized outreach.
  contactFirstName?: string | null;
  contactLastName?: string | null;
}

// A byline/guest/host "name" from any discovery source is 2-4
// space-separated tokens (see the person-name heuristics in ahrefs.ts and
// podcasts.ts) — split on the last token as the surname, everything before
// it as the given name(s). Shared so every source that finds a named
// individual (rather than a company) splits it the same way.
export function splitName(name: string): { first: string; last: string } {
  const tokens = name.trim().split(/\s+/);
  return { first: tokens.slice(0, -1).join(' '), last: tokens[tokens.length - 1] };
}

export interface InsertDiscoveredResult {
  results: { name: string; status: 'created' | 'skipped_duplicate' | 'error'; reason?: string }[];
  created: number;
  batchId: string | null;
}

export async function insertDiscoveredCandidates(
  candidates: DiscoveryCandidate[],
  batchLabel: string,
  batchSourceRef: string | null,
  nicheKey: string | null,
  sourceRefTag: string,
  source: string
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
          values (${source}, ${batchLabel}, ${batchSourceRef})
          returning id
        `;
        batchId = batch.id;
      }

      await sql`
        insert into prospects (
          prospect_type, name, contact_first_name, contact_last_name, email, website, category, niche,
          content_presence, audience_size_est, source, source_ref, batch_id, disqualified, disqualify_reason, stage
        ) values (
          'creator', ${c.name}, ${c.contactFirstName ?? null}, ${c.contactLastName ?? null}, ${c.email ?? null}, ${c.website}, ${c.category}, ${nicheKey}, ${c.contentPresence}, ${c.audienceSizeEst ?? null},
          ${source}, ${sourceRefTag}, ${batchId},
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
