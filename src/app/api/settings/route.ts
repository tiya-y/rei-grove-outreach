import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function GET() {
  const db = createServiceClient();
  const [{ data: settings }, { data: mailbox }] = await Promise.all([
    db.from('app_settings').select('*').eq('id', 1).maybeSingle(),
    db.from('mailbox_connections').select('id,label,email,last_synced_at,is_active,created_at').eq('is_active', true).maybeSingle(),
  ]);
  return NextResponse.json({
    settings: settings ?? { competitor_blocklist: [], scoring_weights: {} },
    mailbox: mailbox ?? null,
    ahrefsEnabled: Boolean(process.env.AHREFS_API_KEY),
  });
}

export async function PATCH(req: NextRequest) {
  const db = createServiceClient();
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if ('competitor_blocklist' in body) update.competitor_blocklist = body.competitor_blocklist;
  if ('scoring_weights' in body) update.scoring_weights = body.scoring_weights;

  const { data, error } = await db.from('app_settings').update(update).eq('id', 1).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
