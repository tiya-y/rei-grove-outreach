// ============================================================
// Ahrefs client — used to enrich a prospect's website with domain authority
// and traffic signals that feed the "Audience Size" / "Content Presence"
// scoring dimensions, and to power Prospect Search's "Discover creators"
// search (real, currently-ranking sites/videos/discussions for a niche's
// keywords, rather than an LLM guessing at names). Optional: if
// AHREFS_API_KEY isn't set, every function here resolves to null/empty and
// the UI just shows "no data" instead of failing.
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
    // Real path doubles the segment: /v3/batch-analysis/batch-analysis. POST
    // with a JSON body (not query params) — confirmed against Ahrefs' actual
    // API reference after the first guess 404'd.
    const res = await ahrefsClient().post('/batch-analysis/batch-analysis', {
      select: ['url', 'domain_rating', 'org_traffic', 'org_keywords'],
      targets: domains.map((domain) => ({ url: domain, mode: 'subdomains', protocol: 'both' })),
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
  type: string[];
}

// What kind of SERP result to search for. Maps to Ahrefs' `type` filter —
// 'all' omits the filter entirely so every result type comes back.
export type DiscoveryResultType = 'all' | 'organic' | 'video' | 'discussion';

const AHREFS_TYPE_FILTER: Record<DiscoveryResultType, string | undefined> = {
  all: undefined,
  organic: 'organic',
  video: 'video',
  discussion: 'discussion',
};

/**
 * Top-ranking SERP results for a keyword. Throws (with a real, specific
 * message) on request failure rather than swallowing it — a silent [] here
 * used to make every Ahrefs error look identical to "no results found."
 * Real path doubles the segment: /v3/serp-overview/serp-overview.
 */
async function searchTopResultsForKeyword(keyword: string, resultType: DiscoveryResultType, country = 'us', topPositions = 15): Promise<SerpPosition[]> {
  const type = AHREFS_TYPE_FILTER[resultType];
  const res = await ahrefsClient().get('/serp-overview/serp-overview', {
    params: {
      keyword,
      country,
      top_positions: topPositions,
      select: 'url,title,position,traffic,domain_rating,type',
      ...(type ? { type } : {}),
    },
  });
  return res.data?.positions ?? [];
}

export interface DiscoveredDomain {
  name: string;
  domain: string;
  website: string;
  category: 'youtube' | 'community' | 'blog';
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

function isYouTube(domain: string): boolean {
  return domain === 'youtube.com' || domain === 'm.youtube.com' || domain === 'youtu.be';
}

// A video's title is the best available signal for who's behind it (Ahrefs
// doesn't return the channel name) — clean it up a little rather than using
// it verbatim as a "name."
function nameFromVideoTitle(title: string | null, domain: string): string {
  if (!title) return nameFromDomain(domain);
  const cleaned = title.split(/[|]/)[0].trim();
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
}

// General platforms, marketplaces, and mega-media sites that reliably rank
// for informational real-estate/landlord queries but are never themselves a
// "content creator" prospect. Filtered out before scoring/sorting candidates
// — without this, results skew toward Reddit/BuzzFeed/Wikipedia/the
// platforms themselves rather than the independent sites we actually want.
// YouTube is deliberately not on this list — a specific video is exactly
// the kind of creator result this search is for (handled separately below
// since every video shares the youtube.com domain).
const PLATFORM_DOMAIN_BLOCKLIST = [
  'reddit.com', 'quora.com', 'pinterest.com', 'facebook.com', 'instagram.com', 'tiktok.com',
  'linkedin.com', 'twitter.com', 'x.com', 'medium.com', 'wikihow.com', 'wikipedia.org',
  'buzzfeed.com', 'forbes.com', 'businessinsider.com', 'nerdwallet.com', 'investopedia.com',
  'amazon.com', 'google.com', 'bing.com', 'yahoo.com', 'airbnb.com', 'vrbo.com', 'yelp.com', 'nytimes.com',
];

function isBlockedPlatform(domain: string): boolean {
  return PLATFORM_DOMAIN_BLOCKLIST.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

export interface DiscoverDomainsResult {
  candidates: DiscoveredDomain[];
  errors: string[];
}

/**
 * Runs each of a niche's keywords through Ahrefs SERP Overview and returns
 * up to `targetCount` real, verifiable results — no invented names or
 * guessed sites. `resultType` controls what kind of result to look for:
 * 'organic' (blogs/websites), 'video' (YouTube), 'discussion' (forum
 * threads), or 'all' of the above together.
 *
 * Websites are deduped by domain (one candidate per site). Videos are
 * deduped by URL instead, since every YouTube result shares the domain
 * "youtube.com" — deduping those by domain would collapse every video down
 * to a single candidate. General platforms/marketplaces/mega-media (Reddit,
 * BuzzFeed, Airbnb.com itself, etc.) are dropped since they reliably rank
 * for these keywords but are never themselves a "creator" prospect.
 *
 * Results still need a human look before approving: some
 * property-management-software blogs and other non-individual sites will
 * still slip through, and a video's "name" is derived from its title since
 * Ahrefs doesn't return the channel name.
 */
export async function discoverDomainsForNiche(
  keywords: string[],
  targetCount: number,
  resultType: DiscoveryResultType = 'all'
): Promise<DiscoverDomainsResult> {
  if (!ahrefsEnabled()) return { candidates: [], errors: ['AHREFS_API_KEY is not configured.'] };

  const byKey = new Map<
    string,
    { url: string; domain: string; title: string | null; keyword: string; domainRating: number | null; traffic: number | null; category: DiscoveredDomain['category'] }
  >();
  const errors: string[] = [];

  for (const keyword of keywords) {
    try {
      const positions = await searchTopResultsForKeyword(keyword, resultType);
      for (const pos of positions) {
        const domain = domainFromUrl(pos.url);
        if (!domain) continue;

        const isVideo = isYouTube(domain);
        if (!isVideo && isBlockedPlatform(domain)) continue;

        const category: DiscoveredDomain['category'] = isVideo ? 'youtube' : pos.type?.includes('discussion') ? 'community' : 'blog';
        const key = isVideo ? pos.url : domain;
        if (byKey.has(key)) continue;

        byKey.set(key, { url: pos.url, domain, title: pos.title, keyword, domainRating: pos.domain_rating, traffic: pos.traffic, category });
      }
    } catch (err) {
      errors.push(`"${keyword}" — ${ahrefsErrorMessage(err)}`);
    }
  }

  const candidates = Array.from(byKey.values())
    .filter((info) => (info.domainRating ?? 0) > 0)
    .sort((a, b) => (b.domainRating ?? 0) - (a.domainRating ?? 0))
    .slice(0, targetCount)
    .map((info) => {
      const name = info.category === 'youtube' ? nameFromVideoTitle(info.title, info.domain) : nameFromDomain(info.domain);
      const website = info.category === 'youtube' ? info.url : info.domain;
      const kindLabel = info.category === 'youtube' ? 'YouTube video' : info.category === 'community' ? 'Discussion thread' : 'Page';
      const contentPresence = info.title
        ? `${kindLabel} ranking in Google search for "${info.keyword}": "${info.title}" (Domain Rating ${info.domainRating}${info.traffic ? `, ~${info.traffic} est. monthly organic visits` : ''}).`
        : `${kindLabel} ranking in Google search for "${info.keyword}" (Domain Rating ${info.domainRating}${info.traffic ? `, ~${info.traffic} est. monthly organic visits` : ''}).`;
      return { name, domain: info.domain, website, category: info.category, contentPresence, domainRating: info.domainRating };
    });

  return { candidates, errors };
}

export function isAhrefsEnabled() {
  return ahrefsEnabled();
}
