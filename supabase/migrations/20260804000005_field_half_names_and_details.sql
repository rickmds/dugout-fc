ALTER TABLE public.tryout_fields
  ADD COLUMN IF NOT EXISTS half_a_name  text,
  ADD COLUMN IF NOT EXISTS half_b_name  text,
  ADD COLUMN IF NOT EXISTS has_lights   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surface_type text,
  ADD COLUMN IF NOT EXISTS field_notes  text;
