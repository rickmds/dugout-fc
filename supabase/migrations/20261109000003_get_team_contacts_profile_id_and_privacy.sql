-- get_team_contacts was defined (20260825000012) but never actually called
-- from the app — the player profile screen's "GUARDIAN CONTACT" card was
-- wired to the `invites` table instead, which invites_select correctly
-- restricts to coaches and that player's own guardian, so for a teammate
-- it always came back empty. That's the real cause of "parent can't see
-- other players' parents' info" — not the share_contact_with_team toggle
-- doing its job, a half-wired feature.
--
-- Wiring the real UI to this RPC (next commit) needs two changes this
-- function never had, since it was never actually reachable by a non-coach
-- client before:
-- 1) a profile_id, so the client can open a DM with the guardian — the
--    Message button lives right next to this same contact info.
-- 2) private-player suppression. get_team_contacts never checked
--    players.is_private at all; harmless while nothing called it, a real
--    leak the moment something does.
--
-- Return columns changed (added profile_id), so this needs a drop first —
-- create or replace can't alter a function's OUT columns.
drop function if exists public.get_team_contacts(uuid);

create function public.get_team_contacts(p_team_id uuid)
returns table(player_id uuid, player_name text, profile_id uuid, guardian_name text, guardian_phone text, is_coach_viewer boolean)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_is_coach boolean;
begin
  if not public.is_team_member(p_team_id) then
    raise exception 'Not permitted';
  end if;
  v_is_coach := public.is_team_coach(p_team_id);

  return query
  select
    p.id, p.full_name,
    case when v_is_coach or not p.is_private then pr.id else null end,
    case when v_is_coach or not p.is_private then pr.full_name else null end,
    case when (v_is_coach or not p.is_private) and (v_is_coach or pr.share_contact_with_team) then pr.phone else null end,
    v_is_coach
  from public.players p
  join public.profiles pr on pr.id = p.profile_id
  where p.team_id = p_team_id

  union

  select
    p.id, p.full_name,
    case when v_is_coach or not p.is_private then pr.id else null end,
    case when v_is_coach or not p.is_private then pr.full_name else null end,
    case when (v_is_coach or not p.is_private) and (v_is_coach or pr.share_contact_with_team) then pr.phone else null end,
    v_is_coach
  from public.players p
  join public.player_guardians pg on pg.player_id = p.id
  join public.profiles pr on pr.id = pg.profile_id
  where p.team_id = p_team_id

  union

  select p.id, p.full_name, null::uuid, null::text, null::text, v_is_coach
  from public.players p
  where p.team_id = p_team_id
    and p.profile_id is null
    and not exists (select 1 from public.player_guardians pg where pg.player_id = p.id);
end;
$function$;

grant execute on function public.get_team_contacts(uuid) to authenticated;
