-- Tracks whether (and when) an evaluation's PDF was actually emailed to
-- its selected recipients, so the send script is idempotent — a rerun
-- skips anything already sent instead of emailing a family twice.
alter table player_evaluations
  add column if not exists sent_at timestamptz;
