-- Add scheduler_split to tryout_fields so the Game Scheduler knows
-- whether to show a field as one full column or two SS sub-columns.
-- 1 = normal (default), 2 = two simultaneous half-field slots ([A] and [B])
ALTER TABLE public.tryout_fields
  ADD COLUMN IF NOT EXISTS scheduler_split smallint NOT NULL DEFAULT 1;
