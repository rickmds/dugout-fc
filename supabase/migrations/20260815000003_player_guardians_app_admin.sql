-- Every other core table's RLS (players, invites, team_members via
-- is_team_coach, etc.) already carries a current_user_role() = 'app_admin'
-- bypass so the super-admin dashboard can read across every club.
-- player_guardians was missed — it only ever allowed the guardian
-- themselves or that player's coach, so app_admin queries against it
-- silently returned zero rows. Caught while building a "players with no
-- linked guardian" health check for the super-admin dashboard.
drop policy if exists player_guardians_select on public.player_guardians;
create policy player_guardians_select on public.player_guardians
  for select
  using (
    is_player_guardian(player_id)
    or exists (select 1 from public.players p where p.id = player_guardians.player_id and is_team_coach(p.team_id))
    or current_user_role() = 'app_admin'
  );
