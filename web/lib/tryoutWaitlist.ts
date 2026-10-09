import { supabaseAdmin } from '@/lib/supabase';
import { sendTryoutOfferEmail } from '@/lib/tryoutOffer';

type SupabaseAdmin = ReturnType<typeof supabaseAdmin>;

const RESERVED_TEAMS = ['Unassigned', 'Cut', 'Declined'];

export type AdvanceWaitlistResult = { promoted: { playerId: string; name: string } | null };

// Called whenever a roster spot opens up on a real team (an accepted/offered
// player declines). Looks up the lowest waitlist_position candidate still
// waitlisted for that exact team, auto-offers them the open spot (the same
// real offer email a staff click would send), and compacts everyone else's
// position down by one so the line stays gap-free.
export async function advanceWaitlistForTeam(sb: SupabaseAdmin, clubId: string, teamName: string | null): Promise<AdvanceWaitlistResult> {
  if (!teamName || RESERVED_TEAMS.includes(teamName)) return { promoted: null };

  const { data: next } = await sb
    .from('tryout_assignments')
    .select('player_id, waitlist_position, tryout_players(first_name,last_name)')
    .eq('club_id', clubId)
    .eq('team', teamName)
    .eq('status', 'Waitlist')
    .not('waitlist_position', 'is', null)
    .order('waitlist_position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) return { promoted: null };

  const playerId = next.player_id as string;
  await sb.from('tryout_assignments')
    .update({ status: 'Offer', waitlist_position: null })
    .eq('player_id', playerId)
    .eq('club_id', clubId);

  // Compact the remaining waitlist for this team so position 2 becomes 1, etc.
  const { data: remaining } = await sb
    .from('tryout_assignments')
    .select('player_id, waitlist_position')
    .eq('club_id', clubId)
    .eq('team', teamName)
    .eq('status', 'Waitlist')
    .not('waitlist_position', 'is', null)
    .order('waitlist_position', { ascending: true });

  for (const row of remaining ?? []) {
    await sb.from('tryout_assignments')
      .update({ waitlist_position: (row.waitlist_position as number) - 1 })
      .eq('player_id', row.player_id as string)
      .eq('club_id', clubId);
  }

  const result = await sendTryoutOfferEmail(sb, playerId, clubId);
  if (!result.ok) console.error('advanceWaitlistForTeam: auto-offer email failed', result.error);

  const player = next.tryout_players as unknown as { first_name: string; last_name: string } | null;
  const name = player ? `${player.first_name} ${player.last_name}`.trim() : 'A waitlisted player';
  return { promoted: { playerId, name } };
}

// Assigns the next available waitlist position for a team (1-indexed).
export async function nextWaitlistPosition(sb: SupabaseAdmin, clubId: string, teamName: string): Promise<number> {
  const { data } = await sb
    .from('tryout_assignments')
    .select('waitlist_position')
    .eq('club_id', clubId)
    .eq('team', teamName)
    .eq('status', 'Waitlist')
    .not('waitlist_position', 'is', null)
    .order('waitlist_position', { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.waitlist_position as number | undefined) ?? 0) + 1;
}
