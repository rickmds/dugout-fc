-- Tracks whether each reminder type has already fired for an event, so the
-- cron can run hourly with a wide "is this due" window instead of a narrow
-- sliding one — the old narrow-window design assumed the cron ran hourly
-- but it was actually scheduled daily, silently missing most events. This
-- also lets quiet-hours skip a run entirely without losing anything: an
-- event just stays eligible until the next non-quiet-hours run catches it.
alter table public.events
  add column if not exists rsvp_reminder_24h_sent_at timestamptz,
  add column if not exists rsvp_reminder_2h_sent_at timestamptz;
