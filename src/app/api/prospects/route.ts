import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { checkDisqualifiers } from '@/lib/scoring';

// GET /api/prospects?stage=reached_out&type=creator — list, newest first
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get('stage');
  const type = searchParams.get('type');

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (stage) {
    params.push(stage);
    conditions.push(`stage = $${params.length}`);
  }
  if (type) {
    params.push(type);
    conditions.push(`prospect_type = $${params.length}`);
  }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  try {
    const prospects = await sql.query(`select * from prospects ${where} order by created_at desc`, params);
    return NextResponse.json({ prospects });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
}

// POST /api/prospects — manual add (also used by the "New Prospect" form).
// Runs the automatic disqualifier check from partnership-prospector on every
// new prospect, regardless of source. Manually-added prospects never get a
// batch_id — batches are only created by bulk imports (see webhooks/n8n).
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    const [settings] = await sql`select competitor_blocklist from app_settings where id = 1`;
    const extraBlocklist = (settings?.competitor_blocklist ?? []) as { name: string; reason: string }[];
    const dq = checkDisqualifiers({ name: body.name, website: body.website }, extraBlocklist);
    const stage = dq.disqualified ? 'pass' : (body.stage ?? 'new');

    const [prospect] = await sql`
      insert into prospects (
        prospect_type, name, contact_first_name, contact_last_name, contact_title,
        email, website, linkedin_url, category, niche, city, state, audience_size_est,
        content_presence, source, source_ref, disqualified, disqualify_reason, stage, notes
      ) values (
        ${body.prospect_type ?? 'partner'}, ${body.name}, ${body.contact_first_name ?? null}, ${body.contact_last_name ?? null}, ${body.contact_title ?? null},
        ${body.email ?? null}, ${body.website ?? null}, ${body.linkedin_url ?? null}, ${body.category ?? null}, ${body.niche ?? null}, ${body.city ?? null}, ${body.state ?? null}, ${body.audience_size_est ?? null},
        ${body.content_presence ?? null}, ${body.source ?? 'manual'}, ${body.source_ref ?? null}, ${dq.disqualified}, ${dq.reason ?? null}, ${stage}, ${body.notes ?? null}
      )
      returning *
    `;

    await sql`
      insert into activity_log (prospect_id, event_type, detail)
      values (${prospect.id}, ${dq.disqualified ? 'disqualified' : 'note'}, ${dq.disqualified ? `Auto-disqualified on creation: ${dq.reason}` : `Added via ${body.source ?? 'manual'}`})
    `;

    return NextResponse.json({ prospect, disqualifier: dq }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Insert failed' }, { status: 500 });
  }
}
