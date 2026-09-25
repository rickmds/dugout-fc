-- Admin-initiated refunds for registration_installments (previously only
-- reachable via a Stripe-dashboard-issued refund hitting the webhook).
-- Same concurrency guard as fee_payments.refund_pending: claimed before
-- calling Stripe, released in a finally, so two concurrent refund clicks
-- can't both hit Stripe for the same installment.
alter table public.registration_installments
  add column if not exists refund_pending boolean not null default false;
