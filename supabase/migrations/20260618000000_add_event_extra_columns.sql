ALTER TABLE events
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS arrival_buffer_minutes integer,
  ADD COLUMN IF NOT EXISTS field_type text CHECK (field_type IN ('turf', 'grass')),
  ADD COLUMN IF NOT EXISTS uniform text CHECK (uniform IN ('home', 'away', 'training')),
  ADD COLUMN IF NOT EXISTS coach_notes text,
  ADD COLUMN IF NOT EXISTS require_rsvp boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS recurrence_id uuid;
