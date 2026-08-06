import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET /api/communications — every prospect with at least one message,
// aggregated (message count, last activity), newest activity first. Used by
// the History page as a directory into full threads on the prospect detail
// page (regardless of the prospect's current pipeline stage).
export async function GET() {
  try {
    const communications = await sql`
      select
        p.id as prospect_id,
        p.name,
        p.prospect_type,
        p.stage,
        count(m.id)::int as message_count,
        max(coalesce(m.sent_at, m.received_at)) as last_activity_at
      from prospects p
      join messages m on m.prospect_id = p.id
      group by p.id
      order by last_activity_at desc
    `;
    return NextResponse.json({ communications });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
}
