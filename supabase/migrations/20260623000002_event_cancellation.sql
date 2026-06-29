alter table public.events
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;
