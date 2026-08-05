// ============================================================
// Claude (Anthropic) helpers — outreach drafting, reply classification, and
// scoring assist. Mirrors the prompting patterns already proven out in
// PO-outreach-app's lib/claude.ts, adapted to REI Grove's partnership +
// affiliate/creator outreach voice (see rei-grove-content.ts and the
// partnership-prospector / affiliate-prospector skills this was ported from).
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { ACTIVATION_CHANNELS, REI_GROVE_BRAND } from './rei-grove-content';
import type { ProspectType, CreatorChannel } from './scoring';
import { getRubric } from './scoring';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function firstText(message: Anthropic.Messages.Message): string {
  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
  return block.text;
}

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
  website?: string;
  contentNotes?: string; // e.g. "hosts a landlord-focused podcast, 8 episodes on tenant screening"
  offerType?: string; // one of ACTIVATION_CHANNELS keys
  sequenceStep?: number; // 1 = initial, 2+ = follow-up
}

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
${ctx.category ? `- Category: ${ctx.category}` : ''}
${ctx.website ? `- Website: ${ctx.website}` : ''}
${ctx.contentNotes ? `- What we know about their content/audience: ${ctx.contentNotes}` : ''}
${offer ? `- Offer to propose: ${offer.label} — ${offer.description}` : ''}

EMAIL SEQUENCE STEP: ${step}
${isFollowUp ? 'This is a follow-up. Keep it to 3-4 short lines, reference the first email briefly, add one new angle. Do not repeat the same pitch verbatim.' : 'This is the initial outreach email.'}

STRUCTURE FOR THE INITIAL EMAIL (skip most of this for follow-ups):
1. Opening (2 sentences): name REI Grove, position it as a community/resource hub, not a hard product pitch.
2. The hook (2-3 sentences): be specific about why their audience and REI Grove's audience overlap. Reference something specific about their content or product if known.
3. The offer: propose the activation above with a concrete, tailored idea (a specific topic if it's a webinar, a specific asset if it's a co-branded resource).
4. The ask (1-2 sentences): cross-promotion — they share with their audience, REI Grove shares with ours.
5. CTA (1 sentence): suggest a quick call, low-pressure.

RULES:
- Do NOT state specific community size numbers — keep it vague ("a highly engaged community of active real estate investors").
- Do NOT position REI Grove as small or new.
- Sound like a real person, not a template. No exclamation-point spam.
- Subject line: short, specific, not salesy.

Return ONLY valid JSON: {"subject": "...", "body": "..."}
The body should be plain text with \\n line breaks (no HTML).`;

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
  const prompt = `Classify this email reply from a REI Grove partnership/affiliate outreach prospect and suggest a brief response.

PROSPECT: ${prospectName}
REPLY:
"""
${replyText}
"""

Classifications: interested | meeting_request | more_info | not_interested | do_not_contact | wrong_person | auto_reply

Return ONLY valid JSON:
{"classification": "...", "confidence": 0.0-1.0, "suggestedResponse": "..."}`;

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 400,
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
