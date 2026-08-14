-- Same gap as teams_select (fixed in 20260813000004), one table over:
-- players_select only allowed is_team_member(team_id) — a cross-club coach
-- who's a team_members row on one team in a club could see that team (now,
-- after the previous fix, every team in the club too) but not the PLAYERS
-- on any of that club's other teams. That's why "Send a call out" started
-- working (only needs teams) while "Invite a player" still showed nobody
-- (needs players on those other teams too).

DROP POLICY IF EXISTS "players_select" ON public.players;
CREATE POLICY "players_select" ON public.players FOR SELECT
  USING (
    public.is_team_member(team_id)
    OR public.current_user_role() = 'app_admin'
    OR public.is_club_teammate((SELECT club_id FROM public.teams WHERE id = players.team_id))
  );
