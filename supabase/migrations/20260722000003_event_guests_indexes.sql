-- Indexes for event_guests to support RLS policy subqueries efficiently
CREATE INDEX IF NOT EXISTS idx_event_guests_event_id  ON public.event_guests(event_id);
CREATE INDEX IF NOT EXISTS idx_event_guests_profile_id ON public.event_guests(profile_id);
CREATE INDEX IF NOT EXISTS idx_event_guests_player_id  ON public.event_guests(player_id);
