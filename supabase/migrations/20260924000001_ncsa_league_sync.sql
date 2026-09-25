-- NCSA league schedule sync — lets a team link to one or more NCSA team
-- entries (league play, and separately the NCSA Cup bracket, which is
-- always the same roster under an "X"-flagged division code) so a
-- recurring job can keep the schedule current automatically, including
-- picking up reschedules (NCSA keeps the same game id when a rained-out
-- game moves, confirmed against real data) without a coach re-entering
-- anything by hand.

-- One Pulse FC team can have MULTIPLE NCSA source entries feeding into the
-- same schedule (league + cup), which is why this isn't just a column on
-- teams — see the "Maroons-B09A-Breheny" (league) / "Maroons-B09XB-Breheny"
-- (cup) example that prompted this design.
create table public.team_ncsa_links (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid references public.teams(id) on delete cascade not null,
  ncsa_team_id   text not null,
  ncsa_raw_name  text not null,
  -- 'ref_only' covers NCSA "R" flight entries — these exist purely so NCSA
  -- can assign referees to a team's home games at NCSA-affiliated fields;
  -- the team's REAL schedule is played in EDP (a separate platform this
  -- app can't automatically sync — see the GotSport/EDP research). The
  -- team still gets created/linked for roster purposes, but sync_games
  -- stays false permanently so we never import that partial, misleading
  -- game list as if it were the team's real schedule.
  competition    text not null check (competition in ('league', 'cup', 'ref_only')),
  sync_games     boolean not null default true,
  last_synced_at timestamptz,
  created_at     timestamptz default now(),
  unique (team_id, ncsa_team_id)
);

create index team_ncsa_links_team_id_idx on public.team_ncsa_links(team_id);

alter table public.team_ncsa_links enable row level security;

create policy "team_ncsa_links_select" on public.team_ncsa_links
  for select using (public.is_team_coach(team_id));
create policy "team_ncsa_links_insert" on public.team_ncsa_links
  for insert with check (public.is_team_coach(team_id));
create policy "team_ncsa_links_update" on public.team_ncsa_links
  for update using (public.is_team_coach(team_id));
create policy "team_ncsa_links_delete" on public.team_ncsa_links
  for delete using (public.is_team_coach(team_id));

-- Lets the sync job recognize "this event is one we created from NCSA
-- game <external_id>" on a later run, so a reschedule updates the existing
-- row (and fires the normal edit-event notification) instead of creating a
-- duplicate. Nullable/no default — every event created through the app's
-- normal manual flows simply never sets these.
alter table public.events add column external_source text;
alter table public.events add column external_id text;

create unique index events_external_unique
  on public.events(external_source, external_id)
  where external_source is not null;

-- One row per sync attempt per link — without this, a scrape that silently
-- starts returning zero games (NCSA changes their HTML, a team gets
-- archived, a network blip) fails invisibly forever. games_found = 0 on a
-- link that previously had games is the actual alarm signal to watch for.
create table public.league_sync_log (
  id                 uuid primary key default gen_random_uuid(),
  team_ncsa_link_id  uuid references public.team_ncsa_links(id) on delete cascade not null,
  run_at             timestamptz default now(),
  status             text not null check (status in ('success', 'error')),
  games_found        int,
  games_created      int,
  games_updated      int,
  games_cancelled    int,
  error_message      text
);

create index league_sync_log_link_id_idx on public.league_sync_log(team_ncsa_link_id, run_at desc);

alter table public.league_sync_log enable row level security;

create policy "league_sync_log_select" on public.league_sync_log
  for select using (
    exists (
      select 1 from public.team_ncsa_links l
      where l.id = team_ncsa_link_id and public.is_team_coach(l.team_id)
    )
  );
