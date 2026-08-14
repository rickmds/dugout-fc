-- invites_delete was is_team_coach(team_id) only — a guardian could never
-- remove a guardian invite for their own child (the "x" button in the
-- player detail screen's Guardians tab), same class of gap as the select
-- policy fixed in 20260814000001. Guardians can already create and read
-- these rows; they should be able to remove ones tied to their own child.
drop policy if exists "invites_delete" on invites;
create policy "invites_delete" on invites
  for delete
  using (is_team_coach(team_id) or is_player_guardian(player_id));
