-- Game-weekend coverage for sync-ncsa-schedule, on top of the existing
-- once-daily run (20260924000002_ncsa_sync_cron.sql, 11:00 UTC — kept as
-- the weekday/overnight-correction safety net). The daily-only cadence
-- meant a Friday-evening through Sunday-night score or location update
-- didn't show up in the app until the next day's 11:00 UTC run, missing
-- an entire weekend's worth of same-day games. These add passes around
-- the actual game windows (times in UTC; ET is UTC-4 during EDT, UTC-5
-- during EST — chosen for EDT, when most of the fall season plays out):
--   Fri ~9:30pm ET (after evening games)       -> Sat 01:30 UTC
--   Sat ~8:00am ET (early)                     -> Sat 12:00 UTC
--   Sat ~1:00pm ET (after morning games)       -> Sat 17:00 UTC
--   Sun ~8:00am ET (early)                     -> Sun 12:00 UTC
--   Sun ~9:30pm ET (after evening games)       -> Mon 01:30 UTC
-- Same auth/URL pattern as the existing daily cron — see that
-- migration's own comment and sync-ncsa-schedule/index.ts for why this
-- uses the legacy service_role JWT literal rather than the newer
-- Vault-secret pattern sync-ncsa-reports uses: a deliberate, already-
-- reasoned-through choice in this codebase, not something to change
-- as a drive-by "improvement" here.

SELECT cron.schedule(
  'sync-ncsa-schedule-fri-night',
  '30 1 * * 6', -- Saturday 01:30 UTC = Friday ~9:30pm ET
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

SELECT cron.schedule(
  'sync-ncsa-schedule-sat-morning',
  '0 12 * * 6', -- Saturday 12:00 UTC = ~8:00am ET
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

SELECT cron.schedule(
  'sync-ncsa-schedule-sat-afternoon',
  '0 17 * * 6', -- Saturday 17:00 UTC = ~1:00pm ET
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

SELECT cron.schedule(
  'sync-ncsa-schedule-sun-morning',
  '0 12 * * 0', -- Sunday 12:00 UTC = ~8:00am ET
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

SELECT cron.schedule(
  'sync-ncsa-schedule-sun-night',
  '30 1 * * 1', -- Monday 01:30 UTC = Sunday ~9:30pm ET
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
