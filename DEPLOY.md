# Deployment Guide — REI Grove Outreach

## Step 1 — Neon

1. Go to [neon.tech](https://neon.tech) → New Project. Name it `rei-grove-outreach`.
2. Open the project's **SQL Editor** → New query → paste the contents of `db/schema.sql` → Run.
   (Or run it via `psql "$DATABASE_URL" -f db/schema.sql` from your machine.)
3. Go to **Dashboard → Connection Details**, select the **pooled connection** (recommended for
   serverless), and copy the full connection string → `DATABASE_URL`.

## Step 2 — Anthropic (Claude)

1. [console.anthropic.com/keys](https://console.anthropic.com/keys) → Create key → `ANTHROPIC_API_KEY`.

## Step 3 — Ahrefs (optional, but required for the Contacts search)

Powers two things: Domain Rating / organic traffic pulled for scoring, and the **Contacts** search on
Prospect Search (finds named individuals — bylined authors, podcast/interview guests — in a reference
domain's Ahrefs backlink data). Skip this and scoring just shows "no data" for that signal, and Contacts
is disabled.

1. [app.ahrefs.com/account/api](https://app.ahrefs.com/account/api) → create key → `AHREFS_API_KEY`.

## Step 4 — n8n (optional)

Only needed if you want prospects fed into the pipeline automatically instead of adding them by hand or
via Contacts.

1. Pick a long random string for `N8N_WEBHOOK_SECRET` (e.g. `openssl rand -hex 32`).
2. Build whatever discovery flow you want in n8n (SERP scrapes, YouTube Data API pulls, RSS/newsletter
   monitoring), end it with an **HTTP Request** node:
   - Method: `POST`
   - URL: `https://YOUR-VERCEL-URL.vercel.app/api/webhooks/n8n/prospects`
   - Header: `x-n8n-secret: <the secret from step 1>`
   - Body (JSON): `{"batchLabel": "n8n: newsletter-sweep-workflow", "prospects": [{"name": "...", "prospect_type": "creator", "website": "...", "email": "...", "category": "newsletter", "audience_size_est": 8000, "content_presence": "...", "source_ref": "..."}]}`
   - Every call that creates at least one prospect shows up as one batch under **History** —
     `batchLabel` (and/or `source_ref`) at the top level names that batch; each prospect's own
     `source_ref` is separate, per-prospect metadata.

## Step 4b — Outlook drafts (optional)

Lets each teammate save outreach emails to their OWN Outlook Drafts folder. Skip it and the Copy button still works.

1. Microsoft Entra admin center (entra.microsoft.com) -> App registrations -> New registration. Name it, choose
   "this organization only", and set a Web redirect URI of `https://YOUR-VERCEL-URL.vercel.app/api/auth/microsoft/callback`
   (Settings in the app shows the exact value). If you can't register apps yourself, your IT admin has to.
2. API permissions -> Add -> Microsoft Graph -> Delegated: `Mail.ReadWrite`, `User.Read`, `offline_access`. Grant admin
   consent if your organization requires it.
3. Certificates & secrets -> New client secret. Copy the **Value** right away.
4. Add to Vercel (and redeploy): `MS365_TENANT_ID` (Directory/tenant ID), `MS365_CLIENT_ID` (Application/client ID),
   `MS365_CLIENT_SECRET`, `SESSION_SECRET` (any long random string), and optionally `MS365_ALLOWED_EMAILS`.
5. In the app: Settings -> Connect Outlook. Each person does this once in their own browser.

## Step 5 — Deploy to Vercel

```bash
cd rei-grove-outreach
git init
git add .
git commit -m "Initial REI Grove Outreach app"
git remote add origin https://github.com/tiya-y/rei-grove-outreach.git
git push -u origin main

# Then: vercel.com -> New Project -> Import this repo
```

In Vercel → Project Settings → **Environment Variables**, add every key from `.env.example`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Pooled connection string from Neon |
| `ANTHROPIC_API_KEY` | From Anthropic Console |
| `AHREFS_API_KEY` | Optional — from Ahrefs |
| `N8N_WEBHOOK_SECRET` | Optional — only if using n8n bulk import |
| `MS365_TENANT_ID`, `MS365_CLIENT_ID`, `MS365_CLIENT_SECRET`, `SESSION_SECRET` | Optional — Outlook drafts (step 4b) |
| `MS365_ALLOWED_EMAILS` | Optional — limit who can connect Outlook |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL |

Deploy. Vercel builds automatically on every push to `main`.

## Step 6 — First prospects

1. On **Prospect Search**, click **+ Add prospect** manually, use **Contacts** to pull named individuals
   from a reference domain's Ahrefs backlink data, or let an n8n discovery workflow populate the pipeline
   via the webhook from Step 4 (each bulk import shows up under **History**).
2. Open a prospect → **Score this prospect** → paste research notes and click "Ask Claude to suggest
   scores" (or just fill in the rubric yourself) → **Save score** → **Approve for outreach**.
3. The prospect now appears on the **Outreach** tab. Open it → **Compose outreach** → **Generate draft
   with Claude** → review/edit → **Copy to clipboard** and send it from your own email → **Mark as
   sent** to log it and advance the pipeline.
4. Everything sent is listed under the prospect's **Sent log**, and every prospect with at least one send
   shows up under **History → Communications**. This app never reads anyone's inbox — if a prospect
   replies, you'll see it in your own email, and you can update their stage (Replied, In Discussion,
   etc.) by hand from the prospect page.

## Local development

```bash
npm install
cp .env.example .env.local
# fill in .env.local
npm run dev
# -> http://localhost:3000
```
