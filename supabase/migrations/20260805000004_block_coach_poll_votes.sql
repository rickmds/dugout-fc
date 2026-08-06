-- Coaches and admins can view poll results but cannot vote
drop policy if exists "team members insert own votes" on public.team_poll_votes;

create policy "team members insert own votes" on public.team_poll_votes for insert
with check (
  profile_id = auth.uid()
  -- Block org_admin and app_admin
  and not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('org_admin', 'app_admin')
  )
  -- Block coaches
  and not exists (
    select 1 from public.team_members tm
    join public.team_polls tp on tp.team_id = tm.team_id
    where tm.profile_id = auth.uid() and tm.role = 'coach' and tp.id = poll_id
  )
  -- Must be a member of the team the poll belongs to
  and poll_id in (
    select id from public.team_polls where team_id in (
      select team_id from public.team_members where profile_id = auth.uid()
    )
  )
);
