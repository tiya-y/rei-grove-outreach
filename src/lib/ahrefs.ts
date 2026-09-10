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
  // An empty array is a legitimate response: Ahrefs only has SERP data for
  // keywords it actually tracks (recorded search volume), and most
  // conversational/long-tail phrasings simply aren't tracked — confirmed via
  // Keywords Explorer returning zero rows for several niche keywords here,
  // not a rate-limit/quota issue. Do NOT treat this as an error (a previous
  // version of this function did, with a hardcoded claim that "this exact
  // query has real data" — that claim isn't re-verified per call and was
  // wrong for several keywords, which made a normal "not tracked" case look
  // like a broken integration). Pick keywords with real recorded volume
  // (check via Keywords Explorer first) if a niche keeps coming back empty.
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

export function domainFromUrl(url: string): string | null {
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
  'linkedin.com', 'twitter.com', 'x.com', 'medium.com', 'wikihow.com', 'wikipedia.org', 'tumblr.com',
  'buzzfeed.com', 'forbes.com', 'businessinsider.com', 'nerdwallet.com', 'investopedia.com', 'flickr.com',
  'bing.com', 'yahoo.com', 'airbnb.com', 'vrbo.com', 'yelp.com', 'nytimes.com', 'baidu.com', 'linktr.ee',
  // Bare youtube.com (no specific video URL) isn't a resolvable prospect —
  // note this only affects backlink discovery (getReferringDomains): SERP
  // keyword discovery checks `isVideo` before this blocklist and keeps
  // individual video URLs regardless.
  'youtube.com', 'm.youtube.com', 'youtu.be',
  // Generic web infrastructure / CMS / dev / creative tools / CDNs — these
  // show up as high-DR "backlinks" to almost any site regardless of topic.
  'wordpress.com', 'wordpress.org', 'squarespace.com', 'wix.com', 'webflow.com', 'godaddy.com', 'shopify.com',
  'github.com', 'github.io', 'gitlab.com', 'bitbucket.org', 'netlify.com', 'vercel.com', 'vercel.app', 'herokuapp.com',
  'amazonaws.com', 'cloudfront.net', 'creativecommons.org', 'wp.me',
  'adobe.com', 'canva.com', 'vimeo.com', 'spotify.com', 'soundcloud.com', 'bandcamp.com', 'apple.com', 'microsoft.com',
  'gravatar.com', 'goo.gl', 'bit.ly', 'tinyurl.com', 'weebly.com', 'issuu.com',
  'dribbble.com', 'behance.net', 'hubspot.com', 'zendesk.com', 'jotform.com', 'eventbrite.com', 'outlook.com',
  // Generic directories/review sites, not partnership-relevant
  'bbb.org', 'crunchbase.com', 'glassdoor.com', 'indeed.com',
  // REI Grove's own parent company — never a useful "reference domain" or
  // "prospect" suggestion in its own discovery tool.
  'innago.com',
];

// Free-hosting platforms whose bare apex domain is a generic "powered by"
// badge link (never a prospect), but whose subdomains
// (name.substack.com, name.blogspot.com) are exactly the kind of individual
// creator site this search is for — block the platform itself, not its
// tenants, so this list is checked for exact match only (no endsWith).
const EXACT_MATCH_ONLY_BLOCKLIST = ['substack.com', 'blogger.com', 'blogspot.com', 'wixsite.com', 'hatenablog.com', 'hatena.ne.jp'];

// Brands that operate under many country-code TLDs (amazon.co.jp,
// amazon.de, google.de, ...) — matched by root label instead of listing
// every TLD, which a real backlink pull (biggerpockets.com's top 50 by
// Domain Rating) showed slipping through a plain exact-domain list.
const MULTI_TLD_BLOCKLIST_PATTERN = /^(google|amazon)\.[a-z.]{2,}$/;

