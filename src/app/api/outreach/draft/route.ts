import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { generateOutreachEmail } from '@/lib/claude';

// POST /api/outreach/draft — generate copy without sending or saving.
// Body: { prospectId, offerType?, sequenceStep? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.prospectId) return NextResponse.json({ error: 'prospectId is required' }, { status: 400 });

  let prospect;
  try {
    [prospect] = await sql`select * from prospects where id = ${body.prospectId}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

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
