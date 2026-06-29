-- Fee categories (reusable templates per club)
CREATE TABLE fee_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  description text,
  amount      numeric(10,2) NOT NULL DEFAULT 0,
  currency    text NOT NULL DEFAULT 'usd',
  season      text,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now()
);

-- Player fee ledger (one row per fee assigned to a player)
CREATE TABLE player_fees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  team_id         uuid REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  category_id     uuid REFERENCES fee_categories(id) ON DELETE SET NULL,
  description     text NOT NULL,
  amount_due      numeric(10,2) NOT NULL DEFAULT 0,
  amount_paid     numeric(10,2) NOT NULL DEFAULT 0,
  discount        numeric(10,2) NOT NULL DEFAULT 0,
  discount_reason text,
  due_date        date,
  status          text CHECK (status IN ('outstanding','partial','paid','waived','overdue')) DEFAULT 'outstanding',
  notes           text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Individual payment records against a player_fee
CREATE TABLE fee_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_fee_id  uuid REFERENCES player_fees(id) ON DELETE CASCADE NOT NULL,
  amount         numeric(10,2) NOT NULL,
  method         text CHECK (method IN ('cash','bank_transfer','card','cheque','stripe','other')) DEFAULT 'cash',
  reference      text,
  notes          text,
  recorded_by    uuid REFERENCES profiles(id),
  paid_at        timestamptz DEFAULT now()
);

-- Auto-update updated_at on player_fees
CREATE OR REPLACE FUNCTION update_player_fees_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_player_fees_updated_at
  BEFORE UPDATE ON player_fees
  FOR EACH ROW EXECUTE FUNCTION update_player_fees_updated_at();

-- RLS
ALTER TABLE fee_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_fees    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments   ENABLE ROW LEVEL SECURITY;

-- fee_categories: club staff can read; org_admin/app_admin can write
CREATE POLICY "club staff read fee categories" ON fee_categories FOR SELECT USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role IN ('org_admin','coach','app_admin'))
);
CREATE POLICY "org_admin manage fee categories" ON fee_categories FOR ALL USING (
  club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role IN ('org_admin','app_admin'))
);

-- player_fees: accessible to coaches of the team or org_admin/app_admin of the club
CREATE POLICY "coaches read player fees" ON player_fees FOR SELECT USING (
  team_id IN (
    SELECT tm.team_id FROM team_members tm WHERE tm.profile_id = auth.uid() AND tm.role IN ('coach','org_admin')
    UNION
    SELECT t.id FROM teams t JOIN profiles p ON p.club_id = t.club_id WHERE p.id = auth.uid() AND p.role IN ('org_admin','app_admin')
  )
);
CREATE POLICY "coaches manage player fees" ON player_fees FOR ALL USING (
  team_id IN (
    SELECT tm.team_id FROM team_members tm WHERE tm.profile_id = auth.uid() AND tm.role IN ('coach','org_admin')
    UNION
    SELECT t.id FROM teams t JOIN profiles p ON p.club_id = t.club_id WHERE p.id = auth.uid() AND p.role IN ('org_admin','app_admin')
  )
);

-- fee_payments: same access as player_fees
CREATE POLICY "coaches read fee payments" ON fee_payments FOR SELECT USING (
  player_fee_id IN (
    SELECT pf.id FROM player_fees pf WHERE pf.team_id IN (
      SELECT tm.team_id FROM team_members tm WHERE tm.profile_id = auth.uid() AND tm.role IN ('coach','org_admin')
      UNION
      SELECT t.id FROM teams t JOIN profiles p ON p.club_id = t.club_id WHERE p.id = auth.uid() AND p.role IN ('org_admin','app_admin')
    )
  )
);
CREATE POLICY "coaches manage fee payments" ON fee_payments FOR ALL USING (
  player_fee_id IN (
    SELECT pf.id FROM player_fees pf WHERE pf.team_id IN (
      SELECT tm.team_id FROM team_members tm WHERE tm.profile_id = auth.uid() AND tm.role IN ('coach','org_admin')
      UNION
      SELECT t.id FROM teams t JOIN profiles p ON p.club_id = t.club_id WHERE p.id = auth.uid() AND p.role IN ('org_admin','app_admin')
    )
  )
);
