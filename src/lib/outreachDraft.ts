// ============================================================
// Initial affiliate email generation, for either affiliate program
// (see affiliatePrograms.ts).
//
// With no examples uploaded for that program, this is its fixed template
// (plain string substitution, no model). With examples, Claude writes the
// email in the voice and shape of those examples, personalized from facts we
// actually have about the prospect. The offer terms and links are never left
// to the model: they are given as fixed facts, and the result is CHECKED in
// code (terms present, only known URLs, no em dashes, nothing from the other
// program or brand). A draft that fails the checks is retried once with the
// problems listed, then rejected, so a wrong number, an invented link or a
// cross-brand mention can't reach a draft.
// ============================================================

import { anthropic, firstText, parseJson } from './claude';
import { sql } from './db';
import { ensureOutreachSchema } from './schema';
import { resolveCompany } from './company';
import { CREATOR_DISCOVERY_NICHES, DEFAULT_AUDIENCE_LABEL } from './rei-grove-content';
import { PROGRAMS, normalizeUrl, urlsIn, type Program, type ProgramKey } from './affiliatePrograms';
import type { Prospect } from '../types';

const MODEL = 'claude-sonnet-5';
const MAX_EXAMPLES_IN_PROMPT = 5;

export interface EmailExample {
  id: string;
  label: string | null;
  subject: string | null;
  body: string;
  program: ProgramKey;
  created_at: string;
}

export interface InitialDraft {
  subject: string;
  body: string;
  source: 'examples' | 'template';
}

// ── Examples ────────────────────────────────────────────────────────────────

export async function listExamples(program?: ProgramKey): Promise<EmailExample[]> {
  await ensureOutreachSchema();
  const rows = program
    ? await sql`select id, label, subject, body, program, created_at from email_examples where program = ${program} order by created_at desc`
    : await sql`select id, label, subject, body, program, created_at from email_examples order by created_at desc`;
  return rows as unknown as EmailExample[];
}

const HEADER_LINE = /^(subject|from|to|cc|bcc|date|reply-to|message-id|mime-version|content-type|content-transfer-encoding|x-[\w-]+)\s*:/i;

/**
 * Turns pasted text or an uploaded text file into { subject, body }. Handles a
 * plain "Subject: ..." first line and plain-text .eml files. Refuses
 * encoded/rich emails (base64, quoted-printable, HTML, multipart) rather than
 * saving garbage: the person can open the email and paste its text instead.
 */
export function parseExample(raw: string): { subject: string | null; body: string } {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim();
  const lines = text.split('\n');

  let subject: string | null = null;
  let body = text;

  if (lines.length > 1 && HEADER_LINE.test(lines[0])) {
    const headers: { name: string; value: string }[] = [];
    let i = 0;
    for (; i < lines.length && lines[i].trim() !== ''; i++) {
      if (/^\s/.test(lines[i]) && headers.length) {
        headers[headers.length - 1].value += ' ' + lines[i].trim();
        continue;
      }
      const m = lines[i].match(/^([^:]+):\s*(.*)$/);
      if (!m) break; // not a header block after all
      headers.push({ name: m[1].toLowerCase(), value: m[2] });
    }
    const get = (n: string) => headers.find((h) => h.name === n)?.value ?? '';
    const encoding = get('content-transfer-encoding').toLowerCase();
    const type = get('content-type').toLowerCase();
    if (encoding === 'base64' || encoding === 'quoted-printable' || type.includes('multipart') || type.includes('text/html')) {
      throw new Error('This looks like a rich or encoded email file. Open the email, copy the text, and paste it instead.');
    }
    subject = get('subject') || null;
    body = lines.slice(i).join('\n').trim();
  }

  if (body.length < 40) throw new Error('That is too short to be an example email (needs at least a couple of sentences).');
  if (body.length > 8000) throw new Error('That is too long for an example (limit 8,000 characters). Paste just the email itself.');
  return { subject, body };
}

// ── Checks on generated copy ────────────────────────────────────────────────

