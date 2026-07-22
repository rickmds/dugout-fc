-- Guest requests: coach sends a call for volunteers to a whole team's parents

CREATE TABLE IF NOT EXISTS public.guest_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  requesting_team_id uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  target_team_id     uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  note               text,
  spots_needed       int         NOT NULL DEFAULT 1 CHECK (spots_needed BETWEEN 1 AND 11),
  status             text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','cancelled')),
  created_by         uuid        REFERENCES public.profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_requests ENABLE ROW LEVEL SECURITY;

-- Coaches/admins in the same club can create requests
CREATE POLICY "Club coaches can create guest requests"
  ON public.guest_requests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.teams t ON t.club_id = p.club_id
      WHERE t.id = guest_requests.requesting_team_id
        AND p.id = auth.uid()
        AND p.role IN ('coach','org_admin','app_admin')
    )
  );

-- Anyone in the same club can view requests (needed for the volunteer screen)
CREATE POLICY "Club members can view guest requests"
  ON public.guest_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN public.profiles p ON p.club_id = t.club_id
      WHERE t.id = guest_requests.requesting_team_id
        AND p.id = auth.uid()
    )
  );

-- Request creator can cancel/update
CREATE POLICY "Request creator can update status"
  ON public.guest_requests
  FOR UPDATE
  USING (created_by = auth.uid());

-- NEW event_guests INSERT policy: parents can volunteer their own child
-- when there is an open guest_request targeting that child's team for this event
CREATE POLICY "Parents can self-volunteer as guest player"
  ON public.event_guests
  FOR INSERT
  WITH CHECK (
    player_id IS NOT NULL
    AND role = 'player'
    AND EXISTS (
      SELECT 1 FROM public.players pl
      WHERE pl.id = event_guests.player_id
        AND pl.profile_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.guest_requests gr
      JOIN public.players pl ON pl.id = event_guests.player_id
      WHERE gr.event_id  = event_guests.event_id
        AND gr.target_team_id = pl.team_id
        AND gr.status = 'open'
    )
  );
