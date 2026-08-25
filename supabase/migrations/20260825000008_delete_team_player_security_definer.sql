-- admin_delete_team/admin_delete_player are called directly from client
-- code (unlike admin_delete_club, which only ever runs behind a
-- service-role API route) — without SECURITY DEFINER, every nested delete
-- inside _delete_resolving_fk is still subject to the CALLER's own RLS,
-- and evaluation_batches' delete policy doesn't permit it, so the patch
-- delete silently affects zero rows and the retry loops until it hits the
-- depth guard. Confirmed live: as a real org_admin, the previous version
-- errored out with "foreign key resolution too deep."
--
-- Making these SECURITY DEFINER bypasses that, so they need their own
-- authorization check in place of RLS (auth.uid() still resolves to the
-- real caller inside a SECURITY DEFINER function — only current_user
-- changes, not the JWT claims PostgREST already set for this request).
create or replace function public.admin_delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not (
    public.current_user_role() = 'app_admin'
    or (
      public.current_user_role() = 'org_admin'
      and exists (select 1 from public.teams t where t.id = p_team_id and t.club_id = public.current_user_club_id())
    )
  ) then
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
begin
  select team_id into v_team_id from public.players where id = p_player_id;
  if v_team_id is null then
    raise exception 'Player not found';
  end if;

  if not (
    public.current_user_role() = 'app_admin'
    or (
      public.current_user_role() = 'org_admin'
      and exists (select 1 from public.teams t where t.id = v_team_id and t.club_id = public.current_user_club_id())
    )
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
