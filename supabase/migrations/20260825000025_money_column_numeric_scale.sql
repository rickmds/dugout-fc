-- Pre-scale data-model audit finding: the original money columns are all
-- numeric(10,2). Every money column added in the Aug 17 refund/surcharge
-- work is a bare numeric with no scale — application code (round2() in
-- web/lib/refunds.ts) rounds to cents before writing, but the database no
-- longer enforces that, so a future write path that forgets to round could
-- silently accumulate sub-cent drift in a ledger other code treats as
-- exact. Row counts are small enough today that this scale change needs no
-- table rewrite.
alter table public.fee_payments
  alter column refunded_amount type numeric(10,2),
  alter column refunded_surcharge type numeric(10,2),
  alter column platform_fee_collected type numeric(10,2);

alter table public.fee_refunds
  alter column amount type numeric(10,2),
  alter column surcharge_amount type numeric(10,2);
