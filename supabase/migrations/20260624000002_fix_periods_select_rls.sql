-- player_match_periods SELECT policy didn't include org_admin/app_admin.
-- INSERT.select() was returning null for org_admin, leaving periods empty
-- and showing no player time in the match tracker.

drop policy if exists "team members read periods" on player_match_periods;

create policy "team members read periods"
  on player_match_periods for select
  using (
    public.is_team_member(team_id)
    or public.current_user_role() in ('org_admin', 'app_admin')
  );
