-- is_team_coach() granted org_admin access to ANY team on the platform,
-- not just teams in the org_admin's own club — the org_admin branch was
-- `public.current_user_role() in ('org_admin','app_admin')` with no club
-- check at all. is_team_member() had this exact same bug and was already
-- fixed in 20260623000005_org_admin_full_club_access.sql (that migration's
-- own comment says "org_admin could already write to any team in their
-- club (is_team_coach included the role check)" — the underlying
-- assumption was wrong; is_team_coach never actually scoped by club).
--
-- is_team_coach() gates writes on players, invites, events, RSVPs,
-- game_sessions, player_match_periods, and messaging tables, so this let
-- any org_admin — including a brand-new self-serve signup — write to any
-- other club's data. app_admin (platform owner) remains global on purpose.

create or replace function public.is_team_coach(p_team_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id
      and profile_id = auth.uid()
      and role = 'coach'
  )
  or public.current_user_role() = 'app_admin'
  or (
    public.current_user_role() = 'org_admin'
    and exists (
      select 1 from public.teams t
      where t.id = p_team_id
        and t.club_id = public.current_user_club_id()
    )
  );
$$;
