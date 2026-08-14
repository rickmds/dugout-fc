-- addGuardianInvite (lib/inviteApi.ts) does .insert(row).select('id').single()
-- — the INSERT was always permitted for a guardian (invites_insert already
-- allowed it), but invites_select only ever allowed is_team_coach() or
-- app_admin. A parent creating their own guardian invite had no permission
-- to read back the row they'd just inserted, so the read-back leg of that
-- single request failed every time, looking identical to an INSERT-side
-- RLS rejection. Extending to match the same guardian check the INSERT
-- policy already trusts — a guardian can see invites for their own child,
-- not any other team member's.
drop policy if exists "invites_select" on invites;
create policy "invites_select" on invites
  for select
  using (is_team_coach(team_id) or current_user_role() = 'app_admin' or is_player_guardian(player_id));
