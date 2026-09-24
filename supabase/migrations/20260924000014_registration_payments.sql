-- Each registration_installments row becomes independently payable via its
-- own link, mirroring player_fees.payment_token but scoped to pre-roster
-- registration submissions (which may never get a player_id/team_id, e.g.
-- a club-wide form nobody has approved onto a roster yet).
alter table public.registration_installments
  add column if not exists payment_token uuid unique default gen_random_uuid(),
  add column if not exists reminder_sent_at timestamptz;

create index if not exists registration_installments_submission_idx
  on public.registration_installments (submission_id);
