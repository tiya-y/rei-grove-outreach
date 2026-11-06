// ============================================================
// "Whose company is this?" for a prospect, used by qualification Round 1 and
// by the email reveal. The `website` field means something different per
// discovery source (a byline contact's own article, a podcast guest's HOST's
// show page, a YouTube channel URL, a LinkedIn profile URL), so it is only
// trusted as the prospect's own domain when nothing marks it as unreliable.
// Sources that know the company set company_name / company_domain directly
// at insert time and those win.
// ============================================================

// Hosts that are never a prospect's own company domain.
const PLATFORM_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'podcasts.apple.com', 'itunes.apple.com', 'linkedin.com']);

interface CompanyInput {
  name: string;
  website: string | null;
  category: string | null;
  content_presence: string | null;
  company_name?: string | null;
  company_domain?: string | null;
}

export function domainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, '');
    return PLATFORM_HOSTS.has(host) ? null : host;
  } catch {
    return null;
  }
}

function pickDomain(p: CompanyInput): string | null {
  if (p.company_domain) return p.company_domain;
  if (p.category === 'youtube') return null;
  if (p.content_presence?.startsWith('Podcast/interview guest in')) return null;
  return domainFromWebsite(p.website);
}

function brandFromDomain(domain: string): string {
  const label = domain.split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function resolveCompany(p: CompanyInput): { name: string | null; domain: string | null } {
  const domain = pickDomain(p);
  if (p.company_name) return { name: p.company_name, domain };

  if (p.category === 'youtube') return { name: p.name, domain };
  const show = p.content_presence?.match(/^Hosts "(.+?)"/);
  if (show) return { name: show[1], domain };
  return { name: domain ? brandFromDomain(domain) : null, domain };
}
