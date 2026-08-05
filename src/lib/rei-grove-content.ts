// ============================================================
// REI Grove reference data — pulled from the rei-grove-knowledge and
// partnership-prospector skills so outreach copy, activation offers, and
// disqualifiers stay consistent with what the rest of the team already uses.
//
// If REI Grove's tiers/pricing/brand voice change, update this file and the
// rei-grove-knowledge skill together.
// ============================================================

export const REI_GROVE_BRAND = {
  name: 'REI Grove',
  parentBrand: 'Innago',
  formerName: 'Innago Insight',
  tagline: 'Grow together',
  supportEmail: 'help@reigrove.com',
  personality:
    'Warm, credible, community-focused, growth-oriented. Speaks like a trusted advisor and knowledgeable neighbor, not a corporation. Welcoming to beginners, respectful of experienced investors.',
  tone: 'Encouraging, practical, inclusive. Avoid jargon. Use plain language. Be direct and helpful.',
  audience:
    'Small to mid-size landlords, property owners, and real estate investors — from first-time buyers to experienced portfolio managers.',
};

// The 7 partnership activation channels from the partnership-prospector skill.
// Every outreach draft should map to one (or more) of these.
export const ACTIVATION_CHANNELS = [
  {
    key: 'webinar',
    label: 'Co-hosted webinar',
    description:
      'Co-hosted live webinar — REI Grove handles promotion, registration, and hosting. Partner brings the expertise. Co-branded.',
  },
  {
    key: 'co_branded_resource',
    label: 'Co-branded resource',
    description:
      'Evergreen asset for the resource library — calculator, guide, flowchart, checklist. Lives permanently with partner branding.',
  },
  {
    key: 'newsletter_feature',
    label: 'Newsletter feature',
    description: "Partner featured in REI Grove's email newsletter to the member base.",
  },
  {
    key: 'dashboard_widget',
    label: 'Dashboard widget',
    description: 'Partner logo card on the member dashboard with a CTA.',
  },
  {
    key: 'email_blast',
    label: 'Dedicated email blast',
    description: "Dedicated or segmented email to REI Grove's landlord audience.",
  },
  {
    key: 'social_cross_promo',
    label: 'Social cross-promotion',
    description: 'Posts on both REI Grove and partner social channels.',
  },
  {
    key: 'forum_takeover',
    label: 'Forum takeover',
    description: 'Partner expert hosts a live Q&A thread in the community forum.',
  },
  {
    key: 'affiliate_terms',
    label: 'Affiliate / referral link',
    description:
      'Straightforward affiliate or referral arrangement — no co-creation. Used for creator/affiliate-type prospects rather than full partnerships.',
  },
] as const;

export type ActivationChannelKey = (typeof ACTIVATION_CHANNELS)[number]['key'];

// Automatic disqualifiers — never pursue these regardless of score.
// Mirrors the partnership-prospector skill's blocklist. Kept here as the code
// default; app_settings.competitor_blocklist in Supabase can extend this list
// without a redeploy.
export const DEFAULT_COMPETITOR_BLOCKLIST = [
  // Direct Ledgre competitors (rental accounting/bookkeeping) — never pursue
  { name: 'Baselane', reason: 'Direct Ledgre competitor (rental accounting/bookkeeping)' },
  { name: 'REI Hub', reason: 'Direct Ledgre competitor (rental accounting/bookkeeping)' },
  { name: 'Stessa', reason: 'Direct Ledgre competitor (rental accounting/bookkeeping)' },
  { name: 'RentRedi', reason: 'Direct Ledgre competitor overlap (financial features)' },
  // Direct Innago competitors (property management software)
  { name: 'TurboTenant', reason: 'Direct Innago competitor (property management software)' },
  { name: 'Buildium', reason: 'Direct Innago competitor (property management software)' },
  { name: 'AppFolio', reason: 'Direct Innago competitor (property management software)' },
  { name: 'DoorLoop', reason: 'Direct Innago competitor (property management software)' },
  { name: 'TenantCloud', reason: 'Direct Innago competitor (property management software)' },
  { name: 'Avail', reason: 'Direct Innago competitor (property management software)' },
];

// Existing Innago product partners — not disqualified, but should be flagged
// so they aren't pitched as a brand-new relationship.
export const EXISTING_PRODUCT_PARTNERS = [
  'Latchel',
  'Steadily',
  'Obie',
  'Ledgre',
  'PlacePay',
  'Accelerent',
];

// REI Grove membership tiers (for outreach copy / dashboard-widget mockups).
export const REI_GROVE_TIERS = {
  free: { name: 'REI Grove (Free)', priceLabel: '$0' },
  plus: {
    name: 'REI Grove+',
    priceLabel: '$20/mo, or $16.67/mo billed annually ($200/yr)',
    trial: '7-day trial for $1',
  },
};

// Pre-loaded discovery keywords (from partnership-prospector + affiliate-prospector).
export const DISCOVERY_KEYWORDS = [
  { keyword: 'property management software', priority: 'high' },
  { keyword: 'rental management software', priority: 'high' },
  { keyword: 'rental management platform', priority: 'high' },
  { keyword: 'multifamily', priority: 'high' },
  { keyword: 'real estate investing', priority: 'high' },
  { keyword: 'landlord', priority: 'high' },
  { keyword: 'house hacking', priority: 'medium' },
  { keyword: 'passive income', priority: 'medium' },
  { keyword: 'tenant screening', priority: 'medium' },
  { keyword: 'DSCR loans', priority: 'medium' },
  { keyword: 'landlord insurance', priority: 'medium' },
];

export const COMPETITOR_DOMAINS_FOR_WARM_LEADS = [
  { competitor: 'Buildium', domain: 'buildium.com' },
  { competitor: 'DoorLoop', domain: 'doorloop.com' },
  { competitor: 'TurboTenant', domain: 'turbotenant.com' },
  { competitor: 'AppFolio', domain: 'appfolio.com' },
  { competitor: 'Entrata', domain: 'entrata.com' },
];
