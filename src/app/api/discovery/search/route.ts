import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { discoverDomainsForNiche, isAhrefsEnabled, type DiscoveryResultType } from '@/lib/ahrefs';
import { checkDisqualifiers } from '@/lib/scoring';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';

// POST /api/discovery/search — Body: { nicheKey, resultType? }
// Runs the niche's keywords through Ahrefs SERP Overview to find real,
// currently-ranking sites, YouTube videos, and/or forum threads (no LLM
// guessing), dedupes against existing prospects, and inserts the new ones
// as "new" prospects tagged with that niche, grouped into one batch
// (visible under History) — same pattern as the n8n bulk-import webhook.
export async function POST(req: NextRequest) {
  if (!isAhrefsEnabled()) {
    return NextResponse.json({ error: 'Ahrefs is not configured (AHREFS_API_KEY missing) — required for creator discovery. Add prospects manually or via n8n instead.' }, { status: 400 });
  }

  const { nicheKey, resultType } = (await req.json()) as { nicheKey: string; resultType?: DiscoveryResultType };
  const niche = CREATOR_DISCOVERY_NICHES.find((n) => n.key === nicheKey);
  if (!niche) return NextResponse.json({ error: 'Unknown niche' }, { status: 400 });

  const { candidates, errors } = await discoverDomainsForNiche(niche.keywords, niche.targetCount, resultType ?? 'all');

  if (candidates.length === 0) {
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' | ') }, { status: 502 });
    }
    return NextResponse.json({ results: [], created: 0, batchId: null, message: 'No verifiable sites found for this niche this run — try again later.' });
  }

  let settings;
  try {
    [settings] = await sql`select competitor_blocklist from app_settings where id = 1`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  const extraBlocklist = (settings?.competitor_blocklist ?? []) as { name: string; reason: string }[];

  const results: { name: string; status: 'created' | 'skipped_duplicate' | 'error'; reason?: string }[] = [];
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
          values ('discovery', ${`Discovery: ${niche.label}`}, ${niche.key})
          returning id
        `;
        batchId = batch.id;
      }

      await sql`
        insert into prospects (
          prospect_type, name, website, category, niche, content_presence,
          source, source_ref, batch_id, disqualified, disqualify_reason, stage
        ) values (
          'creator', ${c.name}, ${c.website}, ${c.category}, ${niche.key}, ${c.contentPresence},
          'discovery', ${'ahrefs serp'}, ${batchId},
          ${dq.disqualified}, ${dq.reason ?? null}, ${dq.disqualified ? 'pass' : 'new'}
        )
      `;
      results.push({ name: c.name, status: 'created', reason: dq.disqualified ? dq.reason : undefined });
    } catch (err) {
      results.push({ name: c.name, status: 'error', reason: err instanceof Error ? err.message : 'Insert failed' });
    }
  }

  return NextResponse.json({ results, created: results.filter((r) => r.status === 'created').length, batchId });
}
