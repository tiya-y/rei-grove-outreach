# REI Grove Outreach

A cold outreach app for REI Grove's partnership, affiliate, and creator pipeline: discover prospects,
score them, and generate a personalized initial outreach email — you copy it, send it from your own
inbox, and mark it sent to keep the pipeline up to date. This app never connects to or reads anyone's
email inbox.

Built as a sibling to `PO-outreach-app` (same Next.js + Postgres + Vercel stack, on Neon instead of
Supabase), with the scoring rubrics
ported from the `partnership-prospector` and `affiliate-prospector` Claude skills so a score computed here
means the same thing it would in a Claude chat session, and outreach copy pulled from `rei-grove-knowledge`
so it stays accurate to REI Grove's current brand, tiers, and voice.

## What it does

- **Dashboard** — three headline stats (prospects found, reached out to, signed up) plus a shortlist of
  top-scored prospects still waiting to be approved.
- **Prospect Search** — three types: `partner` (companies — proptech, RE services, education/media),
  `creator` (individual bloggers/YouTubers/podcasters/newsletter writers), and `affiliate` (simple
  referral-only relationships). Add manually, have an n8n workflow push discoveries into the pipeline
  automatically, or use one of three named-individual discovery sources: **Contacts** pulls bylined
  authors and podcast/interview guests out of a reference domain's Ahrefs backlink data; **Podcast
  hosts** searches Apple's public Podcasts directory directly (no API key needed) for real hosts by
  keyword; **YouTube channels** searches YouTube's own API and also mines each channel's bio for a
  self-stated name or business contact email, when present. No LLM guessing anywhere — every result is
  a real person found on a real page, still worth a quick human glance before approving. (An earlier
  keyword-SERP and raw-backlink-domain discovery mode was removed: both surfaced companies/mega-platforms
  almost exclusively rather than individual creators — see git history if reviving either is ever worth
  revisiting.) Score with the
  exact rubric the team already uses by hand: partnership-prospector's 5-dimension Fit Scorecard for
  `partner` prospects, and affiliate-prospector's channel-aware 100-point rubric (YouTube / Blog / Podcast
  / Newsletter) for `creator`/`affiliate` prospects — Claude can suggest dimension scores from pasted
  research notes, you review and edit before saving. Every new prospect (manual, n8n, or discovered) is
  checked against the competitor blocklist from partnership-prospector (extend the list in
  Settings without a redeploy). Once scored and qualified, **approve** a prospect to move it into Outreach.
- **Outreach** — the initial email to a creator/affiliate prospect uses the team's fixed affiliate-offer
  template (compensation terms and links never drift); every other case (partner-type prospects, and any
  follow-up you choose to generate) is drafted by Claude in REI Grove's voice, personalized to that
  prospect, with hard style rules against em dashes and AI-sounding filler. You review it, **copy it to
  your clipboard**, send it yourself from your own email, and click **Mark as sent** to log it and advance
  the pipeline (a real unsubscribe link is included on every send). There's no automated sending and no
  reply monitoring — if someone replies, you'll see it in your own inbox, and update their stage (Replied,
  In Discussion, etc.) by hand.
- **History** — every bulk-import batch (n8n or Contacts search) with its prospect count, and a
  directory of every prospect you've sent outreach to, linking to their sent log.
- **Pipeline** — New → Researched → Approved → Reached Out → Replied → In Discussion → Partner Live /
  Affiliate Active, plus Stalled / Pass. Every transition past "approved" is set manually — the app has no
  way to detect a reply on its own. Full activity log per prospect throughout.

## Stack

```
Browser
  └── Next.js 14 App Router (Vercel)
        ├── /api/prospects*        -> Neon Postgres (prospects, scoring, disqualifiers)
        ├── /api/batches           -> Neon Postgres (bulk-import batches, for History)
        ├── /api/communications    -> Neon Postgres (sent-log directory, for History)
        ├── /api/discovery/contacts -> Ahrefs API (backlink byline/podcast-guest contact discovery)
        ├── /api/discovery/podcasts -> Apple iTunes Search API (podcast host discovery, no key needed)
        ├── /api/discovery/youtube -> YouTube Data API (channel discovery + bio name/email mining)
        ├── /api/outreach/draft    -> Anthropic Claude (or the fixed template for creator/affiliate step 1)
        ├── /api/outreach/send     -> Neon Postgres (records a send, advances the pipeline — no email is sent)
        ├── /api/webhooks/n8n/*    -> Neon Postgres (bulk prospect ingestion + batch)       [n8n-triggered]
        ├── /api/unsubscribe/[id]  -> Neon Postgres (public opt-out link)
        └── /api/ahrefs/lookup     -> Ahrefs API (optional domain metrics)
              │
              └── Neon (Postgres): prospects, prospect_batches, messages, app_settings, activity_log
```

See `DEPLOY.md` for the full setup: Neon, Anthropic, Ahrefs (optional), n8n (optional), and Vercel
deployment.

## Local development

```bash
npm install
cp .env.example .env.local
# fill in .env.local — see DEPLOY.md for where each value comes from
npm run dev
# -> http://localhost:3000
```

## Security notes

This is built as an internal team tool, matching the permissive-access pattern already used in
`PO-outreach-app` — there's no anon/browser DB client and no per-row security layer, only the trust
boundary that `DATABASE_URL` is a server-only secret never sent to the browser, and there's no per-user
login screen. That's fine behind Vercel's own deployment protection for a small internal team:

- Turn on [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection) (or put it behind
  SSO) so the app itself isn't publicly reachable.
- `DATABASE_URL` and the Anthropic/Ahrefs keys are server-only env vars — never prefix them with
  `NEXT_PUBLIC_` or reference them from a client component.
- `/api/webhooks/n8n/prospects` is the only route gated by a shared secret (`N8N_WEBHOOK_SECRET`) because
  it's meant to be called from outside the app (by n8n). Every other API route is open to anyone who can
  reach the deployment — tighten with real auth if this grows beyond a couple of trusted teammates.
- `/api/unsubscribe/[id]` is intentionally public with no auth — it's meant to be clicked from an email
  client by someone who isn't logged into the app.
