-- Lets the NCSA sync auto-populate the Fields directory from venue data
-- it already scrapes onto events (location/address/field_type/
-- field_notes) without ever fighting a club's own manual edits.
-- Mirrors the events.external_source/external_id pattern already
-- established for games.
--
-- A sync only ever creates/updates rows it owns (external_source='ncsa'):
-- it never touches a field the admin created by hand, and it never
-- touches the admin's own scheduling config on a row it owns either
-- (field_group/is_full_field/rental_cost_per_hour/etc — those columns are
-- simply left alone once a row exists). If an admin "deletes" an
-- NCSA-sourced field that's no longer in use, ncsa_dismissed is set
-- instead of a hard delete, so the next sync doesn't silently recreate
-- it.
alter table public.tryout_fields
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists ncsa_dismissed boolean not null default false;

create unique index if not exists tryout_fields_external_unique
  on public.tryout_fields (club_id, external_source, external_id)
  where external_source is not null;
