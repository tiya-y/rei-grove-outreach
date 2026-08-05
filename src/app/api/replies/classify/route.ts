import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { classifyReply } from '@/lib/claude';

// POST /api/replies/classify — Body: { messageId }
// Manually (re-)run classification on a stored inbound message — useful if
// the automatic classification during sync failed or should be redone.
export async function POST(req: NextRequest) {
  const db = createServiceClient();
  const { messageId } = await req.json();

  const { data: message, error } = await db.from('messages').select('*, prospects(name)').eq('id', messageId).single();
  if (error || !message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  const text = message.body_text || message.body_html || '';
  const prospectName = (message as unknown as { prospects: { name: string } }).prospects?.name ?? 'the prospect';

  try {
    const result = await classifyReply(text, prospectName);
    const { data: updated, error: updateErr } = await db
      .from('messages')
      .update({
        ai_classification: result.classification,
        ai_confidence: result.confidence,
        ai_suggested_response: result.suggestedResponse,
      })
      .eq('id', messageId)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ message: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Classification failed' }, { status: 500 });
  }
}
