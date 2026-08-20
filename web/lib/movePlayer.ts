import { supabase } from '@/lib/supabase';

// Moving a player to a different team should take their guardians' team
// access with them, not just the player row — otherwise a parent keeps
// seeing (and being seen on) the old team's roster/chat while their kid is
// actually on the new one. A guardian keeps their old-team membership if
// they still have another child there; a coach-role membership for that
// same person is never touched, only their 'parent' one.
export async function movePlayerToTeam(
  playerId: string,
  fromTeamId: string,
  toTeamId: string
): Promise<{ error: string | null }> {
  if (fromTeamId === toTeamId) return { error: null };

  const { error: playerErr } = await supabase
    .from('players')
    .update({ team_id: toTeamId })
    .eq('id', playerId);
  if (playerErr) return { error: playerErr.message };

  await supabase.from('invites').update({ team_id: toTeamId }).eq('player_id', playerId);

  const [{ data: playerRow }, { data: guardianLinks }] = await Promise.all([
    supabase.from('players').select('profile_id').eq('id', playerId).maybeSingle(),
    supabase.from('player_guardians').select('profile_id').eq('player_id', playerId),
  ]);
  const guardianIds = new Set<string>();
  if (playerRow?.profile_id) guardianIds.add(playerRow.profile_id);
  for (const g of guardianLinks ?? []) guardianIds.add(g.profile_id);
  if (guardianIds.size === 0) return { error: null };

  const { data: otherPlayersOnOldTeam } = await supabase
    .from('players')
    .select('id, profile_id')
    .eq('team_id', fromTeamId)
    .neq('id', playerId);
  const otherPlayerIds = (otherPlayersOnOldTeam ?? []).map((p) => p.id);

  const { data: otherGuardianLinks } = otherPlayerIds.length
    ? await supabase.from('player_guardians').select('profile_id').in('player_id', otherPlayerIds)
    : { data: [] as { profile_id: string }[] };

  for (const profileId of guardianIds) {
    await supabase.from('team_members').upsert(
      { team_id: toTeamId, profile_id: profileId, role: 'parent' },
      { onConflict: 'team_id,profile_id', ignoreDuplicates: true },
    );

    const stillHasChildOnOldTeam =
      (otherPlayersOnOldTeam ?? []).some((p) => p.profile_id === profileId) ||
      (otherGuardianLinks ?? []).some((g) => g.profile_id === profileId);

    if (!stillHasChildOnOldTeam) {
      await supabase.from('team_members').delete()
        .eq('team_id', fromTeamId).eq('profile_id', profileId).eq('role', 'parent');
    }
  }

  return { error: null };
}
