-- Club-wide "is this club an NCSA partner" gate. clubs.ncsa_club_name
-- (20260924000005) looks like it could serve this purpose but explicitly
-- isn't one — its own migration comment says team_ncsa_links (which
-- drives the actual sync) never reads it; it only seeds the per-team
-- linking screen's default search. Nothing today flags a club as an NCSA
-- partner, so nothing can be conditionally hidden from non-partner clubs
-- (EDP, etc) even though the deeper NCSA integration (auto-populated
-- fields, league schedule in the Game Scheduler, coach roster sync, gap/
-- fine flagging) must never appear for them. This is that flag.
alter table public.clubs
  add column if not exists ncsa_partner boolean not null default false;

-- NCSA's numeric club id (clubTeams.cfm?clubid=<N>), resolved once by
-- matching ncsa_club_name against the clubTeams.cfm dropdown and cached
-- here so every later admin-scraping call (coach roster sync, fines sync)
-- doesn't need to re-resolve it from a fuzzy name match every time.
alter table public.clubs
  add column if not exists ncsa_clubid integer;