function isBlockedPlatform(domain: string): boolean {
  if (MULTI_TLD_BLOCKLIST_PATTERN.test(domain)) return true;
  if (EXACT_MATCH_ONLY_BLOCKLIST.includes(domain)) return true;
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

// ── Backlink-based CONTACT discovery ────────────────────────────────────────
// A different output shape from the domain-level searches above: instead of
// "sites that link to X," this surfaces named INDIVIDUALS found in that same
// backlink data — the person is the prospect, not their website. Two
// independent signals, both verified against live data before shipping:
//
// 1. 'byline' — Ahrefs' all-backlinks endpoint exposes `source_page_author`,
//    the named author of a page that links to the target. A real pull
//    against biggerpockets.com returned actual people (e.g. a ProjectionHub
//    founder, a lending-company analyst) bylined on articles that reference
//    it — someone already writing in this space and citing a comparable
//    resource is a strong affiliate signal.
// 2. 'podcast_guest' — some of that same backlink data is podcast/interview
//    show-notes pages, which put the guest's name directly in the title
//    (e.g. "...With Ryan Pineda"). No API field for this, so it's extracted
//    with a regex — gated behind requiring an actual podcast/interview
//    signal (URL path or title keyword) BEFORE attempting a name match, since
//    Title Case text alone produces false positives (e.g. "...With No
//    Money" reads as a two-word proper name without that gate).
//
// Both are heuristics on real but messy data: `source_page_author` is often
// null (unbylined corporate content), and a handful of non-person "authors"
// (a brand/team name rather than a person) can still slip through. Every
// result still needs a human glance before approving, same as every other
// discovery source in this file.

export type ContactKind = 'byline' | 'podcast_guest';

export interface BacklinkContact {
  name: string;
  domain: string;
  website: string;
  category: 'blog' | 'podcast';
  contentPresence: string;
  domainRating: number | null;
  kind: ContactKind;
}

interface AllBacklinksRow {
  url_from: string;
  title: string | null;
  source_page_author: string | null;
  domain_rating_source: number | null;
  traffic: number | null;
}

const PODCAST_URL_PATTERN = /\/(podcast|episode|episodes|interview|interviews)(\/|-|$)/i;
const PODCAST_TITLE_HINT = /\b(podcast|episode|interview)\b/i;

function isLikelyPodcastPage(url: string, title: string): boolean {
  return PODCAST_URL_PATTERN.test(url) || PODCAST_TITLE_HINT.test(title);
}

// Common capitalized non-name words that show up in Title Case headlines
// (e.g. "Investing With No Money," "Flip Houses With A Partner") — without
// this, the name regexes below would misread them as two-word proper names.
const NAME_STOPWORDS = new Set([
  'no', 'a', 'an', 'the', 'your', 'my', 'our', 'this', 'that', 'these', 'those', 'some', 'any', 'all',
  'none', 'bad', 'good', 'low', 'high', 'little', 'much', 'money', 'credit', 'confidence', 'others',
  'everyone', 'everything', 'nothing', 'people', 'friends', 'family', 'kids', 'benefits', 'interest',
  'zero', 'less', 'more', 'just', 'only', 'us', 'me', 'them', 'work', 'love', 'care',
]);

function looksLikeRealName(candidate: string): boolean {
  const tokens = candidate.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 3) return false;
  return tokens.every((t) => t.length >= 2 && t !== t.toUpperCase() && /^[A-Z][a-zA-Z'.-]+$/.test(t) && !NAME_STOPWORDS.has(t.toLowerCase()));
}

const NAME_TOKEN = "[A-Z][a-zA-Z'.-]+";
// Case-insensitive on the trigger word only (titles are inconsistently
// cased) — NAME_TOKEN stays case-sensitive so the captured group still has
// to look like a real proper name; looksLikeRealName is the second gate.
const GUEST_NAME_PATTERNS = [
  new RegExp(`\\b[Ww]ith\\s+(${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){1,2})\\s*(?:[-|:].*)?$`),
  new RegExp(`\\b(?:[Ff]eaturing|[Ff]eat\\.?|[Ff]t\\.?)\\s+(${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){1,2})\\b`),
  new RegExp(`(?:^|[:.-]\\s*)(${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){1,2})\\s+[Oo]n\\s+`),
];

function extractGuestName(title: string): string | null {
  for (const pattern of GUEST_NAME_PATTERNS) {
    const m = title.match(pattern);
    if (m && looksLikeRealName(m[1])) return m[1];
  }
  return null;
}

// A "byline" that's actually a brand/team account, not a person — best
// effort only, still needs a human look (see file header note above).
const NON_PERSON_AUTHOR_HINT = /\b(llc|inc|team|staff|group|editorial|company|corp|ltd|studio|media|agency)\b/i;

function looksLikePersonByline(author: string, domain: string): boolean {
  const tokens = author.trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (/[0-9@]/.test(author) || NON_PERSON_AUTHOR_HINT.test(author)) return false;
  // Reject "authors" that are really just the site's own brand/account name
  // (e.g. "Minerva Beauty" bylined on minervabeauty.com, "Rent To Retirement"
  // on renttoretirement.com) — a real pull against biggerpockets.com's
  // backlinks surfaced several of these. Comparing the slugified name
  // against the domain's first label catches most of them without risking a
  // false reject on an actual person (whose name won't happen to equal the
  // site's own brand string).
  const slug = author.toLowerCase().replace(/[^a-z0-9]/g, '');
  const domainBrand = domain.split('.')[0];
  if (slug.length > 3 && (domainBrand.includes(slug) || slug.includes(domainBrand))) return false;
  return true;
}

/**
 * Named individuals found in `targetDomain`'s backlink profile: bylined
 * authors of pages that link to it, and podcast/interview guests named in
 * those pages' titles. `kindFilter` narrows to one signal or returns both
 * (default). Real path: /v3/site-explorer/all-backlinks (confirmed by
 * probing the API directly — a wrong path 404s regardless of auth, this one
 * 401s with a bad key, meaning the path itself is real).
 */
export async function getBacklinkContacts(targetDomain: string, kindFilter: ContactKind | 'all' = 'all', limit = 50): Promise<BacklinkContact[]> {
  if (!ahrefsEnabled()) return [];

  let rows: AllBacklinksRow[];
  try {
    const res = await ahrefsClient().get('/site-explorer/all-backlinks', {
      params: {
        target: targetDomain,
        mode: 'subdomains',
        select: 'url_from,title,source_page_author,domain_rating_source,traffic',
        where: JSON.stringify({ field: 'is_content', is: ['eq', true] }),
        order_by: 'traffic:desc',
        limit: 300, // over-fetch: most rows have no usable author/guest signal, see below
        output: 'json',
      },
    });
    if (!res.data || !Array.isArray(res.data.backlinks)) {
      throw new Error(`unexpected response shape (got ${typeof res.data}: ${JSON.stringify(res.data).slice(0, 200)})`);
    }
    rows = res.data.backlinks;
  } catch (err) {
    throw new Error(ahrefsErrorMessage(err));
  }

  const byKey = new Map<string, BacklinkContact>();
  for (const row of rows) {
    const domain = domainFromUrl(row.url_from);
    if (!domain || isBlockedPlatform(domain)) continue;

    let name: string | null = null;
    let kind: ContactKind | null = null;

    const author = row.source_page_author?.trim();
    if ((kindFilter === 'all' || kindFilter === 'byline') && author && looksLikePersonByline(author, domain)) {
      name = author;
      kind = 'byline';
    } else if ((kindFilter === 'all' || kindFilter === 'podcast_guest') && isLikelyPodcastPage(row.url_from, row.title ?? '')) {
      const guest = extractGuestName(row.title ?? '');
      if (guest) {
        name = guest;
        kind = 'podcast_guest';
      }
    }
    if (!name || !kind) continue;

    const key = `${name.toLowerCase()}|${domain}`;
    if (byKey.has(key)) continue;

    const dr = row.domain_rating_source ?? null;
    byKey.set(key, {
      name,
      domain,
      website: row.url_from,
      category: kind === 'podcast_guest' ? 'podcast' : 'blog',
      domainRating: dr,
      kind,
      contentPresence:
        kind === 'byline'
          ? `Bylined ${row.title ? `"${row.title}"` : 'an article'} on ${domain}, which links to ${targetDomain}${dr ? ` (Domain Rating ${dr})` : ''}.`
          : `Podcast/interview guest in "${row.title}" on ${domain}, which links to ${targetDomain}${dr ? ` (Domain Rating ${dr})` : ''}.`,
    });
  }

  return Array.from(byKey.values())
    .sort((a, b) => (b.domainRating ?? 0) - (a.domainRating ?? 0))
    .slice(0, limit);
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
