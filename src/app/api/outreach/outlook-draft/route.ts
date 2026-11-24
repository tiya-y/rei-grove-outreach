import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { unsubscribeFooter } from '@/lib/outreachSend';
import { getDraft, markDraftInOutlook, saveDraft } from '@/lib/draftStore';
import { AFFILIATE_OFFER } from '@/lib/outreachTemplates';
import { createDraft, getAccessToken, getConnection, isOutlookConfigured, readSession, OutlookReconnectError, SESSION_COOKIE } from '@/lib/outlook';

export const dynamic = 'force-dynamic';

// POST /api/outreach/outlook-draft — saves the composed email into the
// signed-in person's own Outlook Drafts folder. Nothing is sent: they open the
// draft in Outlook, review it, and send it themselves, then click "Mark as
// sent" in the app. The unsubscribe footer is added here so the draft matches
// what "Mark as sent" records.
// Body: { prospectId, subject?, body? }. Without subject/body, the prospect's
// saved draft is used (that is how the Outreach tab saves several at once).
// "[Your Name]" is replaced with the connected Microsoft account's name.
export async function POST(req: NextRequest) {
  if (!isOutlookConfigured()) {
    return NextResponse.json({ error: 'Outlook is not set up on the server yet. See Settings.' }, { status: 400 });
  }

  const session = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Connect your Outlook account first.', reconnect: true }, { status: 401 });
  }

  const input = await req.json();
  const { prospectId } = input;
  if (!prospectId) return NextResponse.json({ error: 'prospectId is required' }, { status: 400 });

  let subject: string | undefined = input.subject;
  let body: string | undefined = input.body;
  if (!subject || !body) {
    const saved = await getDraft(prospectId).catch(() => null);
    subject = subject || saved?.subject;
    body = body || saved?.body;
  }
  if (!subject || !body) return NextResponse.json({ error: 'There is no draft for this prospect yet. Generate one first.' }, { status: 400 });

  let prospect;
  try {
    [prospect] = await sql`select * from prospects where id = ${prospectId}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  if (!prospect.email) return NextResponse.json({ error: 'Prospect has no email address on file' }, { status: 400 });
  if (prospect.disqualified) return NextResponse.json({ error: `Prospect is disqualified (${prospect.disqualify_reason})` }, { status: 400 });
  if (prospect.unsubscribed) return NextResponse.json({ error: 'This prospect has unsubscribed, so a draft is blocked.' }, { status: 400 });

  try {
    const conn = await getConnection(session.uid);
    if (!conn) return NextResponse.json({ error: 'Connect your Outlook account first.', reconnect: true }, { status: 401 });

    const accessToken = await getAccessToken(session.uid);
    const toName = [prospect.contact_first_name, prospect.contact_last_name].filter(Boolean).join(' ') || prospect.name;
    const draft = await createDraft(accessToken, {
      toEmail: prospect.email,
      toName,
      subject: String(subject),
      bodyText: (conn.display_name ? String(body).split(AFFILIATE_OFFER.namePlaceholder).join(conn.display_name) : String(body)) + unsubscribeFooter(prospectId),
    });

    // Keep the stored draft in step with what was just saved to Outlook.
    if (input.subject && input.body) {
      await saveDraft(prospectId, { subject: String(subject), body: String(body), offerType: input.offerType, sequenceStep: input.sequenceStep ?? 1, aiGenerated: Boolean(input.aiGenerated) }).catch(() => undefined);
    }
    await markDraftInOutlook(prospectId).catch(() => undefined);

    await sql`
      insert into activity_log (prospect_id, event_type, detail)
      values (${prospectId}, 'outlook_draft', ${`Saved "${String(subject).slice(0, 120)}" to ${conn.email}'s Outlook Drafts`})
    `;
    return NextResponse.json({ draft, mailbox: conn.email });
  } catch (err) {
    if (err instanceof OutlookReconnectError) return NextResponse.json({ error: err.message, reconnect: true }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create the draft' }, { status: 500 });
  }
}
