-- ─── Event reminders cron job ────────────────────────────────────────────────
-- Requires pg_cron and pg_net to be enabled in Supabase dashboard:
--   Project Settings → Extensions → search "pg_cron" and "pg_net" → enable both
-- Then run: supabase db push
-- Fires at 8am UTC daily (≈ 4am US/Eastern).

SELECT cron.schedule(
  'event-reminders-daily-8am',
  '0 8 * * *',
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
