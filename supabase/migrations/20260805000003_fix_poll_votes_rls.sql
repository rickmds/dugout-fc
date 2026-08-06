-- Fix team_poll_votes RLS: org_admin/app_admin role lives on profiles, not team_members.
-- SELECT policy only checked team_members membership, blocking org_admins who aren't
-- explicitly added to that team. Mirrors the fix already applied to team_polls.

drop policy if exists "team members view votes"     on public.team_poll_votes;
drop policy if exists "team members insert own votes" on public.team_poll_votes;

create policy "team members view votes"
  on public.team_poll_votes for select
  using (
    -- regular team member
    poll_id in (
      select id from public.team_polls
      where team_id in (
        select team_id from public.team_members where profile_id = auth.uid()
      )
    )
    or
    -- org_admin / app_admin of the same club
    poll_id in (
      select tp.id from public.team_polls tp
      join public.teams t on t.id = tp.team_id
      join public.profiles p on p.club_id = t.club_id
      where p.id = auth.uid() and p.role in ('org_admin', 'app_admin')
    )
  );

create policy "team members insert own votes"
  on public.team_poll_votes for insert
  with check (
    profile_id = auth.uid() and
    (
      poll_id in (
        select id from public.team_polls
        where team_id in (
          select team_id from public.team_members where profile_id = auth.uid()
        )
      )
      or
      poll_id in (
        select tp.id from public.team_polls tp
        join public.teams t on t.id = tp.team_id
        join public.profiles p on p.club_id = t.club_id
        where p.id = auth.uid() and p.role in ('org_admin', 'app_admin')
      )
    )
  );
