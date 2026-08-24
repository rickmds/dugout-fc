-- Coach shoutouts: a quick, coach-initiated moment of recognition for a
-- player after a game — a preset tag plus an optional one-line note.
-- Unlike player_reflections, there's no privacy wall from the coach's own
-- side (they wrote it) — visible to the coach who sent it, any other
-- coach/org_admin on the same team, and the player's own guardian(s).
-- Deliberately private to that one family, not a team-wide feed — see
-- the design discussion: a public feed risks feeling like a ranking and
-- pressures coaches to spread them around evenly instead of giving them
-- when they mean it.
create table player_shoutouts (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references events(id) on delete cascade not null,
  player_id  uuid references players(id) on delete cascade not null,
  team_id    uuid references teams(id) not null,
  coach_id   uuid references profiles(id) not null,
  tag        text not null check (tag in ('hustle', 'teamwork', 'improvement', 'attitude', 'leadership')),
  note       text,
  created_at timestamptz default now()
);

create index player_shoutouts_player_idx on player_shoutouts(player_id, created_at desc);
create index player_shoutouts_team_idx   on player_shoutouts(team_id);

alter table player_shoutouts enable row level security;

create policy "team coaches manage shoutouts" on player_shoutouts for all using (
  is_team_coach(team_id)
) with check (
  is_team_coach(team_id)
);

create policy "guardians read own player shoutouts" on player_shoutouts for select using (
  player_id in (
    select id from players where profile_id = auth.uid()
    union
    select player_id from player_guardians where profile_id = auth.uid()
  )
);
