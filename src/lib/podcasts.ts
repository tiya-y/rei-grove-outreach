// ============================================================
// Apple Podcasts directory search (iTunes Search API) — a third, free
// automated discovery source alongside Ahrefs and YouTube. No API key or
// auth required at all, unlike either of those. Finds real, individually
// hosted real-estate podcasts directly from Apple's own podcast directory,
// complementary to Contacts' podcast-guest signal (which only catches
// guests mentioned incidentally in Ahrefs backlink data, not the hosts
// themselves).
//
// `artistName` is Apple's "who made this" field — for an independently
// hosted show it's usually the host's real name, but for network/branded
// shows it's a show or network name instead. Verified live against real
// searches ("real estate investing", "landlord", "house hacking",
// "real estate wholesaling", "airbnb hosting"): host names came back
// correctly (Michael Blank, Kevin Bupp, Ken McElroy, David Dodge, Becky
// Nova...), and the person-vs-brand filter below was calibrated against
// that same real sample (37/40 correct) — a couple of brand names with no
// blocklisted keyword (e.g. "Freewyld Foundry") still slip through, and a
// name with an extra descriptor prefix Apple didn't separate with a dash
// (e.g. "Airbnb Superhost Jason Muth") can carry that prefix into the
// result. Every result still needs a human glance before approving, same
// as every other discovery source in this app.
// ============================================================

import axios from 'axios';
import { splitName, type DiscoveryCandidate } from './discoveryInsert';

const ITUNES_BASE = 'https://itunes.apple.com';

interface ITunesPodcastResult {
  artistName?: string;
  collectionName?: string;
  trackViewUrl?: string;
  trackCount?: number;
  primaryGenreName?: string;
}

// Words that show up constantly in real-estate podcast/network names but
// never in a person's own name — rejects "Real Estate Investing School" and
// "Landlord Studio" while keeping "Kevin Bupp" and "Ken McElroy".
const BRAND_WORDS = new Set([
  'real', 'estate', 'investing', 'investor', 'investors', 'wholesaling', 'wholesale', 'landlord', 'landlords',
  'rental', 'rentals', 'income', 'podcast', 'show', 'radio', 'network', 'networks', 'studio', 'media',
  'group', 'team', 'capital', 'financial', 'school', 'academy', 'university', 'guys', 'nation', 'empire',
  'secrets', 'hacks', 'hacking', 'wealth', 'freedom', 'life', 'diaries', 'journey', 'confident',
]);

// Apple's artistName field sometimes packs a descriptor onto the name
// ("Paige Riggsbee - Airbnb Host, Real Estate Investment Strategist") or
// lists co-hosts ("Jason Muth + Rory Gill") — take the name before the
// first descriptor/co-host separator rather than the whole field.
function cleanCandidateName(artistName: string): string {
  let s = artistName.split(/\s+-\s+|,/)[0].trim();
  s = s.split(/\s+\+\s+|\s+and\s+/)[0].trim();
  return s;
}

function looksLikePersonName(candidate: string): boolean {
  if (candidate.startsWith('The ')) return false;
  const tokens = candidate.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return false;
  return tokens.every((t) => {
    if (BRAND_WORDS.has(t.toLowerCase())) return false;
    return /^(Jr\.?|Sr\.?|II|III|IV)$/.test(t) || /^[A-Z]\.?$/.test(t) || /^[A-Z][a-zA-Z'.-]+$/.test(t);
  });
}

export interface SearchPodcastsResult {
  candidates: DiscoveryCandidate[];
  totalResults: number;
}

/**
 * Real podcasts matching a keyword from Apple's public directory, filtered
 * down to ones whose host looks like a named individual rather than a show
 * or network brand. No API key required — always enabled.
 */
export async function searchPodcastsForKeyword(keyword: string, limit = 25): Promise<SearchPodcastsResult> {
  let items: ITunesPodcastResult[];
  try {
    const res = await axios.get(`${ITUNES_BASE}/search`, {
      params: { term: keyword, media: 'podcast', country: 'US', limit },
    });
    items = res.data?.results ?? [];
  } catch (err) {
    throw new Error(err instanceof Error ? `iTunes Search request failed: ${err.message}` : 'iTunes Search request failed');
  }

  const byName = new Map<string, DiscoveryCandidate>();
  for (const item of items) {
    if (!item.artistName || !item.trackViewUrl) continue;
    const cleaned = cleanCandidateName(item.artistName);
    if (!looksLikePersonName(cleaned)) continue;

    const key = cleaned.toLowerCase();
    if (byName.has(key)) continue;

    const { first, last } = splitName(cleaned);
    byName.set(key, {
      name: cleaned,
      domain: null,
      website: item.trackViewUrl,
      category: 'podcast',
      contentPresence: `Hosts "${item.collectionName ?? 'a podcast'}"${item.primaryGenreName ? ` (${item.primaryGenreName})` : ''}${item.trackCount ? `, ${item.trackCount} episodes` : ''}.`,
      contactFirstName: first,
      contactLastName: last,
    });
  }

  return { candidates: Array.from(byName.values()), totalResults: items.length };
}
