-- Reverse guardian lookup for the new web Family page: given a guardian's
-- profile_id, return every player they guard. get_my_guarded_players() is
-- hardwired to auth.uid() (only answers for the caller's own session) and
-- so can't be used by a coach/admin looking up a DIFFERENT family —
-- there's no existing RPC that does this admin-facing direction.
--
-- Same dual-source union (players.profile_id legacy column +
-- player_guardians table) as is_player_guardian()/get_guardian_player_names,
-- confirmed in production to matter (a parent with twins, each child
-- claiming the slot via a different mechanism).
--
-- Scoping: rather than an all-or-nothing permission check, each returned
-- row is filtered through is_team_coach(team_id) for the CALLING user — so
-- an admin sees every one of this family's kids within their own club(s)
-- and nothing from a sibling at a club they have no access to, without a
-- hard failure if the family happens to span clubs.
create or replace function public.get_players_for_guardian(p_profile_id uuid)
returns setof public.players
language sql stable security definer
set search_path = public
as $$
  select p.* from public.players p
  where (
    p.profile_id = p_profile_id
    or p.id in (select player_id from public.player_guardians where profile_id = p_profile_id)
  )
  and public.is_team_coach(p.team_id);
$$;

grant execute on function public.get_players_for_guardian(uuid) to authenticated;
