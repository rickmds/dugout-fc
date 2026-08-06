-- Late fee automation + hardship fund

-- Per-club late fee configuration
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS late_fee_enabled     boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_fee_type        text          DEFAULT 'fixed' CHECK (late_fee_type IN ('fixed','percent')),
  ADD COLUMN IF NOT EXISTS late_fee_amount      numeric(10,2) DEFAULT 10,
  ADD COLUMN IF NOT EXISTS late_fee_grace_days  integer       DEFAULT 7,
  ADD COLUMN IF NOT EXISTS hardship_fund_enabled boolean      DEFAULT false;

-- Track whether a late fee penalty has been added to a fee
ALTER TABLE player_fees
  ADD COLUMN IF NOT EXISTS late_fee_applied boolean DEFAULT false;

-- Hardship fund contributions — optional donations parents make at checkout
CREATE TABLE IF NOT EXISTS hardship_contributions (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid         REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  player_fee_id uuid         REFERENCES player_fees(id) ON DELETE SET NULL,
  amount        numeric(10,2) NOT NULL,
  created_at    timestamptz  DEFAULT now()
);

ALTER TABLE hardship_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view hardship contributions"
  ON hardship_contributions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND club_id = hardship_contributions.club_id
        AND role IN ('org_admin','app_admin')
    )
  );

CREATE POLICY "Service role can manage hardship contributions"
  ON hardship_contributions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
