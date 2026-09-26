-- Scraped from NCSA's own club-admin portal (needs the club-level login
-- from club_ncsa_admin_credentials, not the anonymous schedule scrape) —
-- purpose-built reports NCSA itself already maintains, more authoritative
-- than anything this app could compute client-side (they see every
-- club's bookings at a shared complex, not just ours). Replaces the
-- client-computed gap/overlap heuristic in the Game Scheduler's League
-- Schedule view, and is the data source for missing-score/TBS tracking
-- and fine notifications.

-- Financial record — never deleted, only upserted by (club_id,
-- ncsa_fine_id) so a status change (Unpaid -> Paid) updates in place.
-- team_id is resolved by matching `team_raw_name` against
-- team_ncsa_links.ncsa_raw_name at sync time; null means either a
-- club-wide fine (TBS/registration-type, per the rules doc) or a team
-- whose raw name doesn't match a currently-linked team.
create table public.ncsa_fines (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid references public.clubs(id) on delete cascade not null,
  ncsa_fine_id   text not null,
  ncsa_game_id   text,
  team_raw_name  text,
  team_id        uuid references public.teams(id) on delete set null,
  reason         text,
  submitted_by   text,
  fine_date      date,
  amount         numeric(10,2),
  status         text,
  notified_at    timestamptz,
  scraped_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (club_id, ncsa_fine_id)
);
create index ncsa_fines_club_id_idx on public.ncsa_fines(club_id);

alter table public.ncsa_fines enable row level security;
create policy "ncsa_fines_select" on public.ncsa_fines
  for select using (public.is_club_admin(club_id) or exists (
    select 1 from public.team_members tm where tm.team_id = ncsa_fines.team_id and tm.profile_id = auth.uid() and tm.role = 'coach'
  ));

-- Overlaps and gaps between two of the club's own games at the same
-- field, straight from rptGameOverlap.cfm / rptGameGapTime.cfm. Replaced
-- wholesale (delete+reinsert per club) on every sync, same pattern as
-- ncsa_standings — a conflict is a snapshot of the current schedule
-- state, not a historical record worth diffing/preserving.
create table public.ncsa_schedule_conflicts (
  id                uuid primary key default gen_random_uuid(),
  club_id           uuid references public.clubs(id) on delete cascade not null,
  kind              text not null check (kind in ('overlap', 'gap')),
  game_a_id         text not null,
  game_a_date       date,
  game_a_time       time,
  game_a_field      text,
  game_a_division   text,
  game_a_home       text,
  game_a_visitor    text,
  game_b_id         text not null,
  game_b_date       date,
  game_b_time       time,
  game_b_home       text,
  game_b_visitor    text,
  minutes           integer,
  scraped_at        timestamptz not null default now()
);
create index ncsa_schedule_conflicts_club_id_idx on public.ncsa_schedule_conflicts(club_id);

alter table public.ncsa_schedule_conflicts enable row level security;
create policy "ncsa_schedule_conflicts_select" on public.ncsa_schedule_conflicts
  for select using (public.is_club_admin(club_id) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.club_id = ncsa_schedule_conflicts.club_id and p.role = 'coach'
  ));

-- Single-game issues from rptGameMissingScore.cfm / rptPendingTBSgames.cfm.
-- Unlike conflicts, these persist across syncs (resolved_at set once a
-- game drops off the report — score entered, or a TBS game gets a real
-- date) so a "notify once, don't renotify" history survives, and so a
-- team's TBS list can show recently-resolved entries rather than just
-- vanishing.
create table public.ncsa_game_issues (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid references public.clubs(id) on delete cascade not null,
  kind            text not null check (kind in ('missing_score', 'tbs')),
  ncsa_game_id    text not null,
  event_date      date,
  event_time      time,
  field           text,
  division        text,
  home_team       text,
  visitor_team    text,
  tbs_type        text,
  team_id         uuid references public.teams(id) on delete set null,
  notified_at     timestamptz,
  detected_at     timestamptz not null default now(),
  resolved_at     timestamptz,
  unique (club_id, kind, ncsa_game_id)
);
create index ncsa_game_issues_club_id_idx on public.ncsa_game_issues(club_id);

alter table public.ncsa_game_issues enable row level security;
create policy "ncsa_game_issues_select" on public.ncsa_game_issues
  for select using (public.is_club_admin(club_id) or exists (
    select 1 from public.team_members tm where tm.team_id = ncsa_game_issues.team_id and tm.profile_id = auth.uid() and tm.role = 'coach'
  ));
