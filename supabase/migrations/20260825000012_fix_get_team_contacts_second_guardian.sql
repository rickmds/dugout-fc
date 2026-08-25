-- get_team_contacts (the one sanctioned phone-sharing path for the roster
-- contacts list) only ever joined players.profile_id — the legacy
-- single-guardian column. A second/co-parent guardian linked only via
-- player_guardians was never surfaced to teammates or the coach through
-- this RPC, even if they'd opted in to sharing.
--
-- Now returns one row per actual guardian relationship (so a player with
-- two guardians shows two contact rows, each dialable individually), plus
-- a placeholder row (no guardian info) for a player with neither a
-- profile_id nor any player_guardians row, preserving the original
-- behavior of still listing every player even with no guardian on file.
create or replace function public.get_team_contacts(p_team_id uuid)
returns table(player_id uuid, player_name text, guardian_name text, guardian_phone text, is_coach_viewer boolean)
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
    p.id, p.full_name, pr.full_name,
    case when v_is_coach or pr.share_contact_with_team then pr.phone else null end,
    v_is_coach
  from public.players p
  join public.profiles pr on pr.id = p.profile_id
  where p.team_id = p_team_id

  union

  select
    p.id, p.full_name, pr.full_name,
    case when v_is_coach or pr.share_contact_with_team then pr.phone else null end,
    v_is_coach
  from public.players p
  join public.player_guardians pg on pg.player_id = p.id
  join public.profiles pr on pr.id = pg.profile_id
  where p.team_id = p_team_id

  union

  select p.id, p.full_name, null::text, null::text, v_is_coach
  from public.players p
  where p.team_id = p_team_id
    and p.profile_id is null
    and not exists (select 1 from public.player_guardians pg where pg.player_id = p.id);
end;
$function$;
