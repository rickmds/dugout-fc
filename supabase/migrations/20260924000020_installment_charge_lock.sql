-- Stress-test finding #4 (High): nothing prevented the on-session
-- create-payment-intent route and the off-session cron auto-charge from
-- both firing a real Stripe charge for the same installment at the same
-- time — see web/lib/installmentChargeLock.ts for the full reasoning.

alter table public.registration_installments
  add column if not exists charge_lock_at timestamptz;

alter table public.tryout_installments
  add column if not exists charge_lock_at timestamptz;
