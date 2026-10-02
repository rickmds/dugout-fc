-- Plan feature catalog
--
-- Replaces each plan's free-text, copy-pasted "features" list with one
-- shared catalog: every feature is defined once and tagged with the
-- minimum plan tier it requires (drag-and-drop in Command Center moves a
-- feature's min_plan_id) — every plan at or above that tier includes it
-- automatically. No more manually re-typing "Everything in X, plus..." on
-- every plan.
--
-- `enforced_as` marks the small number of features that are actually
-- checked somewhere in the app (not just advertised): a value of 'fees' or
-- 'branding' means this catalog entry drives that PlanLimits flag; null
-- means it's display-only today (the bulk of the catalog — a phase-2
-- target to wire up one at a time, not something this migration attempts).
--
-- tryouts_enabled and ai_enabled on `plans` are deliberately NOT folded
-- into this catalog. tryouts' real current data is non-monotonic
-- (enabled on Free, disabled on Team Pro/Starter, enabled again on
-- Club/Academy) — a single "minimum tier" can't represent that without
-- silently taking the feature away from a live Free club, so it stays its
-- own flexible per-plan checkbox. ai_enabled isn't read anywhere in the
-- app today (confirmed: only 'branding' and 'fees' are ever passed to
-- canUse()) — left alone as out of scope, not worth touching.

create table public.plan_features (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  description text not null default '',
  min_plan_id text references public.plans(id) on delete set null, -- null = not included in any plan
  enforced_as text check (enforced_as in ('fees', 'branding')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plan_features enable row level security;

create policy "plan_features_select" on public.plan_features for select
  using (true);

create policy "plan_features_manage" on public.plan_features for all
  using (public.current_user_role() = 'app_admin');

-- Seeded from the real marketing copy on the pricing page, each tagged
-- with the lowest tier it currently appears at (every plan above also
-- gets it, matching the "Everything in X, plus..." pattern already used).
--
-- custom_branding and fee_collection are seeded at min_plan='free' to
-- match CURRENT REAL enforcement (plans.branding_enabled/fees_enabled
-- were true on every plan including Free, despite the pricing page
-- copy implying they start at Team Pro) — this migration preserves
-- actual existing behavior rather than silently matching the ad copy.
-- That mismatch is a pre-existing inconsistency, not something
-- introduced here; it's now a one-drag fix in Command Center if wanted.
insert into public.plan_features (key, label, min_plan_id, enforced_as, sort_order) values
  ('custom_branding', 'Custom club branding', 'free', 'branding', 10),
  ('fee_collection', 'Fee collection & tracking', 'free', 'fees', 20),
  ('ai_schedule_import', 'AI schedule import (PDF, image, spreadsheet)', 'team_pro', null, 30),
  ('ai_roster_import', 'AI roster import (any spreadsheet format)', 'team_pro', null, 40),
  ('ai_lineup_suggester', 'AI lineup suggester', 'team_pro', null, 50),
  ('match_tracker', 'Match tracker & equal play time', 'team_pro', null, 60),
  ('game_scores', 'Game scores + season W/L/D record', 'team_pro', null, 70),
  ('change_alerts', 'Automatic change alerts (time/location/cancel instant push)', 'team_pro', null, 80),
  ('video_library', 'Video recordings library', 'team_pro', null, 90),
  ('guest_management', 'Guest player management', 'team_pro', null, 100),
  ('attendance_streaks', 'Player attendance history & streaks', 'team_pro', null, 110),
  ('multi_team_dashboard', 'Unified multi-team dashboard', 'starter', null, 120),
  ('club_attendance_reporting', 'Club-wide attendance & RSVP reporting', 'starter', null, 130),
  ('ai_every_team', 'AI tools active across every team', 'starter', null, 140),
  ('unlimited_staff_logins', 'Unlimited coaches and staff logins', 'starter', null, 150),
  ('club_announcements', 'Club-wide announcement broadcasts', 'starter', null, 160),
  ('public_registration_forms', 'Public registration forms', 'club', null, 170),
  ('player_ranking_builder', 'Player ranking & drag-and-drop team builder', 'club', null, 180),
  ('offer_letters', 'Offer letters with accept/decline tracking', 'club', null, 190),
  ('waitlist_templates', 'Waitlist & decline email templates', 'club', null, 200),
  ('guest_activity_dashboard', 'Club-wide guest activity dashboard', 'club', null, 210),
  ('advanced_reports_export', 'Advanced season reports & export', 'club', null, 220),
  ('dedicated_onboarding', 'Dedicated onboarding call', 'academy', null, 230),
  ('custom_subdomain', 'Custom subdomain', 'academy', null, 240),
  ('early_access', 'Early access to new features', 'academy', null, 250);

-- Superseded by the catalog above.
alter table public.plans
  drop column branding_enabled,
  drop column fees_enabled,
  drop column features;
