// ============================================================
// Fixed initial-outreach template for creator/affiliate prospects — the
// exact copy and affiliate terms the team approved, filled in per prospect.
// Unlike lib/claude.ts's generateOutreachEmail, this is plain string
// substitution with no LLM call, so the compensation numbers and links
// can never drift or get reworded. Partner-type prospects, and every
// follow-up step (2+), still go through Claude — see
// app/api/outreach/draft/route.ts for the branch.
//
// [affiliate application link] and [Your Name] are left as literal
// placeholders for whoever sends to fill in by hand before sending, same
// as any other manually-reviewed draft.
// ============================================================

// The facts every initial affiliate email must carry, whether it comes from
// the fixed template below or is written by Claude from the user's examples.
// The example-based generator is checked against these in code (see
// outreachDraft.ts), so the numbers and links can't drift either way.
export const AFFILIATE_OFFER = {
  siteUrl: 'https://reigrove.com',
  applyPlaceholder: '[affiliate application link]',
  namePlaceholder: '[Your Name]',
  signature: 'REI Grove Partnerships',
  terms: ['$75 per annual signup', '$5/month for every monthly signup', '60-90 day cookie window'],
};

export interface AffiliateTemplateContext {
  firstName: string;
  audienceLabel: string;
}

const SUBJECT_TEMPLATE = 'A resource your {{audienceLabel}} audience might actually use';

const BODY_TEMPLATE = `Hi {{firstName}},

I'll keep this short, I know your inbox is full of pitches.

REI Grove is a resource hub and community for real estate investors, a place for {{audienceLabel}} to connect with other investors, learn through courses and guides, and run real numbers with 14 built-in calculators (cap rate, ROI, IRR, DSCR, and more) instead of guessing.

We're looking for a few partners to share it with their audience, and your work with {{audienceLabel}} made you an easy yes for us.

Here's the offer:
- $75 per annual signup
- $5/month for every monthly signup
- 60–90 day cookie window

Take a look yourself first, no strings attached: https://reigrove.com
If it's useful, apply here, takes about a minute: [affiliate application link]
Just reply here if you have any questions.

Best,
[Your Name]
REI Grove Partnerships`;

function fillTemplate(template: string, ctx: AffiliateTemplateContext): string {
  return template.replace(/{{firstName}}/g, ctx.firstName).replace(/{{audienceLabel}}/g, ctx.audienceLabel);
}

export function renderAffiliateInitialEmail(ctx: AffiliateTemplateContext): { subject: string; body: string } {
  return {
    subject: fillTemplate(SUBJECT_TEMPLATE, ctx),
    body: fillTemplate(BODY_TEMPLATE, ctx),
  };
}

// ── Innago affiliate program ─────────────────────────────────────────────────
// A separate program with its own offer, taken from innago.com/affiliate-program
// (read directly): 25% of every payment fee for each referred landlord's first
// 12 months, free for landlords, instant link after a quick signup, PayPal
// payout at a $25 balance. The page link (which has the earnings calculator)
// is the one link in the email. No earnings figures are stated in the email,
// because the page's estimates depend on the inputs a person chooses.

export const INNAGO_OFFER = {
  infoUrl: 'https://innago.com/affiliate-program/',
  namePlaceholder: '[Your Name]',
  signature: 'Innago Affiliate Program',
  terms: [
    '25% of every payment fee, every month, for the first 12 months each referred landlord uses Innago',
    'Innago is completely free for landlords, no contracts, so there is nothing to sell',
    'No approval wait: you get your referral link right away after a quick signup',
    'Paid through PayPal once your balance reaches $25',
  ],
};

const INNAGO_SUBJECT_TEMPLATE = 'A free tool your {{audienceLabel}} audience might actually use';

const INNAGO_BODY_TEMPLATE = `Hi {{firstName}},

I'll keep this short, I know your inbox is full of pitches.

Innago is free rental property management software for landlords: online rent collection, tenant screening, leases, and maintenance tracking in one place, with no contracts. It's rated 4.9/5 on Capterra.

We have an affiliate program, and your work with {{audienceLabel}} made you an easy yes for us.

Here's the offer:
- 25% of every payment fee, every month, for each landlord's first 12 months
- Free for landlords, so there's nothing to sell
- No approval wait, you get your link right away
- Paid through PayPal once your balance reaches $25

See the details and an earnings calculator here: ${INNAGO_OFFER.infoUrl}
Just reply here if you have any questions.

Best,
${INNAGO_OFFER.namePlaceholder}
${INNAGO_OFFER.signature}`;

export function renderInnagoAffiliateInitialEmail(ctx: AffiliateTemplateContext): { subject: string; body: string } {
  return {
    subject: fillTemplate(INNAGO_SUBJECT_TEMPLATE, ctx),
    body: fillTemplate(INNAGO_BODY_TEMPLATE, ctx),
  };
}
