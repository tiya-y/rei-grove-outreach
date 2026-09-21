// ============================================================
// Apollo API client — enriches a discovered prospect's name with a real
// work email via Apollo's People Match endpoint. This is what actually
// unblocks Outreach: none of the discovery sources reliably return contact
// info (only YouTube's bio mining sometimes does), and Outreach hard-blocks
// drafting/sending without prospect.email (see OutreachComposer.tsx and
// api/outreach/send). Optional: if APOLLO_API_KEY isn't set, enrichment is
// disabled and the UI says so — same pattern as Ahrefs/YouTube.
//
// Real path/auth verified by probing the API directly with a bogus key
// before writing this client (a wrong path 404s regardless of auth; this
// one returned a structured "invalid API key" 401 naming the exact header
// it expects), cross-checked against Apollo's own docs at
// docs.apollo.io/reference/people-enrichment. NOT verified against a real
// API key/real match, since this app has none configured yet — the
// response-shape parsing below follows Apollo's documented field names.
// ============================================================

import axios from 'axios';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

export function isApolloEnabled() {
  return Boolean(process.env.APOLLO_API_KEY);
}

function apolloClient() {
  return axios.create({
    baseURL: APOLLO_BASE,
    headers: {
      'X-Api-Key': process.env.APOLLO_API_KEY,
      'Content-Type': 'application/json',
    },
  });
}

function apolloErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const detail = typeof data === 'string' ? data : (data?.error_details?.message ?? data?.error ?? (data ? JSON.stringify(data) : err.message));
    return `Apollo ${status ?? 'request'} error: ${detail}`;
  }
  return err instanceof Error ? err.message : 'Unknown Apollo error';
}

export interface ApolloMatchInput {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  // The person's OWN domain (their company/personal site), not just any
  // domain associated with where they were found — see
  // pickApolloMatchDomain in the enrich route for why that distinction
  // matters (sending the wrong domain risks matching a different, unrelated
  // real person who happens to work there).
  domain?: string | null;
  organizationName?: string | null;
}

export interface ApolloMatchResult {
  email: string | null;
  matchConfidence: 'high' | 'medium' | 'low' | 'none' | null;
  linkedinUrl: string | null;
  title: string | null;
}

/**
 * Looks up one person's work email via Apollo's People Match endpoint.
 * A name with no domain/organization essentially never produces a
 * confident match per Apollo's own docs — pass one when you have it.
 */
export async function matchPerson(input: ApolloMatchInput): Promise<ApolloMatchResult> {
  if (!isApolloEnabled()) {
    return { email: null, matchConfidence: null, linkedinUrl: null, title: null };
  }

  const body: Record<string, string> = {};
  if (input.firstName) body.first_name = input.firstName;
  if (input.lastName) body.last_name = input.lastName;
  if (!input.firstName && !input.lastName && input.fullName) body.name = input.fullName;
  if (input.domain) body.domain = input.domain;
  if (input.organizationName) body.organization_name = input.organizationName;

  try {
    const res = await apolloClient().post('/people/match', body);
    const person = res.data?.person;
    if (!person) return { email: null, matchConfidence: 'none', linkedinUrl: null, title: null };
    return {
      email: person.email ?? null,
      matchConfidence: person.match_confidence ?? (person.email ? 'high' : 'none'),
      linkedinUrl: person.linkedin_url ?? null,
      title: person.title ?? null,
    };
  } catch (err) {
    throw new Error(apolloErrorMessage(err));
  }
}
