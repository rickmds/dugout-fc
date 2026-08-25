-- "team coaches manage shoutouts" only checked the coach was on the stated
-- team_id — it never verified player_id actually belongs to that team, so
-- a coach's own team_id check passed while player_id referenced any player
-- in the whole database, cross-team and cross-club.
drop policy if exists "team coaches manage shoutouts" on public.player_shoutouts;
create policy "team coaches manage shoutouts" on public.player_shoutouts
  for all
  using (
    is_team_coach(team_id)
    and exists (select 1 from public.players p where p.id = player_shoutouts.player_id and p.team_id = player_shoutouts.team_id)
  )
  with check (
    is_team_coach(team_id)
    and exists (select 1 from public.players p where p.id = player_shoutouts.player_id and p.team_id = player_shoutouts.team_id)
  );
