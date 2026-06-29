-- Add roster_locked to tryout_teams
alter table public.tryout_teams
  add column if not exists roster_locked boolean default false;

-- Fields management table
create table if not exists public.tryout_fields (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid references public.clubs(id) on delete cascade not null,
  name       text not null,
  sub_zones  text[] default '{}',
  is_active  boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table public.tryout_fields enable row level security;

create policy "club staff select tryout_fields"
  on public.tryout_fields for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_fields"
  on public.tryout_fields for all
  using (public.is_club_admin(club_id));

-- Add coach_id to tryout_teams so Team Builder can show assigned coach
alter table public.tryout_teams
  add column if not exists head_coach_id uuid references public.tryout_coaches(id) on delete set null;
