-- teams_update gated purely on the global profiles.role/club_id, independent
-- of team_members — so a coach whose global role hadn't been elevated (e.g.
-- added via the instant-create staff-invite path before that path raised
-- their role) couldn't edit even a team they're a real team_members coach
-- on. The app-level cause is fixed (web/lib/coachInvite.ts now elevates an
-- existing user's role on invite), but the RLS layer shouldn't rely solely
-- on that global flag staying in sync — add the team-scoped check already
-- used everywhere else (is_team_coach) as a second, independent path in.

drop policy if exists "teams_update" on public.teams;
create policy "teams_update" on public.teams for update
  using (
    (club_id = public.current_user_club_id() and public.current_user_role() in ('org_admin','coach','app_admin'))
    or public.is_team_coach(id)
  );
