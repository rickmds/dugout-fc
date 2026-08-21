-- profiles only had profiles_update_own (id = auth.uid()), so the Staff page's
-- role/name edit and "remove staff" actions silently failed for any OTHER
-- profile: the client had no error handling on that update, so the UI
-- optimistically showed the change while the database row never moved,
-- and a refresh revealed the real (unchanged) role.
--
-- Lets an org_admin manage profiles within their own club, and app_admin
-- manage any profile. with_check still blocks moving someone to a
-- different (non-null) club, and blocks an org_admin from granting
-- app_admin — only app_admin can do that.
create policy "profiles_update_by_admin" on public.profiles for update
  using (
    current_user_role() = 'app_admin'
    or (current_user_role() = 'org_admin' and club_id = current_user_club_id())
  )
  with check (
    current_user_role() = 'app_admin'
    or (
      current_user_role() = 'org_admin'
      and (club_id = current_user_club_id() or club_id is null)
      and role in ('org_admin', 'coach', 'player')
    )
  );
