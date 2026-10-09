-- Three small, independent additions to the tryouts module:
--
-- 1. promoted_player_id — tracks whether (and which) real roster player an
--    accepted tryout candidate became. Nothing in this app has ever
--    created a real teams/players row from tryout data before now; this
--    is the marker that makes "promote to roster" idempotent (re-running
--    it must not create a duplicate real player) and lets the UI show
--    "already on the roster" instead of a dead "Add to Roster" button.
alter table public.tryout_assignments
  add column if not exists promoted_player_id uuid references public.players(id) on delete set null;

-- 2. NoShow — distinct from Declined (which means "responded no"). A
-- tryout candidate who registered but never came to be evaluated needs
-- different follow-up than one who showed up and declined an offer, and
-- today there's no way to record that distinction at all.
alter table public.tryout_assignments drop constraint tryout_assignments_status_check;
alter table public.tryout_assignments add constraint tryout_assignments_status_check
  check (status in ('Unassigned','Offer','Waitlist','Rejected','Accepted','Declined','NoShow'));

-- 3. roster_size — the admin-set target headcount for a team (the "16/16"
-- style capacity indicator), so Team Builder can show progress toward a
-- real target instead of just a raw headcount with no sense of "full."
alter table public.tryout_teams
  add column if not exists roster_size integer;
