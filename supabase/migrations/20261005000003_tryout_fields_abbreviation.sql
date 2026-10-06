-- NCSA's field directory report already gives an abbreviation for every
-- field (parsed into NcsaField.abbreviation) — it just was never stored.
-- Needed as a second matching key for backfillFieldAddresses in
-- sync-ncsa-reports, since the schedule report's per-game venue label
-- sometimes uses the short form rather than the field's full name.
alter table public.tryout_fields
  add column if not exists abbreviation text;
