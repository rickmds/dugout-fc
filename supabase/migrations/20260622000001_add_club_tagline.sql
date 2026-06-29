-- Add tagline to clubs for white-label branding
alter table public.clubs
  add column if not exists tagline text;
