-- Lets a parent/coach pin which team the app should land on at cold
-- launch, instead of only ever following whatever was last viewed
-- (TeamContext's existing AsyncStorage-based persistence). Distinct from
-- that "last viewed" behavior on purpose: a deliberate pin doesn't drift
-- just because someone briefly checked a different kid's team.
--
-- on delete set null (not cascade) — losing the pinned team shouldn't
-- delete the profile, just fall back to the existing "last viewed"/
-- teams[0] resolution the same way an invalid/stale pin already would.
--
-- No RLS policy needed: profiles_update_own (id = auth.uid(), no
-- with_check) already lets a user freely update any column on their own
-- profile row, this one included.
alter table public.profiles
  add column default_team_id uuid references public.teams(id) on delete set null;
