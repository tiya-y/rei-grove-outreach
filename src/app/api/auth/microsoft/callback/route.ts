import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCode,
  getProfile,
  saveConnection,
  signSession,
  isEmailAllowed,
  isOutlookConfigured,
  describeMicrosoftError,
  originFromHeaders,
  sessionCookieOptions,
  OAUTH_COOKIE,
  SESSION_COOKIE,
} from '@/lib/outlook';

export const dynamic = 'force-dynamic';

function readOauthCookie(raw: string | undefined): { state: string; returnTo: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.state === 'string' && typeof parsed.returnTo === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

// GET /api/auth/microsoft/callback — Microsoft sends the person back here with
// a one-time code. Trade it for tokens, store them encrypted under the
// person's Microsoft account id, and set the signed session cookie.
export async function GET(req: NextRequest) {
  const origin = originFromHeaders(req.headers, req.url);
  const fail = (message: string) => {
    const res = NextResponse.redirect(`${origin}/settings?outlook_error=${encodeURIComponent(message)}`);
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };

  if (!isOutlookConfigured()) return fail('Outlook is not set up on the server.');

  const params = req.nextUrl.searchParams;
  const denied = params.get('error_description') || params.get('error');
  if (denied) return fail(denied.split('\r\n')[0].slice(0, 300));

  const saved = readOauthCookie(req.cookies.get(OAUTH_COOKIE)?.value);
  const code = params.get('code');
  if (!code) return fail('Microsoft did not send a sign-in code.');
  if (!saved || saved.state !== params.get('state')) {
    return fail('The sign-in could not be verified (state mismatch). Start the connection again from Settings.');
  }

  try {
    const tokens = await exchangeCode(code, origin);
    if (!tokens.refresh_token) {
      return fail('Microsoft did not return a refresh token. Check that offline_access is added to the app registration permissions.');
    }
    const profile = await getProfile(tokens.access_token);
    if (!isEmailAllowed(profile.email)) {
      return fail(`${profile.email} is not on this app's allowed list (MS365_ALLOWED_EMAILS).`);
    }

    await saveConnection(profile, { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in });

    const res = NextResponse.redirect(`${origin}${saved.returnTo.startsWith('/') && !saved.returnTo.startsWith('//') ? saved.returnTo : '/settings'}`);
    res.cookies.set(SESSION_COOKIE, signSession({ uid: profile.id, email: profile.email }), sessionCookieOptions());
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch (err) {
    return fail(describeMicrosoftError(err));
  }
}
