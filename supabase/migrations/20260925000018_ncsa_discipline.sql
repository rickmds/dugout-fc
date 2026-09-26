-- Scraped from NCSA's Caution/Ejection Reports (cautionEjectRpt.cfm,
-- Administrative Reports) — needs the club-level login from
-- club_ncsa_admin_credentials, same as the other reports in
-- 20260925000014_ncsa_reports.sql. A plain GET already defaults to the
-- current season and, for a club-rep login, to that club's own records
-- only.
--
-- NCSA's Rules of Competition repeatedly state that a carded player is
-- barred from all NCSA activity (including reffing) until the suspension
-- is served, but the report itself exposes no "games served" counter —
-- so served_at is a manual club-admin action, not something a sync can
-- ever set on its own. is_ejection is derived from the free-text event
-- column rather than stored redundantly: confirmed real values are
-- "Cautioned" and "Sent off" (NOT "Ejected", despite the report's name),
-- and there's no guarantee NCSA never introduces a third label.
--
-- No stable per-row ID from NCSA, so rows are deduped on
-- (club_id, ncsa_game_id, player_name) — the same game can produce more
-- than one carded player, but not the same player twice.
create table public.ncsa_discipline_records (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid references public.clubs(id) on delete cascade not null,
  ncsa_game_id   text not null,
  division       text,
  team_raw_name  text,
  team_id        uuid references public.teams(id) on delete set null,
  player_name    text not null,
  referee_name   text,
  filed_on       date,
  game_date      date,
  game_time      time,
  misconduct     text,
  event          text not null,
  served_at      timestamptz,
  notified_at    timestamptz,
  scraped_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (club_id, ncsa_game_id, player_name)
);
create index ncsa_discipline_records_club_id_idx on public.ncsa_discipline_records(club_id);
create index ncsa_discipline_records_team_id_idx on public.ncsa_discipline_records(team_id);

alter table public.ncsa_discipline_records enable row level security;

create policy "ncsa_discipline_records_select" on public.ncsa_discipline_records
  for select using (public.is_club_admin(club_id) or exists (
    select 1 from public.team_members tm where tm.team_id = ncsa_discipline_records.team_id and tm.profile_id = auth.uid() and tm.role = 'coach'
  ));

-- Club admins mark a suspension served once NCSA confirms it — the only
-- field this app ever writes back onto a scraped row.
create policy "ncsa_discipline_records_update_served" on public.ncsa_discipline_records
  for update using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));
