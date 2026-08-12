import { NextResponse } from 'next/server';
import { runFollowUps } from '@/lib/followUps';

// Internal-only: the "Run follow-ups now" button on the Settings page calls
// this (same-origin, no shared secret needed — see
// /api/outreach/follow-ups/run for the n8n-facing equivalent).
export async function POST() {
  const result = await runFollowUps();
  return NextResponse.json(result);
}
