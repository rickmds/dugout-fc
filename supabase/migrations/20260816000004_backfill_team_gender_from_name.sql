-- One-time backfill for teams.gender, which has existed since
-- 20260705000001_teams_gender.sql but was never settable anywhere in the
-- UI, so it's null on every team on the platform today — "Boys"/"Girls"
-- currently only lives inside the team name as text, in two different
-- conventions clubs actually use ("U8 Boys Rockets" vs "BU8 Madrid" /
-- "GU12 Milan"). Previewed live before running: 53 of 54 null teams match
-- unambiguously (no team matches both patterns), one ("G10 Milan" — a "G"
-- + digits but no "U") is left null rather than loosen the pattern and
-- risk a false positive elsewhere on the platform. A gender picker is
-- being added to team create/edit so this is the last time this needs to
-- run — going forward gender is a real, directly-set field.

update public.teams
set gender = 'boys'
where gender is null
  and (name ~ '^BU[0-9]' or name ~* '\yboys\y');

update public.teams
set gender = 'girls'
where gender is null
  and (name ~ '^GU[0-9]' or name ~* '\ygirls\y');
