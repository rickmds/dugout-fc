-- A team with both a league and a cup NCSA link (the normal case now that
-- links merge onto one team instead of creating a duplicate team) has two
-- independent sources feeding events into the same team_id. The sync's
-- "did this game disappear?" check was scoped only to team_id, which meant
-- syncing one link couldn't tell the other link's games apart from its own
-- — every run of link A saw link B's games as "missing" and cancelled
-- them, and vice versa. This column lets that check (and the create/update
-- matching) scope precisely to the link that actually owns each event.
alter table public.events
  add column if not exists team_ncsa_link_id uuid references public.team_ncsa_links(id) on delete set null;

create index if not exists events_ncsa_link_id_idx on public.events(team_ncsa_link_id);
