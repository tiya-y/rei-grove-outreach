import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureOutreachSchema } from '@/lib/schema';
import { listExamples, parseExample } from '@/lib/outreachDraft';

export const dynamic = 'force-dynamic';
const MAX_EXAMPLES = 20;

// GET /api/outreach/examples — the example emails new drafts are based on.
export async function GET() {
  try {
    return NextResponse.json({ examples: await listExamples() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
}

// POST /api/outreach/examples — add one example. Body: { text, label?, subject? }
// "text" is the pasted email or the contents of an uploaded text file. A
// "Subject:" line (or email headers) at the top is split off as the subject.
export async function POST(req: NextRequest) {
  const b = await req.json();
  if (typeof b.text !== 'string' || !b.text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });

  let parsed;
  try {
    parsed = parseExample(b.text);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not read that email' }, { status: 400 });
  }
  const subject = (typeof b.subject === 'string' && b.subject.trim()) || parsed.subject;
  const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 80) : null;

  try {
    await ensureOutreachSchema();
    const [{ count }] = await sql`select count(*)::int as count from email_examples`;
    if (count >= MAX_EXAMPLES) return NextResponse.json({ error: `You already have ${MAX_EXAMPLES} examples. Delete one first.` }, { status: 400 });
    const [example] = await sql`
      insert into email_examples (label, subject, body) values (${label}, ${subject}, ${parsed.body}) returning *
    `;
    return NextResponse.json({ example });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 500 });
  }
}

// DELETE /api/outreach/examples?id=... — remove one example.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  try {
    await ensureOutreachSchema();
    await sql`delete from email_examples where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 500 });
  }
}
