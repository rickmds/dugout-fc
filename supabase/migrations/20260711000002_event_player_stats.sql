create table event_player_stats (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid references events(id) on delete cascade not null,
  player_id      uuid references players(id) on delete cascade not null,
  team_id        uuid references teams(id) not null,
  club_id        uuid references clubs(id) not null,
  goals          int not null default 0,
  assists        int not null default 0,
  yellow_cards   int not null default 0,
  red_cards      int not null default 0,
  minutes_played int,
  created_by     uuid references profiles(id),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(event_id, player_id)
);

alter table event_player_stats enable row level security;

create policy "club staff can select event_player_stats"
  on event_player_stats for select
  using (is_club_staff(club_id));

create policy "club staff can insert event_player_stats"
  on event_player_stats for insert
  with check (is_club_staff(club_id));

create policy "club staff can update event_player_stats"
  on event_player_stats for update
  using (is_club_staff(club_id));
