create extension if not exists pgcrypto;

create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  game_key text not null,
  player_key text not null,
  nickname text not null,
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_entries_game_score_idx
  on public.leaderboard_entries (game_key, score desc, created_at desc);

create or replace view public.leaderboard_ranked as
select
  id,
  game_key,
  player_key,
  nickname,
  score,
  created_at,
  row_number() over (
    partition by game_key
    order by score desc, created_at desc, id asc
  ) as rank
from public.leaderboard_entries;

alter table public.leaderboard_entries enable row level security;

drop policy if exists "Public read leaderboard" on public.leaderboard_entries;
create policy "Public read leaderboard"
  on public.leaderboard_entries
  for select
  using (true);

drop policy if exists "Public insert leaderboard" on public.leaderboard_entries;
create policy "Public insert leaderboard"
  on public.leaderboard_entries
  for insert
  with check (true);
