-- Same shape of bug as the player_fees fix earlier today: "public select
-- tryout_assignments by token" was USING (true) — table-wide unauthenticated
-- SELECT, not actually scoped by any token (RLS can't see query filters).
--
-- Audited every real caller of tryout_assignments: dashboard pages read it
-- via the authenticated client (covered by the existing "club admin manage
-- tryout_assignments" policy, is_club_admin() = org_admin/app_admin — the
-- Tryouts module is marked adminOnly in the sidebar nav, so that's the
-- correct scope, not a bug), and every /api/tryout/* route reads it with
-- the service-role key, which bypasses RLS entirely. No legitimate
-- unauthenticated reader of this table exists, so the policy is dropped
-- outright rather than replaced.

DROP POLICY IF EXISTS "public select tryout_assignments by token" ON tryout_assignments;
