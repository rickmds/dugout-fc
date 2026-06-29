-- Match tracker: game sessions + player time periods

create table if not exists game_sessions (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid references events(id) on delete cascade not null unique,
  team_id             uuid references teams(id) on delete cascade not null,
  half_length_seconds integer not null,
  half1_started_at    timestamptz,
  half1_ended_at      timestamptz,
  half2_started_at    timestamptz,
  half2_ended_at      timestamptz,
  status              text check (status in ('not_started','half1','half_time','half2','full_time')) default 'not_started',
  created_by          uuid references profiles(id),
  created_at          timestamptz default now()
);

create table if not exists player_match_periods (
  id                uuid primary key default gen_random_uuid(),
  game_session_id   uuid references game_sessions(id) on delete cascade not null,
  event_id          uuid references events(id) on delete cascade not null,
  team_id           uuid references teams(id) not null,
  player_id         uuid references players(id) on delete cascade not null,
  half              integer check (half in (1,2)) not null,
  on_at             timestamptz not null,
  off_at            timestamptz
);

-- Indexes for season aggregation queries
create index if not exists idx_player_match_periods_player on player_match_periods(player_id);
create index if not exists idx_player_match_periods_event  on player_match_periods(event_id);
create index if not exists idx_player_match_periods_team   on player_match_periods(team_id);

-- RLS
alter table game_sessions         enable row level security;
alter table player_match_periods   enable row level security;

-- Coaches can read/write sessions for their team's events
create policy "coaches manage game sessions"
  on game_sessions for all
  using (
    team_id in (
      select team_id from team_members
      where profile_id = auth.uid() and role in ('coach','parent')
    )
  );

-- All team members can read periods; only coaches can write
create policy "team members read periods"
  on player_match_periods for select
  using (
    team_id in (
      select team_id from team_members where profile_id = auth.uid()
    )
  );

create policy "coaches write periods"
  on player_match_periods for insert with check (
    team_id in (
      select team_id from team_members
      where profile_id = auth.uid() and role in ('coach','parent')
    )
  );

create policy "coaches update periods"
  on player_match_periods for update
  using (
    team_id in (
      select team_id from team_members
      where profile_id = auth.uid() and role in ('coach','parent')
    )
  );

create policy "coaches delete periods"
  on player_match_periods for delete
  using (
    team_id in (
      select team_id from team_members
      where profile_id = auth.uid() and role in ('coach','parent')
    )
  );
