import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { requireN8nSecret } from '@/lib/apiAuth';
import { checkDisqualifiers } from '@/lib/scoring';

// POST /api/webhooks/n8n/prospects
// Header: x-n8n-secret: <N8N_WEBHOOK_SECRET>
// Body: { prospects: [{ name, prospect_type, email?, website?, category?,
//                        audience_size_est?, content_presence?, source_ref? }] }
//
// Point any n8n discovery workflow here (e.g. an Ahrefs SERP pull, a YouTube
// Data API search, an RSS/newsletter scrape) to drop candidates straight into
// the pipeline as "new". Each one runs through the same automatic-disqualifier
// check as manually-added prospects; duplicates (same name+website) are
// skipped rather than erroring the whole batch.
export async function POST(req: NextRequest) {
  const authError = requireN8nSecret(req);
  if (authError) return authError;

  const body = await req.json();
  const incoming = Array.isArray(body.prospects) ? body.prospects : [body];

  const db = createServiceClient();
  const { data: settings } = await db.from('app_settings').select('competitor_blocklist').eq('id', 1).maybeSingle();
  const extraBlocklist = (settings?.competitor_blocklist ?? []) as { name: string; reason: string }[];

  const results: { name: string; status: 'created' | 'skipped_duplicate' | 'error'; reason?: string }[] = [];

  for (const raw of incoming) {
    if (!raw.name) {
      results.push({ name: '(missing name)', status: 'error', reason: 'name is required' });
      continue;
    }

    const { data: dupe } = await db
      .from('prospects')
      .select('id')
      .ilike('name', raw.name)
      .maybeSingle();
    if (dupe) {
      results.push({ name: raw.name, status: 'skipped_duplicate' });
      continue;
    }

    const dq = checkDisqualifiers({ name: raw.name, website: raw.website }, extraBlocklist);

    const { error } = await db.from('prospects').insert({
      prospect_type: raw.prospect_type ?? 'creator',
      name: raw.name,
      email: raw.email ?? null,
      website: raw.website ?? null,
      category: raw.category ?? null,
      city: raw.city ?? null,
      state: raw.state ?? null,
      audience_size_est: raw.audience_size_est ?? null,
      content_presence: raw.content_presence ?? null,
      source: 'n8n',
      source_ref: raw.source_ref ?? null,
      disqualified: dq.disqualified,
      disqualify_reason: dq.reason ?? null,
      stage: dq.disqualified ? 'pass' : 'new',
    });

    if (error) {
      results.push({ name: raw.name, status: 'error', reason: error.message });
    } else {
      results.push({ name: raw.name, status: 'created', reason: dq.disqualified ? dq.reason : undefined });
    }
  }

  return NextResponse.json({ results, created: results.filter((r) => r.status === 'created').length });
}
