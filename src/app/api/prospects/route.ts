import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkDisqualifiers } from '@/lib/scoring';

// GET /api/prospects?stage=reached_out&type=creator — list, newest first
export async function GET(req: NextRequest) {
  const db = createServiceClient();
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get('stage');
  const type = searchParams.get('type');

  let query = db.from('prospects').select('*').order('created_at', { ascending: false });
  if (stage) query = query.eq('stage', stage);
  if (type) query = query.eq('prospect_type', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospects: data });
}

// POST /api/prospects — manual add (also used by the "New Prospect" form).
// Runs the automatic disqualifier check from partnership-prospector on every
// new prospect, regardless of source.
export async function POST(req: NextRequest) {
  const db = createServiceClient();
  const body = await req.json();

  if (!body.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { data: settings } = await db.from('app_settings').select('competitor_blocklist').eq('id', 1).maybeSingle();
  const extraBlocklist = (settings?.competitor_blocklist ?? []) as { name: string; reason: string }[];
  const dq = checkDisqualifiers({ name: body.name, website: body.website }, extraBlocklist);

  const { data, error } = await db
    .from('prospects')
    .insert({
      prospect_type: body.prospect_type ?? 'partner',
      name: body.name,
      contact_first_name: body.contact_first_name ?? null,
      contact_last_name: body.contact_last_name ?? null,
      contact_title: body.contact_title ?? null,
      email: body.email ?? null,
      website: body.website ?? null,
      linkedin_url: body.linkedin_url ?? null,
      category: body.category ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      audience_size_est: body.audience_size_est ?? null,
      content_presence: body.content_presence ?? null,
      source: body.source ?? 'manual',
      source_ref: body.source_ref ?? null,
      disqualified: dq.disqualified,
      disqualify_reason: dq.reason ?? null,
      stage: dq.disqualified ? 'pass' : (body.stage ?? 'new'),
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('activity_log').insert({
    prospect_id: data.id,
    event_type: dq.disqualified ? 'disqualified' : 'note',
    detail: dq.disqualified ? `Auto-disqualified on creation: ${dq.reason}` : `Added via ${body.source ?? 'manual'}`,
  });

  return NextResponse.json({ prospect: data, disqualifier: dq }, { status: 201 });
}
