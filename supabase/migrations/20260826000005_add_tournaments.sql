-- Tournaments are a lightweight container for a set of games — not a new
-- events.type. Individual games stay completely normal events rows with a
-- nullable tournament_id, so RSVP, chat, Lineup Builder, and Match
-- Tracker's existing score_home/score_away writes all keep working
-- unmodified. The tournament's displayed date range and record are always
-- derived client-side from whichever games are linked to it, never stored
-- here — this lets one container serve both a weekend tournament (dates
-- known up front) and a State Cup knockout (rounds added one at a time
-- over weeks) with no schema difference between them.
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  name text not null,
  location text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;

create policy "tournaments_select" on public.tournaments for select
  using (public.is_team_member(team_id));
create policy "tournaments_insert" on public.tournaments for insert
  with check (public.is_team_coach(team_id));
create policy "tournaments_update" on public.tournaments for update
  using (public.is_team_coach(team_id));
create policy "tournaments_delete" on public.tournaments for delete
  using (public.is_team_coach(team_id));

create trigger tournaments_updated_at
  before update on public.tournaments
  for each row execute function public.set_updated_at();

-- on delete set null: deleting a tournament shouldn't delete or corrupt the
-- (fully normal) event rows linked to it — same reasoning as events.field_id
-- (20260819000001_link_events_to_fields.sql).
alter table public.events add column if not exists tournament_id uuid references public.tournaments(id) on delete set null;
alter table public.events add column if not exists round_label text;

create index if not exists idx_events_tournament_id on public.events (tournament_id) where tournament_id is not null;
create index if not exists idx_tournaments_team_id on public.tournaments (team_id);
