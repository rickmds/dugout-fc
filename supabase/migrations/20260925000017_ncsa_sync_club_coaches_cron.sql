-- Daily sync of each NCSA-partner club's full coach roster (clubTeams.cfm,
-- via the club-level admin credential — reaches every coach on every
-- team, not just whichever coaches have connected their own personal
-- NCSA login). Runs 10 minutes after sync-ncsa-reports so the club's
-- team_ncsa_links data (used for context by other syncs) is settled
-- first, though this sync doesn't itself depend on it. Same dedicated
-- Vault-backed cron secret as sync-ncsa-reports — see that migration for
-- why this isn't a hardcoded literal.
select cron.schedule(
  'sync-ncsa-club-coaches-daily',
  '30 11 * * *',
  $$
  select net.http_post(
    url := 'https://nandbuwogaxmrzsstttd.supabase.co/functions/v1/ncsa-sync-club-coaches',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ncsa_reports_cron_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
