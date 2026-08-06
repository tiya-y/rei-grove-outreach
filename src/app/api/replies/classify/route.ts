import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { classifyReply } from '@/lib/claude';

// POST /api/replies/classify — Body: { messageId }
// Manually (re-)run classification on a stored inbound message — useful if
// the automatic classification during sync failed or should be redone.
export async function POST(req: NextRequest) {
  const { messageId } = await req.json();

  let message;
  try {
    [message] = await sql`
      select m.*, p.name as prospect_name
      from messages m
      join prospects p on p.id = m.prospect_id
      where m.id = ${messageId}
    `;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  const text = message.body_text || message.body_html || '';
  const prospectName = message.prospect_name ?? 'the prospect';

  try {
    const result = await classifyReply(text, prospectName);
    const [updated] = await sql`
      update messages
      set ai_classification = ${result.classification}, ai_confidence = ${result.confidence}, ai_suggested_response = ${result.suggestedResponse}
      where id = ${messageId}
      returning *
    `;
    return NextResponse.json({ message: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Classification failed' }, { status: 500 });
  }
}
