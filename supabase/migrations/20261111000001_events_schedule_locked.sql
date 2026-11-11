-- A coach editing a game's date/time/location/etc. on an NCSA-synced event
-- used to be silently reverted on the next schedule sync — that sync
-- unconditionally overwrites those same fields from the league feed on
-- every run, with no concept of a manual correction. This flag, set by
-- edit-event.tsx the moment a coach actually changes one of the fields
-- sync-ncsa-schedule also writes, tells that sync to leave this game's
-- schedule fields alone from then on (score and bookkeeping columns still
-- sync normally — those were never coach-editable in the first place).
alter table public.events
  add column if not exists schedule_locked boolean not null default false;
