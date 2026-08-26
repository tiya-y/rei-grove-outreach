// ============================================================
// YouTube Data API v3 client — a second, free automated discovery source
// alongside Ahrefs. Distinct from the Ahrefs "video" result type: that finds
// individual videos ranking in Google search for a keyword, this finds
// YouTube channels directly via YouTube's own search. Free tier: 10,000
// quota units/day; search.list costs 100 units/call (~100 searches/day),
// channels.list costs 1 unit/call (batchable up to 50 ids).
// ============================================================

import axios from 'axios';
import type { DiscoveryCandidate } from './discoveryInsert';

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3';

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

  let statsRows: { id: string; snippet?: { title?: string; country?: string }; statistics?: { subscriberCount?: string } }[] = [];
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
    return {
      name: title,
      domain: 'youtube.com',
      website: `https://www.youtube.com/channel/${row.id}`,
      category: 'youtube',
      contentPresence: `YouTube channel, ~${subscriberCount != null ? subscriberCount.toLocaleString() : 'unknown'} subscribers.`,
      audienceSizeEst: subscriberCount,
    };
  });

  return { candidates, totalResults };
}
