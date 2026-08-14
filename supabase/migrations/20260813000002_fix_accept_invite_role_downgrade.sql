-- accept_invite() unconditionally overwrote profiles.role/club_id based only
-- on the invite just accepted, with no idea the person might already coach
-- elsewhere. A coach who later accepts an unrelated parent invite (e.g. for
-- their own kid on a different team) got silently demoted club-wide —
-- team_members stayed correct, but the global role flipped to 'player' and
-- every coach-gated screen broke for them. Confirmed via rbreheny1+67@gmail.com:
-- accepted a coach invite, then ~2.5 hours later accepted a parent invite,
-- and profiles.role flipped from 'coach' to 'player' at that exact moment.
--
-- Fix: never lower an already-elevated role (coach/org_admin/app_admin) just
-- because a lower-tier invite was accepted, and don't relocate that person's
-- home club_id in that case either — only a coach invite (or a first-time
-- parent invite for someone with no elevated role yet) sets club_id.

create or replace function public.accept_invite(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_invite_id    uuid;
  v_team_id      uuid;
  v_player_id    uuid;
  v_club_id      uuid;
  v_club_slug    text;
  v_role         text;
  v_current_role text;
begin
  select i.id, i.team_id, i.player_id, c.id, c.slug, coalesce(i.role, 'parent')
  into   v_invite_id, v_team_id, v_player_id, v_club_id, v_club_slug, v_role
  from   public.invites i
  join   public.teams   t on t.id = i.team_id
  join   public.clubs   c on c.id = t.club_id
  where  i.token = p_token
    and  i.accepted_at is null;

  if not found then
    return jsonb_build_object('error', 'Invalid or already used invite');
  end if;

  -- team_members role mirrors the invite role
  insert into public.team_members (team_id, profile_id, role)
  values (v_team_id, auth.uid(), case when v_role = 'coach' then 'coach' else 'parent' end)
  on conflict do nothing;

  -- link player profile if this is a player invite
  if v_player_id is not null then
    update public.players set profile_id = auth.uid() where id = v_player_id;
  end if;

  select role into v_current_role from public.profiles where id = auth.uid();

  update public.profiles
  set    role    = case
                      when v_role = 'coach' then 'coach'
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then v_current_role
                      else 'player'
                    end,
         club_id = case
                      when v_role = 'coach' then v_club_id
                      when v_current_role in ('coach', 'org_admin', 'app_admin') then club_id
                      else v_club_id
                    end
  where  id = auth.uid();

  update public.invites set accepted_at = now() where id = v_invite_id;

  return jsonb_build_object('success', true, 'club_slug', v_club_slug);
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;
