-- Real payment collection for tryout offers, mirroring registration_installments
-- but tied to tryout_assignments instead of a registration_submissions row —
-- there's no equivalent "submission" concept here, and forcing one would
-- conflate two genuinely different flows. Kept as a deliberately parallel
-- system to registration_installments rather than a shared table, same
-- reasoning as why registration payments don't reuse player_fees: the
-- parent entity shape is different enough that a shared table would need
-- an awkward polymorphic FK.
create table public.tryout_installments (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid references public.tryout_assignments(id) on delete cascade not null,
  label             text not null,
  amount            numeric(10,2) not null,
  due_date          date,
  paid_at           timestamptz,
  payment_method    text check (payment_method in ('stripe','cash','bank_transfer','cheque','other')),
  reference         text,
  payment_token     uuid unique default gen_random_uuid(),
  reminder_sent_at  timestamptz,
  charge_attempts   int not null default 0,
  last_charge_error text,
  created_at        timestamptz default now()
);

alter table public.tryout_installments enable row level security;

create policy "club staff select tryout_installments"
  on public.tryout_installments for select
  using (assignment_id in (
    select ta.id from public.tryout_assignments ta
    join public.profiles p on p.club_id = ta.club_id
    where p.id = auth.uid() and p.role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_installments"
  on public.tryout_installments for all
  using (assignment_id in (
    select id from public.tryout_assignments where public.is_club_admin(club_id)
  ));

create index on public.tryout_installments (assignment_id);

-- Autopay support — mirrors registration_submissions' equivalent columns,
-- but lives on the assignment since that's the closest thing to a
-- "submission" a tryout offer has.
alter table public.tryout_assignments
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists autopay_consent boolean not null default false;
