# REI Grove Outreach

A cold outreach app for REI Grove's partnership, affiliate, and creator pipeline: discover prospects, score
them, send the first outreach email from a real Outlook mailbox, and keep watching that mailbox so replies
show up automatically as a thread — without anyone forwarding or CC'ing the app.

Built as a sibling to `PO-outreach-app` (same Next.js + Supabase + Vercel stack), with the scoring rubrics
ported from the `partnership-prospector` and `affiliate-prospector` Claude skills so a score computed here
means the same thing it would in a Claude chat session, and outreach copy pulled from `rei-grove-knowledge`
so it stays accurate to REI Grove's current brand, tiers, and voice.

## What it does

- **Prospects** — three types: `partner` (companies — proptech, RE services, education/media), `creator`
  (individual bloggers/YouTubers/podcasters/newsletter writers), and `affiliate` (simple referral-only
  relationships). Add manually, or have an n8n workflow push discoveries into the pipeline automatically.
- **Scoring** — the exact rubric the team already uses by hand: partnership-prospector's 5-dimension Fit
  Scorecard for `partner` prospects, and affiliate-prospector's channel-aware 100-point rubric (YouTube /
  Blog / Podcast / Newsletter) for `creator`/`affiliate` prospects. Claude can suggest dimension scores from
  pasted research notes — you review and edit before saving.
- **Automatic disqualifiers** — every new prospect (manual or n8n) is checked against the Ledgre/Innago
  competitor blocklist from partnership-prospector. Extend the list in Settings without a redeploy.
- **Outreach** — Claude drafts the initial email (and follow-ups) in REI Grove's voice, mapped to one of the
  7 partnership activation channels (webinar, co-branded resource, newsletter feature, etc.) or a plain
  affiliate/referral offer. You review before sending.
- **Send + monitor via a real Outlook inbox** — connect one M365/Outlook mailbox (OAuth). Outreach sends
  from it via Microsoft Graph, and a sync job reads Inbox + Sent Items, matches messages to prospects by
  email address, and logs the whole thread — including running Claude reply classification on inbound
  messages (interested / meeting request / not interested / do not contact / etc.).
- **Tracking** — a pipeline of stages (New → Researched → Reached Out → Replied → In Discussion → Partner
  Live / Affiliate Active, plus Stalled / Pass), an activity log per prospect, and a dashboard.

## Stack

```
Browser
  └── Next.js 14 App Router (Vercel)
        ├── /api/prospects*        -> Supabase (prospects, scoring, disqualifiers)
        ├── /api/outreach/*        -> Anthropic Claude (draft) + Microsoft Graph (send)
        ├── /api/graph/sync        -> Microsoft Graph (read) + Anthropic Claude (classify)  [n8n-triggered]
        ├── /api/webhooks/n8n/*    -> Supabase (bulk prospect ingestion)                    [n8n-triggered]
        ├── /api/ahrefs/lookup     -> Ahrefs API (optional domain metrics)
        └── /api/auth/microsoft*   -> Microsoft identity platform (OAuth)
              │
              └── Supabase (Postgres): prospects, messages, mailbox_connections,
                                        app_settings, activity_log
```

See `DEPLOY.md` for the full setup: Supabase, Azure AD app registration for Outlook, Ahrefs (optional),
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

This is built as an internal team tool, matching the permissive-RLS pattern already used in
`PO-outreach-app` — every `app_settings`/`prospects`/`messages` row is readable/writable by anyone holding
the Supabase anon key, and there's no per-user login screen. That's fine behind Vercel's own deployment
protection for a small internal team, but before wiring this to a real Outlook inbox and sending real
email:

- Turn on [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection) (or put it behind
  SSO) so the app itself isn't publicly reachable.
- `SUPABASE_SERVICE_ROLE_KEY` and the Microsoft/Anthropic/Ahrefs keys are server-only env vars — never
  prefix them with `NEXT_PUBLIC_` or reference them from a client component.
- `/api/webhooks/n8n/prospects` and `/api/graph/sync` are the only two routes gated by a shared secret
  (`N8N_WEBHOOK_SECRET`) because they're meant to be called from outside the app (by n8n). Every other API
  route is open to anyone who can reach the deployment — tighten with real auth if this grows beyond a
  couple of trusted teammates.
