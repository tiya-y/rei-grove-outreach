// ============================================================
// Ahrefs client — used to enrich a prospect's website with domain authority
// and traffic signals that feed the "Audience Size" / "Content Presence"
// scoring dimensions, and to power Prospect Search's "Discover creators"
// search (real, currently-ranking sites for a niche's keywords, rather than
// an LLM guessing at names). Optional: if AHREFS_API_KEY isn't set, every
// function here resolves to null/empty and the UI just shows "no data"
// instead of failing.
// ============================================================

import axios from 'axios';

const AHREFS_BASE = 'https://api.ahrefs.com/v3';

function ahrefsEnabled() {
  return Boolean(process.env.AHREFS_API_KEY);
}

function ahrefsClient() {
  return axios.create({
    baseURL: AHREFS_BASE,
    headers: {
      Authorization: `Bearer ${process.env.AHREFS_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
}

export interface DomainMetrics {
  domain: string;
  domainRating: number | null;
  organicKeywords: number | null;
  organicTraffic: number | null;
}

function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, '');
}

/**
 * Domain Rating + organic traffic estimate for one or more domains
 * (batch-analysis, mode=subdomains). Throws a specific error on request
 * failure rather than silently returning nulls, which used to make a real
 * API/auth problem look identical to "Ahrefs just has no data here."
 */
export async function getDomainMetrics(domains: string[]): Promise<DomainMetrics[]> {
  if (!ahrefsEnabled() || domains.length === 0) {
    return domains.map((domain) => ({ domain, domainRating: null, organicKeywords: null, organicTraffic: null }));
  }

  try {
    const res = await ahrefsClient().get('/batch-analysis', {
      params: {
        select: 'url,domain_rating,org_traffic,org_keywords',
        targets: JSON.stringify(domains.map((domain) => ({ url: domain, mode: 'subdomains', protocol: 'both' }))),
      },
    });
    const rows = (res.data?.targets ?? []) as { url: string; domain_rating: number; org_traffic: number; org_keywords: number }[];
    return domains.map((domain) => {
      const row = rows.find((r) => stripTrailingSlash(r.url) === domain);
      return {
        domain,
        domainRating: row?.domain_rating ?? null,
        organicKeywords: row?.org_keywords ?? null,
        organicTraffic: row?.org_traffic ?? null,
      };
    });
  } catch (err) {
    throw new Error(ahrefsErrorMessage(err));
  }
}

interface SerpPosition {
  url: string;
  title: string | null;
  position: number;
  traffic: number | null;
  domain_rating: number | null;
}

/** Formats an Ahrefs request failure with enough detail to actually debug it. */
function ahrefsErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const detail = typeof data === 'string' ? data : data ? JSON.stringify(data) : err.message;
    return `Ahrefs ${status ?? 'request'} error: ${detail}`;
  }
  return err instanceof Error ? err.message : 'Unknown Ahrefs error';
}

/**
 * Top-ranking organic results for a keyword. Throws (with a real, specific
 * message) on request failure rather than swallowing it — a silent [] here
 * used to make every Ahrefs error look identical to "no results found."
 */
async function searchTopResultsForKeyword(keyword: string, country = 'us', topPositions = 15): Promise<SerpPosition[]> {
  const res = await ahrefsClient().get('/serp-overview', {
    params: { keyword, country, type: 'organic', top_positions: topPositions, select: 'url,title,position,traffic,domain_rating' },
  });
  return res.data?.positions ?? [];
}

export interface DiscoveredDomain {
  name: string;
  domain: string;
  website: string;
  contentPresence: string;
  domainRating: number | null;
}

function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function nameFromDomain(domain: string): string {
  const label = domain.split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// General platforms, marketplaces, and mega-media sites that reliably rank
// for informational real-estate/landlord queries but are never themselves a
// "content creator" prospect. Filtered out before scoring/sorting candidates
// — without this, results skew toward Reddit/BuzzFeed/Wikipedia/the
// platforms themselves rather than the independent sites we actually want.
const PLATFORM_DOMAIN_BLOCKLIST = [
  'reddit.com', 'quora.com', 'pinterest.com', 'facebook.com', 'instagram.com', 'tiktok.com',
  'linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'medium.com', 'wikihow.com', 'wikipedia.org',
  'buzzfeed.com', 'forbes.com', 'businessinsider.com', 'nerdwallet.com', 'investopedia.com',
  'amazon.com', 'google.com', 'bing.com', 'yahoo.com', 'airbnb.com', 'vrbo.com', 'yelp.com', 'nytimes.com',
];

function isBlockedPlatform(domain: string): boolean {
  return PLATFORM_DOMAIN_BLOCKLIST.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

/**
 * Runs each of a niche's keywords through Ahrefs SERP Overview, dedupes the
 * ranking domains, drops general platforms/marketplaces/mega-media (Reddit,
 * BuzzFeed, Airbnb.com itself, etc. — real ranking results, just never
 * "creator" prospects) and anything with no backlink profile at all, then
 * returns up to `targetCount` sorted by Domain Rating. Real, verifiable URLs
 * only — no invented names or guessed sites. Results still need a human look
 * before approving: some property-management-software blogs and other
 * non-individual sites will still slip through, and format (blog vs.
 * podcast vs. newsletter) isn't detectable from search rankings alone, so
 * everything lands tagged "blog" for you to reclassify.
 */
export interface DiscoverDomainsResult {
  candidates: DiscoveredDomain[];
  errors: string[];
}

export async function discoverDomainsForNiche(keywords: string[], targetCount: number): Promise<DiscoverDomainsResult> {
  if (!ahrefsEnabled()) return { candidates: [], errors: ['AHREFS_API_KEY is not configured.'] };

  const byDomain = new Map<string, { title: string | null; keyword: string; domainRating: number | null; traffic: number | null }>();
  const errors: string[] = [];

  for (const keyword of keywords) {
    try {
      const positions = await searchTopResultsForKeyword(keyword);
      for (const pos of positions) {
        const domain = domainFromUrl(pos.url);
        if (!domain || byDomain.has(domain) || isBlockedPlatform(domain)) continue;
        byDomain.set(domain, { title: pos.title, keyword, domainRating: pos.domain_rating, traffic: pos.traffic });
      }
    } catch (err) {
      errors.push(`"${keyword}" — ${ahrefsErrorMessage(err)}`);
    }
  }

  const candidates = Array.from(byDomain.entries())
    .filter(([, info]) => (info.domainRating ?? 0) > 0)
    .sort((a, b) => (b[1].domainRating ?? 0) - (a[1].domainRating ?? 0))
    .slice(0, targetCount)
    .map(([domain, info]) => ({
      name: nameFromDomain(domain),
      domain,
      website: domain,
      contentPresence: info.title
        ? `Ranks in Google search for "${info.keyword}" with the post "${info.title}" (Domain Rating ${info.domainRating}${info.traffic ? `, ~${info.traffic} est. monthly organic visits` : ''}).`
        : `Ranks in Google search for "${info.keyword}" (Domain Rating ${info.domainRating}${info.traffic ? `, ~${info.traffic} est. monthly organic visits` : ''}).`,
      domainRating: info.domainRating,
    }));

  return { candidates, errors };
}

export function isAhrefsEnabled() {
  return ahrefsEnabled();
}
