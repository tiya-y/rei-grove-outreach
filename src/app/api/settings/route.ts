import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    const [settings] = await sql`select * from app_settings where id = 1`;
    return NextResponse.json({
      settings: settings ?? { competitor_blocklist: [], scoring_weights: {} },
      ahrefsEnabled: Boolean(process.env.AHREFS_API_KEY),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();

  const setClauses: string[] = [];
  const values: unknown[] = [];
  if ('competitor_blocklist' in body) {
    values.push(JSON.stringify(body.competitor_blocklist));
    setClauses.push(`competitor_blocklist = $${values.length}`);
  }
  if ('scoring_weights' in body) {
    values.push(JSON.stringify(body.scoring_weights));
    setClauses.push(`scoring_weights = $${values.length}`);
  }
  if (setClauses.length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  try {
    const [settings] = await sql.query(`update app_settings set ${setClauses.join(', ')} where id = 1 returning *`, values);
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 });
  }
}
