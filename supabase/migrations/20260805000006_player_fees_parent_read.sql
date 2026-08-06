-- Allow players/parents to read fees for their own linked player record
create policy "players read own fees" on public.player_fees for select
using (
  player_id in (
    select id from public.players where profile_id = auth.uid()
  )
);
