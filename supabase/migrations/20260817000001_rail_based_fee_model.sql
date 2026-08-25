-- Rail-based payment processing fee model (card vs ACH, priced separately —
-- see web/lib/feeCalculator.ts). Replaces the single blended
-- stripe_surcharge_pct rate for any fee created after this migration.
--
-- fee_model_version is snapshotted on player_fees at row-creation time
-- (not read live off the club) so a family's existing instalment plan
-- never silently reprices if the global rate table changes later. All
-- rows in one plan_group_id are always inserted together in one batch, so
-- a plan can never straddle two versions.
alter table player_fees add column fee_model_version text;
update player_fees set fee_model_version = 'legacy_blended' where fee_model_version is null;
alter table player_fees alter column fee_model_version set default 'v2_rail_2026_08';
alter table player_fees alter column fee_model_version set not null;

-- fee_payments: which rail was used and the real charge/cost split, for
-- margin reporting only — platform_cost is never shown to a payer.
-- Null for cash/check/manual entries and for legacy_blended Stripe
-- payments made before this migration (no rail was ever selected for them).
alter table fee_payments add column payment_rail text check (payment_rail in ('card', 'ach'));
alter table fee_payments add column fee_charged numeric;
alter table fee_payments add column platform_cost numeric;
