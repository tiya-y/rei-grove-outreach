// ============================================================
// Google results via Serper (google.serper.dev) — the evidence source for
// qualification Rounds 1 to 3 and for the "LinkedIn (via Google)" discovery
// mode. LinkedIn itself has no public API and scraping it breaks its terms,
// so the only LinkedIn data used anywhere here is what Google already shows
// in its own search results (title and snippet of a public profile).
//
// Verified: the X-API-KEY header (a missing key and a wrong key return
// different error messages, so the header is the thing being read), the
// organic[] result shape (title, link, snippet, position), and the free
// tier (2,500 queries, no card). NOT verified: the exact /search path and
// request body, because Serper checks auth before routing, so a fake path
// can't be told apart from a real one without a working key. Both are from
// Serper's documented API; a wrong path would surface as a clear error on
// the first real query.
// ============================================================

import axios from 'axios';

const SERPER_URL = 'https://google.serper.dev/search';

export function isSearchEnabled() {
  return Boolean(process.env.SERPER_API_KEY);
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

function searchErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const detail = typeof data === 'string' ? data : (data?.message ?? (data ? JSON.stringify(data) : err.message));
    return `Search ${status ?? 'request'} error: ${detail}`;
  }
  return err instanceof Error ? err.message : 'Unknown search error';
}

export async function webSearch(query: string, num = 6): Promise<SearchResult[]> {
  if (!isSearchEnabled()) throw new Error('SERPER_API_KEY is not configured.');
  try {
    const res = await axios.post(
      SERPER_URL,
      { q: query, num, gl: 'us', hl: 'en' },
      { headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const organic = (res.data?.organic ?? []) as { title?: string; link?: string; snippet?: string }[];
    return organic
      .filter((r) => r.link)
      .map((r) => ({ title: (r.title ?? '').slice(0, 200), link: r.link as string, snippet: (r.snippet ?? '').slice(0, 400) }));
  } catch (err) {
    throw new Error(searchErrorMessage(err));
  }
}

// ── LinkedIn profile discovery (X-ray search through Google) ────────────────
// Google titles public LinkedIn profiles like "Jane Doe - Property Manager -
// Acme Rentals | LinkedIn". This is parsed from real result titles only; the
// profile URL is kept exactly as Google returned it. The format is a
// convention, not a contract, and was not tested against live results (no
// Serper key in this environment), so the parser skips anything that doesn't
// match instead of guessing, and every result still goes through the
// qualification rounds.

export interface LinkedInProfile {
  name: string;
  title: string | null;
  company: string | null;
  url: string;
}

const LETTER = "A-Za-z\u00C0-\u024F";
const NAME_PATTERN = new RegExp(`^[${LETTER}][${LETTER}'.-]*(\\s+[${LETTER}][${LETTER}'.-]*){1,3}$`);

export function parseLinkedInResult(result: SearchResult): LinkedInProfile | null {
  if (!/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\//i.test(result.link)) return null;

  const cleaned = result.title.replace(/\s*[|\-]\s*LinkedIn\s*$/i, '').trim();
  const parts = cleaned.split(/\s+-\s+/);
  const name = parts[0].split(',')[0].replace(/\(.*?\)/g, '').trim();
  if (!NAME_PATTERN.test(name)) return null;

  let title: string | null = null;
  let company: string | null = null;
  if (parts.length >= 3) {
    title = parts[1].trim();
    company = parts.slice(2).join(' - ').trim();
  } else if (parts.length === 2) {
    const m = parts[1].match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
    if (m) {
      title = m[1].trim();
      company = m[2].trim();
    } else {
      title = parts[1].trim();
    }
  }

  return { name, title: title || null, company: company || null, url: result.link };
}

export async function findLinkedInProfiles(titleKeywords: string, topic: string, location: string): Promise<{ profiles: LinkedInProfile[]; totalResults: number }> {
  const query = ['site:linkedin.com/in', `"${titleKeywords.trim()}"`, topic.trim(), location.trim()].filter(Boolean).join(' ');
  const results = await webSearch(query, 10);
  const seen = new Set<string>();
  const profiles: LinkedInProfile[] = [];
  for (const r of results) {
    const p = parseLinkedInResult(r);
    if (!p || seen.has(p.url)) continue;
    seen.add(p.url);
    profiles.push(p);
  }
  return { profiles, totalResults: results.length };
}
