-- The Finances page's "Fee Config" (projected reg fee / seasonal tuition
-- used for the revenue projection) was local component state only — it
-- reset to the hardcoded defaults on every page load, making the profit
-- projection unreliable the moment staff navigated away. Persist it,
-- scoped like tryout_expenses (per club + season).
create table public.tryout_finance_projections (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  season_label text not null,
  reg_fee     numeric,
  season_fee  numeric,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (club_id, season_label)
);

alter table public.tryout_finance_projections enable row level security;

create policy "Club staff can manage finance projections"
  on public.tryout_finance_projections for all
  using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));
