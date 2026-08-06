-- Fix poll RLS: org_admin role lives on profiles, not team_members.
-- The old policy checked team_members.role = 'org_admin' which can never be true.

drop policy if exists "coaches manage polls"    on public.team_polls;
drop policy if exists "coaches manage options"  on public.team_poll_options;

create policy "coaches manage polls"
  on public.team_polls for all
  using (
    -- explicit coach membership
    team_id in (
      select team_id from public.team_members
      where profile_id = auth.uid() and role = 'coach'
    )
    or
    -- org_admin or app_admin of the same club
    team_id in (
      select t.id from public.teams t
      join public.profiles p on p.club_id = t.club_id
      where p.id = auth.uid() and p.role in ('org_admin', 'app_admin')
    )
  );

create policy "coaches manage options"
  on public.team_poll_options for all
  using (
    poll_id in (
      select id from public.team_polls
      where
        team_id in (
          select team_id from public.team_members
          where profile_id = auth.uid() and role = 'coach'
        )
        or
        team_id in (
          select t.id from public.teams t
          join public.profiles p on p.club_id = t.club_id
          where p.id = auth.uid() and p.role in ('org_admin', 'app_admin')
        )
    )
  );
