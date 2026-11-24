import { NextRequest, NextResponse } from 'next/server';
import { getConnection, isOutlookConfigured, missingOutlookEnv, readSession, SESSION_COOKIE, CALLBACK_PATH, originFromHeaders, redirectUri } from '@/lib/outlook';

export const dynamic = 'force-dynamic';

// GET /api/auth/microsoft/status — is Outlook set up on the server, and is
// THIS browser's person connected? Used by Settings and the outreach composer.
export async function GET(req: NextRequest) {
  const configured = isOutlookConfigured();
  const redirect = redirectUri(originFromHeaders(req.headers, req.url));
  const base = { configured, missing: missingOutlookEnv(), redirectUri: redirect, callbackPath: CALLBACK_PATH };
  if (!configured) return NextResponse.json({ ...base, connected: false, email: null, displayName: null });

  const session = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ ...base, connected: false, email: null, displayName: null });

  try {
    const conn = await getConnection(session.uid);
    return NextResponse.json({ ...base, connected: Boolean(conn), email: conn?.email ?? null, displayName: conn?.display_name ?? null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not read the Outlook connection' }, { status: 500 });
  }
}
