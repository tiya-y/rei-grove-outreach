import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET /api/prospects/:id/messages — the prospect's sent log (fast path, used
// by the prospect detail page).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const messages = await sql`
      select * from messages
      where prospect_id = ${params.id}
      order by sent_at asc nulls first
    `;
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
}
