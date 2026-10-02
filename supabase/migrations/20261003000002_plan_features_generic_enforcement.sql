-- Phase 2: replace the fixed enforced_as ('fees'|'branding' only) column
-- with a plain is_enforced boolean. fees/branding move onto the same
-- generic "does this club's plan sort_order meet this feature's min_plan's
-- sort_order" check every other enforced feature now uses (plans.ts's
-- planHasCatalogFeature), instead of a hand-written special case — one
-- mechanism, not two, and it scales to any number of enforced features
-- without another migration each time.

alter table public.plan_features
  add column is_enforced boolean not null default false;

update public.plan_features set is_enforced = true
  where key in ('custom_branding', 'fee_collection');

alter table public.plan_features drop column enforced_as;

-- Phase 2's first real enforcement additions, confirmed via a Explore-agent
-- audit of actual call sites (web-only this round — mobile has no
-- plan-gating infrastructure yet, deliberately deferred):
--   ai_schedule_import / ai_roster_import -- gated at the UI button/modal,
--     not the shared /api/ai/parse-all route (also used by pre-signup
--     onboarding, which must stay ungated)
--   change_alerts -- gated server-side in /api/push-event, the one real
--     chokepoint across all 8 UI call sites that trigger it
--   club_attendance_reporting / advanced_reports_export -- same page
--     (reports/page.tsx) but different tiers: viewing vs. exporting
--   club_announcements -- gates the "club-wide" broadcast option
--     specifically, not the announcements feature as a whole
--   public_registration_forms -- whole-page gate, same pattern as fees.tsx
update public.plan_features set is_enforced = true
  where key in ('ai_schedule_import', 'ai_roster_import', 'change_alerts', 'club_attendance_reporting', 'advanced_reports_export', 'club_announcements', 'public_registration_forms');
