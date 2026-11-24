import { NextRequest, NextResponse } from 'next/server';
import { deleteConnection, readSession, SESSION_COOKIE } from '@/lib/outlook';

export const dynamic = 'force-dynamic';

// POST /api/auth/microsoft/disconnect — forgets this person's stored tokens
// and signs them out of the app's Outlook connection.
export async function POST(req: NextRequest) {
  const session = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  try {
    if (session) await deleteConnection(session.uid);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Disconnect failed' }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
