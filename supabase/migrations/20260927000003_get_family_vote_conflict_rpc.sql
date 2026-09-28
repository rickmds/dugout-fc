-- A poll vote is cast by an account, but two guardian accounts (e.g. both
-- parents) can share the same player — nothing stopped both from voting
-- independently, inflating the tally and potentially recording two
-- different answers for the same kid. Confirmed live: "Cole Katcher"
-- appeared twice in a single option's "who voted" list.
--
-- For the calling account, finds any vote already cast on this poll by a
-- DIFFERENT account that shares at least one guarded player with the
-- caller — i.e. a co-guardian who already answered. The client uses this
-- to block a second, independent vote rather than let it double-count.
create or replace function public.get_family_vote_conflict(p_poll_id uuid)
returns table (option_id uuid, guardian_profile_id uuid)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  return query
  with guardians as (
    select p.id as player_id, p.profile_id
    from public.players p
    where p.profile_id is not null
    union
    select pg.player_id, pg.profile_id
    from public.player_guardians pg
  ),
  my_players as (
    select player_id from guardians where profile_id = v_caller
  ),
  co_guardians as (
    select distinct g.profile_id
    from guardians g
    where g.player_id in (select player_id from my_players)
      and g.profile_id <> v_caller
  )
  select v.option_id, v.profile_id as guardian_profile_id
  from public.team_poll_votes v
  where v.poll_id = p_poll_id
    and v.profile_id in (select profile_id from co_guardians);
end;
$$;

grant execute on function public.get_family_vote_conflict(uuid) to authenticated;
