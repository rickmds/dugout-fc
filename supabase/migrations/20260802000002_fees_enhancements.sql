-- Add last_reminded_at to player_fees so we can show "reminded X days ago"
ALTER TABLE player_fees ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

-- Fee reminder log — one row per reminder sent
CREATE TABLE IF NOT EXISTS fee_reminder_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_fee_id    uuid REFERENCES player_fees(id) ON DELETE CASCADE NOT NULL,
  sent_at          timestamptz DEFAULT now() NOT NULL,
  sent_by          uuid REFERENCES profiles(id),
  reminder_type    text CHECK (reminder_type IN ('overdue','due_soon','invoice','manual')) DEFAULT 'manual',
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE fee_reminder_log ENABLE ROW LEVEL SECURITY;

-- Club staff can read logs for their club's fees
CREATE POLICY "Club staff can view reminder logs"
  ON fee_reminder_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM player_fees pf
      JOIN players pl ON pl.id = pf.player_id
      JOIN teams t    ON t.id  = pl.team_id
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE pf.id = fee_reminder_log.player_fee_id
        AND pr.club_id = t.club_id
        AND pr.role IN ('org_admin','coach','app_admin')
    )
  );

-- Any authenticated club staff can insert
CREATE POLICY "Club staff can insert reminder logs"
  ON fee_reminder_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('org_admin','coach','app_admin')
    )
  );
