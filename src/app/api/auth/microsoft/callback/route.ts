import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getMyProfile } from '@/lib/ms365';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error_description') || searchParams.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (errorParam) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(errorParam)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${appUrl}/settings?error=missing_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getMyProfile(tokens.access_token);

    // Deactivate any previous connection, then insert the fresh one — keeps
    // history around in the table but "active" always points to the mailbox
    // currently authorized to send/read.
    await sql`update mailbox_connections set is_active = false where is_active = true`;
    await sql`
      insert into mailbox_connections (label, email, ms365_user_id, access_token, refresh_token, token_expires_at, is_active)
      values (
        'Primary outreach inbox', ${profile.mail ?? profile.userPrincipalName}, ${profile.id},
        ${tokens.access_token}, ${tokens.refresh_token}, ${new Date(Date.now() + tokens.expires_in * 1000).toISOString()}, true
      )
    `;

    return NextResponse.redirect(`${appUrl}/settings?connected=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(message)}`);
  }
}
