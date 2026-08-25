-- teams_select had the same is_club_teammate branch flagged as the root
-- cause of the players_select leak — but here it's genuinely dead code,
-- not a live gap: the sibling clause `club_id = current_user_club_id()`
-- already grants identical (club-wide) access to any club member, so
-- is_club_teammate never changes the outcome. Verified this breadth is
-- intentional and load-bearing here, unlike players_select: the roster
-- import "link to existing team" picker (club-import.tsx) is reachable by
-- coaches, not just org_admin, and needs to list every team in the club by
-- name to offer as a merge target — narrowing this to team-membership-only
-- would break that feature. Just removing the dead duplicate clause.
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select
  using (
    club_id = current_user_club_id()
    or current_user_role() = 'app_admin'
    or is_team_member(id)
  );
