-- Enable UUID extension
create extension if not exists "pgcrypto";

-- =====================
-- TABLES
-- =====================

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  primary_color text default '#000000',
  secondary_color text default '#ffffff',
  created_at timestamptz default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  full_name text,
  avatar_url text,
  role text check (role in ('app_admin','org_admin','coach','player')),
  preferred_language text default 'en',
  created_at timestamptz default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete cascade not null,
  name text not null,
  age_group text,
  season text,
  created_at timestamptz default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  full_name text not null,
  jersey_number int,
  position text,
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  role text check (role in ('coach','parent','player')),
  created_at timestamptz default now(),
  unique(team_id, profile_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  player_id uuid references public.players(id) on delete set null,
  email text not null,
  token text unique not null default gen_random_uuid()::text,
  accepted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  title text not null,
  type text check (type in ('game','training','other')) default 'training',
  event_date date not null,
  event_time time,
  location text,
  address text,
  lat numeric,
  lng numeric,
  rsvp_lock_at timestamptz,
  ai_suggested_lock_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  player_id uuid references public.players(id) on delete cascade not null,
  responded_by uuid references public.profiles(id) on delete set null,
  status text check (status in ('attending','not_attending')) not null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(event_id, player_id)
);

create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  formation text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table public.lineup_positions (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid references public.lineups(id) on delete cascade not null,
  player_id uuid references public.players(id) on delete cascade not null,
  x numeric not null,
  y numeric not null,
  position_label text
);

create table public.sub_plans (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid references public.lineups(id) on delete cascade not null,
  plan_json jsonb not null,
  created_at timestamptz default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  type text check (type in ('team_group','announcement','direct')) not null,
  title text,
  created_at timestamptz default now()
);

create table public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  unique(conversation_id, profile_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  title text not null,
  body text not null,
  pinned boolean default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  token text not null,
  platform text check (platform in ('ios','android')),
  created_at timestamptz default now(),
  unique(profile_id, token)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  type text not null,
  title text not null,
  body text,
  read boolean default false,
  data jsonb,
  created_at timestamptz default now()
);

create table public.player_development_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete cascade not null,
  coach_id uuid references public.profiles(id) on delete cascade not null,
  session_date date not null,
  notes text not null,
  created_at timestamptz default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete cascade not null,
  status text check (status in ('active','trialing','cancelled','past_due')) default 'trialing',
  plan text,
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at timestamptz,
  created_at timestamptz default now()
);

-- =====================
-- HELPER FUNCTIONS
-- =====================

-- Returns the authenticated user's role
create or replace function public.current_user_role()
returns text language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Returns the authenticated user's club_id
create or replace function public.current_user_club_id()
returns uuid language sql stable security definer as $$
  select club_id from public.profiles where id = auth.uid();
$$;

-- Returns true if the user is a member of the given team
create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and profile_id = auth.uid()
  );
$$;

-- Returns true if the user is a coach or above for the given team
create or replace function public.is_team_coach(p_team_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id
      and profile_id = auth.uid()
      and role = 'coach'
  ) or public.current_user_role() in ('org_admin','app_admin');
$$;

-- =====================
-- ROW LEVEL SECURITY
-- =====================

alter table public.clubs enable row level security;
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.team_members enable row level security;
alter table public.invites enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.lineups enable row level security;
alter table public.lineup_positions enable row level security;
alter table public.sub_plans enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.announcements enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;
alter table public.player_development_notes enable row level security;
alter table public.subscriptions enable row level security;

-- clubs
create policy "clubs_select" on public.clubs for select
  using (id = public.current_user_club_id() or public.current_user_role() = 'app_admin');

create policy "clubs_insert" on public.clubs for insert
  with check (public.current_user_role() in ('org_admin','app_admin'));

create policy "clubs_update" on public.clubs for update
  using (id = public.current_user_club_id() and public.current_user_role() in ('org_admin','app_admin'));

-- profiles
create policy "profiles_select_own" on public.profiles for select
  using (id = auth.uid() or public.current_user_role() in ('org_admin','coach','app_admin'));

