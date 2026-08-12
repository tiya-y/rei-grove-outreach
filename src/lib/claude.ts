// ============================================================
// Claude (Anthropic) helpers — outreach drafting, reply classification, and
// scoring assist. Mirrors the prompting patterns already proven out in
// PO-outreach-app's lib/claude.ts, adapted to REI Grove's partnership +
// affiliate/creator outreach voice (see rei-grove-content.ts and the
// partnership-prospector / affiliate-prospector skills this was ported from).
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { ACTIVATION_CHANNELS, REI_GROVE_BRAND, REI_GROVE_PRODUCT_EXPLAINER } from './rei-grove-content';
import type { ProspectType, CreatorChannel } from './scoring';
import { getRubric } from './scoring';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function firstText(message: Anthropic.Messages.Message): string {
  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
  return block.text;
}

// Style rules applied to every piece of outbound/reply copy so it reads like
// a real person wrote it, not a template.
const HUMAN_STYLE_RULES = `STYLE RULES (apply to everything you write):
- Never use an em dash (—) or double hyphen (--) as punctuation. Use a period, comma, or "and"/"but" instead.
- Avoid AI-sounding phrases and corporate filler: "I hope this email finds you well," "in today's fast-paced world," "delve into," "leverage," "unlock," "seamless," "streamline," "revolutionize," "elevate," "game-changer," "circle back," "touch base," "furthermore," "in conclusion," "I wanted to reach out."
- Write short, plain sentences. Contractions are fine. Sound like a real person typing an email from their own inbox, not a marketing template.
- Reference at least one specific, concrete detail about this exact person or their content/niche — never send something generic that could apply to anyone.`;

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error('Could not parse JSON from Claude response');
  }
}

// ── Outreach drafting ───────────────────────────────────────────────────────

export interface OutreachContext {
  prospectName: string;
  prospectType: ProspectType;
  contactFirstName?: string;
  category?: string;
  niche?: string;
  website?: string;
  contentNotes?: string; // e.g. "hosts a landlord-focused podcast, 8 episodes on tenant screening"
  offerType?: string; // one of ACTIVATION_CHANNELS keys
  sequenceStep?: number; // 1 = initial, 2 = follow-up 1 (day 7), 3 = follow-up 2 (day 14), 4 = follow-up 3 / final (day 44)
}

const FOLLOW_UP_TONE: Record<number, string> = {
  2: 'This is the first follow-up, sent about a week after the initial email with no reply. Keep it to 2-3 short lines. Briefly reference that you wrote before, add one new specific angle or detail you did not mention the first time, and make it very low-pressure. Do not repeat the first email.',
  3: 'This is the second follow-up, sent about two weeks after the initial email with no reply. Keep it to 2-3 short lines, even shorter and lower-key than the first follow-up. Try a different, smaller angle (e.g. a single specific resource or idea), not a repeat of the pitch.',
  4: 'This is the final follow-up in the sequence, sent about six weeks after the initial email with no reply. Keep it to 2 short lines. Make it a genuine, no-pressure close: acknowledge you have not heard back, leave the door open, and say this is the last check-in for now (in your own words, not that exact phrase).',
};

export async function generateOutreachEmail(ctx: OutreachContext): Promise<{ subject: string; body: string }> {
  const step = ctx.sequenceStep ?? 1;
  const isFollowUp = step > 1;
  const offer = ACTIVATION_CHANNELS.find((c) => c.key === ctx.offerType);

  const prompt = `You are writing cold outreach on behalf of ${REI_GROVE_BRAND.name} (${REI_GROVE_BRAND.tagline}), ${REI_GROVE_BRAND.parentBrand}'s free real estate investor education hub, tool platform, and community.

BRAND VOICE: ${REI_GROVE_BRAND.personality} Tone: ${REI_GROVE_BRAND.tone}
Audience REI Grove serves: ${REI_GROVE_BRAND.audience}

PROSPECT:
- Name: ${ctx.prospectName}
- Type: ${ctx.prospectType === 'partner' ? 'Company / partnership prospect' : ctx.prospectType === 'creator' ? 'Individual content creator' : 'Affiliate prospect'}
${ctx.contactFirstName ? `- Contact first name: ${ctx.contactFirstName}` : ''}
${ctx.category ? `- Content format: ${ctx.category}` : ''}
${ctx.niche ? `- Content niche/topic: ${ctx.niche}` : ''}
${ctx.website ? `- Website: ${ctx.website}` : ''}
${ctx.contentNotes ? `- What we know about their content/audience: ${ctx.contentNotes}` : ''}
${offer ? `- Offer to propose: ${offer.label} — ${offer.description}` : ''}

EMAIL SEQUENCE STEP: ${step}
${isFollowUp ? FOLLOW_UP_TONE[step] ?? FOLLOW_UP_TONE[4] : 'This is the initial outreach email.'}

STRUCTURE FOR THE INITIAL EMAIL (skip most of this for follow-ups):
1. Opening (2 sentences): name REI Grove, position it as a community/resource hub, not a hard product pitch.
2. The hook (2-3 sentences): be specific about why their audience and REI Grove's audience overlap. Reference something specific about their content or product if known.
3. The offer: propose the activation above with a concrete, tailored idea (a specific topic if it's a webinar, a specific asset if it's a co-branded resource).
4. The ask (1-2 sentences): cross-promotion — they share with their audience, REI Grove shares with ours.
5. CTA (1 sentence): suggest a quick call, low-pressure.

${HUMAN_STYLE_RULES}

ADDITIONAL RULES:
- Do NOT state specific community size numbers — keep it vague ("a highly engaged community of active real estate investors").
- Do NOT position REI Grove as small or new.
- No exclamation-point spam.
- Subject line: short, specific, not salesy. For follow-ups, vary the subject line from a plausible first-email subject rather than reusing "Following up".
- If you don't have specific content/audience notes for this prospect, base the personalized detail on their content niche and website instead of writing something generic.

Return ONLY valid JSON: {"subject": "...", "body": "..."}
The body should be plain text with \\n line breaks (no HTML). Do not include a signature block or unsubscribe line, those are added separately.`;

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJson<{ subject: string; body: string }>(firstText(message));
}

