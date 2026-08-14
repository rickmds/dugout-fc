-- Venmo is the primary way coach-collected fees actually get paid —
-- add it as an explicit payment method instead of forcing coaches to
-- log it as "Other".
alter table public.fee_payments drop constraint fee_payments_method_check;
alter table public.fee_payments add constraint fee_payments_method_check
  check (method in ('cash', 'bank_transfer', 'card', 'cheque', 'stripe', 'venmo', 'other'));
