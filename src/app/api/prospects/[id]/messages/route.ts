import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

// GET /api/prospects/:id/messages — stored thread (fast path, used by the
// prospect detail page). Live re-sync happens via the Settings "Sync now"
// button or the n8n-triggered /api/graph/sync, not on every page load.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const db = createServiceClient();
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('prospect_id', params.id)
    .order('sent_at', { ascending: true, nullsFirst: true })
    .order('received_at', { ascending: true, nullsFirst: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}
