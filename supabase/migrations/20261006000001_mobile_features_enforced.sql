-- Phase 2, mobile round: marks the 6 mobile-only catalog features that now
-- have real client-side gates (via the new PlanProvider/usePlan hook) as
-- enforced. game_scores is deliberately left unmarked — manual score
-- entry is already blocked (match_tracker is the only way to set one, and
-- that's enforced), but the W/L/D record *display* itself is spread
-- across tournament markers and schedule badges in a way that wasn't
-- worth rushing alongside these six; treated as a smaller follow-up.
update public.plan_features set is_enforced = true
  where key in ('ai_lineup_suggester', 'match_tracker', 'video_library', 'guest_management', 'attendance_streaks', 'guest_activity_dashboard');
