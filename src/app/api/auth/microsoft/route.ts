import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { authorizationUrl, isOutlookConfigured, missingOutlookEnv, originFromHeaders, OAUTH_COOKIE } from '@/lib/outlook';

export const dynamic = 'force-dynamic';

// GET /api/auth/microsoft?return=/some/path — sends the person to Microsoft's
// sign-in. A random state value is kept in a short-lived cookie and checked at
// the callback, so a sign-in can only complete in the browser that started it.
export async function GET(req: NextRequest) {
  const origin = originFromHeaders(req.headers, req.url);

  if (!isOutlookConfigured()) {
    const msg = `Outlook is not set up yet. Missing: ${missingOutlookEnv().join(', ')}.`;
    return NextResponse.redirect(`${origin}/settings?outlook_error=${encodeURIComponent(msg)}`);
  }

  // Only same-site relative paths, so this can't be used as an open redirect.
  const requested = req.nextUrl.searchParams.get('return') ?? '/settings';
  const returnTo = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/settings';

  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(authorizationUrl(origin, state));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/microsoft',
    maxAge: 600,
  });
  return res;
}