create policy "profiles_insert_own" on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own" on public.profiles for update
  using (id = auth.uid());

-- teams
create policy "teams_select" on public.teams for select
  using (club_id = public.current_user_club_id() or public.current_user_role() = 'app_admin');

create policy "teams_insert" on public.teams for insert
  with check (club_id = public.current_user_club_id() and public.current_user_role() in ('org_admin','app_admin'));

create policy "teams_update" on public.teams for update
  using (club_id = public.current_user_club_id() and public.current_user_role() in ('org_admin','coach','app_admin'));

create policy "teams_delete" on public.teams for delete
  using (club_id = public.current_user_club_id() and public.current_user_role() in ('org_admin','app_admin'));

-- players
create policy "players_select" on public.players for select
  using (public.is_team_member(team_id) or public.current_user_role() = 'app_admin');

create policy "players_insert" on public.players for insert
  with check (public.is_team_coach(team_id));

create policy "players_update" on public.players for update
  using (public.is_team_coach(team_id));

create policy "players_delete" on public.players for delete
  using (public.is_team_coach(team_id));

-- team_members
create policy "team_members_select" on public.team_members for select
  using (public.is_team_member(team_id) or public.current_user_role() = 'app_admin');

create policy "team_members_insert" on public.team_members for insert
  with check (public.is_team_coach(team_id));

create policy "team_members_delete" on public.team_members for delete
  using (public.is_team_coach(team_id) or profile_id = auth.uid());

-- invites
create policy "invites_select" on public.invites for select
  using (public.is_team_coach(team_id) or public.current_user_role() = 'app_admin');

create policy "invites_insert" on public.invites for insert
  with check (public.is_team_coach(team_id));

create policy "invites_update" on public.invites for update
  using (public.is_team_coach(team_id));

-- events
create policy "events_select" on public.events for select
  using (public.is_team_member(team_id) or public.current_user_role() = 'app_admin');

create policy "events_insert" on public.events for insert
  with check (public.is_team_coach(team_id));

create policy "events_update" on public.events for update
  using (public.is_team_coach(team_id));

create policy "events_delete" on public.events for delete
  using (public.is_team_coach(team_id));

-- event_rsvps
create policy "rsvps_select" on public.event_rsvps for select
  using (exists (
    select 1 from public.events e where e.id = event_id and public.is_team_member(e.team_id)
  ));

create policy "rsvps_insert" on public.event_rsvps for insert
  with check (exists (
    select 1 from public.events e where e.id = event_id and public.is_team_member(e.team_id)
  ));

create policy "rsvps_update" on public.event_rsvps for update
  using (responded_by = auth.uid() or exists (
    select 1 from public.events e where e.id = event_id and public.is_team_coach(e.team_id)
  ));

-- lineups
create policy "lineups_select" on public.lineups for select
  using (exists (
    select 1 from public.events e where e.id = event_id and public.is_team_member(e.team_id)
  ));

create policy "lineups_insert" on public.lineups for insert
  with check (exists (
    select 1 from public.events e where e.id = event_id and public.is_team_coach(e.team_id)
  ));

create policy "lineups_update" on public.lineups for update
  using (exists (
    select 1 from public.events e where e.id = event_id and public.is_team_coach(e.team_id)
  ));

-- lineup_positions
create policy "lineup_positions_select" on public.lineup_positions for select
  using (exists (
    select 1 from public.lineups l
    join public.events e on e.id = l.event_id
    where l.id = lineup_id and public.is_team_member(e.team_id)
  ));

create policy "lineup_positions_insert" on public.lineup_positions for insert
  with check (exists (
    select 1 from public.lineups l
    join public.events e on e.id = l.event_id
    where l.id = lineup_id and public.is_team_coach(e.team_id)
  ));

create policy "lineup_positions_update" on public.lineup_positions for update
  using (exists (
    select 1 from public.lineups l
    join public.events e on e.id = l.event_id
    where l.id = lineup_id and public.is_team_coach(e.team_id)
  ));

