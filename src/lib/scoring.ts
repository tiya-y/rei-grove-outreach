// ============================================================
// Prospect scoring engine
//
// Ports the two rubrics the team already uses by hand in the
// partnership-prospector and affiliate-prospector skills, so scores computed
// in this app mean the same thing they'd mean in a Claude chat session.
//
//  - "partner" type  -> partnership-prospector's 5-dimension Fit Scorecard
//  - "creator" / "affiliate" types -> affiliate-prospector's channel-aware
//    100-point rubric (YouTube / Blog / Podcast / Newsletter variants)
//
// All rubrics are normalized to a 0-100 total so they can be compared and
// sorted together in the pipeline view, with per-dimension breakdowns kept
// so the "why" is never lost.
// ============================================================

import { DEFAULT_COMPETITOR_BLOCKLIST, EXISTING_PRODUCT_PARTNERS } from './rei-grove-content';

export type ProspectType = 'partner' | 'creator' | 'affiliate';

export type CreatorChannel = 'youtube' | 'blog' | 'podcast' | 'newsletter';

export interface ScoreDimensionInput {
  key: string;
  /** Raw score already expressed in points out of this dimension's weight (0..weight). */
  points: number;
  /** True when the underlying stat wasn't publicly available and was estimated. */
  estimated?: boolean;
  notes?: string;
}

export interface ScoreDimensionResult extends ScoreDimensionInput {
  label: string;
  weight: number;
}

export interface ScoreResult {
  total: number; // 0-100
  tier: 'Priority A' | 'Priority B' | 'Priority C' | 'Deprioritize';
  breakdown: ScoreDimensionResult[];
  highConversionBet: boolean;
}

interface RubricDimension {
  key: string;
  label: string;
  weight: number;
  guidance: string;
}

// ---- Partnership-prospector Fit Scorecard (weights sum to 100) ------------
export const PARTNER_RUBRIC: RubricDimension[] = [
  {
    key: 'audience_overlap',
    label: 'Audience Overlap',
    weight: 25,
    guidance:
      "1 (serves enterprise/institutional only) to 5 (core audience is independent landlords/investors)",
  },
  {
    key: 'content_presence',
    label: 'Content Presence',
    weight: 15,
    guidance: '1 (no blog/social/content) to 5 (active blog + newsletter + YouTube/podcast + webinars)',
  },
  {
    key: 'revenue_potential',
    label: 'Revenue Potential',
    weight: 25,
    guidance: '1 (no clear revenue path) to 5 (direct integration revenue or large referral fees possible)',
  },
  {
    key: 'product_fit',
    label: 'Product Fit',
    weight: 20,
    guidance: '1 (tangential to landlord needs) to 5 (solves a core landlord pain point)',
  },
  {
    key: 'co_creation_willingness',
    label: 'Co-Creation Willingness',
    weight: 15,
    guidance: '1 (affiliate-only or unresponsive) to 5 (already produces co-branded content or webinars)',
  },
];

// ---- Affiliate-prospector channel-aware rubrics (weights sum to 100) ------
export const CREATOR_RUBRICS: Record<CreatorChannel, RubricDimension[]> = {
  youtube: [
    { key: 'audience_fit', label: 'Audience fit', weight: 30, guidance: 'Independent landlords/self-managing investors = 30; adjacent = 10-20; broad = 0-10' },
    { key: 'engagement_rate', label: 'Engagement rate', weight: 25, guidance: 'Views-to-sub ratio: 20%+=25, 10-20%=20, 5-10%=14, <5%=7' },
    { key: 'audience_size', label: 'Audience size', weight: 20, guidance: 'Subscribers: 500k+=20, 100-500k=16, 25-100k=12, 5-25k=8, <5k=4' },
    { key: 'purchase_intent', label: 'Purchase intent', weight: 15, guidance: 'Software reviews/comparisons=15, "tools I use"=13, how-tos=10, general investing=6, lifestyle=2' },
    { key: 'affiliate_track_record', label: 'Affiliate track record', weight: 10, guidance: 'Active affiliate links=10, sponsor segments=8, no history but strong fit=5, anti-sponsorship=0' },
  ],
  blog: [
    { key: 'audience_fit', label: 'Audience fit', weight: 30, guidance: 'Landlord/PM-specific=30, adjacent RE=10-20, broad personal finance=0-10' },
    { key: 'engagement_rate', label: 'Engagement rate (est.)', weight: 20, guidance: 'Active comments+shares=18-20, moderate=10-17, none visible=5-9' },
    { key: 'audience_size', label: 'Audience size', weight: 20, guidance: 'Monthly traffic: 500k+=20, 100-500k=16, 25-100k=12, 5-25k=8, <5k=4' },
    { key: 'purchase_intent', label: 'Purchase intent', weight: 20, guidance: 'Software review/comparison posts=20, "best tools" listicles=16, how-tos=12, general RE=6, lifestyle=2' },
    { key: 'affiliate_track_record', label: 'Affiliate track record', weight: 10, guidance: 'Affiliate links/sponsored posts=10, advertise page=8, no history=5, anti-ads=0' },
  ],
  podcast: [
    { key: 'audience_fit', label: 'Audience fit', weight: 35, guidance: 'Landlords/self-managing investors=35, adjacent=12-25, broad=0-10' },
    { key: 'engagement_rate', label: 'Engagement rate (est.)', weight: 10, guidance: 'Review count/community proxy signals — high=10, moderate=6, low/none=3' },
    { key: 'audience_size', label: 'Audience size (est.)', weight: 20, guidance: 'Downloads/episode: 50k+=20, 10-50k=16, 2-10k=12, 500-2k=8, <500=4' },
    { key: 'purchase_intent', label: 'Purchase intent', weight: 25, guidance: 'Episodes on landlord tools/PM software=25, general RE investing=12, wealth/passive income only=4' },
    { key: 'affiliate_track_record', label: 'Affiliate track record', weight: 10, guidance: 'Promo codes in episodes=10, sponsor page=8, no history=5, explicitly no ads=0' },
  ],
  newsletter: [
    { key: 'audience_fit', label: 'Audience fit', weight: 35, guidance: 'Landlord/PM-specific=35, adjacent RE=12-25, broad=0-10' },
    { key: 'engagement_rate', label: 'Engagement rate (est.)', weight: 10, guidance: 'Self-reported open rate/repeat sponsors — high=10, moderate=6, low/none=3' },
    { key: 'audience_size', label: 'Audience size', weight: 20, guidance: 'Subscribers: 50k+=20, 10-50k=16, 2-10k=12, 500-2k=8, <500=4' },
    { key: 'purchase_intent', label: 'Purchase intent', weight: 25, guidance: 'Covers landlord tools/software reviews/ops tips=25, general RE news=12, broad personal finance=4' },
    { key: 'affiliate_track_record', label: 'Affiliate track record', weight: 10, guidance: 'Visible sponsor sections/affiliate links=10, media kit=8, no history=5, explicitly no ads=0' },
  ],
};

