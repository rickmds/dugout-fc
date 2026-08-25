-- accept_invite always takes the invite's own club/role when the invite
-- itself is coach/org_admin-scoped, with no check for whether the
-- accepting user already belongs to a DIFFERENT club as an existing
-- coach/org_admin/app_admin. Not exploitable (it requires the person to
-- knowingly accept a staff invite addressed to their own email), but a
-- real correctness gap: their real home club silently switches with no
-- signal anywhere that it happened. Surface it as a `warning` in the
-- response instead — same mechanism the accept-invite API route already
-- uses for its own partial-failure warning — so the accepting screen can
-- tell them plainly rather than leaving it invisible.
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_invite_id      uuid;
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
  select i.id, i.team_id, coalesce(i.team_ids, '{}'), i.player_id,
         coalesce(t.club_id, i.club_id), coalesce(tc.slug, ic.slug),
         coalesce(i.role, 'parent')
  into   v_invite_id, v_team_id, v_team_ids, v_player_id,
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

  select role, club_id into v_current_role, v_current_club from public.profiles where id = auth.uid();

  if v_role in ('coach', 'org_admin')
     and v_current_role in ('coach', 'org_admin', 'app_admin')
     and v_current_club is not null
     and v_current_club <> v_club_id then
    v_warning := 'Your account was moved from your previous club to this one.';
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
