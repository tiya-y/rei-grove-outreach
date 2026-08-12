import { NextRequest, NextResponse } from 'next/server';
import { requireN8nSecret } from '@/lib/apiAuth';
import { runFollowUps } from '@/lib/followUps';

// External-facing follow-up runner. Point an n8n Schedule Trigger -> HTTP
// Request node here (POST, header `x-n8n-secret: <N8N_WEBHOOK_SECRET>`),
// once a day is plenty since the cadence is measured in days.
export async function POST(req: NextRequest) {
  const authError = requireN8nSecret(req);
  if (authError) return authError;

  const result = await runFollowUps();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
