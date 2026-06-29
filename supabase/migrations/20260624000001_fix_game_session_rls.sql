-- game_sessions and player_match_periods RLS policies didn't use is_team_coach(),
-- so org_admin (who may not be in team_members) was blocked on INSERT.

drop policy if exists "coaches manage game sessions" on game_sessions;
drop policy if exists "coaches write periods"         on player_match_periods;
drop policy if exists "coaches update periods"        on player_match_periods;
drop policy if exists "coaches delete periods"        on player_match_periods;

create policy "coaches manage game sessions"
  on game_sessions for all
  using     (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

create policy "coaches write periods"
  on player_match_periods for insert
  with check (public.is_team_coach(team_id));

create policy "coaches update periods"
  on player_match_periods for update
  using (public.is_team_coach(team_id));

create policy "coaches delete periods"
  on player_match_periods for delete
  using (public.is_team_coach(team_id));
