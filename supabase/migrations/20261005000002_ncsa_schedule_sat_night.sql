-- Rounds out the weekend sync coverage added in
-- 20261005000001_ncsa_schedule_weekend_sync.sql with a Saturday night
-- pass, matching the Friday/Sunday night slots already there.
SELECT cron.schedule(
  'sync-ncsa-schedule-sat-night',
  '30 1 * * 0', -- Sunday 01:30 UTC = Saturday ~9:30pm ET
  $cron$
  SELECT net.http_post(
    url := 'https://nandbuwogaxmrzsstttd.supabase.co/functions/v1/sync-ncsa-schedule',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hbmRidXdvZ2F4bXJ6c3N0dHRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3MDI0MywiZXhwIjoyMDk3MTQ2MjQzfQ.E6uuet4_AhAY9PH8LS1_crFG11obwv04ohGpv-BZgDk'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
