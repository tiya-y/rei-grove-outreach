import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

function htmlPage(message: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title>
<style>body{font-family:Poppins,sans-serif;background:#f5f7f5;color:#4a5568;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
.card{background:#fff;border:1px solid #e2e8e0;border-radius:12px;padding:32px;max-width:420px}
h1{color:#26463d;font-size:20px;margin:0 0 8px}</style></head>
<body><div class="card"><h1>${message}</h1></div></body></html>`;
}

// GET /api/unsubscribe/:id — public, no auth. A person clicks this straight
// from their inbox, so it just needs to work in a browser with no API
// client. Stops the automated follow-up sequence immediately.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const [prospect] = await sql`
      update prospects set unsubscribed = true, unsubscribed_at = now()
      where id = ${params.id}
      returning id
    `;
    if (!prospect) {
      return new NextResponse(htmlPage("We couldn't find that subscription, but you won't hear from us either way."), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    await sql`
      insert into activity_log (prospect_id, event_type, detail)
      values (${params.id}, 'unsubscribed', 'Unsubscribed via email link')
    `;

    return new NextResponse(htmlPage("You're unsubscribed. We won't send any more emails."), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch {
    return new NextResponse(htmlPage('Something went wrong processing this request.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
