-- Elevation schema (planning doc §7). Run in the Supabase SQL editor, or `supabase db push`.
-- There is no auth: identity is a client-generated device UUID (players.id), so the
-- row-level-security policies below are open to the anon role. That means anyone can
-- write any row. This is the accepted hackathon limitation from §7; do not rely on it
-- for anything that matters.

create table if not exists players (
  id           uuid primary key,                      -- = the anonymous device ID
  display_name text check (display_name is null or char_length(display_name) between 1 and 24),
  created_at   timestamptz not null default now()
);

create table if not exists scores (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references players (id) on delete cascade,
  date            date not null,
  height_score    numeric(5, 2) not null check (height_score between 0 and 100),   -- % of max height
  stability_score numeric(3, 2) not null check (stability_score between 0 and 5),   -- §5.2
  combined_score  integer       not null check (combined_score between 0 and 100),  -- §5.3
  created_at      timestamptz not null default now(),
  unique (player_id, date)                              -- one attempt per device per day
);

-- Percentile and leaderboard queries filter by date and sort by combined score.
create index if not exists scores_date_combined_idx on scores (date, combined_score desc);

create table if not exists daily_puzzle (
  date          date primary key,
  seed          text not null,
  item_ids      jsonb not null,                         -- material ids; freezes the day's set if the library grows
  disaster_type text not null check (disaster_type in ('wind', 'earthquake', 'flood', 'meteor'))
);

alter table players      enable row level security;
alter table scores       enable row level security;
alter table daily_puzzle enable row level security;

create policy "players are readable"    on players for select using (true);
create policy "players can register"    on players for insert with check (true);
create policy "players can rename"      on players for update using (true) with check (true);

-- Scores are insert-only: no update or delete policy exists.
create policy "scores are readable"     on scores for select using (true);
create policy "scores can be submitted" on scores for insert with check (true);

-- The first visitor of a day stores its puzzle; it is never changed after that.
create policy "puzzles are readable"    on daily_puzzle for select using (true);
create policy "puzzles can be stored"   on daily_puzzle for insert with check (true);
