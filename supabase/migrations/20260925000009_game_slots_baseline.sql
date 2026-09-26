-- game_slots (the Game Scheduler's club-wide field/time grid) has existed
-- live in production with no migration ever capturing it — like
-- tryout_fields.field_group/is_full_field before it (see
-- 20260925000008_fields_consolidation.sql), it was added directly via the
-- SQL editor at some point. Worse than that case: pending_games.slot_id
-- has a live FK to this table, so a fresh `supabase db reset` fails
-- outright with "relation game_slots does not exist" rather than just
-- missing a couple of columns. This migration captures the exact live
-- schema (table, indexes, RLS) as a no-op against production and a real
-- baseline for anyone starting fresh — surfaced while building the NCSA
-- partner integration, which adds more code on top of this table.

create table if not exists public.game_slots (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  field_name   text not null,
  slot_date    date not null,
  start_time   time not null,
  end_time     time not null,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team    text,
  age_group    text,
  game_format  text check (game_format in ('SS','FS','7v7','9v9','11v11')),
  status       text not null default 'open' check (status in ('open','assigned','cancelled')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists game_slots_club_date   on public.game_slots (club_id, slot_date);
create index if not exists game_slots_club_status on public.game_slots (club_id, status);
create index if not exists game_slots_home_team   on public.game_slots (home_team_id);
create index if not exists game_slots_field       on public.game_slots (club_id, field_name, slot_date);

alter table public.game_slots enable row level security;

drop policy if exists "game_slots_admin_all" on public.game_slots;
create policy "game_slots_admin_all" on public.game_slots for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.club_id = game_slots.club_id
      and profiles.role = any (array['org_admin','app_admin'])
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.club_id = game_slots.club_id
      and profiles.role = any (array['org_admin','app_admin'])
  ));

drop policy if exists "game_slots_coach_select" on public.game_slots;
create policy "game_slots_coach_select" on public.game_slots for select
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.club_id = game_slots.club_id
      and profiles.role = 'coach'
  ));

drop policy if exists "game_slots_public_select" on public.game_slots;
create policy "game_slots_public_select" on public.game_slots for select
  using (status = 'assigned');
