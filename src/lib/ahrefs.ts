// ============================================================
// Ahrefs client — used to enrich a prospect's website with domain authority
// and traffic signals that feed the "Audience Size" / "Content Presence"
// scoring dimensions. Optional: if AHREFS_API_KEY isn't set, every function
// here resolves to null and the scoring UI just shows "no data" for that
// dimension instead of failing.
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

/** Domain Rating + organic traffic estimate for one or more domains. */
export async function getDomainMetrics(domains: string[]): Promise<DomainMetrics[]> {
  if (!ahrefsEnabled() || domains.length === 0) {
    return domains.map((domain) => ({ domain, domainRating: null, organicKeywords: null, organicTraffic: null }));
  }

  try {
    const res = await ahrefsClient().get('/batch-domain-overview', {
      params: { targets: domains.join(','), select: 'domain,dr,org_keywords,org_traffic' },
    });
    const rows = res.data?.domains ?? [];
    return domains.map((domain) => {
      const row = rows.find((r: { domain: string }) => r.domain === domain);
      return {
        domain,
        domainRating: row?.dr ?? null,
        organicKeywords: row?.org_keywords ?? null,
        organicTraffic: row?.org_traffic ?? null,
      };
    });
  } catch {
    return domains.map((domain) => ({ domain, domainRating: null, organicKeywords: null, organicTraffic: null }));
  }
}

/** Top-ranking sites for a discovery keyword — useful for sourcing new prospects. */
export async function searchTopDomainsByKeyword(keyword: string, country = 'us', limit = 20) {
  if (!ahrefsEnabled()) return null;
  try {
    const res = await ahrefsClient().get('/serp-overview', {
      params: { keyword, country, select: 'url,domain,position,traffic', limit },
    });
    return res.data?.serp ?? [];
  } catch {
    return null;
  }
}

export function isAhrefsEnabled() {
  return ahrefsEnabled();
}
