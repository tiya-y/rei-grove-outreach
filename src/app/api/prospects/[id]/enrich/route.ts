import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isApolloEnabled, matchPerson } from '@/lib/apollo';
import { resolveCompany } from '@/lib/company';
import { isFullyQualified, type Prospect } from '@/types';

// POST /api/prospects/:id/enrich — the email reveal. Looks up a work email
// (and LinkedIn/title if available) via Apollo and saves it, without
// overwriting an email that's already on file. Only allowed once the
// contact has passed all three qualification rounds, so no Apollo credit
// is spent on someone who hasn't earned it. Used from Prospect Search's
// bulk toolbar and from Outreach when a prospect has no email.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isApolloEnabled()) {
    return NextResponse.json({ error: 'Apollo is not configured (APOLLO_API_KEY missing) — required for enrichment.' }, { status: 400 });
  }

  let prospect: Prospect | undefined;
  try {
    [prospect] = (await sql`select * from prospects where id = ${params.id}`) as Prospect[];
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  if (prospect.email) {
    return NextResponse.json({ prospect, match: { matchConfidence: 'skipped_has_email' } });
  }
  if (!isFullyQualified(prospect)) {
    return NextResponse.json({ error: 'Email can only be revealed after the contact passes all three qualification rounds.' }, { status: 400 });
  }
  if (!prospect.contact_first_name && !prospect.contact_last_name) {
    return NextResponse.json({ error: 'No contact name on file to match against — enrichment needs at least a name.' }, { status: 400 });
  }

  const domain = resolveCompany(prospect).domain;

  let match;
  try {
    match = await matchPerson({
      firstName: prospect.contact_first_name,
      lastName: prospect.contact_last_name,
      fullName: prospect.name,
      domain,
      linkedinUrl: prospect.linkedin_url,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Apollo lookup failed' }, { status: 502 });
  }

  if (!match.email) {
    await sql`
      insert into activity_log (prospect_id, event_type, detail)
      values (${params.id}, 'note', ${`Apollo enrichment found no email (match_confidence: ${match.matchConfidence ?? 'none'}).`})
    `;
    return NextResponse.json({ prospect, match });
  }

  try {
    const [updated] = await sql`
      update prospects set
        email = ${match.email},
        linkedin_url = coalesce(linkedin_url, ${match.linkedinUrl}),
        contact_title = coalesce(contact_title, ${match.title})
      where id = ${params.id}
      returning *
    `;
    await sql`
      insert into activity_log (prospect_id, event_type, detail)
      values (${params.id}, 'note', ${`Apollo enrichment found email (match_confidence: ${match.matchConfidence}).`})
    `;
    return NextResponse.json({ prospect: updated, match });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 500 });
  }
}
