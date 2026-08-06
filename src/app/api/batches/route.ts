import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET /api/batches — every bulk-import batch (n8n today), newest first, with
// a count of how many prospects it created. Used by the History page.
export async function GET() {
  try {
    const batches = await sql`
      select b.*, count(p.id)::int as prospect_count
      from prospect_batches b
      left join prospects p on p.batch_id = b.id
      group by b.id
      order by b.created_at desc
    `;
    return NextResponse.json({ batches });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
}
