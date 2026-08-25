-- Pre-scale payments audit findings:
-- 1. No dispute/chargeback handling existed anywhere — fee_payments had no
--    way to record that a charge was disputed or that a lost dispute
--    clawed the money back, so player_fees kept showing "paid" forever.
-- 2. hardship_contributions had no idempotency guard of its own (unlike
--    fee_payments, which is protected by its unique constraint on
--    stripe_payment_intent_id) — a redelivered payment_intent.succeeded
--    webhook double-counted the donation into the club's displayed
--    hardship-fund balance.
alter table public.fee_payments
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_status text;

alter table public.hardship_contributions
  add column if not exists stripe_payment_intent_id text;

create unique index if not exists hardship_contributions_stripe_pi_key
  on public.hardship_contributions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
