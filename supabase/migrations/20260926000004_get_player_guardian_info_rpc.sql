-- player/[playerId].tsx's guardian-management panel (loadGuardians) is
-- reached by ANY guardian of that player, not just coaches — a parent
-- viewing their own child's page — but its two profile lookups (the
-- player's own linked account, if any; other guardians via
-- player_guardians) both embedded-joined profiles directly, 403ing under
-- current RLS the same way the chat screens did. Unlike the name-only
-- RPCs added alongside this one, this screen already legitimately shows
-- address (guardian contact info a co-guardian needs), so this returns
-- that too — gated the same way the screen's own canSeeDetails check
-- intends: a guardian of this player, or a coach/org_admin of their team.
create or replace function public.get_player_guardian_info(p_player_id uuid)
returns table (profile_id uuid, full_name text, avatar_url text, address text)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from public.players where id = p_player_id;
  if v_team_id is null then
    raise exception 'Player not found';
  end if;

  if not (
    public.is_team_coach(v_team_id)
    or exists (
      select 1 from public.player_guardians pg
      where pg.player_id = p_player_id and pg.profile_id = auth.uid()
    )
  ) then
    raise exception 'Not permitted';
  end if;

  return query
  select distinct pr.id, pr.full_name, pr.avatar_url, pr.address
  from public.profiles pr
  where pr.id in (
    select p.profile_id from public.players p where p.id = p_player_id and p.profile_id is not null
    union
    select pg.profile_id from public.player_guardians pg where pg.player_id = p_player_id
  );
end;
$$;

grant execute on function public.get_player_guardian_info(uuid) to authenticated;
