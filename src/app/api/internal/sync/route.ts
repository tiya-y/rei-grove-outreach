import { NextResponse } from 'next/server';
import { syncMailbox } from '@/lib/graphSync';

// Internal-only: the "Sync now" button on the Settings page calls this
// (same-origin, no shared secret needed — see /api/graph/sync for the
// n8n-facing equivalent).
export async function POST() {
  const result = await syncMailbox();
  return NextResponse.json(result);
}
