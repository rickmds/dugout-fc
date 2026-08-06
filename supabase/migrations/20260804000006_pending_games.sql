CREATE TABLE public.pending_games (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid REFERENCES public.clubs(id) NOT NULL,
  season_label text,
  game_date   date NOT NULL,
  age_group   text,
  gender      text,
  our_team    text,
  opponent    text NOT NULL,
  league      text,
  notes       text,
  raw_data    jsonb,
  slot_id     uuid REFERENCES public.game_slots(id),
  status      text NOT NULL DEFAULT 'unscheduled'
                CHECK (status IN ('unscheduled', 'scheduled')),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.pending_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club staff can manage pending games"
  ON public.pending_games FOR ALL TO authenticated
  USING  (club_id IN (SELECT club_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (club_id IN (SELECT club_id FROM public.profiles WHERE id = auth.uid()));
