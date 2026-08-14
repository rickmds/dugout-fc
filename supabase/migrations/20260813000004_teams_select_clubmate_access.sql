-- teams_select let a cross-club coach see their home club's teams plus any
-- single team they hold an explicit team_members row on elsewhere — but not
-- SIBLING teams in that other club. A coach who's a team_members row on just
-- one Maroons SC team could see that team (and Maroons itself, via
-- clubs_select below) but none of Maroons's other ~47 teams, breaking the
-- guest-player pickers ("no other teams in your club") for any cross-club
-- coach browsing a non-home club. clubs_select already got the right fix
-- for this exact scenario in 20260709000005 — teams_select just never got
-- the same treatment in that pass.
--
-- An inline EXISTS subquery joining back to teams recurses (that join's own
-- read of teams re-triggers this same policy) — wrap it in a SECURITY
-- DEFINER function, the same pattern is_team_member/is_team_coach already
-- use to break exactly this cycle.

CREATE OR REPLACE FUNCTION public.is_club_teammate(p_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE t.club_id = p_club_id AND tm.profile_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "teams_select" ON public.teams;
CREATE POLICY "teams_select" ON public.teams FOR SELECT
  USING (
    club_id = public.current_user_club_id()
    OR public.current_user_role() = 'app_admin'
    OR public.is_team_member(id)
    OR public.is_club_teammate(club_id)
  );
