-- =====================================================================
-- TRYOUT MODULE — 12 tables for the full tryout management flow
-- registration → ranking → team building → offer letters → acceptance
-- =====================================================================

-- Helper: is current user org_admin or app_admin for a given club?
create or replace function public.is_club_admin(cid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and club_id = cid
      and role in ('org_admin','app_admin')
  );
$$;

-- ── 1. TRYOUT_PLAYERS ────────────────────────────────────────────────
create table public.tryout_players (
  id                              uuid primary key default gen_random_uuid(),
  club_id                         uuid references public.clubs(id) on delete cascade not null,

  -- Identity
  first_name                      text not null,
  last_name                       text not null,
  full_name                       text generated always as (first_name || ' ' || last_name) stored,
  date_of_birth                   date,
  birth_year                      int generated always as (extract(year from date_of_birth)::int) stored,
  grade                           text,
  gender                          text check (gender in ('Male','Female')),

  -- Contact
  parent_name                     text,
  email_primary                   text,
  email_secondary                 text,
  phone                           text,
  town                            text,
  current_team                    text,

  -- Tryout logistics
  positions                       text[],
  tryout_date                     date,
  final_age_group                 text,
  age_group_override              boolean default false,
  source                          text check (source in ('registration','coach','both')) default 'registration',
  tryout_session                  text,
  season_label                    text,
  maroons_status                  text check (maroons_status in ('new','current','returning','unknown')) default 'unknown',

  -- Flags
  is_duplicate_flagged            boolean default false,
  duplicate_of                    uuid references public.tryout_players(id) on delete set null,
  maybe_flag                      boolean default false,
  early_decision_request          boolean default false,
  early_decision_details          text,

  -- Medical / kit
  medical_notes                   text,
  image_permission                boolean default false,
  jersey_size                     text,
  shorts_size                     text,

  -- School
  school_attending                text,

  -- Emergency contact
  emergency_contact_name          text,
  emergency_contact_phone         text,
  emergency_contact_relationship  text,

  -- Marketing
  referral_source                 text,

  -- Overflow
  notes                           text,
  custom_responses                jsonb default '{}',

  created_at                      timestamptz default now()
);

-- ── 2. TRYOUT_RANKINGS ───────────────────────────────────────────────
create table public.tryout_rankings (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid references public.clubs(id) on delete cascade not null,
  player_id           uuid references public.tryout_players(id) on delete cascade not null,
  coach_rank          int,
  tryout_rank         int,
  tryout_status       text check (tryout_status in ('NTR','NS')),
  ranking_age_group   text,
  combined_score      numeric(5,2),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique(club_id, player_id)
);

-- ── 3. TRYOUT_ASSIGNMENTS ────────────────────────────────────────────
create table public.tryout_assignments (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid references public.clubs(id) on delete cascade not null,
  player_id           uuid references public.tryout_players(id) on delete cascade not null,
  team                text,
  status              text check (status in ('Unassigned','Offer','Waitlist','Rejected','Accepted','Declined')) default 'Unassigned',
  declined_reason     text,
  declined_note       text,
  offer_token         uuid unique default gen_random_uuid(),
  offer_status        text check (offer_status in ('NotSent','Sent','Accepted','Declined')) default 'NotSent',
  offer_sent_at       timestamptz,
  offer_responded_at  timestamptz,
  reminder_sent_at    timestamptz,
  reminder_count      int default 0,
  created_at          timestamptz default now(),
  unique(club_id, player_id)
);

