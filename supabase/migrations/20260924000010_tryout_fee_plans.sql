-- Per-age-group (or club-wide default) cost + fully customizable installment
-- plan for tryout offers. age_group = '' represents the club-wide default,
-- used when no plan exists for a team's specific age group. A team's own
-- tryout_teams.season_fee/deposit_amount (added earlier) still overrides
-- this at the individual-team level when set.
create table public.tryout_fee_plans (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid references public.clubs(id) on delete cascade not null,
  age_group    text not null default '',
  season_fee   numeric(10,2),
  -- [{ "label": "Deposit", "amount": 300, "due_date": "2027-05-01" }, ...]
  installments jsonb not null default '[]',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (club_id, age_group)
);

alter table public.tryout_fee_plans enable row level security;

create policy "club staff select tryout_fee_plans"
  on public.tryout_fee_plans for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_fee_plans"
  on public.tryout_fee_plans for all
  using (public.is_club_admin(club_id));

create trigger trg_tryout_fee_plans_updated_at
  before update on public.tryout_fee_plans
  for each row execute function public.set_updated_at();

create index on public.tryout_fee_plans (club_id);
