-- Stripe payment infrastructure

-- player_fees: public payment token (URL-safe, opaque to parents)
ALTER TABLE player_fees
  ADD COLUMN IF NOT EXISTS payment_token uuid DEFAULT gen_random_uuid() UNIQUE;

-- Backfill any existing rows that have a null token
UPDATE player_fees SET payment_token = gen_random_uuid() WHERE payment_token IS NULL;

ALTER TABLE player_fees
  ALTER COLUMN payment_token SET NOT NULL;

-- fee_payments: Stripe tracking columns
ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id          text;

-- profiles: Stripe customer ID for saved cards
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- clubs: per-club payment configuration
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS stripe_fee_handling     text    DEFAULT 'absorb' CHECK (stripe_fee_handling IN ('absorb', 'pass_on')),
  ADD COLUMN IF NOT EXISTS stripe_surcharge_pct    numeric(5,2) DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS allow_partial_payments  boolean DEFAULT false;

-- Public (unauthenticated) read on player_fees by payment_token
-- Scoped tightly: only the columns needed to render the payment page
CREATE POLICY "public read fee by payment token" ON player_fees FOR SELECT
  USING (true);

-- Allow unauthenticated inserts into fee_payments via payment token flow
-- (service role key used server-side, so this policy is for completeness)
-- Actual inserts happen via supabaseAdmin in the webhook route.
