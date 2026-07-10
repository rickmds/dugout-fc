-- ─── Video link on events ────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS video_url text;

-- ─── Player injury flag ───────────────────────────────────────────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_injured boolean NOT NULL DEFAULT false;

-- ─── Attendance tracking (separate from RSVP — coach marks on game day) ──────
CREATE TABLE IF NOT EXISTS public.event_attendance (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id    uuid        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  status       text        NOT NULL CHECK (status IN ('present','absent','late')),
  marked_by    uuid        REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, player_id)
);

ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

-- Coaches and above can read/write attendance for their team's events
CREATE POLICY "Team coaches can manage attendance"
  ON public.event_attendance
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.team_members tm ON tm.team_id = e.team_id
      WHERE e.id = event_attendance.event_id
        AND tm.profile_id = auth.uid()
        AND tm.role IN ('coach')
    )
    OR EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.profiles p ON p.club_id = (
        SELECT club_id FROM public.teams WHERE id = e.team_id
      )
      WHERE e.id = event_attendance.event_id
        AND p.id = auth.uid()
        AND p.role IN ('org_admin','app_admin')
    )
  );

-- Players can read their own attendance
CREATE POLICY "Players can read own attendance"
  ON public.event_attendance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.players pl
      JOIN public.team_members tm ON tm.team_id = pl.team_id
      WHERE pl.id = event_attendance.player_id
        AND tm.profile_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS event_attendance_updated_at ON public.event_attendance;
CREATE TRIGGER event_attendance_updated_at
  BEFORE UPDATE ON public.event_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Event guests (within-club guest players and coaches) ─────────────────────
CREATE TABLE IF NOT EXISTS public.event_guests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- For guest players: links to existing player record on another team
  player_id    uuid        REFERENCES public.players(id) ON DELETE SET NULL,
  -- For guest coaches: links to their profile
  profile_id   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name    text        NOT NULL,
  role         text        NOT NULL CHECK (role IN ('player','coach')),
  -- pending → invited but not confirmed; confirmed → accepted; declined → declined
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined')),
  added_by     uuid        REFERENCES public.profiles(id),
  responded_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;

-- Coaches/admins can manage guests for their team's events
CREATE POLICY "Team coaches can manage event guests"
  ON public.event_guests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.team_members tm ON tm.team_id = e.team_id
      WHERE e.id = event_guests.event_id
        AND tm.profile_id = auth.uid()
        AND tm.role IN ('coach')
    )
    OR EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.profiles p ON p.club_id = (
        SELECT club_id FROM public.teams WHERE id = e.team_id
      )
      WHERE e.id = event_guests.event_id
        AND p.id = auth.uid()
        AND p.role IN ('org_admin','app_admin')
    )
  );

-- Guest players/coaches can read and update their own invite
CREATE POLICY "Guests can read their own invite"
  ON public.event_guests
  FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Guests can confirm or decline their own invite"
  ON public.event_guests
  FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
