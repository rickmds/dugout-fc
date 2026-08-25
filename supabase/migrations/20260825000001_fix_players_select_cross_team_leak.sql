-- players_select granted SELECT to anyone who is a team_members row on ANY
-- team in the same club (is_club_teammate), regardless of role or which
-- team the player actually belongs to. Live-confirmed exploitable: a parent
-- on one team could read another team's full roster, including
-- medical_notes on players flagged is_private (a UI-only flag never
-- enforced by RLS).
--
-- is_team_member(team_id) already grants full coverage for org_admin (any
-- team in their own club) and app_admin (any team at all) internally — see
-- its definition. So the app_admin branch here was already redundant, and
-- is_club_teammate added nothing legitimate; it only ever widened access
-- beyond what any real feature needs.
drop policy if exists players_select on public.players;
create policy players_select on public.players
  for select
  using (is_team_member(team_id));
