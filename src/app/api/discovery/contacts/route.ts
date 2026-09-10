import { NextRequest, NextResponse } from 'next/server';
import { getBacklinkContacts, isAhrefsEnabled, type ContactKind } from '@/lib/ahrefs';
import { insertDiscoveredCandidates, splitName } from '@/lib/discoveryInsert';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';

function normalizeDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

// POST /api/discovery/contacts — Body: { referenceDomain, kind?, nicheKey? }
// Finds named INDIVIDUALS in referenceDomain's backlink profile (e.g.
// biggerpockets.com) rather than websites: bylined authors of pages that
// link to it, and/or podcast/interview guests named in those pages' titles.
// See lib/ahrefs.ts's getBacklinkContacts for the two extraction signals and
// why each needs a human look before approving. Same dedupe/batch/insert
// path as every other discovery source (see lib/discoveryInsert.ts).
export async function POST(req: NextRequest) {
  if (!isAhrefsEnabled()) {
    return NextResponse.json({ error: 'Ahrefs is not configured (AHREFS_API_KEY missing) — required for contact discovery.' }, { status: 400 });
  }

  const { referenceDomain, kind, nicheKey } = (await req.json()) as { referenceDomain: string; kind?: ContactKind | 'all'; nicheKey?: string };
  if (!referenceDomain?.trim()) return NextResponse.json({ error: 'referenceDomain is required' }, { status: 400 });

  const domain = normalizeDomain(referenceDomain);
  const niche = nicheKey ? CREATOR_DISCOVERY_NICHES.find((n) => n.key === nicheKey) : undefined;

  let contacts;
  try {
    contacts = await getBacklinkContacts(domain, kind ?? 'all', 50);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Contact lookup failed' }, { status: 502 });
  }

  if (contacts.length === 0) {
    return NextResponse.json({
      results: [],
      created: 0,
      batchId: null,
      message: `No named contacts found in "${domain}"'s backlink data — either nothing links to it with an identifiable byline or podcast-guest name, or everything found was a general platform. Try a different reference domain.`,
    });
  }

  try {
    const candidates = contacts.map((c) => {
      const { first, last } = splitName(c.name);
      return {
        name: c.name,
        domain: c.domain,
        website: c.website,
        category: c.category,
        contentPresence: c.contentPresence,
        domainRating: c.domainRating,
        contactFirstName: first,
        contactLastName: last,
      };
    });
    const { results, created, batchId } = await insertDiscoveredCandidates(
      candidates,
      `Contacts: ${domain}`,
      domain,
      niche?.key ?? null,
      `ahrefs backlink contacts (${domain})`,
      'discovery'
    );
    return NextResponse.json({ results, created, batchId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save results' }, { status: 500 });
  }
}
