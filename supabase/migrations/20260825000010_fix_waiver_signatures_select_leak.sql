-- "Club members can view waiver signatures" only scoped by club_id — any
-- parent or coach in the club could read every other family's signed
-- waiver data (medical/liability/photo consent), not just their own kid's.
-- Scope to the signing family (is_player_guardian) or the player's own team
-- coach (is_team_coach already covers org_admin/app_admin internally for
-- their club).
drop policy if exists "Club members can view waiver signatures" on public.waiver_signatures;
create policy "Club members can view waiver signatures" on public.waiver_signatures
  for select
  using (
    is_player_guardian(player_id)
    or exists (
      select 1 from public.players p
      where p.id = waiver_signatures.player_id and is_team_coach(p.team_id)
    )
  );
