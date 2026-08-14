-- Confirmed live: a guardian removed under the old (pre-tonight) behavior
-- — which only ever deleted the invites row — kept full real access
-- forever, because the actual grant lives in player_guardians and nothing
-- touched it. invite_id was never the right key for "revoke this person's
-- access" since a guardian can (and did, in exactly this case) exist with
-- zero matching invite rows. Keying on (player_id, profile_id) instead —
-- the actual player_guardians identity — makes this correct regardless of
-- whether an invite record happens to still exist. Supersedes
-- revoke_guardian_invite from 20260814000004.
drop function if exists public.revoke_guardian_invite(uuid);

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

  -- Defense in depth — this path is only ever meant for secondary
  -- guardians (the UI never shows a delete affordance for the primary),
  -- but refuse outright rather than trust that invariant blindly.
  if exists (select 1 from public.players where id = p_player_id and profile_id = p_profile_id) then
    return jsonb_build_object('error', 'Cannot remove the primary guardian this way');
  end if;

  delete from public.player_guardians where player_id = p_player_id and profile_id = p_profile_id;
  delete from public.invites where player_id = p_player_id and accepted_by = p_profile_id;

  return jsonb_build_object('success', true);
end;
$$;
