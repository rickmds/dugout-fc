-- The nudge count was counting individual parent ACCOUNTS who haven't
-- voted, not families/players — a child with two linked guardian accounts
-- (common: both parents) inflated the count and, worse, would nudge a
-- parent whose spouse already voted for that family. A player/family
-- counts as "responded" once ANY of its guardians has voted; nudge targets
-- are every guardian of a still-non-responding player, not every
-- individual non-voting account.
create or replace function public.get_poll_nonresponders(p_poll_id uuid)
returns table (player_id uuid, guardian_profile_ids uuid[])
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from public.team_polls where id = p_poll_id;
  if v_team_id is null then
    raise exception 'Poll not found';
  end if;
  if not public.is_team_coach(v_team_id) then
    raise exception 'Not permitted';
  end if;

  return query
  with guardians as (
    select p.id as player_id, p.profile_id
    from public.players p
    where p.team_id = v_team_id and p.profile_id is not null
    union
    select pg.player_id, pg.profile_id
    from public.player_guardians pg
    join public.players p2 on p2.id = pg.player_id
    where p2.team_id = v_team_id
  )
  select g.player_id, array_agg(distinct g.profile_id) as guardian_profile_ids
  from guardians g
  where not exists (
    select 1 from guardians g2
    join public.team_poll_votes v on v.profile_id = g2.profile_id and v.poll_id = p_poll_id
    where g2.player_id = g.player_id
  )
  group by g.player_id;
end;
$$;

grant execute on function public.get_poll_nonresponders(uuid) to authenticated;
