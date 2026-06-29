-- Email logs (track sent blasts)
create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  sent_by uuid references profiles(id),
  subject text not null,
  body text not null,
  recipient_count int not null default 0,
  team_ids uuid[] default '{}',
  team_names text[] default '{}',
  sent_at timestamptz default now()
);

alter table email_logs enable row level security;

create policy "Club members can view their email logs"
  on email_logs for select
  using (club_id = (select club_id from profiles where id = auth.uid()));

create policy "Coaches and above can insert email logs"
  on email_logs for insert
  with check (club_id = (select club_id from profiles where id = auth.uid()));

-- Waivers
create table if not exists waivers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade not null,
  title text not null,
  body text not null,
  required_by date,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table waivers enable row level security;

create policy "Club members can view waivers"
  on waivers for select
  using (club_id = (select club_id from profiles where id = auth.uid()));

create policy "Org admins can manage waivers"
  on waivers for all
  using (
    club_id = (select club_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('org_admin', 'app_admin')
  );

-- Waiver team assignments
create table if not exists waiver_assignments (
  id uuid primary key default gen_random_uuid(),
  waiver_id uuid references waivers(id) on delete cascade not null,
  team_id uuid references teams(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(waiver_id, team_id)
);

alter table waiver_assignments enable row level security;

create policy "Club members can view waiver assignments"
  on waiver_assignments for select
  using (
    waiver_id in (select id from waivers where club_id = (select club_id from profiles where id = auth.uid()))
  );

create policy "Org admins can manage waiver assignments"
  on waiver_assignments for all
  using (
    waiver_id in (select id from waivers where club_id = (select club_id from profiles where id = auth.uid()))
    and (select role from profiles where id = auth.uid()) in ('org_admin', 'app_admin')
  );

-- Waiver signatures (signed by parent on behalf of player)
create table if not exists waiver_signatures (
  id uuid primary key default gen_random_uuid(),
  waiver_id uuid references waivers(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  signed_by_name text not null,
  signed_at timestamptz default now(),
  unique(waiver_id, player_id)
);

alter table waiver_signatures enable row level security;

create policy "Club members can view waiver signatures"
  on waiver_signatures for select
  using (
    waiver_id in (select id from waivers where club_id = (select club_id from profiles where id = auth.uid()))
  );

create policy "Anyone can insert a waiver signature"
  on waiver_signatures for insert
  with check (true);
