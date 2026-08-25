-- Pre-scale payments audit finding: two concurrent refund requests for the
-- same fee_payment (double-click, or two admins acting at once) both read
-- the same refunded_amount, both pass the refundable-balance check, and
-- both hit Stripe for the same amount — Stripe processes both as long as
-- the sum doesn't exceed the original charge. This column lets the refund
-- route claim exclusive access before ever calling Stripe, using the same
-- compare-and-swap-on-write pattern already used for late_fee_applied.
alter table public.fee_payments
  add column if not exists refund_pending boolean not null default false;
