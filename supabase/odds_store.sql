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

-- Second data source (SportsGameOdds): objects billed per day, backup-provider use, and source.
alter table public.odds_days add column if not exists sgo_objects integer not null default 0;
alter table public.odds_days add column if not exists backup_refreshes integer not null default 0;
alter table public.odds_days add column if not exists source text;

-- Track record: each insight is graded once its game is final (hit, miss, push, or void).
alter table public.insight_picks add column if not exists result text check (result in ('hit','miss','push','void'));
alter table public.insight_picks add column if not exists actual numeric;
alter table public.insight_picks add column if not exists graded_at timestamptz;
alter table public.insight_picks add column if not exists grade_checked_at timestamptz;

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

alter table public.insight_picks add column if not exists author text not null default 'site' check (author in ('site','claude'));

-- Claude's researched picks are published only through this function. It accepts a line only
-- if it exists in today's saved sportsbook copy (so the price is never typed in by hand), only
-- for a game that has not started, only with a written reason, and at most five a day.
create or replace function private.publish_claude_pick(p_player text, p_metric text, p_line numeric, p_side text, p_book text, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  d date := (now() at time zone 'America/New_York')::date;
  v_home text; v_away text; v_tip timestamptz; v_fetched timestamptz; v_row jsonb;
  q jsonb; k text; n int;
begin
  if p_side not in ('Over','Under') then raise exception 'side must be Over or Under'; end if;
  if p_metric not in ('points','rebounds','assists') then raise exception 'metric must be points, rebounds or assists'; end if;
  if length(coalesce(p_reason,'')) < 40 or length(p_reason) > 700 then raise exception 'reason must be 40 to 700 characters'; end if;
  select count(*) into n from public.insight_picks where slate_date = d and author = 'claude';
  if n >= 5 then raise exception 'daily limit of 5 Claude picks reached'; end if;
  select ev.home, ev.away, ev.tip, ev.fetched_at, r into v_home, v_away, v_tip, v_fetched, v_row
    from public.odds_events ev, jsonb_array_elements(ev.rows) r
    where ev.slate_date = d and lower(r->>'player') = lower(p_player) and r->>'metric' = p_metric
      and (r->>'line')::numeric = p_line and lower(r->>'book') = lower(p_book) and r ? p_side
    order by ev.fetched_at desc limit 1;
  if v_row is null then raise exception 'no saved % line for % % % at %', p_side, p_player, p_line, p_metric, p_book; end if;
  if v_tip <= now() then raise exception 'that game has already started'; end if;
  k := 'claude_' || regexp_replace(lower(v_row->>'player'), '[^a-z0-9]', '', 'g') || '_' || p_metric || '_' || replace(p_line::text, '.', 'p') || '_' || lower(p_side);
  q := jsonb_build_object('player', v_row->>'player', 'metric', p_metric, 'line', p_line, 'side', p_side,
    'price', (v_row->>p_side)::numeric, 'book', v_row->>'book', 'Over', v_row->'Over', 'Under', v_row->'Under',
    'updated', v_fetched, 'home', v_home, 'away', v_away, 'tip', v_tip, 'reason', p_reason, 'author', 'claude');
  insert into public.insight_picks (slate_date, pick_key, player, metric, line, side, first_pick, pick, first_suggested_at, last_confirmed_at, active, author)
    values (d, k, v_row->>'player', p_metric, p_line, p_side, q, q, now(), now(), true, 'claude')
    on conflict (slate_date, pick_key) do nothing;
  return k;
end $$;
revoke all on function private.publish_claude_pick(text, text, numeric, text, text, text) from public, anon, authenticated;
