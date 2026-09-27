-- A poll vote is cast by a parent's own profile_id, but a coach reading
-- "who voted" thinks in terms of which player/family, not the parent
-- account's own name — especially once there's more than one kid on the
-- team sharing a parent. Resolves a team's players back to whichever
-- profile(s) guard them, covering both the legacy players.profile_id
-- column and the newer player_guardians table (a parent with twins on
-- this team gets both names joined), same dual-source pattern already
-- established for a single player in get_player_guardian_info.
create or replace function public.get_guardian_player_names(p_team_id uuid)
returns table (profile_id uuid, player_names text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_team_coach(p_team_id) then
    raise exception 'Not permitted';
  end if;

  return query
  select gp.profile_id, string_agg(distinct pl.full_name, ' & ' order by pl.full_name) as player_names
  from (
    select p.profile_id, p.id as player_id
    from public.players p
    where p.team_id = p_team_id and p.profile_id is not null
    union
    select pg.profile_id, pg.player_id
    from public.player_guardians pg
    join public.players p2 on p2.id = pg.player_id
    where p2.team_id = p_team_id
  ) gp
  join public.players pl on pl.id = gp.player_id
  group by gp.profile_id;
end;
$$;

grant execute on function public.get_guardian_player_names(uuid) to authenticated;
