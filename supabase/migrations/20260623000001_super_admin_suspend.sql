alter table public.clubs
  add column if not exists suspended_at timestamptz;
