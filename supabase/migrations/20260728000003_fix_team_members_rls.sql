-- The original team_members_select policy only used is_team_member(team_id),
-- which is circular: it queries team_members to prove membership in team_members.
-- This breaks for rows added after the initial session load.
-- Fix: also allow a user to see any row where they are the profile_id directly.

drop policy if exists "team_members_select" on public.team_members;

create policy "team_members_select" on public.team_members for select
  using (
    profile_id = auth.uid()
    or public.is_team_member(team_id)
    or public.current_user_role() = 'app_admin'
  );
