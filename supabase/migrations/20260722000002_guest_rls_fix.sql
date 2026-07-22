-- Fix 1: Let player guests read their own event_guests row
-- The existing policy only matches coach guests (profile_id = auth.uid())
-- Player guests have profile_id NULL and are identified via player_id → players.profile_id
DROP POLICY IF EXISTS "Guests can read their own invite" ON public.event_guests;
CREATE POLICY "Guests can read their own invite"
  ON public.event_guests FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id  = event_guests.player_id
        AND players.profile_id = auth.uid()
    )
  );

-- Fix 2: Let player guests update (accept/decline) their own invite
DROP POLICY IF EXISTS "Guests can confirm or decline their own invite" ON public.event_guests;
CREATE POLICY "Guests can confirm or decline their own invite"
  ON public.event_guests FOR UPDATE
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id  = event_guests.player_id
        AND players.profile_id = auth.uid()
    )
  );

-- Fix 3: Allow guests to read the event they were invited to.
--
-- Naive approach (events → event_guests RLS → events) creates an infinite loop
-- because the existing "Team coaches can manage event guests" policy references
-- events directly. Fix: replace that policy with a SECURITY DEFINER function
-- so the inner events read bypasses RLS and breaks the circular dependency.

-- Helper: reads events without RLS — safe for use inside event_guests policy
CREATE OR REPLACE FUNCTION public.is_event_coach_or_admin(p_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.team_members tm ON tm.team_id = e.team_id
      WHERE e.id = p_event_id
        AND tm.profile_id = auth.uid()
        AND tm.role = 'coach'
    )
    OR EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.teams t ON t.id = e.team_id
      JOIN public.profiles p ON p.club_id = t.club_id OR p.role = 'app_admin'
      WHERE e.id = p_event_id
        AND p.id = auth.uid()
        AND p.role IN ('org_admin', 'app_admin')
    );
$$;

-- Rebuild event_guests coach policy — now uses SECURITY DEFINER (no RLS loop)
DROP POLICY IF EXISTS "Team coaches can manage event guests" ON public.event_guests;
CREATE POLICY "Team coaches can manage event guests"
  ON public.event_guests FOR ALL
  USING (public.is_event_coach_or_admin(event_id));

-- Events guest policy — safe now (event_guests → is_event_coach_or_admin → no RLS)
DROP POLICY IF EXISTS "Event guests can read their event" ON public.events;
CREATE POLICY "Event guests can read their event"
  ON public.events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.event_guests eg
      WHERE eg.event_id = events.id
        AND (
          eg.profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.players
            WHERE players.id         = eg.player_id
              AND players.profile_id = auth.uid()
          )
        )
    )
  );
