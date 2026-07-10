ALTER TABLE events
  ADD COLUMN IF NOT EXISTS home_away text CHECK (home_away IN ('home', 'away'));
