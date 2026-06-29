-- Allow a player/parent to update their own linked player row (photo, privacy settings).
-- Coaches already have full update access via players_update. This adds a second policy
-- so that profile_id = auth.uid() also satisfies the update check.
create policy "players_update_own" on public.players
  for update
  using  (profile_id = auth.uid())
  with check (profile_id = auth.uid());
