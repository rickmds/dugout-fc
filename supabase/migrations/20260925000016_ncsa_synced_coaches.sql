-- A club's full coach roster as NCSA lists it (clubTeams.cfm), pulled
-- with the club-level admin credential rather than any one coach's
-- personal login — so this works for the whole club regardless of which
-- individual coaches have ever connected their own NCSA account.
--
-- Deliberately NOT auto-created into profiles/invites: matched against an
-- existing profile by email where possible (matched_profile_id), and left
-- unmatched otherwise — the Staff page surfaces unmatched rows with a
-- one-click "Invite" action so an admin decides, rather than this sync
-- silently creating accounts. Mirrors this codebase's existing
-- don't-guess discipline (e.g. sync-ncsa-schedule's ambiguous-match
-- handling).
create table public.ncsa_synced_coaches (
  id                 uuid primary key default gen_random_uuid(),
  club_id            uuid references public.clubs(id) on delete cascade not null,
  ncsa_coach_id      text not null,
  ncsa_team_raw_name text not null,
  role               text not null,
  first_name         text,
  last_name          text,
  email              text,
  cell               text,
  home_phone         text,
  matched_profile_id uuid references public.profiles(id) on delete set null,
  last_synced_at     timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (club_id, ncsa_coach_id, ncsa_team_raw_name)
);
create index ncsa_synced_coaches_club_id_idx on public.ncsa_synced_coaches(club_id);

alter table public.ncsa_synced_coaches enable row level security;
create policy "ncsa_synced_coaches_select" on public.ncsa_synced_coaches
  for select using (public.is_club_admin(club_id));

-- clubs.ncsa_clubid (the numeric id clubTeams.cfm needs, resolved once by
-- matching ncsa_club_name against the club dropdown) already exists —
-- added in 20260925000010_clubs_ncsa_partner.sql.
