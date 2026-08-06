# REI Grove Outreach

A cold outreach app for REI Grove's partnership, affiliate, and creator pipeline: discover prospects, score
them, send the first outreach email from a real Outlook mailbox, and keep watching that mailbox so replies
show up automatically as a thread — without anyone forwarding or CC'ing the app.

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
  referral-only relationships). Add manually, or have an n8n workflow push discoveries into the pipeline
  automatically. Score with the exact rubric the team already uses by hand: partnership-prospector's
  5-dimension Fit Scorecard for `partner` prospects, and affiliate-prospector's channel-aware 100-point
  rubric (YouTube / Blog / Podcast / Newsletter) for `creator`/`affiliate` prospects — Claude can suggest
  dimension scores from pasted research notes, you review and edit before saving. Every new prospect
  (manual or n8n) is checked against the Ledgre/Innago competitor blocklist from partnership-prospector
  (extend the list in Settings without a redeploy). Once scored and qualified, **approve** a prospect to
  move it into Outreach.
- **Outreach** — Claude drafts the initial email (and follow-ups) in REI Grove's voice, mapped to one of
  the 7 partnership activation channels (webinar, co-branded resource, newsletter feature, etc.) or a
  plain affiliate/referral offer, sent from a connected Outlook mailbox via Microsoft Graph. A sync job
  reads Inbox + Sent Items, matches messages to prospects by email address, and logs the whole thread —
  including Claude reply classification on inbound messages (interested / meeting request / not
  interested / do not contact / etc.) — so you can keep the conversation going from the same page.
- **History** — every bulk-import batch (n8n discovery workflows) with its prospect count, and a directory
  of every email thread with anyone ever reached out to.
- **Pipeline** — New → Researched → Approved → Reached Out → Replied → In Discussion → Partner Live /
  Affiliate Active, plus Stalled / Pass, with a per-prospect activity log throughout.

## Stack

```
Browser
  └── Next.js 14 App Router (Vercel)
        ├── /api/prospects*        -> Neon Postgres (prospects, scoring, disqualifiers)
        ├── /api/batches           -> Neon Postgres (bulk-import batches, for History)
        ├── /api/communications    -> Neon Postgres (message threads directory, for History)
        ├── /api/outreach/*        -> Anthropic Claude (draft) + Microsoft Graph (send)
        ├── /api/graph/sync        -> Microsoft Graph (read) + Anthropic Claude (classify)  [n8n-triggered]
        ├── /api/webhooks/n8n/*    -> Neon Postgres (bulk prospect ingestion + batch)       [n8n-triggered]
        ├── /api/ahrefs/lookup     -> Ahrefs API (optional domain metrics)
        └── /api/auth/microsoft*   -> Microsoft identity platform (OAuth)
              │
              └── Neon (Postgres): prospects, prospect_batches, messages,
                                     mailbox_connections, app_settings, activity_log
```

See `DEPLOY.md` for the full setup: Neon, Azure AD app registration for Outlook, Ahrefs (optional),
Anthropic, n8n wiring, and Vercel deployment.

## Local development

```bash
npm install
cp .env.example .env.local
# fill in .env.local — see DEPLOY.md for where each value comes from
npm run dev
# -> http://localhost:3000
```

## Security notes (read before connecting a real mailbox)

This is built as an internal team tool, matching the permissive-access pattern already used in
`PO-outreach-app` — there's no anon/browser DB client and no per-row security layer, only the trust
boundary that `DATABASE_URL` is a server-only secret never sent to the browser, and there's no per-user
login screen. That's fine behind Vercel's own deployment protection for a small internal team, but before
wiring this to a real Outlook inbox and sending real email:

- Turn on [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection) (or put it behind
  SSO) so the app itself isn't publicly reachable.
- `DATABASE_URL` and the Microsoft/Anthropic/Ahrefs keys are server-only env vars — never prefix them with
  `NEXT_PUBLIC_` or reference them from a client component.
- `/api/webhooks/n8n/prospects` and `/api/graph/sync` are the only two routes gated by a shared secret
  (`N8N_WEBHOOK_SECRET`) because they're meant to be called from outside the app (by n8n). Every other API
  route is open to anyone who can reach the deployment — tighten with real auth if this grows beyond a
  couple of trusted teammates.
