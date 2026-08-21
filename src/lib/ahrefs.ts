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
      // Ahrefs' own example requests explicitly set this on GETs. Without it
      // the API can return something axios doesn't auto-parse as JSON, so
      // `res.data.positions` silently doesn't exist — no error, just an
      // empty result, which is exactly the symptom that led here.
      Accept: 'application/json',
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
      output: 'json',
    });
    if (!res.data || !Array.isArray(res.data.targets)) {
      throw new Error(`unexpected response shape (got ${typeof res.data}: ${JSON.stringify(res.data).slice(0, 200)})`);
    }
    const rows = res.data.targets as { url: string; domain_rating: number; org_traffic: number; org_keywords: number }[];
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
      output: 'json',
      ...(type ? { type } : {}),
    },
  });
  if (!res.data || !Array.isArray(res.data.positions)) {
    throw new Error(`unexpected response shape (got ${typeof res.data}: ${JSON.stringify(res.data).slice(0, 200)})`);
  }
  // A genuinely-empty array here for a common keyword almost always means an
  // account/plan/quota issue rather than "no data" — surface the raw body
  // and any usage/limit headers instead of quietly returning [], since that
  // silence is exactly what made this hard to diagnose the first two times.
  if (res.data.positions.length === 0) {
    const usageHeaders = Object.entries(res.headers ?? {}).filter(([k]) => /rate|limit|quota|usage|credit/i.test(k));
    throw new Error(
      `Ahrefs returned an empty positions array for "${keyword}" (this exact query has real data — verified separately). ` +
        `Full response: ${JSON.stringify(res.data)}. ` +
        `Usage/limit headers: ${usageHeaders.length ? JSON.stringify(Object.fromEntries(usageHeaders)) : 'none present'}.`
    );
  }
  return res.data.positions;
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

// General platforms, marketplaces, mega-media, and generic web
// infrastructure that reliably show up in both SERP results and backlink
// profiles but are never themselves a "creator"/partnership prospect.
// Filtered out before scoring/sorting candidates. The infra half of this
// list (WordPress, GitHub, Shopify, etc.) came directly out of a real test:
// pulling BiggerPockets' backlinks sorted by Domain Rating surfaced almost
// nothing but google.com/youtube.com/wordpress.org/github.com/apple.com —
// generic "powered by" and badge links every established site accumulates,
// not partnership-relevant sites. YouTube is deliberately not on this list
// — a specific video is exactly the kind of creator result this search is
// for (handled separately since every video shares the youtube.com domain).
const PLATFORM_DOMAIN_BLOCKLIST = [
  // Social/community platforms and mega-media
  'reddit.com', 'quora.com', 'pinterest.com', 'facebook.com', 'instagram.com', 'tiktok.com',
  'linkedin.com', 'twitter.com', 'x.com', 'medium.com', 'wikihow.com', 'wikipedia.org',
  'buzzfeed.com', 'forbes.com', 'businessinsider.com', 'nerdwallet.com', 'investopedia.com',
  'amazon.com', 'google.com', 'bing.com', 'yahoo.com', 'airbnb.com', 'vrbo.com', 'yelp.com', 'nytimes.com',
  // Generic web infrastructure / CMS / dev / creative tools — these show up
  // as high-DR "backlinks" to almost any site regardless of topic.
  'wordpress.com', 'wordpress.org', 'squarespace.com', 'wix.com', 'webflow.com', 'godaddy.com',
  'github.com', 'gitlab.com', 'bitbucket.org', 'netlify.com', 'vercel.com', 'herokuapp.com',
  'adobe.com', 'canva.com', 'vimeo.com', 'spotify.com', 'soundcloud.com', 'apple.com', 'microsoft.com',
  'gravatar.com', 'goo.gl', 'bit.ly', 'tinyurl.com',
  // Generic directories/review sites, not partnership-relevant
  'bbb.org', 'crunchbase.com', 'glassdoor.com', 'indeed.com',
  // REI Grove's own parent company — never a useful "reference domain" or
  // "prospect" suggestion in its own discovery tool.
  'innago.com',
];

