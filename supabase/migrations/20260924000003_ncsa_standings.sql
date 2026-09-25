-- Division standings — one full snapshot of a division's table per linked
-- team, refreshed (delete + reinsert, not diffed) on every sync. Unlike
-- events there's no "did this specific row change" question worth
-- tracking — the whole table is replaced together, so a plain overwrite is
-- simpler and correct: today's table is always today's table.
create table public.ncsa_standings (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid references public.teams(id) on delete cascade not null,
  team_ncsa_link_id  uuid references public.team_ncsa_links(id) on delete cascade not null,
  division           text not null,
  rank               int not null,
  team_raw_name      text not null,
  is_self            boolean not null default false,
  games_played       int not null,
  wins               int not null,
  losses             int not null,
  draws              int not null,
  points             int not null,
  goals_for          int not null,
  goals_against      int not null,
  updated_at         timestamptz default now()
);

create index ncsa_standings_team_id_idx on public.ncsa_standings(team_id);
create index ncsa_standings_link_id_idx on public.ncsa_standings(team_ncsa_link_id);

alter table public.ncsa_standings enable row level security;

-- Readable by anyone on the team (parents included) — unlike team_ncsa_links
-- itself (coach-only setup data), standings are exactly the kind of thing
-- parents want to see, so this uses is_team_member, not is_team_coach.
create policy "ncsa_standings_select" on public.ncsa_standings
  for select using (public.is_team_member(team_id));