create policy "lineup_positions_delete" on public.lineup_positions for delete
  using (exists (
    select 1 from public.lineups l
    join public.events e on e.id = l.event_id
    where l.id = lineup_id and public.is_team_coach(e.team_id)
  ));

-- sub_plans
create policy "sub_plans_select" on public.sub_plans for select
  using (exists (
    select 1 from public.lineups l
    join public.events e on e.id = l.event_id
    where l.id = lineup_id and public.is_team_member(e.team_id)
  ));

create policy "sub_plans_insert" on public.sub_plans for insert
  with check (exists (
    select 1 from public.lineups l
    join public.events e on e.id = l.event_id
    where l.id = lineup_id and public.is_team_coach(e.team_id)
  ));

-- conversations
create policy "conversations_select" on public.conversations for select
  using (exists (
    select 1 from public.conversation_participants
    where conversation_id = id and profile_id = auth.uid()
  ) or (team_id is not null and public.is_team_member(team_id)));

create policy "conversations_insert" on public.conversations for insert
  with check (
    (team_id is null) or public.is_team_coach(team_id)
  );

-- conversation_participants
create policy "conv_participants_select" on public.conversation_participants for select
  using (profile_id = auth.uid() or exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversation_id and cp.profile_id = auth.uid()
  ));

create policy "conv_participants_insert" on public.conversation_participants for insert
  with check (profile_id = auth.uid() or exists (
    select 1 from public.conversations c
    join public.teams t on t.id = c.team_id
    where c.id = conversation_id and public.is_team_coach(t.id)
  ));

-- messages
create policy "messages_select" on public.messages for select
  using (exists (
    select 1 from public.conversation_participants
    where conversation_id = messages.conversation_id and profile_id = auth.uid()
  ));

create policy "messages_insert" on public.messages for insert
  with check (
    sender_id = auth.uid() and exists (
      select 1 from public.conversation_participants
      where conversation_id = messages.conversation_id and profile_id = auth.uid()
    )
  );

-- announcements
create policy "announcements_select" on public.announcements for select
  using (public.is_team_member(team_id) or public.current_user_role() = 'app_admin');

create policy "announcements_insert" on public.announcements for insert
  with check (public.is_team_coach(team_id));

create policy "announcements_update" on public.announcements for update
  using (public.is_team_coach(team_id));

create policy "announcements_delete" on public.announcements for delete
  using (public.is_team_coach(team_id));

-- push_tokens
create policy "push_tokens_own" on public.push_tokens for all
  using (profile_id = auth.uid());

-- notifications
create policy "notifications_own" on public.notifications for all
  using (profile_id = auth.uid());

-- player_development_notes
create policy "dev_notes_select" on public.player_development_notes for select
  using (public.is_team_coach(team_id) or coach_id = auth.uid());

create policy "dev_notes_insert" on public.player_development_notes for insert
  with check (coach_id = auth.uid() and public.is_team_coach(team_id));

create policy "dev_notes_update" on public.player_development_notes for update
  using (coach_id = auth.uid());

create policy "dev_notes_delete" on public.player_development_notes for delete
  using (coach_id = auth.uid());

-- subscriptions
create policy "subscriptions_select" on public.subscriptions for select
  using (club_id = public.current_user_club_id() or public.current_user_role() = 'app_admin');

create policy "subscriptions_manage" on public.subscriptions for all
  using (public.current_user_role() = 'app_admin');

-- =====================
-- TRIGGERS
-- =====================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at on event_rsvps
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger event_rsvps_updated_at
  before update on public.event_rsvps
  for each row execute procedure public.set_updated_at();

-- =====================
-- STORAGE BUCKETS
-- =====================

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
insert into storage.buckets (id, name, public) values ('club-logos', 'club-logos', true);

create policy "avatars_upload" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "logos_upload" on storage.objects for insert
  with check (bucket_id = 'club-logos' and public.current_user_role() in ('org_admin','app_admin'));

create policy "logos_public_read" on storage.objects for select
  using (bucket_id = 'club-logos');
