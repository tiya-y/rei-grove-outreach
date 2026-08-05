// Shared-secret check for routes hit by n8n (or Vercel Cron) rather than the
// app's own browser UI. Internal CRUD routes deliberately don't use this —
// this is an internal tool with no per-user auth yet (see README "Security
// notes"), matching the rest of the app's permissive RLS policies.
import { NextRequest, NextResponse } from 'next/server';

export function requireN8nSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'N8N_WEBHOOK_SECRET is not configured on the server.' }, { status: 500 });
  }
  const provided = req.headers.get('x-n8n-secret');
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized — missing or incorrect x-n8n-secret header.' }, { status: 401 });
  }
  return null;
}
