-- Stripe Connect Express per-club accounts
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded  boolean DEFAULT false;
