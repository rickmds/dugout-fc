alter table events
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_reason text;
