-- Card network rules (and several state laws) require that a surcharge
-- collected from a payer be returned in full on a full refund, and
-- prorated on a partial refund — it can't just sit with the club/platform
-- once the underlying fee is being reversed. To do that correctly we need
-- to know, per payment, whether the surcharge was actually charged to the
-- payer (pass_on) as opposed to absorbed by the club (absorb) — only the
-- former needs any surcharge returned.
alter table fee_payments add column surcharge_passed_to_payer boolean not null default false;
alter table fee_payments add column refunded_surcharge numeric not null default 0;

-- fee_refunds.amount was always the base-fee-portion refunded (what
-- decrements player_fees.amount_paid); surcharge_amount is the additional,
-- separately-tracked surcharge portion returned to the payer's card in the
-- same refund — it does not touch amount_paid, since the surcharge was
-- never part of amount_due to begin with.
alter table fee_refunds add column surcharge_amount numeric not null default 0;
