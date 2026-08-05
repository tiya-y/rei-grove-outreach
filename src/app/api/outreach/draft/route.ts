import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateOutreachEmail } from '@/lib/claude';

// POST /api/outreach/draft — generate copy without sending or saving.
// Body: { prospectId, offerType?, sequenceStep? }
export async function POST(req: NextRequest) {
  const db = createServiceClient();
  const body = await req.json();
  if (!body.prospectId) return NextResponse.json({ error: 'prospectId is required' }, { status: 400 });

  const { data: prospect, error } = await db.from('prospects').select('*').eq('id', body.prospectId).single();
  if (error || !prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  if (prospect.disqualified) {
    return NextResponse.json({ error: `This prospect is disqualified (${prospect.disqualify_reason}). Remove the disqualification before drafting outreach.` }, { status: 400 });
  }

  try {
    const draft = await generateOutreachEmail({
      prospectName: prospect.name,
      prospectType: prospect.prospect_type,
      contactFirstName: prospect.contact_first_name ?? undefined,
      category: prospect.category ?? undefined,
      website: prospect.website ?? undefined,
      contentNotes: prospect.content_presence ?? prospect.notes ?? undefined,
      offerType: body.offerType,
      sequenceStep: body.sequenceStep ?? 1,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Draft generation failed' }, { status: 500 });
  }
}
