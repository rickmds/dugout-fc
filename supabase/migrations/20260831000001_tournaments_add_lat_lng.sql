-- Tournament cards are getting a satellite map thumbnail (matching the one
-- events already have), which needs real coordinates to center on —
-- tournaments only ever stored a free-text `location` column. Nullable and
-- purely additive: existing tournaments keep working with the text-only
-- fallback until the app backfills these the first time each card renders
-- (geocoding `location` client-side, then writing the result back here so
-- every later render is instant).
alter table public.tournaments
  add column if not exists lat numeric,
  add column if not exists lng numeric;
