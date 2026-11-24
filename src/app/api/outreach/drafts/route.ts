import { NextResponse } from 'next/server';
import { listDraftSummaries } from '@/lib/draftStore';

export const dynamic = 'force-dynamic';

// GET /api/outreach/drafts — which prospects have a saved draft (for the
// Outreach tab's Draft column).
export async function GET() {
  try {
    return NextResponse.json({ drafts: await listDraftSummaries() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
}
