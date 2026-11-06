import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/schema';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const [[prospect], messages, activity] = await Promise.all([
      sql`select * from prospects where id = ${params.id}`,
      sql`select * from messages where prospect_id = ${params.id} order by sent_at asc nulls first`,
      sql`select * from activity_log where prospect_id = ${params.id} order by created_at desc`,
    ]);

    if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    return NextResponse.json({ prospect, messages: messages ?? [], activity: activity ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 404 });
  }
}

const ALLOWED_FIELDS = [
  'prospect_type', 'name', 'contact_first_name', 'contact_last_name', 'contact_title',
  'email', 'website', 'linkedin_url', 'category', 'niche', 'city', 'state', 'audience_size_est',
  'content_presence', 'stage', 'notes', 'disqualified', 'disqualify_reason',
  'unsubscribed', 'unsubscribed_at',
  'round1_status', 'round1_reason', 'round2_status', 'round2_reason', 'round3_status', 'round3_reason',
] as const;

const ROUND_STATUS_FIELDS = ['round1_status', 'round2_status', 'round3_status'];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const update: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  for (const field of ROUND_STATUS_FIELDS) {
    if (field in update && update[field] !== null && update[field] !== 'pass' && update[field] !== 'fail') {
      return NextResponse.json({ error: `${field} must be "pass", "fail", or null` }, { status: 400 });
    }
  }

  try {
    if (Object.keys(update).some((f) => f.startsWith('round'))) await ensureSchema();
    const [before] = await sql`select stage from prospects where id = ${params.id}`;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [field, value] of Object.entries(update)) {
      values.push(value);
      setClauses.push(`${field} = $${values.length}`);
    }
    values.push(params.id);

    const [prospect] = await sql.query(
      `update prospects set ${setClauses.join(', ')} where id = $${values.length} returning *`,
      values
    );
    if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

    if (before && 'stage' in update && update.stage !== before.stage) {
      await sql`
        insert into activity_log (prospect_id, event_type, detail)
        values (${params.id}, 'stage_change', ${`${before.stage} -> ${update.stage}`})
      `;
    }

    return NextResponse.json({ prospect });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`delete from prospects where id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 500 });
  }
}
