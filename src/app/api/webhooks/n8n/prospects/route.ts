import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireN8nSecret } from '@/lib/apiAuth';
import { checkDisqualifiers } from '@/lib/scoring';

// POST /api/webhooks/n8n/prospects
// Header: x-n8n-secret: <N8N_WEBHOOK_SECRET>
// Body: { prospects: [{ name, prospect_type, email?, website?, category?,
//                        audience_size_est?, content_presence?, source_ref? }],
//         batchLabel?, source_ref? }
//
// Point any n8n discovery workflow here (e.g. an Ahrefs SERP pull, a YouTube
// Data API search, an RSS/newsletter scrape) to drop candidates straight into
// the pipeline as "new". Each one runs through the same automatic-disqualifier
// check as manually-added prospects; duplicates (same name+website) are
// skipped rather than erroring the whole batch. Every call that creates at
// least one prospect is recorded as one "batch" in History — the optional
// top-level `batchLabel`/`source_ref` fields (distinct from each prospect's
// own `source_ref`) label that batch.
export async function POST(req: NextRequest) {
  const authError = requireN8nSecret(req);
  if (authError) return authError;

  const body = await req.json();
  const incoming = Array.isArray(body.prospects) ? body.prospects : [body];

  let settings;
  try {
    [settings] = await sql`select competitor_blocklist from app_settings where id = 1`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  const extraBlocklist = (settings?.competitor_blocklist ?? []) as { name: string; reason: string }[];

  const results: { name: string; status: 'created' | 'skipped_duplicate' | 'error'; reason?: string }[] = [];
  let batchId: string | null = null;

  for (const raw of incoming) {
    if (!raw.name) {
      results.push({ name: '(missing name)', status: 'error', reason: 'name is required' });
      continue;
    }

    try {
      const [dupe] = await sql`select id from prospects where name ilike ${raw.name} limit 1`;
      if (dupe) {
        results.push({ name: raw.name, status: 'skipped_duplicate' });
        continue;
      }

      const dq = checkDisqualifiers({ name: raw.name, website: raw.website }, extraBlocklist);

      if (!batchId) {
        const [batch] = await sql`
          insert into prospect_batches (source, label, source_ref)
          values ('n8n', ${body.batchLabel ?? null}, ${body.source_ref ?? null})
          returning id
        `;
        batchId = batch.id;
      }

      await sql`
        insert into prospects (
          prospect_type, name, email, website, category, city, state,
          audience_size_est, content_presence, source, source_ref, batch_id,
          disqualified, disqualify_reason, stage
        ) values (
          ${raw.prospect_type ?? 'creator'}, ${raw.name}, ${raw.email ?? null}, ${raw.website ?? null}, ${raw.category ?? null}, ${raw.city ?? null}, ${raw.state ?? null},
          ${raw.audience_size_est ?? null}, ${raw.content_presence ?? null}, 'n8n', ${raw.source_ref ?? null}, ${batchId},
          ${dq.disqualified}, ${dq.reason ?? null}, ${dq.disqualified ? 'pass' : 'new'}
        )
      `;
      results.push({ name: raw.name, status: 'created', reason: dq.disqualified ? dq.reason : undefined });
    } catch (err) {
      results.push({ name: raw.name, status: 'error', reason: err instanceof Error ? err.message : 'Insert failed' });
    }
  }

  return NextResponse.json({ results, created: results.filter((r) => r.status === 'created').length, batchId });
}
