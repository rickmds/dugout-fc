-- Separates "what the payer was actually charged" (fee_charged — drives
-- refund proration and receipts) from "what Pulse actually collected via
-- application_fee_amount" (platform_fee_collected — the real revenue
-- number). These were always equal until the debit-card surcharge fix:
-- a debit card can't be surcharged, so the payer is charged $0 extra, but
-- Pulse still takes its normal fee out of the club's share rather than
-- eating that cost itself — fee_charged alone no longer reflects Pulse's
-- true take for that case.
alter table fee_payments add column platform_fee_collected numeric;
