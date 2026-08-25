-- Refund support, layered on top of the rail-based fee model
-- (20260817000001_rail_based_fee_model.sql).
--
-- refunded_amount is cumulative on fee_payments so repeated partial
-- refunds against the same payment stay bounded without double-refunding.
-- fee_refunds is the audit trail — one row per refund, whether it was
-- issued from our own UI (mode 'full'/'percent'/'amount') or reflected
-- back from a Stripe-dashboard-initiated refund via the charge.refunded
-- webhook (mode 'external'). stripe_refund_id is unique so the webhook
-- can insert idempotently even if Stripe redelivers the event.
alter table fee_payments add column refunded_amount numeric not null default 0;

create table fee_refunds (
  id                uuid primary key default gen_random_uuid(),
  fee_payment_id    uuid references fee_payments(id) on delete cascade not null,
  player_fee_id     uuid references player_fees(id) not null,
  amount            numeric not null,
  mode              text check (mode in ('full', 'percent', 'amount', 'external')) not null,
  stripe_refund_id  text unique,
  reason            text,
  refunded_by       uuid references profiles(id),
  created_at        timestamptz default now()
);

alter table fee_refunds enable row level security;

-- Read-only for club staff — same visibility as fee_payments. All writes
-- go through the service-role refund API route / webhook, not the client.
create policy "coaches read fee refunds" on fee_refunds for select using (
  player_fee_id in (
    select pf.id from player_fees pf where pf.team_id in (
      select tm.team_id from team_members tm where tm.profile_id = auth.uid() and tm.role in ('coach','org_admin')
      union
      select t.id from teams t join profiles p on p.club_id = t.club_id where p.id = auth.uid() and p.role in ('org_admin','app_admin')
    )
  )
);
