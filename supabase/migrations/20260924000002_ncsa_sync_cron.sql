-- Daily automatic NCSA schedule sync — picks up new games, reschedules
-- (rained-out games moving; NCSA keeps the same game id, confirmed against
-- real data), and games the league removes, for every team linked via
-- team_ncsa_links with sync_games = true. See supabase/functions/
-- sync-ncsa-schedule for the actual scrape/diff/notify logic.
-- Once daily (early morning) is enough — this is a schedule, not a
-- live-score feed, and NCSA's own site doesn't update more often than that.
SELECT cron.schedule(
  'sync-ncsa-schedule-daily',
  '0 11 * * *',
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
