-- profiles_select_own's org_admin/coach branch only matches when the
-- TARGET row's own home club_id equals the caller's club — it has no
-- concept of "this person coaches/admins at my club via team_members or
-- club_admins even though their home club is elsewhere." That's exactly
-- the cross-club coach/org_admin pattern the multi-club membership feature
-- (20260830000001_multi_club_membership.sql) added — so any such person
-- shows up as "Unknown" (null full_name from a denied embedded join) on
-- every roster/staff page at the *other* club they help coach.
--
-- Fix: add branches allowing an org_admin/coach caller to read a profile
-- that's a team_members row (any team) or a club_admins row at the
-- caller's own club, regardless of that profile's own home club_id.
-- Mirrors is_club_staff's own team_members/club_admins union.

drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_own" on public.profiles for select
  using (
    id = auth.uid()
    or public.current_user_role() = 'app_admin'
    or (
      public.current_user_role() in ('org_admin', 'coach')
      and (
        club_id = public.current_user_club_id()
        or exists (
          select 1 from public.team_members tm
          join public.teams t on t.id = tm.team_id
          where tm.profile_id = profiles.id
            and t.club_id = public.current_user_club_id()
        )
        or exists (
          select 1 from public.club_admins ca
          where ca.profile_id = profiles.id
            and ca.club_id = public.current_user_club_id()
        )
      )
    )
  );
