-- Saved sportsbook snapshot and daily insight history. Run once in the Supabase SQL editor
-- (safe to re-run). These tables are server-only: no visitor or signed-in user can read or
-- write them. The website's server functions prove who they are with a private token sent in
-- the x-nba-edge-server header; only the SHA-256 hash of that token is stored here.
create schema if not exists private;

create table if not exists private.server_token (
  singleton boolean primary key default true check (singleton),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$')
);
revoke all on private.server_token from public, anon, authenticated;

create or replace function private.is_server() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.server_token t
    where t.sha256 = encode(sha256(convert_to(coalesce(
      nullif(current_setting('request.headers', true), '')::json ->> 'x-nba-edge-server', ''), 'UTF8')), 'hex')
  );
$$;
grant usage on schema private to anon, authenticated;
revoke all on function private.is_server() from public;
grant execute on function private.is_server() to anon, authenticated;

-- One row per Eastern day: refresh bookkeeping and the provider's reported credit usage.
create table if not exists public.odds_days (
  slate_date date primary key,
  version integer not null default 0,
  refreshes integer not null default 0,
  last_started timestamptz,
  fetched_at timestamptz,
  games integer not null default 0,
  covered integer not null default 0,
  credits_spent integer not null default 0,
  scanner_credits integer not null default 0,
  credits_remaining integer,
  credits_used integer,
  usage_at timestamptz,
  note text,
  insights_started timestamptz,
  insights_at timestamptz
);

-- The saved sportsbook quotes for each game, exactly as fetched before tip-off.
create table if not exists public.odds_events (
  slate_date date not null,
  event_id text not null,
  home text not null,
  away text not null,
  tip timestamptz not null,
  ok boolean not null default true,
  rows jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null,
  primary key (slate_date, event_id)
);

-- Every insight ever suggested. Rows are never deleted by the site: first_pick keeps the
-- suggestion as first published, pick keeps the latest version that passed the filters.
create table if not exists public.insight_picks (
  slate_date date not null,
  pick_key text not null,
  player text not null,
  metric text not null,
  line numeric not null,
  side text not null check (side in ('Over','Under')),
  first_pick jsonb not null,
  pick jsonb not null,
  first_suggested_at timestamptz not null,
  last_confirmed_at timestamptz not null,
  active boolean not null default true,
  primary key (slate_date, pick_key)
);

alter table public.odds_days enable row level security;
alter table public.odds_events enable row level security;
alter table public.insight_picks enable row level security;

grant select, insert, update on public.odds_days, public.odds_events, public.insight_picks to anon, authenticated;

drop policy if exists "odds_days_server_only" on public.odds_days;
create policy "odds_days_server_only" on public.odds_days for all to anon, authenticated
  using ((select private.is_server())) with check ((select private.is_server()));
drop policy if exists "odds_events_server_only" on public.odds_events;
create policy "odds_events_server_only" on public.odds_events for all to anon, authenticated
  using ((select private.is_server())) with check ((select private.is_server()));
drop policy if exists "insight_picks_server_only" on public.insight_picks;
create policy "insight_picks_server_only" on public.insight_picks for all to anon, authenticated
  using ((select private.is_server())) with check ((select private.is_server()));

-- After running this file, store the hash of the server token once (replace the value):
--   insert into private.server_token (sha256) values ('<64 hex characters>')
--   on conflict (singleton) do update set sha256 = excluded.sha256;
