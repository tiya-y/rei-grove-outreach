export type ProspectType = 'partner' | 'creator' | 'affiliate';

export type ProspectStage =
  | 'new'
  | 'researched'
  | 'approved'
  | 'reached_out'
  | 'replied'
  | 'in_discussion'
  | 'partner_live'
  | 'affiliate_active'
  | 'stalled'
  | 'pass';

export const PROSPECT_STAGES: { key: ProspectStage; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'researched', label: 'Researched' },
  { key: 'approved', label: 'Approved' },
  { key: 'reached_out', label: 'Reached Out' },
  { key: 'replied', label: 'Replied' },
  { key: 'in_discussion', label: 'In Discussion' },
  { key: 'partner_live', label: 'Partner (Live)' },
  { key: 'affiliate_active', label: 'Affiliate (Active)' },
  { key: 'stalled', label: 'Stalled' },
  { key: 'pass', label: 'Pass' },
];

// Stages that mean "this prospect has been approved for outreach" — used to
// split the pipeline between the Prospect Search pool and the Outreach pool.
export const OUTREACH_STAGES: ProspectStage[] = [
  'approved',
  'reached_out',
  'replied',
  'in_discussion',
  'partner_live',
  'affiliate_active',
  'stalled',
];

export function isOutreachStage(stage: ProspectStage): boolean {
  return (OUTREACH_STAGES as string[]).includes(stage);
}

export interface ScoreBreakdownEntry {
  key: string;
  label: string;
  weight: number;
  points: number;
  estimated?: boolean;
  notes?: string;
}

export interface ScoreBreakdown {
  total: number;
  tier: string;
  breakdown: ScoreBreakdownEntry[];
  highConversionBet?: boolean;
}

export type RoundStatus = 'pass' | 'fail' | null;

export interface RoundEvidence {
  queries: string[];
  results: { title: string; link: string; snippet: string }[];
  apollo?: { name: string | null; industry: string | null; employees: number | null; description: string | null } | null;
  apolloError?: string;
}

export interface Prospect {
  id: string;
  prospect_type: ProspectType;
  name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_title: string | null;
  email: string | null;
  website: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  company_domain: string | null;
  round1_status: RoundStatus;
  round1_reason: string | null;
  round2_status: RoundStatus;
  round2_reason: string | null;
  round3_status: RoundStatus;
  round3_reason: string | null;
  qualification_evidence: { round1?: RoundEvidence; round2?: RoundEvidence; round3?: RoundEvidence } | null;
  category: string | null;
  niche: string | null;
  city: string | null;
  state: string | null;
  audience_size_est: number | null;
  content_presence: string | null;
  domain_rating: number | null;
  organic_traffic_est: number | null;
  source: 'manual' | 'n8n' | 'ahrefs' | 'discovery';
  source_ref: string | null;
  batch_id: string | null;
  score: number | null;
  score_breakdown: ScoreBreakdown | Record<string, never>;
  disqualified: boolean;
  disqualify_reason: string | null;
  stage: ProspectStage;
  notes: string | null;
  unsubscribed: boolean;
  unsubscribed_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MessageDirection = 'outbound';
export type MessageStatus = 'draft' | 'sent';

export interface Message {
  id: string;
  prospect_id: string;
  direction: MessageDirection;
  subject: string | null;
  body_text: string | null;
  offer_type: string | null;
  sequence_step: number;
  ai_generated: boolean;
  status: MessageStatus;
  to_address: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ProspectBatch {
  id: string;
  source: 'n8n' | 'csv' | 'discovery' | 'manual';
  label: string | null;
  source_ref: string | null;
  created_at: string;
  prospect_count: number;
}

export interface DashboardStats {
  found: number;
  reached_out: number;
  signed_up: number;
}

export const QUALIFICATION_ROUNDS = [
  { round: 1, label: 'Company' },
  { round: 2, label: 'Contact' },
  { round: 3, label: 'Relevance' },
] as const;

export function roundStatus(p: Pick<Prospect, 'round1_status' | 'round2_status' | 'round3_status'>, round: 1 | 2 | 3): RoundStatus {
  return (round === 1 ? p.round1_status : round === 2 ? p.round2_status : p.round3_status) ?? null;
}

// All three rounds passed. The email reveal (Apollo) is gated on this.
export function isFullyQualified(p: Pick<Prospect, 'round1_status' | 'round2_status' | 'round3_status'>): boolean {
  return p.round1_status === 'pass' && p.round2_status === 'pass' && p.round3_status === 'pass';
}

// ── The qualification funnel ────────────────────────────────────────────────
// Every prospect is in exactly one bucket:
//   failed     did not meet the criteria (failed a round, was blocklisted at
//              import, or was passed on by hand). Never reaches Outreach.
//   qualified  passed all three rounds. Moving forward: reveal email, approve.
//   pending    not ruled out yet (rounds not run, or partway through).

export type QualificationBucket = 'pending' | 'qualified' | 'failed';

// The round a prospect failed (1, 2, or 3), 0 if it was ruled out some other
// way (blocklisted at import, or passed on manually), or null if it hasn't been.
export function failedRound(p: Pick<Prospect, 'round1_status' | 'round2_status' | 'round3_status' | 'disqualified' | 'stage'>): 0 | 1 | 2 | 3 | null {
  if (p.round1_status === 'fail') return 1;
  if (p.round2_status === 'fail') return 2;
  if (p.round3_status === 'fail') return 3;
  if (p.disqualified || p.stage === 'pass') return 0;
  return null;
}

export function qualificationBucket(p: Prospect): QualificationBucket {
  if (failedRound(p) !== null) return 'failed';
  return isFullyQualified(p) ? 'qualified' : 'pending';
}

export function failureText(p: Prospect): string | null {
  const round = failedRound(p);
  if (round === null) return null;
  if (round === 0) return p.disqualified ? `Blocklisted: ${p.disqualify_reason ?? 'no reason recorded'}` : 'Passed on by hand.';
  const reason = round === 1 ? p.round1_reason : round === 2 ? p.round2_reason : p.round3_reason;
  return `Failed round ${round}${reason ? `: ${reason}` : ''}`;
}

// Why a prospect can't move into Outreach yet, or null if it can. Used by the
// list, the prospect page, and the server so they can never disagree.
export function approvalBlocker(p: Pick<Prospect, 'email' | 'round1_status' | 'round2_status' | 'round3_status'>): string | null {
  if (!isFullyQualified(p)) return 'Needs to pass all three qualification rounds first.';
  if (!p.email) return 'Needs an email address. Reveal it now that the contact has qualified.';
  return null;
}
