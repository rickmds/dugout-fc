-- The client-side "remove guardian" fix (accepted_by-guarded delete) only
-- works when accepted_by is actually populated — true for every acceptance
-- going forward, but several already-accepted invites never backfilled
-- (their invite.email didn't exactly match any auth.users.email, mostly
-- abandoned test signups). Moving the whole operation server-side: this
-- can fall back to an email lookup against auth.users (not reachable from
-- the client under RLS), does the player_guardians + invites removal
-- atomically, and centralizes the permission check instead of relying on
-- the client to only call it when it should.
create or replace function public.revoke_guardian_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_invite      record;
  v_accepted_by uuid;
begin
  select * into v_invite from public.invites where id = p_invite_id;
  if not found then
    return jsonb_build_object('error', 'Invite not found');
  end if;

  if not (
    public.is_team_coach(v_invite.team_id)
    or (v_invite.player_id is not null and public.is_player_guardian(v_invite.player_id))
  ) then
    return jsonb_build_object('error', 'Forbidden');
  end if;

  v_accepted_by := v_invite.accepted_by;
  if v_accepted_by is null and v_invite.accepted_at is not null then
    select id into v_accepted_by from auth.users where lower(email) = lower(v_invite.email) limit 1;
  end if;

  if v_accepted_by is not null and v_invite.player_id is not null then
    -- Defense in depth — this path is only ever meant for secondary
    -- guardians (the UI never shows a delete affordance for the primary),
    -- but refuse outright rather than trust that invariant blindly.
    if exists (select 1 from public.players where id = v_invite.player_id and profile_id = v_accepted_by) then
      return jsonb_build_object('error', 'Cannot remove the primary guardian this way');
    end if;
    delete from public.player_guardians where player_id = v_invite.player_id and profile_id = v_accepted_by;
  end if;

  delete from public.invites where id = p_invite_id;

  return jsonb_build_object('success', true);
end;
$$;