export function getRubric(type: ProspectType, channel?: CreatorChannel | null): RubricDimension[] {
  if (type === 'partner') return PARTNER_RUBRIC;
  const ch = channel && CREATOR_RUBRICS[channel] ? channel : 'blog';
  return CREATOR_RUBRICS[ch];
}

function tierFor(total: number): ScoreResult['tier'] {
  if (total >= 85) return 'Priority A';
  if (total >= 65) return 'Priority B';
  if (total >= 45) return 'Priority C';
  return 'Deprioritize';
}

/**
 * Compute a score from per-dimension point inputs (already expressed as
 * points out of that dimension's weight — e.g. a 4/5 on a 25pt partner
 * dimension is `points: 20`).
 */
export function computeScore(
  type: ProspectType,
  channel: CreatorChannel | null,
  dimensionInputs: ScoreDimensionInput[]
): ScoreResult {
  const rubric = getRubric(type, channel);
  const breakdown: ScoreDimensionResult[] = rubric.map((dim) => {
    const input = dimensionInputs.find((d) => d.key === dim.key);
    const rawPoints = input?.points ?? 0;
    const clamped = Math.max(0, Math.min(dim.weight, rawPoints));
    return {
      key: dim.key,
      label: dim.label,
      weight: dim.weight,
      points: clamped,
      estimated: input?.estimated,
      notes: input?.notes,
    };
  });

  const total = Math.round(breakdown.reduce((sum, d) => sum + d.points, 0));

  // "High Conversion Bet" flag from affiliate-prospector: strong audience fit
  // AND strong purchase intent, even if overall score is dragged down by
  // unmeasurable engagement data.
  const audienceFit = breakdown.find((d) => d.key === 'audience_fit' || d.key === 'audience_overlap');
  const purchaseIntent = breakdown.find((d) => d.key === 'purchase_intent' || d.key === 'revenue_potential');
  const highConversionBet = Boolean(
    audienceFit && purchaseIntent && audienceFit.points >= audienceFit.weight * 0.7 && purchaseIntent.points >= purchaseIntent.weight * 0.7
  );

  return { total, tier: tierFor(total), breakdown, highConversionBet };
}

// ---- Automatic disqualifiers -----------------------------------------------

export interface DisqualifierCheck {
  disqualified: boolean;
  reason?: string;
  isExistingProductPartner?: boolean;
}

/**
 * Checks a prospect's name/website against the competitor blocklist.
 * `extraBlocklist` should come from app_settings.competitor_blocklist so the
 * team can extend the list from Settings without a redeploy.
 */
export function checkDisqualifiers(
  input: { name: string; website?: string | null },
  extraBlocklist: { name: string; reason: string }[] = []
): DisqualifierCheck {
  const haystack = `${input.name} ${input.website ?? ''}`.toLowerCase();

  const blocklist = [...DEFAULT_COMPETITOR_BLOCKLIST, ...extraBlocklist];
  for (const entry of blocklist) {
    if (haystack.includes(entry.name.toLowerCase())) {
      return { disqualified: true, reason: entry.reason };
    }
  }

  const isExistingProductPartner = EXISTING_PRODUCT_PARTNERS.some((partner) =>
    haystack.includes(partner.toLowerCase())
  );

  return { disqualified: false, isExistingProductPartner };
}
