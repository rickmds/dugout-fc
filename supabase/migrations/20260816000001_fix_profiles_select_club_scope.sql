-- profiles_select_own let ANY user with global role org_admin/coach read
-- EVERY profile row on the entire platform — the org_admin/coach branch had
-- no club_id check at all, unlike every other role-gated policy in this
-- schema (teams_update, clubs_update, etc. all pair the role check with
-- club_id = current_user_club_id()). This is exploitable via accept_invite:
-- accepting an invite that grants an elevated role (coach/org_admin) at a
-- second club overwrites profiles.role globally, which — through this
-- policy alone — then grants that person read access to every parent and
-- coach profile at every other club too, not just their own two.
--
-- Fix: require the elevated-role branch to match the caller's own
-- current_user_club_id(), same pattern as is_team_coach's org_admin branch
-- (fixed in 20260812000002_fix_is_team_coach_club_scope.sql) and
-- teams_update. app_admin (platform owner) stays global on purpose.
--
-- profiles_select_own is the only SELECT policy on profiles (confirmed live
-- via pg_policy) — coach-to-parent / parent-to-coach contact visibility
-- goes through the separate get_team_contacts RPC, which is unaffected.

drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_own" on public.profiles for select
  using (
    id = auth.uid()
    or public.current_user_role() = 'app_admin'
    or (
      public.current_user_role() in ('org_admin', 'coach')
      and club_id = public.current_user_club_id()
    )
  );
