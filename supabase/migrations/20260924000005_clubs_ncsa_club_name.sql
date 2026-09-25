-- Lets a club confirm "we are this club within NCSA" once, during signup,
-- instead of a coach discovering the per-team linking screen on their own
-- later. Purely a convenience/discovery aid — team_ncsa_links (which
-- actually drives the sync) never reads this column; it only narrows what
-- the linking screen searches by default.
alter table public.clubs add column if not exists ncsa_club_name text;
