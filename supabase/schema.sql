-- Run once in Supabase SQL Editor. Clients use a publishable key only.
-- Row level security ensures each signed-in user sees only their own records.
create extension if not exists pgcrypto;

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player text not null,
  team text not null default '',
  market text not null,
  side text not null check (side in ('MORE','LESS')),
  line numeric not null check (line >= 0),
  game_date date not null,
  note text not null default '',
  result text not null default 'pending' check (result in ('pending','win','loss','push','void')),
  created_at timestamptz not null default now()
);
create index if not exists predictions_user_date on public.predictions(user_id,game_date desc);
alter table public.predictions enable row level security;
drop policy if exists "predictions_select_own" on public.predictions;
create policy "predictions_select_own" on public.predictions for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "predictions_insert_own" on public.predictions;
create policy "predictions_insert_own" on public.predictions for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "predictions_update_own" on public.predictions;
create policy "predictions_update_own" on public.predictions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "predictions_delete_own" on public.predictions;
create policy "predictions_delete_own" on public.predictions for delete to authenticated using ((select auth.uid())=user_id);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legs jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','placed','settled','void')),
  created_at timestamptz not null default now()
);
create index if not exists entries_user_created on public.entries(user_id,created_at desc);
alter table public.entries enable row level security;
drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own" on public.entries for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "entries_delete_own" on public.entries;
create policy "entries_delete_own" on public.entries for delete to authenticated using ((select auth.uid())=user_id);