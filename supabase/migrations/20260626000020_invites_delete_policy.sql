-- Allow coaches and org_admins to delete invite records
drop policy if exists "invites_delete" on public.invites;
create policy "invites_delete" on public.invites for delete
  using (public.is_team_coach(team_id));
