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
