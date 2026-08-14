-- revoke_guardian_access only ever removed player_guardians — access to
-- that one child's data. accept_invite grants team_members on join too
-- (that's what actually gates roster/chat/schedule for the whole team),
-- and revoke never undid it, so a removed guardian kept full team access
-- forever. Only drops team_members when this was their last remaining
-- connection to the team (another guarded/owned player on the same team
-- keeps them on it), and never touches a 'coach' row.
create or replace function public.revoke_guardian_access(p_player_id uuid, p_profile_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from public.players where id = p_player_id;
  if v_team_id is null then
    return jsonb_build_object('error', 'Player not found');
  end if;

  if not (public.is_team_coach(v_team_id) or public.is_player_guardian(p_player_id)) then
    return jsonb_build_object('error', 'Forbidden');
  end if;

  if exists (select 1 from public.players where id = p_player_id and profile_id = p_profile_id) then
    return jsonb_build_object('error', 'Cannot remove the primary guardian this way');
  end if;

  delete from public.player_guardians where player_id = p_player_id and profile_id = p_profile_id;
  delete from public.invites where player_id = p_player_id and accepted_by = p_profile_id;

  if not exists (
    select 1 from public.players p
    where p.team_id = v_team_id
      and (p.profile_id = p_profile_id or exists (
        select 1 from public.player_guardians pg where pg.player_id = p.id and pg.profile_id = p_profile_id
      ))
  ) then
    delete from public.team_members
    where team_id = v_team_id and profile_id = p_profile_id and role = 'parent';
  end if;

  return jsonb_build_object('success', true);
end;
$$;
