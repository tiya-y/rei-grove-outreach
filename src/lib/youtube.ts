// ============================================================
// YouTube Data API v3 client — a second, free automated discovery source
// alongside Ahrefs. Distinct from the Ahrefs "video" result type: that finds
// individual videos ranking in Google search for a keyword, this finds
// YouTube channels directly via YouTube's own search. Free tier: 10,000
// quota units/day; search.list costs 100 units/call (~100 searches/day),
// channels.list costs 1 unit/call (batchable up to 50 ids).
// ============================================================

import axios from 'axios';
import { splitName, type DiscoveryCandidate } from './discoveryInsert';

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3';

// ── Channel bio mining ───────────────────────────────────────────────────
// Creators often self-identify in their channel description ("Hi, I'm Ryan
// Pineda...") and/or list a direct business contact email there — both are
// far more valuable than the channel title alone (personalized outreach,
// or skipping Apollo/manual enrichment entirely when an email is found).
// Bio prose is normal sentence case, not Title Case, so a capital letter
// after "I'm " overwhelmingly signals a proper noun rather than a common
// word (unlike headline-style text, where Title Case makes this much
// riskier — see the guest-name extraction in ahrefs.ts for that problem).
// The stopword list below is a safety net for informal/inconsistent bio
// capitalization ("I'm Excited to..."), not the primary defense.
//
// Verified against synthetic bios covering the common conventions
// (self-intro, "my name is", "founded by", an embedded contact email, and
// several bios with nothing to find) before shipping — NOT against real
// live channel descriptions, since testing that needs a working
// YOUTUBE_API_KEY this session doesn't have. Spot-check the first batch of
// real results once a key is configured.
const BIO_NAME_STOPWORDS = new Set([
  'based', 'here', 'back', 'new', 'just', 'also', 'not', 'still', 'excited', 'passionate', 'ready',
  'sharing', 'building', 'helping', 'working', 'currently', 'proud', 'happy', 'thrilled', 'honored',
  'a', 'an', 'the', 'so', 'very', 'really', 'always', 'obsessed', 'grateful', 'blessed',
]);

function looksLikeBioNameToken(t: string): boolean {
  return t.length >= 2 && t !== t.toUpperCase() && /^[A-Z][a-zA-Z'-]+$/.test(t) && !BIO_NAME_STOPWORDS.has(t.toLowerCase());
}

const BIO_NAME_TOKEN = "[A-Z][a-zA-Z'-]+";
const BIO_NAME_PATTERNS = [
  new RegExp(`\\bI'?m\\s+(${BIO_NAME_TOKEN}(?:\\s+${BIO_NAME_TOKEN}){0,2})\\b`),
  new RegExp(`\\b[Mm]y name is\\s+(${BIO_NAME_TOKEN}(?:\\s+${BIO_NAME_TOKEN}){0,2})\\b`),
  new RegExp(`\\b[Hh]osted by\\s+(${BIO_NAME_TOKEN}(?:\\s+${BIO_NAME_TOKEN}){0,2})\\b`),
  new RegExp(`\\b[Ff]ounded by\\s+(${BIO_NAME_TOKEN}(?:\\s+${BIO_NAME_TOKEN}){0,2})\\b`),
];

function extractBioName(description: string): string | null {
  for (const pattern of BIO_NAME_PATTERNS) {
    const m = description.match(pattern);
    if (m && m[1].split(/\s+/).every(looksLikeBioNameToken)) return m[1];
  }
  return null;
}

function extractBioEmail(description: string): string | null {
  const m = description.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

export function isYoutubeEnabled() {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

function youtubeClient() {
  return axios.create({ baseURL: YOUTUBE_BASE, params: { key: process.env.YOUTUBE_API_KEY } });
}

function youtubeErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const detail = typeof data === 'string' ? data : data ? JSON.stringify(data) : err.message;
    return `YouTube ${status ?? 'request'} error: ${detail}`;
  }
  return err instanceof Error ? err.message : 'Unknown YouTube error';
}

interface SearchChannelsResult {
  candidates: DiscoveryCandidate[];
  totalResults: number;
}

/**
 * Real YouTube channels for a keyword search (not video results — see the
 * module comment above). Empty results are a legitimate outcome here (narrow
 * real-estate keywords can genuinely turn up nothing), unlike the Ahrefs SERP
 * path where an empty response turned out to be a real bug — so this
 * function returns [] rather than throwing on empty, but still surfaces
 * `totalResults` so the caller can say why.
 */
export async function searchChannelsForKeyword(keyword: string, maxResults = 25): Promise<SearchChannelsResult> {
  let searchRes;
  try {
    searchRes = await youtubeClient().get('/search', {
      params: { part: 'snippet', type: 'channel', q: keyword, maxResults },
    });
  } catch (err) {
    throw new Error(youtubeErrorMessage(err));
  }

  const items = (searchRes.data?.items ?? []) as { id?: { channelId?: string }; snippet?: { title?: string } }[];
  const totalResults = searchRes.data?.pageInfo?.totalResults ?? items.length;
  const channelIds = Array.from(new Set(items.map((i) => i.id?.channelId).filter((id): id is string => Boolean(id))));

  if (channelIds.length === 0) {
    return { candidates: [], totalResults };
  }

  let statsRows: { id: string; snippet?: { title?: string; country?: string; description?: string }; statistics?: { subscriberCount?: string } }[] = [];
  try {
    const statsRes = await youtubeClient().get('/channels', {
      params: { part: 'snippet,statistics', id: channelIds.join(',') },
    });
    statsRows = statsRes.data?.items ?? [];
  } catch (err) {
    throw new Error(youtubeErrorMessage(err));
  }

  const candidates: DiscoveryCandidate[] = statsRows.map((row) => {
    const subscriberCount = row.statistics?.subscriberCount ? Number(row.statistics.subscriberCount) : null;
    const title = row.snippet?.title ?? 'Unknown channel';
    const description = row.snippet?.description ?? '';
    const bioName = extractBioName(description);
    const bioEmail = extractBioEmail(description);
    const { first, last } = bioName ? splitName(bioName) : { first: null, last: null };

    const subscriberNote = `~${subscriberCount != null ? subscriberCount.toLocaleString() : 'unknown'} subscribers`;
    const contentPresence = [
      `YouTube channel, ${subscriberNote}.`,
      bioName ? `Channel bio names the creator as ${bioName}.` : null,
      bioEmail ? `Business contact email listed in bio: ${bioEmail}.` : null,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      name: title,
      domain: 'youtube.com',
      website: `https://www.youtube.com/channel/${row.id}`,
      category: 'youtube',
      contentPresence,
      audienceSizeEst: subscriberCount,
      email: bioEmail,
      contactFirstName: first,
      contactLastName: last,
    };
  });

  return { candidates, totalResults };
}
