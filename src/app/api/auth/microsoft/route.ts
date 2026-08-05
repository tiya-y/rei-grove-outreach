import { NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/lib/ms365';

// GET /api/auth/microsoft — redirect the person connecting the mailbox to
// Microsoft's consent screen. Linked from the "Connect Outlook" button in Settings.
export async function GET() {
  return NextResponse.redirect(getAuthorizationUrl());
}
