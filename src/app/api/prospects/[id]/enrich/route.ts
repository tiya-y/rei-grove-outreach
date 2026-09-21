import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isApolloEnabled, matchPerson } from '@/lib/apollo';

// Non-personal platform hosts that can end up in `website` depending on
// discovery source — never a prospect's own domain, so never worth sending
// to Apollo as their employer domain.
const PLATFORM_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'podcasts.apple.com', 'itunes.apple.com']);

// `website` means something different per discovery source: for a byline
// contact it's the article they wrote (their own site, usually a fair
// employer-domain guess), for a podcast GUEST found via Contacts it's the
// HOST's show page (not the guest's own site at all), and for a YouTube
// channel it's always youtube.com. Sending the wrong one risks Apollo
// confidently matching a different, unrelated real person who happens to
// work at that domain — so this only trusts `website` as a domain when
// nothing marks it as unreliable.
function pickApolloDomain(prospect: { website: string | null; category: string | null; content_presence: string | null }): string | null {
  if (!prospect.website || prospect.category === 'youtube') return null;
  if (prospect.content_presence?.startsWith('Podcast/interview guest in')) return null;
  try {
    const host = new URL(prospect.website).hostname.replace(/^www\./, '');
    return PLATFORM_HOSTS.has(host) ? null : host;
  } catch {
    return null;
  }
}

// POST /api/prospects/:id/enrich — looks up a work email (and LinkedIn/title
// if available) via Apollo and saves it, without overwriting an email
// that's already on file. Used both from Prospect Search's bulk toolbar
// (before approving) and from Outreach when a prospect is blocked for
// having no email.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isApolloEnabled()) {
    return NextResponse.json({ error: 'Apollo is not configured (APOLLO_API_KEY missing) — required for enrichment.' }, { status: 400 });
  }

  let prospect;
  try {
    [prospect] = await sql`select * from prospects where id = ${params.id}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 });
  }
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  if (prospect.email) {
    return NextResponse.json({ prospect, match: { matchConfidence: 'skipped_has_email' } });
  }
  if (!prospect.contact_first_name && !prospect.contact_last_name) {
    return NextResponse.json({ error: 'No contact name on file to match against — enrichment needs at least a name.' }, { status: 400 });
  }

  const domain = pickApolloDomain({ website: prospect.website, category: prospect.category, content_presence: prospect.content_presence });

  let match;
  try {
    match = await matchPerson({
      firstName: prospect.contact_first_name,
      lastName: prospect.contact_last_name,
      fullName: prospect.name,
      domain,
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