// ── Reply classification ────────────────────────────────────────────────────

export type ReplyClassification =
  | 'interested'
  | 'meeting_request'
  | 'more_info'
  | 'not_interested'
  | 'do_not_contact'
  | 'wrong_person'
  | 'auto_reply';

export async function classifyReply(
  replyText: string,
  prospectName: string
): Promise<{ classification: ReplyClassification; confidence: number; suggestedResponse: string }> {
  const prompt = `Classify this email reply from a REI Grove partnership/affiliate outreach prospect, and draft a response we could send back.

PROSPECT: ${prospectName}
REPLY:
"""
${replyText}
"""

WHAT REI GROVE IS (use this to explain the product accurately if the reply asks for more info; don't just repeat it verbatim, work the relevant parts into an actual reply to what they said):
${REI_GROVE_PRODUCT_EXPLAINER}

Classifications: interested | meeting_request | more_info | not_interested | do_not_contact | wrong_person | auto_reply

${HUMAN_STYLE_RULES}

FOR "suggestedResponse":
- If the classification is interested, meeting_request, or more_info: write a full, ready-to-send reply (3-5 sentences) addressed to ${prospectName}, personalized to whatever they specifically said or asked in their reply, explaining REI Grove further using the product info above where relevant, with a clear next step.
- For any other classification: keep "suggestedResponse" to one short internal note for the team (not a reply to send), e.g. "No action needed, form auto-reply" or "They asked not to be contacted again."

Return ONLY valid JSON:
{"classification": "...", "confidence": 0.0-1.0, "suggestedResponse": "..."}`;

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJson(firstText(message));
}

// ── Scoring assist ───────────────────────────────────────────────────────────
// Given free-text research notes, suggests per-dimension point values
// against the correct rubric (see scoring.ts). This is assistive only — the
// team can and should edit any suggested value before saving.

export async function suggestScore(input: {
  prospectType: ProspectType;
  channel?: CreatorChannel | null;
  name: string;
  website?: string;
  researchNotes: string;
  domainRating?: number | null;
  organicTraffic?: number | null;
  audienceSizeEst?: number | null;
}) {
  const rubric = getRubric(input.prospectType, input.channel ?? null);
  const rubricText = rubric
    .map((d) => `- ${d.key} ("${d.label}", max ${d.weight} pts): ${d.guidance}`)
    .join('\n');

  const prompt = `Score this REI Grove outreach prospect using the exact rubric below. Assign each dimension a point value from 0 up to its max. Flag any dimension as "estimated": true if the underlying data wasn't directly observable from the research notes.

PROSPECT: ${input.name}
${input.website ? `Website: ${input.website}` : ''}
${input.domainRating != null ? `Ahrefs Domain Rating: ${input.domainRating}` : ''}
${input.organicTraffic != null ? `Ahrefs organic traffic estimate: ${input.organicTraffic}` : ''}
${input.audienceSizeEst != null ? `Audience size estimate: ${input.audienceSizeEst}` : ''}

RESEARCH NOTES:
"""
${input.researchNotes}
"""

RUBRIC:
${rubricText}

Return ONLY valid JSON:
{"dimensions": [{"key": "...", "points": 0, "estimated": true|false, "notes": "one short reason"}], "summary": "one sentence overall assessment"}`;

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJson<{
    dimensions: { key: string; points: number; estimated: boolean; notes: string }[];
    summary: string;
  }>(firstText(message));
}
