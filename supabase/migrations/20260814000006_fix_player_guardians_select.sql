-- player_guardians_select was profile_id = auth.uid() OR is_team_coach()
-- — a guardian could only ever see their OWN row, never a co-guardian's,
-- for the same player. The reworked Guardians tab queries player_guardians
-- directly to show everyone with access, so the primary guardian's query
-- was silently filtered down to just themselves — the second guardian
-- they'd just added was invisible to them, with no way to manage/remove.
-- is_player_guardian(player_id) already covers "this is my own row" as
-- one of its OR branches, so this is a strict widening, not a behavior
-- change for the single-guardian case.
drop policy if exists "player_guardians_select" on player_guardians;
create policy "player_guardians_select" on player_guardians
  for select
  using (
    is_player_guardian(player_id)
    or exists (select 1 from players p where p.id = player_guardians.player_id and is_team_coach(p.team_id))
  );
