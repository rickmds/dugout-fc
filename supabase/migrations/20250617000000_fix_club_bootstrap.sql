-- Allow any authenticated user without a club to create their first one.
-- This enables the "coach creates own team" flow without requiring org_admin role first.
drop policy "clubs_insert" on public.clubs;

create policy "clubs_insert" on public.clubs for insert
  with check (
    public.current_user_role() in ('org_admin', 'app_admin')
    or public.current_user_club_id() is null
  );

-- Also allow team_members insert for the creator bootstrapping their own team.
-- Previously required is_team_coach(), which fails before the row exists.
drop policy "team_members_insert" on public.team_members;

create policy "team_members_insert" on public.team_members for insert
  with check (
    public.is_team_coach(team_id)
    or (
      profile_id = auth.uid()
      and exists (
        select 1 from public.teams t
        join public.clubs c on c.id = t.club_id
        where t.id = team_id
          and c.id = public.current_user_club_id()
          and public.current_user_role() in ('org_admin', 'coach')
      )
    )
  );
