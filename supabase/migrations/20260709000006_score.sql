-- Score columns on events (live match tracker + full-time result)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS score_home int;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS score_away int;
