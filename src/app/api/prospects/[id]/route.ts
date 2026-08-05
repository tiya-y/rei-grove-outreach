import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServiceClient();
  const [{ data: prospect, error }, { data: messages }, { data: activity }] = await Promise.all([
    db.from('prospects').select('*').eq('id', params.id).single(),
    db.from('messages').select('*').eq('prospect_id', params.id).order('sent_at', { ascending: true, nullsFirst: true }),
    db.from('activity_log').select('*').eq('prospect_id', params.id).order('created_at', { ascending: false }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ prospect, messages: messages ?? [], activity: activity ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServiceClient();
  const body = await req.json();

  const { data: before } = await db.from('prospects').select('stage').eq('id', params.id).single();

  const allowedFields = [
    'prospect_type', 'name', 'contact_first_name', 'contact_last_name', 'contact_title',
    'email', 'website', 'linkedin_url', 'category', 'city', 'state', 'audience_size_est',
    'content_presence', 'stage', 'notes', 'disqualified', 'disqualify_reason',
  ];
  const update: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field];
  }

  const { data, error } = await db.from('prospects').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (before && 'stage' in update && update.stage !== before.stage) {
    await db.from('activity_log').insert({
      prospect_id: params.id,
      event_type: 'stage_change',
      detail: `${before.stage} -> ${update.stage}`,
    });
  }

  return NextResponse.json({ prospect: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServiceClient();
  const { error } = await db.from('prospects').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
