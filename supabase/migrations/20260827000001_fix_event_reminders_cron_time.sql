-- The original schedule (0 8 * * *) fires at 8am UTC, which its own
-- comment correctly noted is "≈ 4am US/Eastern" — that's the bug, not a
-- typo in the comment: 8am UTC really is 4am Eastern, not a reasonable
-- morning send time. Retimed to noon UTC (8am Eastern), matching the
-- schedule already used by the newer event-day-reminders/rsvp-reminders
-- Vercel crons that cover the same US-Eastern-centric assumption today.
-- cron.schedule() with an existing job name updates it in place.
SELECT cron.schedule(
  'event-reminders-daily-8am',
  '0 12 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://nandbuwogaxmrzsstttd.supabase.co/functions/v1/event-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hbmRidXdvZ2F4bXJ6c3N0dHRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3MDI0MywiZXhwIjoyMDk3MTQ2MjQzfQ.E6uuet4_AhAY9PH8LS1_crFG11obwv04ohGpv-BZgDk'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
