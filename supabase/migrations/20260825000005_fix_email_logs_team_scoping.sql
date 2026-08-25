-- email_logs SELECT only checked club_id — any coach/org_admin in the club
-- could read every other team's sent-email history and bodies via a direct
-- query, even though the app's own UI already filters by team client-side.
-- org_admin/app_admin keep full club-wide visibility (unchanged); a coach
-- is now scoped to logs whose team_ids actually overlaps their own teams.
drop policy if exists "Club members can view their email logs" on public.email_logs;
create policy "Club members can view their email logs" on public.email_logs
  for select
  using (
    club_id = (select profiles.club_id from public.profiles where profiles.id = auth.uid())
    and (
      (select profiles.role from public.profiles where profiles.id = auth.uid()) in ('org_admin', 'app_admin')
      or team_ids && (select coalesce(array_agg(team_id), '{}') from public.team_members where profile_id = auth.uid())
    )
  );