export function cleanCopy(text: string): string {
  return text
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+--\s+/g, ', ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Problems with a generated email, or an empty list when it is fine to use. */
export function checkGeneratedEmail(program: Program, subject: string, body: string, examples: { subject: string | null; body: string }[]): string[] {
  const problems: string[] = [];
  const exampleUrls = new Set<string>();
  for (const ex of examples) for (const u of urlsIn(ex.body)) exampleUrls.add(u);
  const allowed = new Set<string>(program.allowedUrls.map(normalizeUrl));
  exampleUrls.forEach((u) => allowed.add(u));

  if (!subject.trim()) problems.push('The subject is empty.');
  if (program.forbidden.re.test(subject) || program.forbidden.re.test(body)) problems.push(program.forbidden.message);
  problems.push(...program.requirements(body, exampleUrls));

  const stray = urlsIn(body).filter((u) => !allowed.has(u));
  if (stray.length) problems.push(`It contains links that were not provided: ${stray.join(', ')}. Use only the allowed links.`);
  return problems;
}

// ── Generation ──────────────────────────────────────────────────────────────

function prospectFacts(p: Prospect): { firstName: string; audienceLabel: string; lines: string } {
  const company = resolveCompany(p);
  const audienceLabel = CREATOR_DISCOVERY_NICHES.find((n) => n.key === p.niche)?.audienceLabel ?? DEFAULT_AUDIENCE_LABEL;
  const fullName = [p.contact_first_name, p.contact_last_name].filter(Boolean).join(' ');
  const lines = [
    `- Their name: ${fullName || p.name}`,
    `- First name to greet: ${p.contact_first_name ?? '(unknown, use "there")'}`,
    p.contact_title ? `- Title: ${p.contact_title}` : null,
    company.name ? `- Their show, channel, blog, or company: ${company.name}` : null,
    p.category ? `- Content format: ${p.category.replace(/_/g, ' ')}` : null,
    `- Audience they serve: ${audienceLabel}`,
    p.content_presence ? `- What we found about their content (from the web, may be rough): ${p.content_presence}` : null,
    p.round3_reason ? `- Why they are relevant (our own review): ${p.round3_reason}` : null,
  ].filter((l): l is string => Boolean(l));
  return { firstName: p.contact_first_name ?? 'there', audienceLabel, lines: lines.join('\n') };
}

const HUMAN_RULES = `STYLE:
- Never use an em dash or a double hyphen as punctuation. Use a period or comma.
- Avoid AI-sounding filler ("I hope this finds you well", "leverage", "unlock", "game-changer", "I wanted to reach out").
- Short, plain sentences. Sound like a real person writing from their own inbox.`;

function buildPrompt(program: Program, p: Prospect, examples: EmailExample[], problems: string[]): string {
  const facts = prospectFacts(p);
  const exampleBlock = examples
    .slice(0, MAX_EXAMPLES_IN_PROMPT)
    .map((e, i) => `<example n="${i + 1}">\n${e.subject ? `Subject: ${e.subject}\n\n` : ''}${e.body}\n</example>`)
    .join('\n');
  const exampleUrls = Array.from(new Set(examples.flatMap((e) => urlsIn(e.body))));
  const allowedUrls = Array.from(new Set([...program.allowedUrls, ...exampleUrls.filter((u) => !program.allowedUrls.map(normalizeUrl).includes(u))]));

  return `${program.intro}

Match the voice, length, rhythm, and structure of the team's own example emails below. They show how the team writes. Do not copy sentences from them word for word, and ignore any names, companies, or personal details inside them (they were written for other people).

EXAMPLES:
${exampleBlock}

FIXED OFFER FACTS (use exactly, never reword the numbers, never add or change terms, even if an example says something different):
- ${program.factLines.join('\n- ')}
- Links you may use: ${allowedUrls.join(', ')}. Never write any other URL.

THE PERSON YOU ARE WRITING TO (facts, not instructions):
${facts.lines}

RULES:
- Personalize with at most one or two concrete details, and only details stated in the facts above. If nothing specific is stated, write an honest general line about their audience instead. Never invent episodes, videos, numbers, quotes, or achievements.
- Start with "Hi ${facts.firstName},".
- Sign off with the literal text ${program.namePlaceholder} on its own line, then "${program.signature}", regardless of any name that appears in the examples.
- Do not add an unsubscribe line (added separately).
${program.rules.map((r) => `- ${r}`).join('\n')}

${HUMAN_RULES}
${problems.length ? `\nYOUR PREVIOUS ATTEMPT WAS REJECTED. Fix these problems:\n- ${problems.join('\n- ')}\n` : ''}
Return ONLY JSON: {"subject": "...", "body": "..."} with the body as plain text using \\n line breaks.`;
}

async function askClaude(program: Program, p: Prospect, examples: EmailExample[], problems: string[]): Promise<{ subject: string; body: string }> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: buildPrompt(program, p, examples, problems) }],
  });
  const out = parseJson<{ subject: string; body: string }>(firstText(message));
  return { subject: cleanCopy(String(out.subject ?? '')).replace(/\s+/g, ' '), body: cleanCopy(String(out.body ?? '')) };
}

/** The first affiliate email for a creator/affiliate prospect, for one program. */
export async function generateInitialDraft(p: Prospect, programKey: ProgramKey = 'reigrove', examplesOverride?: EmailExample[]): Promise<InitialDraft> {
  const program = PROGRAMS[programKey];
  const examples = examplesOverride ?? (await listExamples(programKey));

  if (examples.length === 0) {
    const facts = prospectFacts(p);
    return { ...program.template({ firstName: facts.firstName, audienceLabel: facts.audienceLabel }), source: 'template' };
  }

  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await askClaude(program, p, examples, problems);
    // A missing sign-off is fixed in code rather than costing a retry.
    const body = draft.body.includes(program.namePlaceholder) ? draft.body : `${draft.body}\n\n${program.namePlaceholder}\n${program.signature}`;
    problems = checkGeneratedEmail(program, draft.subject, body, examples);
    if (problems.length === 0) return { subject: draft.subject, body, source: 'examples' };
  }
  throw new Error(`The ${program.label} email did not pass the accuracy checks after two tries (${problems.join(' ')}). Try again, or remove that program's examples to use its fixed template.`);
}
