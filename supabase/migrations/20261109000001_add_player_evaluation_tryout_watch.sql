-- Internal-only tryout-risk flag for coaches/admins. Never parent-facing:
-- no RLS policy exposes it differently than the rest of the
-- row (RLS here is row-level, not column-level), so every client query that
-- can reach a published player_evaluations row must deliberately not
-- select these two columns. The parent-facing surfaces
-- (web EvaluationReportCard.tsx, the internal PDF render page, the mobile
-- player report screen) all use explicit column lists for exactly this
-- reason — see those files.
alter table player_evaluations
  add column if not exists tryout_watch text check (tryout_watch in ('watch','priority')),
  add column if not exists tryout_contacted_at timestamptz;
