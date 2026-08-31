// ============================================================
// Parses a CSV export (e.g. from Heepsy) into DiscoveryCandidate rows.
// Heepsy has no public API, but its Business/Gold plans export search
// results as CSV/XLS — this reads that file directly instead of making
// Mose retype every contact as "Name, link" by hand. Column names aren't
// guaranteed across exports, so headers are matched heuristically rather
// than by exact position.
// ============================================================

import Papa from 'papaparse';
import { domainFromUrl } from './ahrefs';
import type { DiscoveryCandidate } from './discoveryInsert';

const NAME_HEADERS = ['name', 'username', 'handle', 'creator', 'creator name', 'influencer', 'influencer name', 'full name'];
const LINK_HEADERS = [
  'url', 'link', 'profile url', 'profile link', 'website',
  'channel url', 'youtube url', 'youtube', 'instagram url', 'instagram',
  'tiktok url', 'tiktok', 'social url',
];
const EMAIL_HEADERS = ['email', 'contact email', 'contact'];
const AUDIENCE_HEADERS = ['followers', 'subscribers', 'audience', 'audience size', 'reach', 'fans'];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findColumn(headers: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const match = headers.find((h) => normalizeHeader(h) === candidate);
    if (match) return match;
  }
  return null;
}

function findAnyLinkColumns(headers: string[]): string[] {
  return headers.filter((h) => LINK_HEADERS.includes(normalizeHeader(h)));
}

function parseAudienceCount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '').toUpperCase();
  if (!cleaned) return null;
  const kMatch = cleaned.match(/^([\d.]+)K$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1_000);
  const mMatch = cleaned.match(/^([\d.]+)M$/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1_000_000);
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isYouTubeUrl(url: string): boolean {
  const domain = domainFromUrl(url);
  return domain === 'youtube.com' || domain === 'm.youtube.com' || domain === 'youtu.be';
}

export interface CsvParseResult {
  candidates: DiscoveryCandidate[];
  skipped: string[];
  detectedHeaders: { name: string | null; link: string | null; email: string | null; audience: string | null };
}

/**
 * Throws only on a structurally broken file (no headers, no rows). A file
 * that parses but yields zero usable rows still returns normally with
 * `candidates: []` and `detectedHeaders` populated, so the caller can show
 * *which* columns were found instead of just "nothing happened" — same
 * "no silent empty result" pattern as the Ahrefs discovery paths.
 */
export function parseCreatorCsv(csvText: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (!parsed.meta.fields || parsed.meta.fields.length === 0) {
    throw new Error('Could not find a header row in that CSV — make sure the first row has column names.');
  }
  if (parsed.data.length === 0) {
    throw new Error('That CSV has a header row but no data rows.');
  }

  const headers = parsed.meta.fields;
  const nameCol = findColumn(headers, NAME_HEADERS);
  const linkCols = findAnyLinkColumns(headers);
  const preferredLinkCol = findColumn(headers, ['url', 'link', 'profile url', 'profile link', 'website']);
  const emailCol = findColumn(headers, EMAIL_HEADERS);
  const audienceCol = findColumn(headers, AUDIENCE_HEADERS);

  const candidates: DiscoveryCandidate[] = [];
  const skipped: string[] = [];

  for (const row of parsed.data) {
    const name = nameCol ? row[nameCol]?.trim() : '';
    if (!name) {
      skipped.push('(row with no name column value) — skipped');
      continue;
    }

    // Prefer a generic url/link column; otherwise take the first non-empty
    // platform-specific column (Heepsy exports sometimes split by network).
    let link = preferredLinkCol ? row[preferredLinkCol]?.trim() : '';
    if (!link) {
      for (const col of linkCols) {
        const val = row[col]?.trim();
        if (val) {
          link = val;
          break;
        }
      }
    }
    if (!link) {
      skipped.push(`"${name}" — no link/URL column value, skipped (need a link to dedupe and follow up on)`);
      continue;
    }

    const audienceSizeEst = audienceCol ? parseAudienceCount(row[audienceCol] ?? '') : null;
    const email = emailCol ? row[emailCol]?.trim() || null : null;

    candidates.push({
      name,
      domain: domainFromUrl(link),
      website: link,
      category: isYouTubeUrl(link) ? 'youtube' : null,
      contentPresence: `Imported from Heepsy CSV export${audienceSizeEst != null ? ` (~${audienceSizeEst.toLocaleString()} followers)` : ''}.`,
      audienceSizeEst,
      email,
    });
  }

  return {
    candidates,
    skipped,
    detectedHeaders: { name: nameCol, link: preferredLinkCol ?? linkCols[0] ?? null, email: emailCol, audience: audienceCol },
  };
}
