-- ============================================================
-- REI Grove Cold Outreach — Neon (Postgres) Schema
-- Run this in your Neon project's SQL editor (or via psql against the
-- connection string in DATABASE_URL).
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- PROSPECT BATCHES — one row per bulk-import event (n8n webhook, or the
-- Ahrefs-backed "Discover creators" search). Manually-added single
-- prospects do NOT get a batch row.
-- ============================================================
create table if not exists prospect_batches (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null default 'n8n',   -- n8n | discovery | csv (future)
  label               text,                           -- human label, e.g. "n8n: newsletter-sweep-workflow"
  source_ref          text,                            -- workflow name/run id, free text
  created_at          timestamptz default now()
);

-- ============================================================
-- PROSPECTS — partnership targets, affiliates, and creators
-- ============================================================
create table if not exists prospects (
  id                  uuid primary key default gen_random_uuid(),

  -- What kind of prospect this is — drives which scoring rubric applies
  prospect_type       text not null default 'partner',   -- partner | creator | affiliate

  -- Identity
  name                text not null,                      -- company name OR creator/publication name
  contact_first_name  text,
  contact_last_name   text,
  contact_title       text,
  email               text,
  website             text,
  linkedin_url        text,

  -- Classification
  category            text,   -- content FORMAT: proptech | re_services | education_media | adjacent_tech | blog | youtube | podcast | newsletter | webinar | community | other
  niche               text,   -- content TOPIC (creator/affiliate only) — see CREATOR_DISCOVERY_NICHES in lib/rei-grove-content.ts
  city                text,
  state               text,

  -- Signals used by scoring (see lib/scoring.ts)
  audience_size_est   int,               -- subscribers / monthly traffic / listener count
  content_presence    text,              -- free-text notes on blog/YouTube/newsletter/podcast/webinar presence
  domain_rating        numeric,           -- Ahrefs DR, if pulled
  organic_traffic_est int,               -- Ahrefs organic traffic estimate, if pulled

  -- Source
  source              text default 'manual',   -- manual | n8n | ahrefs | discovery
  source_ref          text,                    -- e.g. n8n workflow name/run id, or search query that surfaced them
  batch_id            uuid references prospect_batches(id) on delete set null,

  -- Scoring
  score               numeric,                 -- normalized 0-100
  score_breakdown     jsonb default '{}',       -- per-dimension scores + notes, channel-aware
  disqualified        boolean default false,
  disqualify_reason   text,                     -- e.g. "Direct Ledgre competitor" / "Direct competitor (property management software)"

  -- Pipeline
  stage               text not null default 'new',
    -- new | researched | approved | reached_out | replied | in_discussion | partner_live | affiliate_active | stalled | pass
    -- Every transition past "approved" is set manually by whoever is running outreach — the app does
    -- not read anyone's inbox, so it can't detect a reply on its own.

  notes               text,

  -- Manual opt-out — someone told the sender directly not to contact them
  -- again. Toggled by hand on the prospect page; also settable via the
  -- public /api/unsubscribe/[id] link appended to every generated email.
  -- Blocks drafting/recording further outreach to this prospect.
  unsubscribed        boolean not null default false,
  unsubscribed_at     timestamptz,

  last_contacted_at   timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists prospects_stage_idx on prospects(stage);
create index if not exists prospects_email_idx on prospects(email);
create index if not exists prospects_type_idx on prospects(prospect_type);
create index if not exists prospects_batch_id_idx on prospects(batch_id);
create unique index if not exists prospects_name_website_idx on prospects (lower(name), lower(coalesce(website, '')));

-- ============================================================
-- MESSAGES — a log of every outreach email generated/sent for a prospect.
-- Outbound only — this app never reads a reply, so there is no inbound
-- side to this table. Whoever sends manually marks it sent from the UI.
-- ============================================================
create table if not exists messages (
  id                  uuid primary key default gen_random_uuid(),
  prospect_id         uuid references prospects(id) on delete cascade,

  direction           text not null default 'outbound',  -- always 'outbound' — kept for clarity/future-proofing
  subject             text,
  body_text           text,

  offer_type          text,                    -- webinar | co_branded_resource | newsletter_feature | dashboard_widget | email_blast | social_cross_promo | forum_takeover | affiliate_terms
  sequence_step        int default 1,           -- 1 = initial, 2+ = a manually-generated follow-up
  ai_generated        boolean default false,
  status              text default 'sent',      -- draft | sent

  to_address          text,

  sent_at             timestamptz,
  created_at          timestamptz default now()
);

create index if not exists messages_prospect_id_idx on messages(prospect_id);

-- ============================================================
-- SETTINGS — single-row config: scoring weights, competitor blocklist, etc.
-- ============================================================
create table if not exists app_settings (
  id                  int primary key default 1,
  scoring_weights     jsonb not null default '{}',
  competitor_blocklist jsonb not null default '[]',
  updated_at          timestamptz default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- ACTIVITY LOG — audit trail per prospect (stage changes, notes, sends)
-- ============================================================
create table if not exists activity_log (
  id                  uuid primary key default gen_random_uuid(),
  prospect_id         uuid references prospects(id) on delete cascade,
  event_type          text not null,   -- stage_change | note | scored | disqualified | approved | email_sent | unsubscribed
  detail              text,
  created_at          timestamptz default now()
);

create index if not exists activity_log_prospect_id_idx on activity_log(prospect_id);

-- ============================================================
-- Helper: keep updated_at fresh
-- ============================================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Postgres has no `create trigger if not exists`, so drop-then-create to
-- keep this file safe to run repeatedly against the same database.
drop trigger if exists update_prospects_updated_at on prospects;
create trigger update_prospects_updated_at
  before update on prospects
  for each row execute function update_updated_at_column();

-- ============================================================
-- Access control: this app talks to Neon only from server-side code
-- (API routes) using DATABASE_URL, which is a server-only secret and is
-- never sent to the browser. There is no anon/browser DB client and no
-- per-row security layer here.
-- ============================================================

-- ============================================================
-- Migration: bring an older (pre-cleanup) database up to this shape.
-- Safe to re-run — every statement is conditional.
-- ============================================================
alter table prospects add column if not exists niche text;
alter table prospects add column if not exists unsubscribed boolean not null default false;
alter table prospects add column if not exists unsubscribed_at timestamptz;
alter table prospects drop column if exists last_reply_at;

alter table messages drop column if exists body_html;
alter table messages drop column if exists ms_message_id;
alter table messages drop column if exists ms_conversation_id;
alter table messages drop column if exists from_address;
alter table messages drop column if exists ai_classification;
alter table messages drop column if exists ai_confidence;
alter table messages drop column if exists ai_suggested_response;
alter table messages drop column if exists received_at;

drop trigger if exists update_mailbox_connections_updated_at on mailbox_connections;
drop table if exists mailbox_connections;
