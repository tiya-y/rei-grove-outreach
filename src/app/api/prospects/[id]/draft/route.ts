import { NextRequest, NextResponse } from 'next/server';
import { getDraft, saveDraft } from '@/lib/draftStore';

export const dynamic = 'force-dynamic';

// GET /api/prospects/[id]/draft — the saved draft, if any.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json({ draft: await getDraft(params.id) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
}

// PUT /api/prospects/[id]/draft — save edits to the draft.
// Body: { subject, body, offerType?, sequenceStep?, aiGenerated? }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  if (!b.subject || !b.body) return NextResponse.json({ error: 'subject and body are required' }, { status: 400 });
  try {
    const draft = await saveDraft(params.id, { subject: String(b.subject), body: String(b.body), offerType: b.offerType, sequenceStep: b.sequenceStep, aiGenerated: b.aiGenerated });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 500 });
  }
}
