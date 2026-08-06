ALTER TABLE public.tryout_fields
  ADD COLUMN IF NOT EXISTS scheduler_format text NOT NULL DEFAULT '7v7';
