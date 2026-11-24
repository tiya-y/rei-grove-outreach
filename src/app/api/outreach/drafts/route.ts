import { NextResponse } from 'next/server';
import { listDraftSummaries, listSentPrograms } from '@/lib/draftStore';

export const dynamic = 'force-dynamic';

// GET /api/outreach/drafts — which prospects have a saved draft for which
// program, and which programs' first emails were already sent (for the
// Outreach tab's Draft column and its eligibility rules).
export async function GET() {
  try {
    const [drafts, sent] = await Promise.all([listDraftSummaries(), listSentPrograms()]);
    return NextResponse.json({ drafts, sent });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
}
