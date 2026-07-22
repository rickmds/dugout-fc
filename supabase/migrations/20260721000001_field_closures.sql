-- ── Field closures ────────────────────────────────────────────────────────────

create table if not exists public.field_closures (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid references public.clubs(id) on delete cascade not null,
  field_name          text not null,
  sub_zones           text[] default '{}',   -- empty = whole field
  closed_from         timestamptz not null,
  closed_until        timestamptz,           -- null = indefinite
  duration_label      text check (duration_label in ('rest_of_day','hours','date_range','indefinite')),
  reason              text,
  notify_message      text,
  emails_sent_at      timestamptz,
  emails_sent_count   int default 0,
  push_sent           boolean default false,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz default now()
);

-- ── Coach acknowledgements ─────────────────────────────────────────────────────

create table if not exists public.field_closure_acknowledgements (
  id              uuid primary key default gen_random_uuid(),
  closure_id      uuid references public.field_closures(id) on delete cascade not null,
  coach_profile_id uuid references public.profiles(id),
  coach_email     text not null,
  coach_name      text,
  acknowledged_at timestamptz default now(),
  unique (closure_id, coach_email)
);

-- ── Closure templates ──────────────────────────────────────────────────────────

create table if not exists public.field_closure_templates (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid references public.clubs(id) on delete cascade not null,
  name             text not null,              -- "Standard Rain Closure"
  reason           text,
  message_template text,
  duration_label   text check (duration_label in ('rest_of_day','hours','date_range','indefinite')),
  created_at       timestamptz default now()
);

-- ── Season field availability rules ───────────────────────────────────────────
-- Recurring windows where a field/zone is unavailable (e.g. maintenance every Friday 3-5pm)

create table if not exists public.field_availability_rules (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid references public.clubs(id) on delete cascade not null,
  field_name       text not null,
  sub_zone         text,                       -- null = whole field
  day_of_week      text check (day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')) not null,
  unavailable_from time not null,
  unavailable_until time not null,
  label            text,                       -- "Groundskeeping", "Booked for external use"
  season_label     text,
  created_at       timestamptz default now()
);

-- ── Add lat/lng and timezone to clubs ──────────────────────────────────────────

alter table public.clubs
  add column if not exists latitude  numeric,
  add column if not exists longitude numeric,
  add column if not exists timezone  text default 'America/New_York';

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.field_closures enable row level security;
alter table public.field_closure_acknowledgements enable row level security;
alter table public.field_closure_templates enable row level security;
alter table public.field_availability_rules enable row level security;

-- field_closures: public read (for public status page), club admin write
create policy "field_closures_public_read" on public.field_closures
  for select using (true);

create policy "field_closures_admin_all" on public.field_closures
  for all using (
    exists (select 1 from public.profiles
      where id = auth.uid() and club_id = field_closures.club_id
      and role in ('org_admin','app_admin','coach'))
  );

-- acknowledgements: public insert (no-login link), club admin read
create policy "ack_public_insert" on public.field_closure_acknowledgements
  for insert with check (true);

create policy "ack_admin_read" on public.field_closure_acknowledgements
  for select using (
    exists (select 1 from public.profiles
      where id = auth.uid()
      and role in ('org_admin','app_admin','coach'))
  );

-- templates: club staff read/write
create policy "templates_club_all" on public.field_closure_templates
  for all using (
    exists (select 1 from public.profiles
      where id = auth.uid() and club_id = field_closure_templates.club_id
      and role in ('org_admin','app_admin','coach'))
  );

-- availability rules: public read, club admin write
create policy "avail_rules_public_read" on public.field_availability_rules
  for select using (true);

create policy "avail_rules_admin_all" on public.field_availability_rules
  for all using (
    exists (select 1 from public.profiles
      where id = auth.uid() and club_id = field_availability_rules.club_id
      and role in ('org_admin','app_admin'))
  );
