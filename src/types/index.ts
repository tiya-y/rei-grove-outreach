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
  category: string | null;
  city: string | null;
  state: string | null;
  audience_size_est: number | null;
  content_presence: string | null;
  domain_rating: number | null;
  organic_traffic_est: number | null;
  source: 'manual' | 'n8n' | 'ahrefs';
  source_ref: string | null;
  batch_id: string | null;
  score: number | null;
  score_breakdown: ScoreBreakdown | Record<string, never>;
  disqualified: boolean;
  disqualify_reason: string | null;
  stage: ProspectStage;
  notes: string | null;
  last_contacted_at: string | null;
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MessageDirection = 'outbound' | 'inbound';
export type MessageStatus = 'draft' | 'sent' | 'delivered' | 'opened' | 'replied' | 'bounced' | 'failed';

export interface Message {
  id: string;
  prospect_id: string;
  direction: MessageDirection;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  offer_type: string | null;
  sequence_step: number;
  ai_generated: boolean;
  status: MessageStatus;
  ms_message_id: string | null;
  ms_conversation_id: string | null;
  from_address: string | null;
  to_address: string | null;
  ai_classification: string | null;
  ai_confidence: number | null;
  ai_suggested_response: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
}

export interface MailboxConnection {
  id: string;
  label: string;
  email: string | null;
  ms365_user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  last_synced_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProspectBatch {
  id: string;
  source: 'n8n' | 'csv';
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
