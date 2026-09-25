-- charge.refunded / charge.dispute.* webhooks only ever credited
-- fee_payments — registration_installments and tryout_installments had no
-- refund/dispute tracking at all, so a refund or chargeback on one of
-- those charges silently vanished (still shown as paid forever, no admin
-- notified). These columns mirror the fields already used on fee_payments.

alter table public.registration_installments
  add column if not exists refunded_amount numeric not null default 0,
  add column if not exists last_refund_id text,
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_status text;

alter table public.tryout_installments
  add column if not exists refunded_amount numeric not null default 0,
  add column if not exists last_refund_id text,
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_status text;
