-- Two "notify coaches and admins" call sites (a parent responding to a
-- guest invite, a parent-triggerable event action) queried
-- profiles directly for a club's org_admin/app_admin ids — blocked by RLS
-- for any caller who isn't themselves org_admin/coach at that club, so a
-- parent-triggered notification silently reached zero admins. IDs only
-- (no name/phone — club admin identity isn't sensitive the way contact
-- details are), so this is deliberately open to any authenticated caller
-- rather than gated like get_team_coaches/get_team_contacts.
create or replace function public.get_club_admin_ids(p_club_id uuid)
returns table (profile_id uuid)
language sql stable security definer
set search_path = public
as $$
  select id from public.profiles
  where club_id = p_club_id and role in ('org_admin', 'app_admin');
$$;

grant execute on function public.get_club_admin_ids(uuid) to authenticated;
