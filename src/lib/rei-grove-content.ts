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
// default; app_settings.competitor_blocklist in the database can extend this list
// without a redeploy.
export const DEFAULT_COMPETITOR_BLOCKLIST = [
  // Direct Ledgre competitors (rental accounting/bookkeeping) — never pursue
  { name: 'Baselane', reason: 'Direct Ledgre competitor (rental accounting/bookkeeping)' },
  { name: 'REI Hub', reason: 'Direct Ledgre competitor (rental accounting/bookkeeping)' },
  { name: 'Stessa', reason: 'Direct Ledgre competitor (rental accounting/bookkeeping)' },
  { name: 'RentRedi', reason: 'Direct Ledgre competitor overlap (financial features)' },
  // Direct property management software competitors
  { name: 'TurboTenant', reason: 'Direct competitor (property management software)' },
  { name: 'Buildium', reason: 'Direct competitor (property management software)' },
  { name: 'AppFolio', reason: 'Direct competitor (property management software)' },
  { name: 'DoorLoop', reason: 'Direct competitor (property management software)' },
  { name: 'TenantCloud', reason: 'Direct competitor (property management software)' },
  { name: 'Avail', reason: 'Direct competitor (property management software)' },
];

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

// ============================================================
// Creator discovery — the content-creator niches Prospect Search's
// "Discover creators" search targets, with a rough target count per niche
// and a note on how well REI Grove's affiliate offer tends to convert there.
// Target counts are a goal for the pipeline overall, not a guarantee any one
// search call returns. `keywords` are the queries used to find real,
// currently-ranking sites via Ahrefs SERP data — see
// lib/ahrefs.ts's discoverDomainsForNiche().
// ============================================================
export interface CreatorDiscoveryNiche {
  key: string;
  label: string;
  targetCount: number;
  affiliateFitNote: string;
  keywords: string[];
  // Plural, people-first phrase for mail-merge copy, e.g. "a place for
  // {{audienceLabel}} to connect" — see lib/outreachTemplates.ts.
  audienceLabel: string;
}

export const CREATOR_DISCOVERY_NICHES: CreatorDiscoveryNiche[] = [
  { key: 'small_landlord', label: 'Small Landlord / Self-Managing / Buy-and-Hold', targetCount: 13, affiliateFitNote: 'Mostly high fit', keywords: ['self managing landlord tips', 'buy and hold rental property tips', 'DIY landlord advice'], audienceLabel: 'self-managing landlords' },
  { key: 'house_hacking_beginner', label: 'House Hacking / BRRRR / Beginner Investor', targetCount: 4, affiliateFitNote: 'High to medium fit', keywords: ['house hacking tips', 'BRRRR method explained', 'beginner real estate investor advice'], audienceLabel: 'beginner real estate investors' },
  { key: 'wholesaling_flip', label: 'Wholesaling / Fix & Flip', targetCount: 8, affiliateFitNote: 'Mostly low fit (tangential to landlording)', keywords: ['real estate wholesaling tips', 'house flipping advice'], audienceLabel: 'wholesalers and house flippers' },
  { key: 'multifamily_syndication', label: 'Multifamily / Syndication', targetCount: 6, affiliateFitNote: 'Mostly low fit (accredited-investor skew)', keywords: ['multifamily syndication explained', 'apartment investing tips'], audienceLabel: 'multifamily investors' },
  { key: 'mhp_self_storage', label: 'Mobile Home Park / Self-Storage', targetCount: 4, affiliateFitNote: 'Low fit (niche/accredited)', keywords: ['mobile home park investing tips', 'self storage investing tips'], audienceLabel: 'mobile home park and self-storage investors' },
  { key: 'short_term_rental', label: 'Short-Term Rental / Airbnb Hosting', targetCount: 17, affiliateFitNote: 'Mixed, several high-fit', keywords: ['airbnb hosting tips', 'airbnb superhost advice', 'short term rental arbitrage tips'], audienceLabel: 'short-term rental hosts' },
  { key: 'women_in_rei', label: 'Women in Real Estate Investing', targetCount: 10, affiliateFitNote: 'Mixed, several high-fit', keywords: ['women real estate investors advice', 'women in real estate investing tips'], audienceLabel: 'women real estate investors' },
  { key: 'general_rei_education', label: 'General RE Investing Education', targetCount: 9, affiliateFitNote: 'Medium fit', keywords: ['real estate investing tips for beginners', 'real estate investor education'], audienceLabel: 'real estate investors' },
];

// Fallback for creator/affiliate prospects with no niche set (e.g. added
// manually without picking one).
export const DEFAULT_AUDIENCE_LABEL = 'real estate investors';
