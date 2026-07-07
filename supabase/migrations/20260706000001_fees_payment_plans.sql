-- Add payment plan / instalment support to player_fees
ALTER TABLE player_fees ADD COLUMN IF NOT EXISTS plan_group_id uuid;
ALTER TABLE player_fees ADD COLUMN IF NOT EXISTS installment_number integer;
ALTER TABLE player_fees ADD COLUMN IF NOT EXISTS installment_total integer;

-- Index for looking up instalments by plan
CREATE INDEX IF NOT EXISTS player_fees_plan_group_idx ON player_fees(plan_group_id) WHERE plan_group_id IS NOT NULL;
