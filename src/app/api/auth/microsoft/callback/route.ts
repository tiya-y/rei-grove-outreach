import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getMyProfile } from '@/lib/ms365';
import { createServiceClient } from '@/lib/supabase';

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

    const db = createServiceClient();
    // Deactivate any previous connection, then insert the fresh one — keeps
    // history around in the table but "active" always points to the mailbox
    // currently authorized to send/read.
    await db.from('mailbox_connections').update({ is_active: false }).eq('is_active', true);
    await db.from('mailbox_connections').insert({
      label: 'Primary outreach inbox',
      email: profile.mail ?? profile.userPrincipalName,
      ms365_user_id: profile.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
    });

    return NextResponse.redirect(`${appUrl}/settings?connected=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(message)}`);
  }
}
