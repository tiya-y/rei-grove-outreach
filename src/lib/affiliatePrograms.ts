// ============================================================
// The two affiliate programs the Outreach tab can write initial emails for.
// Pure data and string checks (no database, no model), so the browser can
// import the labels too. Each program carries its own fixed offer facts, the
// one link that must appear, the checks a generated email must pass, and a
// brand guard so a REI Grove email never mentions Innago and an Innago email
// never mentions REI Grove (example emails can't leak one into the other).
// ============================================================

import {
  AFFILIATE_OFFER,
  INNAGO_OFFER,
  renderAffiliateInitialEmail,
  renderInnagoAffiliateInitialEmail,
  type AffiliateTemplateContext,
} from './outreachTemplates';

export type ProgramKey = 'reigrove' | 'innago';
export const PROGRAM_KEYS: ProgramKey[] = ['reigrove', 'innago'];

export function isProgramKey(v: unknown): v is ProgramKey {
  return v === 'reigrove' || v === 'innago';
}

/** Any input to a valid program key, defaulting to REI Grove. */
export function toProgram(v: unknown): ProgramKey {
  return isProgramKey(v) ? v : 'reigrove';
}

export function normalizeUrl(u: string): string {
  return u.replace(/[.,;:!?)\]]+$/, '').replace(/\/+$/, '').toLowerCase();
}

export function urlsIn(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>"]+/g) ?? []).map(normalizeUrl);
}

export interface Program {
  key: ProgramKey;
  label: string;
  /** Stored as the message's offer_type when an email for this program is marked sent. */
  offerType: string;
  intro: string;
  signature: string;
  namePlaceholder: string;
  /** Fixed facts handed to the model verbatim. */
  factLines: string[];
  /** Links the model may use (besides any that appear in the team's examples). */
  allowedUrls: string[];
  /** Extra prompt rules specific to this program. */
  rules: string[];
  forbidden: { re: RegExp; message: string };
  /** Problems with a body beyond the shared checks. */
  requirements(body: string, exampleUrls: Set<string>): string[];
  template(ctx: AffiliateTemplateContext): { subject: string; body: string };
}

const REIGROVE: Program = {
  key: 'reigrove',
  label: 'REI Grove',
  offerType: 'affiliate_terms',
  intro: 'REI Grove is a real estate investor education hub, tool platform, and community. You are writing the first cold outreach email inviting one person to join the REI Grove affiliate program.',
  signature: AFFILIATE_OFFER.signature,
  namePlaceholder: AFFILIATE_OFFER.namePlaceholder,
  factLines: [
    ...AFFILIATE_OFFER.terms,
    `Link to look at the site: ${AFFILIATE_OFFER.siteUrl}`,
    `Application link: write the literal text ${AFFILIATE_OFFER.applyPlaceholder} (it is filled in by hand later)`,
  ],
  allowedUrls: [AFFILIATE_OFFER.siteUrl],
  rules: ['Never mention Innago. This email is only about REI Grove.'],
  forbidden: { re: /innago/i, message: 'It must not mention Innago. This email is only about REI Grove.' },
  requirements(body, exampleUrls) {
    const problems: string[] = [];
    if (!/\$75\b/.test(body)) problems.push('It must state "$75 per annual signup".');
    if (!/\$5\s*\/\s*month|\$5 (?:a|per) month/i.test(body)) problems.push('It must state "$5/month for every monthly signup".');
    if (!/60\s*(?:-|–|to|or)\s*90/i.test(body)) problems.push('It must state the 60-90 day cookie window.');
    const site = normalizeUrl(AFFILIATE_OFFER.siteUrl);
    if (!urlsIn(body).includes(site)) problems.push(`It must include ${AFFILIATE_OFFER.siteUrl} exactly.`);
    const hasApplyPath = body.includes(AFFILIATE_OFFER.applyPlaceholder) || urlsIn(body).some((u) => exampleUrls.has(u) && u !== site);
    if (!hasApplyPath) problems.push(`It must include the application link as the literal text ${AFFILIATE_OFFER.applyPlaceholder}.`);
    return problems;
  },
  template: renderAffiliateInitialEmail,
};

const INNAGO: Program = {
  key: 'innago',
  label: 'Innago',
  offerType: 'innago_affiliate',
  intro:
    'Innago is free rental property management software for landlords (online rent collection, tenant screening, leases, maintenance tracking). You are writing the first cold outreach email inviting one person to join the Innago affiliate program.',
  signature: INNAGO_OFFER.signature,
  namePlaceholder: INNAGO_OFFER.namePlaceholder,
  factLines: [
    ...INNAGO_OFFER.terms,
    `The one link to share, with details and an earnings calculator: ${INNAGO_OFFER.infoUrl}`,
    'Do not state any specific earnings amount. The calculator on that page does the estimating.',
  ],
  allowedUrls: [INNAGO_OFFER.infoUrl],
  rules: ['Never mention REI Grove. This email is only about Innago.', 'Do not state any dollar amount except the $25 PayPal payout threshold.'],
  forbidden: { re: /rei\s*grove|reigrove/i, message: 'It must not mention REI Grove. This email is only about Innago.' },
  requirements(body) {
    const problems: string[] = [];
    if (!/25\s*%/.test(body)) problems.push('It must state the 25% commission.');
    if (!/12[\s-]*months?/i.test(body)) problems.push('It must state that commission lasts for the first 12 months.');
    if (!urlsIn(body).includes(normalizeUrl(INNAGO_OFFER.infoUrl))) problems.push(`It must include ${INNAGO_OFFER.infoUrl} exactly.`);
    if (/\$75\b/.test(body) || /60\s*(?:-|–|to)\s*90/i.test(body)) problems.push('It contains terms from a different program ($75 or a 60-90 day cookie). Remove them.');
    return problems;
  },
  template: renderInnagoAffiliateInitialEmail,
};

export const PROGRAMS: Record<ProgramKey, Program> = { reigrove: REIGROVE, innago: INNAGO };
