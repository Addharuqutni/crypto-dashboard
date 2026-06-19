-- Screener storage schema (Supabase / Postgres)
--
-- Mirrors the file-based ScreenerStore interface using JSONB so the domain
-- types (ScreenerLatestRun, ScreenerHistoryEntry, ScreenerAlertSettings,
-- ScreenerAlertRecord, ScreenerActionCallRecord) are persisted verbatim without granular columns.
--
-- Layout:
--   screener_kv      — singletons: latest run snapshot + alert/rank settings
--   screener_history — append-only run summaries
--   screener_alerts  — append-only local alert event records
--   screener_action_calls — append-only eligible action-call evaluation samples
--
-- All tables are server-only (written by the screener worker / cron via the
-- service role). RLS is enabled and NO anon policies are added, so the public
-- anon key cannot read or write these tables. The Next.js server reads them
-- through the service role key.

-- ─── Singletons (latest run, settings) ──────────────────────────────────────
create table if not exists public.screener_kv (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ─── History (append-only run summaries) ────────────────────────────────────
create table if not exists public.screener_history (
  id         bigint generated always as identity primary key,
  ts         bigint not null,          -- unix ms (echo of entry.ts)
  entry      jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists screener_history_ts_idx
  on public.screener_history (ts desc);

-- ─── Alerts (append-only local alert event records) ─────────────────────────
create table if not exists public.screener_alerts (
  id         bigint generated always as identity primary key,
  record     jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists screener_alerts_created_at_idx
  on public.screener_alerts (created_at desc);

-- ─── Action calls (append-only algorithm evaluation samples) ────────────────
create table if not exists public.screener_action_calls (
  id         bigint generated always as identity primary key,
  ts         bigint not null,          -- unix ms (record.capturedAt)
  record     jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists screener_action_calls_ts_idx
  on public.screener_action_calls (ts desc);

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Enable RLS but add no policies: the anon/public key is fully denied.
-- The service role key bypasses RLS, which is how the server writes/reads.
alter table public.screener_kv      enable row level security;
alter table public.screener_history enable row level security;
alter table public.screener_alerts  enable row level security;
alter table public.screener_action_calls enable row level security;
