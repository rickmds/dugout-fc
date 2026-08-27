-- The remaining job in this edge function (guest-deadline reminders) is
-- now per-club-timezone-aware and only acts during the hourly tick that's
-- 8am in that club's own local time (see supabase/functions/event-reminders
-- /index.ts) — that requires the trigger itself to actually run every
-- hour, not once a day, so some tick lands on 8am for every timezone.
-- cron.schedule() with an existing job name updates it in place.
SELECT cron.schedule(
  'event-reminders-daily-8am',
  '0 * * * *',
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
