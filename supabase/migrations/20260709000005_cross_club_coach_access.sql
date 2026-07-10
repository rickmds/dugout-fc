-- Add home_address to profiles for drive time origin
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS home_address text;

-- Allow coaches to read teams they're a member of (cross-club Weekend Outlook support)
DROP POLICY IF EXISTS "teams_select" ON public.teams;
CREATE POLICY "teams_select" ON public.teams FOR SELECT
  USING (
    club_id = public.current_user_club_id()
    OR public.current_user_role() = 'app_admin'
    OR public.is_team_member(id)
  );

-- Allow coaches to read clubs whose teams they're a member of
DROP POLICY IF EXISTS "clubs_select" ON public.clubs;
CREATE POLICY "clubs_select" ON public.clubs FOR SELECT
  USING (
    id = public.current_user_club_id()
    OR public.current_user_role() = 'app_admin'
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE t.club_id = clubs.id AND tm.profile_id = auth.uid()
    )
  );
