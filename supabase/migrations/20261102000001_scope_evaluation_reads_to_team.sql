-- Narrow evaluation read access from "any coach anywhere in the club" down
-- to "a coach can only read evaluations for teams they actually coach,
-- club admins keep full club-wide read."
--
-- "club staff read batches"/"club staff read evals" used is_club_staff(club_id),
-- whose role='coach' branch has no team filter at all (confirmed live —
-- 20260830000001_multi_club_membership.sql:60-62) — any coach account in a
-- club could read every other team's evaluation_batches and
-- player_evaluations rows directly, including ratings and the coach's
-- written notes about kids who aren't theirs. Discovered while testing a
-- real coach login on the web dashboard, which surfaced every team's
-- evaluations in the list with no scoping.
--
-- is_team_coach(team_id) is the right replacement, not a hand-rolled check:
-- it already resolves to true for the actual team's coach, OR any club
-- admin for that team's club (org_admin on their home club, or an explicit
-- club_admins row), OR app_admin outright — so this is a strict narrowing
-- for a plain coach while leaving every existing admin/approval workflow
-- (which reads/approves club-wide) unchanged.

drop policy "club staff read batches" on public.evaluation_batches;
create policy "team coach or club admin read batches"
  on public.evaluation_batches for select
  using (public.is_team_coach(team_id));

drop policy "club staff read evals" on public.player_evaluations;
create policy "team coach or club admin read evals"
  on public.player_evaluations for select
  using (public.is_team_coach(team_id));

-- Same class of bug, on the write side this time: teams_update's fallback
-- clause (20260813000003_teams_update_team_scoped.sql) grants UPDATE to
-- "any 'coach' whose home club matches", with no team_id check at all —
-- so any coach in a club could rename, re-age-group, or re-season ANY
-- team in it, not just their own. The narrower is_team_coach(id) clause
-- already added alongside it correctly covers the legitimate case (a
-- coach editing their own team), including the stale-global-role edge
-- case the broad fallback was originally there for — that was separately
-- fixed at the app level per that migration's own comment, so the broad
-- fallback no longer needs 'coach' in it. org_admin/app_admin are
-- unaffected: is_team_coach() already resolves true for them via
-- is_club_admin() internally.
drop policy "teams_update" on public.teams;
create policy "teams_update" on public.teams for update
  using (
    (club_id = public.current_user_club_id() and public.current_user_role() in ('org_admin','app_admin'))
    or public.is_team_coach(id)
  );
