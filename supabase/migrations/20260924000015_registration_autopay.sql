-- Lets a family opt in, when paying the first installment of a plan, to
-- have the remaining scheduled payments charged automatically instead of
-- clicking a fresh link each time. stripe_customer_id/stripe_payment_method_id
-- are only ever populated when there's actually a future installment to
-- charge (see /api/registration/create-payment-intent) — a one-time full
-- payment never creates a saved card.
alter table public.registration_submissions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists autopay_consent boolean not null default false;

-- Tracks off-session auto-charge attempts so a repeatedly-declining card
-- doesn't retry silently forever with no visibility for the club or family.
alter table public.registration_installments
  add column if not exists charge_attempts int not null default 0,
  add column if not exists last_charge_error text;