function isBlockedPlatform(domain: string): boolean {
  return PLATFORM_DOMAIN_BLOCKLIST.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

export interface DiscoverDomainsResult {
  candidates: DiscoveredDomain[];
  errors: string[];
  /** Funnel counts so "no results" can say *why* instead of just that. */
  debug: { rawPositions: number; droppedAsPlatform: number; droppedNoRating: number };
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
  if (!ahrefsEnabled()) {
    return { candidates: [], errors: ['AHREFS_API_KEY is not configured.'], debug: { rawPositions: 0, droppedAsPlatform: 0, droppedNoRating: 0 } };
  }

  const byKey = new Map<
    string,
    { url: string; domain: string; title: string | null; keyword: string; domainRating: number | null; traffic: number | null; category: DiscoveredDomain['category'] }
  >();
  const errors: string[] = [];
  let rawPositions = 0;
  let droppedAsPlatform = 0;
  let droppedNoRating = 0;

  for (const keyword of keywords) {
    try {
      const positions = await searchTopResultsForKeyword(keyword, resultType);
      rawPositions += positions.length;
      for (const pos of positions) {
        const domain = domainFromUrl(pos.url);
        if (!domain) continue;

        const isVideo = isYouTube(domain);
        if (!isVideo && isBlockedPlatform(domain)) {
          droppedAsPlatform += 1;
          continue;
        }
        if (!((pos.domain_rating ?? 0) > 0)) {
          droppedNoRating += 1;
          continue;
        }

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

  return { candidates, errors, debug: { rawPositions, droppedAsPlatform, droppedNoRating } };
}

// ── Backlink-based partnership discovery ────────────────────────────────────
// A different angle from keyword search: domains that already link to a
// comparable real-estate-education resource (e.g. BiggerPockets) are
// natural partnership/affiliate targets, since they're already engaging
// with similar content.

interface RefDomainRow {
  domain: string;
  domain_rating: number;
  traffic_domain: number;
}

/**
 * Domains linking to `targetDomain`, sorted by Domain Rating. Real path:
 * /v3/site-explorer/refdomains — note this is "refdomains," not
 * "referring-domains" (confirmed against Ahrefs' docs; the tool/concept
 * name and the REST path segment don't always match).
 */
export async function getReferringDomains(targetDomain: string, limit = 50): Promise<DiscoveredDomain[]> {
  if (!ahrefsEnabled()) return [];

  let rows: RefDomainRow[];
  try {
    const res = await ahrefsClient().get('/site-explorer/refdomains', {
      params: {
        target: targetDomain,
        mode: 'subdomains',
        select: 'domain,domain_rating,traffic_domain',
        order_by: 'domain_rating:desc',
        limit,
        output: 'json',
      },
    });
    if (!res.data || !Array.isArray(res.data.refdomains)) {
      throw new Error(`unexpected response shape (got ${typeof res.data}: ${JSON.stringify(res.data).slice(0, 200)})`);
    }
    rows = res.data.refdomains;
  } catch (err) {
    throw new Error(ahrefsErrorMessage(err));
  }

  return rows
    .filter((r) => r.domain !== targetDomain && (r.domain_rating ?? 0) > 0 && !isBlockedPlatform(r.domain))
    .map((r) => ({
      name: nameFromDomain(r.domain),
      domain: r.domain,
      website: r.domain,
      category: 'blog' as const,
      contentPresence: `Links to ${targetDomain} (Domain Rating ${r.domain_rating}${r.traffic_domain ? `, ~${r.traffic_domain} est. monthly organic visits` : ''}).`,
      domainRating: r.domain_rating,
    }));
}

export interface CompetitorDomain {
  domain: string;
  domainRating: number | null;
  traffic: number | null;
}

/**
 * Real, currently-active organic search competitors of `targetDomain` — a
 * "find more reference domains" helper for the backlinks search above, not
 * a prospect source itself. Real path: /v3/site-explorer/organic-competitors.
 */
export async function getOrganicCompetitors(targetDomain: string, limit = 10): Promise<CompetitorDomain[]> {
  if (!ahrefsEnabled()) return [];

  const today = new Date().toISOString().slice(0, 10);
  let rows: { competitor_domain: string | null; domain_rating: number; traffic: number | null }[];
  try {
    const res = await ahrefsClient().get('/site-explorer/organic-competitors', {
      params: {
        target: targetDomain,
        mode: 'subdomains',
        country: 'us',
        date: today,
        select: 'competitor_domain,domain_rating,traffic',
        order_by: 'domain_rating:desc',
        limit,
        output: 'json',
      },
    });
    if (!res.data || !Array.isArray(res.data.competitors)) {
      throw new Error(`unexpected response shape (got ${typeof res.data}: ${JSON.stringify(res.data).slice(0, 200)})`);
    }
    rows = res.data.competitors;
  } catch (err) {
    throw new Error(ahrefsErrorMessage(err));
  }

  return rows
    .filter((r) => r.competitor_domain && !isBlockedPlatform(r.competitor_domain))
    .map((r) => ({ domain: r.competitor_domain as string, domainRating: r.domain_rating ?? null, traffic: r.traffic ?? null }));
}

export function isAhrefsEnabled() {
  return ahrefsEnabled();
}