-- ── 4. TRYOUT_TEAMS ──────────────────────────────────────────────────
create table public.tryout_teams (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references public.clubs(id) on delete cascade not null,
  name        text not null,
  color       text default '#22C55E',
  logo_url    text,
  age_group   text,
  gender      text check (gender in ('Male','Female','Mixed')),
  format      text check (format in ('7v7','9v9','11v11')),
  tier        text check (tier in ('A','B','C','D','')),
  sort_order  int default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ── 5. TRYOUT_COACHES ────────────────────────────────────────────────
create table public.tryout_coaches (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references public.clubs(id) on delete cascade not null,
  full_name   text not null,
  email       text,
  phone       text,
  license     text,
  hourly_rate numeric(8,2) default 100,
  is_active   boolean default true,
  notes       text,
  created_at  timestamptz default now()
);

-- ── 6. TRYOUT_COACH_ASSIGNMENTS ──────────────────────────────────────
create table public.tryout_coach_assignments (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references public.clubs(id) on delete cascade not null,
  coach_id    uuid references public.tryout_coaches(id) on delete cascade not null,
  age_group   text,
  gender      text,
  team        text,
  role        text check (role in ('head','assistant')) default 'head',
  created_at  timestamptz default now()
);

-- ── 7. TRYOUT_PRACTICE_SLOTS ─────────────────────────────────────────
create table public.tryout_practice_slots (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid references public.clubs(id) on delete cascade not null,
  season_label text,
  age_group    text,
  gender       text,
  team         text,
  field_name   text,
  sub_zone     text,
  day_of_week  text check (day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  start_time   time,
  end_time     time,
  notes        text,
  created_at   timestamptz default now()
);

-- ── 8. TRYOUT_GAMES ──────────────────────────────────────────────────
create table public.tryout_games (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid references public.clubs(id) on delete cascade not null,
  season_label   text,
  age_group      text,
  gender         text,
  team           text,
  opponent_name  text,
  is_home_game   boolean default true,
  game_date      date,
  start_time     time,
  end_time       time,
  field_name     text,
  sub_zone       text,
  away_location  text,
  league         text,
  coach_id       uuid references public.tryout_coaches(id) on delete set null,
  status         text check (status in ('unscheduled','scheduled','rescheduled','cancelled','completed')) default 'unscheduled',
  notes          text,
  created_at     timestamptz default now()
);

-- ── 9. TRYOUT_EXPENSES ───────────────────────────────────────────────
create table public.tryout_expenses (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid references public.clubs(id) on delete cascade not null,
  season_label text,
  category     text check (category in (
    'League Fees','Referee Fees','Pro Coaching Fees','Tournament Fees','Field Rental',
    'Uniforms & Kit','Equipment','Insurance','Coach Stipends',
    'Coach Education & Licensing','Background Checks','Travel & Lodging',
    'Trainers & Medical','Marketing & Website','Software & Admin',
    'Awards & End-of-Season','Facility & Indoor Training',
    'Bank & Payment Fees','Miscellaneous'
  )) not null,
  description  text,
  amount       numeric(10,2) not null default 0,
  notes        text,
  created_at   timestamptz default now()
);

-- ── 10. TRYOUT_FORM_CONFIG (singleton per club) ──────────────────────
create table public.tryout_form_config (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid references public.clubs(id) on delete cascade not null,
  season_label text,
  config_json  jsonb not null default '{}',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(club_id)
);

-- ── 11. TRYOUT_OFFER_SETTINGS (singleton per club) ───────────────────
create table public.tryout_offer_settings (
  id                        uuid primary key default gen_random_uuid(),
  club_id                   uuid references public.clubs(id) on delete cascade not null,
  teamsnap_registration_url text,
  email_subject             text default 'Your Roster Offer',
  from_name                 text,
  offer_deadline            timestamptz,
  email_body_html           text,
  email_body_html_u8        text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),
  unique(club_id)
);

-- ── 12. TRYOUT_EMAIL_TEMPLATES ───────────────────────────────────────
create table public.tryout_email_templates (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid references public.clubs(id) on delete cascade not null,
  template_key text check (template_key in ('waitlist','decline','reminder')) not null,
  subject      text not null,
  from_name    text,
  body_html    text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(club_id, template_key)
);

-- ── TRIGGERS for updated_at ──────────────────────────────────────────
create trigger trg_tryout_rankings_updated_at
  before update on public.tryout_rankings
  for each row execute function public.set_updated_at();

create trigger trg_tryout_form_config_updated_at
  before update on public.tryout_form_config
  for each row execute function public.set_updated_at();

create trigger trg_tryout_offer_settings_updated_at
  before update on public.tryout_offer_settings
  for each row execute function public.set_updated_at();

create trigger trg_tryout_email_templates_updated_at
  before update on public.tryout_email_templates
  for each row execute function public.set_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────
alter table public.tryout_players           enable row level security;
alter table public.tryout_rankings          enable row level security;
alter table public.tryout_assignments       enable row level security;
alter table public.tryout_teams             enable row level security;
alter table public.tryout_coaches           enable row level security;
alter table public.tryout_coach_assignments enable row level security;
alter table public.tryout_practice_slots    enable row level security;
alter table public.tryout_games             enable row level security;
alter table public.tryout_expenses          enable row level security;
alter table public.tryout_form_config       enable row level security;
alter table public.tryout_offer_settings    enable row level security;
alter table public.tryout_email_templates   enable row level security;

-- tryout_players: public INSERT (registration form is unauthenticated)
create policy "public insert tryout_players"
  on public.tryout_players for insert with check (true);

create policy "club staff select tryout_players"
  on public.tryout_players for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin update tryout_players"
  on public.tryout_players for update
  using (public.is_club_admin(club_id));

create policy "club admin delete tryout_players"
  on public.tryout_players for delete
  using (public.is_club_admin(club_id));

-- tryout_form_config: public SELECT (registration page reads without auth)
create policy "public select tryout_form_config"
  on public.tryout_form_config for select using (true);

create policy "club admin manage tryout_form_config"
  on public.tryout_form_config for all
  using (public.is_club_admin(club_id));

-- tryout_assignments: public SELECT by offer_token (for /offer-response)
-- The API route uses service role for the actual update, so just allow select here.
create policy "public select tryout_assignments by token"
  on public.tryout_assignments for select
  using (true);

create policy "club admin manage tryout_assignments"
  on public.tryout_assignments for all
  using (public.is_club_admin(club_id));

-- tryout_rankings
create policy "club staff select tryout_rankings"
  on public.tryout_rankings for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_rankings"
  on public.tryout_rankings for all
  using (public.is_club_admin(club_id));

-- tryout_teams
create policy "club staff select tryout_teams"
  on public.tryout_teams for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_teams"
  on public.tryout_teams for all
  using (public.is_club_admin(club_id));

-- tryout_coaches
create policy "club staff select tryout_coaches"
  on public.tryout_coaches for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_coaches"
  on public.tryout_coaches for all
  using (public.is_club_admin(club_id));

-- tryout_coach_assignments
create policy "club staff select tryout_coach_assignments"
  on public.tryout_coach_assignments for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_coach_assignments"
  on public.tryout_coach_assignments for all
  using (public.is_club_admin(club_id));

-- tryout_practice_slots
create policy "club staff select tryout_practice_slots"
  on public.tryout_practice_slots for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_practice_slots"
  on public.tryout_practice_slots for all
  using (public.is_club_admin(club_id));

-- tryout_games
create policy "club staff select tryout_games"
  on public.tryout_games for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_games"
  on public.tryout_games for all
  using (public.is_club_admin(club_id));

-- tryout_expenses
create policy "club staff select tryout_expenses"
  on public.tryout_expenses for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_expenses"
  on public.tryout_expenses for all
  using (public.is_club_admin(club_id));

-- tryout_offer_settings
create policy "club staff select tryout_offer_settings"
  on public.tryout_offer_settings for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_offer_settings"
  on public.tryout_offer_settings for all
  using (public.is_club_admin(club_id));

-- tryout_email_templates
create policy "club staff select tryout_email_templates"
  on public.tryout_email_templates for select
  using (club_id in (
    select club_id from public.profiles
    where id = auth.uid() and role in ('org_admin','coach','app_admin')
  ));

create policy "club admin manage tryout_email_templates"
  on public.tryout_email_templates for all
  using (public.is_club_admin(club_id));

-- ── INDEXES ──────────────────────────────────────────────────────────
create index on public.tryout_players (club_id);
create index on public.tryout_players (club_id, final_age_group);
create index on public.tryout_players (club_id, gender);
create index on public.tryout_players (club_id, season_label);
create index on public.tryout_rankings (club_id, player_id);
create index on public.tryout_assignments (club_id, team);
create index on public.tryout_assignments (offer_token);
create index on public.tryout_games (club_id, game_date);
create index on public.tryout_expenses (club_id, season_label);

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

-- Allow anonymous users to create assignment row when submitting registration form
create policy "public insert tryout_assignments"
  on public.tryout_assignments for insert
  with check (true);
