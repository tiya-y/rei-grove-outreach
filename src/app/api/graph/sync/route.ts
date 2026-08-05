import { NextRequest, NextResponse } from 'next/server';
import { requireN8nSecret } from '@/lib/apiAuth';
import { syncMailbox } from '@/lib/graphSync';

// External-facing sync trigger. Point an n8n Schedule Trigger -> HTTP Request
// node here (POST, header `x-n8n-secret: <N8N_WEBHOOK_SECRET>`) on whatever
// cadence you want thread monitoring to run — every 10-15 min is reasonable.
// (Vercel Hobby's cron only runs once/day, so n8n is the recommended
// scheduler for this — see DEPLOY.md.)
export async function POST(req: NextRequest) {
  const authError = requireN8nSecret(req);
  if (authError) return authError;

  const result = await syncMailbox();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
