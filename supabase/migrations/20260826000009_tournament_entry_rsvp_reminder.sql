-- Idempotency column for the tournament entry-RSVP deadline reminder cron —
-- one reminder per tournament, not the dual 24h/2h pattern per-game RSVP
-- uses, since entry deadlines are typically days/weeks out, not hours.
alter table public.tournaments add column if not exists entry_rsvp_reminder_sent_at timestamptz;
