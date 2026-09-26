-- Daily sync of NCSA's own club-admin reports (fines, overlaps, gaps,
-- missing scores, TBS games) for every club with a connected
-- club_ncsa_admin_credentials row. Runs 20 minutes after the existing
-- schedule sync (20260924000002_ncsa_sync_cron.sql, 11:00 UTC) so a
-- club's events/team_ncsa_links data is fresh before this cross-
-- references it for team-name resolution.
--
-- Unlike that cron, this one authenticates with a dedicated secret
-- (matching the edge function's own NCSA_REPORTS_CRON_KEY, set via
-- `supabase secrets set` — a Deno env var, invisible to Postgres) kept in
-- Vault under the name 'ncsa_reports_cron_key' and read at call time via
-- vault.decrypted_secrets, rather than hardcoded in this migration file
-- the way the schedule-sync cron's JWT was.
select cron.schedule(
  'sync-ncsa-reports-daily',
  '20 11 * * *',
  $$
  select net.http_post(
    url := 'https://nandbuwogaxmrzsstttd.supabase.co/functions/v1/sync-ncsa-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ncsa_reports_cron_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
