-- Stripe delivers webhooks at-least-once — without a uniqueness backstop,
-- any retry (slow response, transient 5xx, network blip) replays the same
-- event and the webhook handler would insert a second fee_payments row and
-- double-credit player_fees.amount_paid. Manual (non-Stripe) payments have
-- no payment_intent_id and are unaffected — Postgres unique constraints
-- already treat multiple NULLs as distinct, so this only dedupes real
-- Stripe payments. No existing rows to reconcile: fee_payments currently
-- has zero Stripe-sourced rows in production.

ALTER TABLE fee_payments
  ADD CONSTRAINT fee_payments_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);
