# Deployment Guide — REI Grove Outreach

## Step 1 — Supabase

1. Go to [supabase.com](https://supabase.com) → New Project. Name it `rei-grove-outreach`.
2. In **SQL Editor** → New query → paste the contents of `supabase/schema.sql` → Run.
3. Go to **Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

## Step 2 — Anthropic (Claude)

1. [console.anthropic.com/keys](https://console.anthropic.com/keys) → Create key → `ANTHROPIC_API_KEY`.

## Step 3 — Microsoft 365 / Outlook (the part that lets this send from + read a real inbox)

This is an Azure AD **app registration**, not a mailbox setting — one registration is shared by everyone
who connects a mailbox later from the Settings page.

1. Go to [portal.azure.com](https://portal.azure.com) → **Azure Active Directory** (aka Microsoft Entra ID)
   → **App registrations** → **New registration**.
2. Name: `REI Grove Outreach`.
3. Supported account types: pick **"Accounts in this organizational directory only"** if everyone
   connecting a mailbox is in your own M365 tenant (recommended — simpler consent). Use
   `MS365_TENANT_ID=<your tenant GUID>` in that case. If you need people outside your tenant to connect
   their own mailbox, pick the multi-tenant option instead and set `MS365_TENANT_ID=common`.
4. Redirect URI (platform: **Web**): `https://YOUR-VERCEL-URL.vercel.app/api/auth/microsoft/callback`
   (use `http://localhost:3000/api/auth/microsoft/callback` for local dev — you can add both).
5. After creation, copy the **Application (client) ID** → `MS365_CLIENT_ID`, and the **Directory (tenant)
   ID** → `MS365_TENANT_ID` (unless you chose multi-tenant above).
6. **Certificates & secrets** → New client secret → copy the value (not the ID) → `MS365_CLIENT_SECRET`.
7. **API permissions** → Add a permission → **Microsoft Graph** → **Delegated permissions** → add:
   - `Mail.Send`
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `User.Read`
   - `offline_access`
   Click **Grant admin consent** if you're a tenant admin — this avoids every connecting user having to
   click through an extra admin-approval prompt themselves.
8. Set `MS365_REDIRECT_URI=https://YOUR-VERCEL-URL.vercel.app/api/auth/microsoft/callback` (must match #4
   exactly, including trailing slashes).

**Whose mailbox should this be?** Whoever's Outlook inbox you connect in Settings is the one outreach sends
from and the one that gets polled for replies. In practice: a shared mailbox or an individual's inbox both
work — Graph's delegated-permission flow just needs someone to sign in once and grant consent. If you use a
personal inbox, replies to outreach will land alongside that person's regular mail (filtered by conversation
in the app's thread view, but still physically in their Inbox).

## Step 4 — Ahrefs (optional)

Only needed if you want Domain Rating / organic traffic pulled automatically for scoring. Skip this and the
app just shows "no data" for that signal.

1. [app.ahrefs.com/account/api](https://app.ahrefs.com/account/api) → create key → `AHREFS_API_KEY`.

## Step 5 — n8n

n8n is how you feed prospects into the pipeline automatically (SERP scrapes, YouTube Data API pulls, RSS/
newsletter monitoring, Ahrefs keyword sweeps — whatever discovery workflow you build) and how you keep the
mailbox sync running on a tighter schedule than Vercel's own cron allows.

1. Pick a long random string for `N8N_WEBHOOK_SECRET` (e.g. `openssl rand -hex 32`).
2. **Ingestion workflow**: build whatever discovery flow you want in n8n, end it with an **HTTP Request**
   node:
   - Method: `POST`
   - URL: `https://YOUR-VERCEL-URL.vercel.app/api/webhooks/n8n/prospects`
   - Header: `x-n8n-secret: <the secret from step 1>`
   - Body (JSON): `{"prospects": [{"name": "...", "prospect_type": "creator", "website": "...", "email": "...", "category": "newsletter", "audience_size_est": 8000, "content_presence": "...", "source_ref": "n8n: newsletter-sweep-workflow"}]}`
3. **Mailbox sync workflow**: a **Schedule Trigger** (every 10-15 min is reasonable) → **HTTP Request** node:
   - Method: `POST`
   - URL: `https://YOUR-VERCEL-URL.vercel.app/api/graph/sync`
   - Header: `x-n8n-secret: <the same secret>`
   This is the recommended way to run sync on a tight interval — Vercel's Hobby plan cron only fires once a
   day, which is too slow for "did they reply yet."

## Step 6 — Deploy to Vercel

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
| `NEXT_PUBLIC_SUPABASE_URL` | From Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase |
| `ANTHROPIC_API_KEY` | From Anthropic Console |
| `MS365_CLIENT_ID` | From Azure app registration |
| `MS365_CLIENT_SECRET` | From Azure app registration |
| `MS365_TENANT_ID` | From Azure (or `common` for multi-tenant) |
| `MS365_REDIRECT_URI` | `https://your-app.vercel.app/api/auth/microsoft/callback` |
| `AHREFS_API_KEY` | Optional — from Ahrefs |
| `N8N_WEBHOOK_SECRET` | The random string from Step 5 |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL |

Deploy. Vercel builds automatically on every push to `main`.

## Step 7 — Connect the outreach mailbox

1. Open the deployed app → **Settings**.
2. Click **Connect Outlook**, sign in, grant consent.
3. Click **Sync now** once to confirm it can read the mailbox. From then on, either click **Sync now**
   manually or let the n8n schedule workflow from Step 5 keep it current.

## Step 8 — First prospects

1. **Add prospect** manually, or let an n8n discovery workflow populate the pipeline via the webhook from
   Step 5.
2. Open a prospect → **Score this prospect** → paste research notes and click "Ask Claude to suggest
   scores" (or just fill in the rubric yourself) → **Save score**.
3. **Compose outreach** → pick an activation channel → **Generate draft with Claude** → review/edit →
   **Send via connected Outlook inbox**.
4. Replies show up under **Email thread** on the prospect's page after the next sync.

## Local development

```bash
npm install
cp .env.example .env.local
# fill in .env.local
npm run dev
# -> http://localhost:3000
```
