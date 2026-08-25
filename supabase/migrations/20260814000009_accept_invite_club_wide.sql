-- accept_invite joined invites to teams with an INNER join, so a club-wide
-- invite (team_id null — org_admin, or a coach not tied to a single team)
-- always failed with "Invalid or already used invite" here, on both the
-- mobile invite-code/auto-match paths and the web /join "I already have an
-- account" path. Mirrors the team_id/club_id/team_ids handling already
-- applied to web/app/api/accept-invite/route.ts.
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_invite_id    uuid;
  v_team_id      uuid;
  v_team_ids     uuid[];
  v_player_id    uuid;
  v_club_id      uuid;
  v_club_slug    text;
  v_role         text;
  v_current_role text;
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

  select role into v_current_role from public.profiles where id = auth.uid();

  update public.profiles
  set    role    = case
                      when v_role in ('coach', 'org_admin') then v_role
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then v_current_role
                      else 'player'
                    end,
         club_id = case
                      when v_role in ('coach', 'org_admin') then v_club_id
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then club_id
                      else v_club_id
                    end
  where  id = auth.uid();

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = v_invite_id;

  return jsonb_build_object('success', true, 'club_slug', v_club_slug);
end;
$function$;
