-- admin_delete_team/admin_delete_player (20260825000008) predate the
-- multi-club system (20260830000001) and still gate the org_admin branch
-- on `club_id = current_user_club_id()` — which only ever resolves to the
-- caller's HOME club (profiles.club_id). An org_admin managing a team at
-- a SECOND club via club_admins is a real, already-supported case
-- everywhere else (is_team_member/is_team_coach/is_club_staff/the Staff
-- page/the dashboard's own club fetch all route through is_club_admin()
-- for exactly this), but these two functions were never swept into that
-- migration since they carry their own inline auth check instead of
-- reusing is_team_coach. Confirmed live: the function definition still
-- has the stale home-club-only check. Fixed by routing both through
-- is_club_admin(), the single canonical check this app already uses
-- everywhere else for "does this org_admin have rights over this club" —
-- it already covers app_admin internally, so the separate app_admin
-- branch collapses into it too.
create or replace function public.admin_delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id from public.teams where id = p_team_id;
  if v_club_id is null then
    raise exception 'Team not found';
  end if;

  if not public.is_club_admin(v_club_id) then
    raise exception 'Not authorized to delete this team';
  end if;

  perform public._delete_resolving_fk('delete from teams where id = $1', p_team_id, 'teams'::regclass);
end;
$$;

create or replace function public.admin_delete_player(p_player_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_team_id uuid;
  v_club_id uuid;
begin
  select team_id into v_team_id from public.players where id = p_player_id;
  if v_team_id is null then
    raise exception 'Player not found';
  end if;

  select club_id into v_club_id from public.teams where id = v_team_id;

  if not (
    public.is_club_admin(v_club_id)
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = v_team_id and tm.profile_id = auth.uid() and tm.role = 'coach'
    )
  ) then
    raise exception 'Not authorized to delete this player';
  end if;

  perform public._delete_resolving_fk('delete from players where id = $1', p_player_id, 'players'::regclass);
end;
$$;
