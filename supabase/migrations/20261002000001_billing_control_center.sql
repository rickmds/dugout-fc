-- Billing Control Center
--
-- Replaces three previously-hardcoded sources of truth with editable,
-- app_admin-only-writable rows, so pricing/fees/plan assignment no longer
-- require a code deploy to change:
--   - web/lib/plans.ts's PLAN_PRICING/PLAN_LIMITS/PLAN_FEATURES -> plans
--   - web/lib/feeCalculator.ts's DEFAULT_RAIL_FEE_CONFIG          -> platform_fee_rails
--   - (new) per-club comp/negotiated processing rate               -> club_fee_overrides
-- Also adds billing_cycle + custom price override columns to
-- subscriptions, and a small platform_settings key/value table for
-- global, non-fee settings (starting with default trial length).
--
-- This is a control-panel-only change: nothing here starts actually
-- charging a club. subscriptions.plan is still a manually-set label —
-- real club-subscription billing is a separate, later piece of work.

-- ============ plans ============
-- Publicly readable (marketing pricing page is logged-out; in-app upgrade
-- prompts need it from any club) — writable by app_admin only.
create table public.plans (
  id text primary key,
  label text not null,
  description text not null default '',
  monthly_price_cents integer not null default 0,
  annual_price_cents integer not null default 0,
  max_teams integer,              -- null = unlimited
  max_players integer,            -- null = unlimited
  ai_enabled boolean not null default true,
  fees_enabled boolean not null default true,
  branding_enabled boolean not null default true,
  tryouts_enabled boolean not null default true,
  team_limit_label text not null default '',
  player_limit_label text not null default 'Unlimited players',
  features jsonb not null default '[]'::jsonb,
  highlight boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy "plans_select" on public.plans for select
  using (true);

create policy "plans_manage" on public.plans for all
  using (public.current_user_role() = 'app_admin');

-- Seeded with the exact values previously hardcoded in web/lib/plans.ts and
-- web/app/pricing/page.tsx, so nothing changes in the app on migration day
-- — free's max_teams/max_players stay null (unlimited) even though its
-- display copy says "1 team, up to 12 players": that mismatch between
-- enforced limit and marketing copy already existed before this migration
-- and isn't something this migration changes.
insert into public.plans
  (id, label, description, monthly_price_cents, annual_price_cents, max_teams, max_players, ai_enabled, fees_enabled, branding_enabled, tryouts_enabled, team_limit_label, player_limit_label, features, highlight, sort_order)
values
  ('free', 'Free', 'Get started for free', 0, 0, null, null, true, true, true, true, '1 team', 'Up to 12 players',
    '["Schedule, roster & RSVP","Team, group & 1:1 chat","Manual lineup builder","1 team, up to 12 players"]'::jsonb, false, 0),
  ('team_pro', 'Team Pro', 'For single coaches and parent managers', 999, 9990, 1, null, true, true, true, false, '1 team', 'Unlimited players',
    '["Everything in Free","Unlimited players","Custom club branding","AI schedule import","AI roster import","AI lineup suggester","AI substitution planner","Fee collection & tracking"]'::jsonb, false, 1),
  ('starter', 'Starter', 'For small clubs with a handful of teams', 4900, 49000, 25, null, true, true, true, false, 'Up to 25 teams', 'Unlimited players',
    '["Everything in Team Pro","Up to 25 teams","Multi-team dashboard"]'::jsonb, true, 2),
  ('club', 'Club', 'For established clubs that run tryouts', 9900, 99000, 60, null, true, true, true, true, 'Up to 60 teams', 'Unlimited players',
    '["Everything in Starter","Up to 60 teams","Full tryout management","Tryout registration forms","Offer letters & acceptance tracking"]'::jsonb, false, 3),
  ('academy', 'Academy', 'For large academies with unlimited scale', 17900, 179000, null, null, true, true, true, true, 'Unlimited teams', 'Unlimited players',
    '["Everything in Club","Unlimited teams","Dedicated onboarding call","Custom subdomain","Early access to new features"]'::jsonb, false, 4);

-- ============ platform_fee_rails ============
-- Pulse's own payment-processing economics (what's charged to a club vs
-- Pulse's real underlying processor cost) per rail. App_admin only — this
-- is internal margin data, never exposed to a club.
create table public.platform_fee_rails (
  rail text primary key check (rail in ('card','ach')),
  charge_rate_pct numeric not null,
  charge_fixed numeric not null,
  charge_cap numeric,
  cost_rate_pct numeric not null,
  cost_fixed numeric not null,
  cost_cap numeric,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.platform_fee_rails enable row level security;

create policy "platform_fee_rails_all" on public.platform_fee_rails for all
  using (public.current_user_role() = 'app_admin');

-- Seeded with the exact values previously hardcoded in
-- web/lib/feeCalculator.ts's DEFAULT_RAIL_FEE_CONFIG.
insert into public.platform_fee_rails (rail, charge_rate_pct, charge_fixed, charge_cap, cost_rate_pct, cost_fixed, cost_cap) values
  ('card', 0.029, 0.80, null,   0.029, 0.30, null),
  ('ach',  0.015, 0,    40.00,  0.008, 0,    5.00);

-- ============ club_fee_overrides ============
-- Per-club comped/negotiated rate — charge side only; the real processor
-- cost above never varies by club. A null field means "use the platform
-- default" for that one field, so a partial override is normal.
create table public.club_fee_overrides (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  card_charge_rate_pct numeric,
  card_charge_fixed numeric,
  card_charge_cap numeric,
  ach_charge_rate_pct numeric,
  ach_charge_fixed numeric,
  ach_charge_cap numeric,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.club_fee_overrides enable row level security;

create policy "club_fee_overrides_all" on public.club_fee_overrides for all
  using (public.current_user_role() = 'app_admin');

-- ============ platform_settings ============
-- Small key/value store for global, non-fee platform settings — starts
-- with default trial length, room for more later without another migration.
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.platform_settings enable row level security;

create policy "platform_settings_all" on public.platform_settings for all
  using (public.current_user_role() = 'app_admin');

insert into public.platform_settings (key, value) values
  ('default_trial_days', '14'::jsonb);

-- ============ subscriptions: billing cycle + custom price override ============
-- Inherits the existing subscriptions_select/subscriptions_manage policies
-- (app_admin, or the club's own members for select) — no new policy needed.
alter table public.subscriptions
  add column billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
  add column custom_monthly_price_cents integer,
  add column custom_annual_price_cents integer;
