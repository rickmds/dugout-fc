-- Pre-scale security audit finding: accept_invite() never verified that
-- the authenticated caller was actually the person the invite was sent
-- to. Any signed-in user who obtained *any* club's invite token (a
-- forwarded email, a screenshot, a misdirected send) could redeem it as
-- themselves and gain a real team_members row — and for coach/org_admin
-- invites, a reassigned profiles.club_id — inside that club. This closes
-- the identity gap, and also turns the club-switch "warning" added in
-- 20260825000015 into a real, confirmed gate instead of an unconditional
-- reassignment the caller merely gets told about after the fact.
create or replace function public.accept_invite(p_token text, p_confirm_switch boolean default false)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_invite_id      uuid;
  v_invite_email   text;
  v_team_id        uuid;
  v_team_ids       uuid[];
  v_player_id      uuid;
  v_club_id        uuid;
  v_club_slug      text;
  v_role           text;
  v_current_role   text;
  v_current_club   uuid;
  v_warning        text;
begin
  select i.id, i.email, i.team_id, coalesce(i.team_ids, '{}'), i.player_id,
         coalesce(t.club_id, i.club_id), coalesce(tc.slug, ic.slug),
         coalesce(i.role, 'parent')
  into   v_invite_id, v_invite_email, v_team_id, v_team_ids, v_player_id,
         v_club_id, v_club_slug, v_role
  from   public.invites i
  left join public.teams t  on t.id = i.team_id
  left join public.clubs tc on tc.id = t.club_id
  left join public.clubs ic on ic.id = i.club_id
  where  i.token = p_token
    and  i.accepted_at is null;

  if not found or v_club_id is null then
    return jsonb_build_object('error', 'Invalid or already used invite');
  end if;

  -- Every real invite in this app is created with a real recipient email
  -- (invite-coach, roster-import, and the guardian-invite screens all
  -- reject an empty email before insert) — so a null/blank invite email
  -- here is unexpected, not a legitimate wildcard-accept case.
  if lower(coalesce(v_invite_email, '')) <> lower(coalesce(auth.email(), '')) then
    return jsonb_build_object('error', 'This invite was sent to a different email address. Sign in with that account, or ask your club for a new invite.');
  end if;

  select role, club_id into v_current_role, v_current_club from public.profiles where id = auth.uid();

  if v_role in ('coach', 'org_admin')
     and v_current_role in ('coach', 'org_admin', 'app_admin')
     and v_current_club is not null
     and v_current_club <> v_club_id then
    if not p_confirm_switch then
      return jsonb_build_object(
        'needs_confirmation', true,
        'warning', 'Accepting this invite will move your account from your current club to this one. Your access to your current club will end.'
      );
    end if;
    v_warning := 'Your account was moved from your previous club to this one.';
  end if;

  if v_team_id is not null then
    insert into public.team_members (team_id, profile_id, role)
    values (v_team_id, auth.uid(), case when v_role = 'coach' then 'coach' else 'parent' end)
    on conflict do nothing;
  elsif array_length(v_team_ids, 1) > 0 then
    insert into public.team_members (team_id, profile_id, role)
    select unnest(v_team_ids), auth.uid(), 'coach'
    on conflict do nothing;
  end if;

  if v_player_id is not null then
    insert into public.player_guardians (player_id, profile_id)
    values (v_player_id, auth.uid())
    on conflict do nothing;
    -- Only the first guardian claims the legacy single-column slot —
    -- later guardians never overwrite an already-linked player.
    update public.players set profile_id = auth.uid() where id = v_player_id and profile_id is null;
  end if;

  update public.profiles
  set    role    = case
                      when v_role in ('coach', 'org_admin') then v_role
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then v_current_role
                      else 'player'
                    end,
         club_id = case
                      when v_role in ('coach', 'org_admin') then v_club_id
                      when v_current_role in ('coach', 'org_admin', 'app_admin') and club_id is not null then club_id
                      else v_club_id
                    end
  where  id = auth.uid();

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = v_invite_id;

  return jsonb_build_object('success', true, 'club_slug', v_club_slug, 'warning', v_warning);
end;
$function$;
