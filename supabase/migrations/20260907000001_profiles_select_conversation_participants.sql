-- profiles_select_own has no branch at all for role = 'parent' — a parent
-- can only ever read their own profile row. Team Chat's embedded
-- `profiles:sender_id(full_name)` join is silently denied by RLS for every
-- other sender, rendering as "Unknown" (Supabase/PostgREST returns null for
-- a denied embedded relationship rather than erroring). This isn't
-- View-As-specific — it's a real gap that hits any genuine parent account
-- viewing Team Chat, just never noticed because org_admin/coach/app_admin
-- all have broader profiles_select_own branches that mask it.
--
-- Fix: any authenticated caller can read the full_name/avatar_url-bearing
-- profile of anyone who shares at least one conversation with them,
-- regardless of role — this is strictly narrower than "same club" (the
-- existing org_admin/coach branches), scoped to exactly the people a
-- caller could already see messages FROM in a conversation they're
-- genuinely part of.

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
    or exists (
      select 1 from public.conversation_participants cp_self
      join public.conversation_participants cp_other
        on cp_other.conversation_id = cp_self.conversation_id
      where cp_self.profile_id = auth.uid()
        and cp_other.profile_id = profiles.id
    )
  );
