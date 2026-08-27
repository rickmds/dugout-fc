import { supabase } from './supabase';
import { sendTeamPush } from './push';

export const RESULT_COLORS = { W: '#22c55e', L: '#ef4444', D: '#9ca3af' } as const;

export function getGameResult(event: { type: string; score_home: number | null; score_away: number | null }): { label: 'W' | 'L' | 'D'; ourScore: number; oppScore: number } | null {
  if (event.type !== 'game' || event.score_home == null || event.score_away == null) return null;
  // Match tracker always writes score_home = our score, score_away = opponent score
  const ourScore = event.score_home;
  const oppScore = event.score_away;
  const label = ourScore > oppScore ? 'W' : ourScore < oppScore ? 'L' : 'D';
  return { label, ourScore, oppScore };
}

const MONTH_DAY = { month: 'short', day: 'numeric' } as const;

function fmt(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', MONTH_DAY);
}

// Derives a tournament's displayed date range purely from whichever games
// are actually linked to it — a tournament never stores its own dates, so
// this is the only source of truth. Empty on purpose for a State Cup entry
// that only has future rounds not yet scheduled.
export function formatTournamentDateRange(dates: (string | null)[]): string {
  const real = dates.filter((d): d is string => !!d).sort();
  if (real.length === 0) return 'Dates TBD';
  const first = real[0];
  const last = real[real.length - 1];
  if (first === last) return fmt(first);
  return `${fmt(first)} – ${fmt(last)}`;
}

// Relative "how soon" label for a nested tournament game row — adds real
// at-a-glance info beyond the date already shown next to it. Always fills
// the slot for an upcoming game (never null) so rows stay visually
// consistent — falls back to a short date once "in N weeks" stops being a
// useful granularity.
export function formatGameCountdown(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const gameDate = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round((gameDate.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 6) return `In ${diffDays} days`;
  if (diffDays <= 27) {
    const weeks = Math.floor(diffDays / 7);
    return `In ${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  return fmt(dateStr);
}

// Only for a knockout (undated) tournament — a round-robin/weekend
// tournament plays every game regardless of result, so "advanced" /
// "eliminated" framing doesn't apply there. Shared by every score-entry
// surface (Match Tracker's "Save Result & Close", the lightweight score
// editor on the event detail screen) — call exactly once, when a final
// score is actually saved, not on every +/- tap while it's being adjusted.
export async function sendTournamentResultPush(
  tournamentId: string | null,
  teamId: string | null,
  finalHome: number,
  finalAway: number,
): Promise<void> {
  if (!tournamentId || !teamId) return;
  try {
    const { data: t } = await supabase.from('tournaments').select('name,start_date').eq('id', tournamentId).single();
    if (!t || t.start_date) return; // dated (round-robin) — no advance/eliminated messaging
    const result = getGameResult({ type: 'game', score_home: finalHome, score_away: finalAway });
    if (!result || result.label === 'D') return; // no score, or a draw — nothing clear to announce
    const won = result.label === 'W';
    await sendTeamPush({
      teamId,
      title: won ? "🎉 You're through!" : 'Tournament complete',
      body: won
        ? `Final: ${finalHome}–${finalAway}. ${t.name} continues — nice work advancing!`
        : `Final: ${finalHome}–${finalAway}. ${t.name} ends here — great run.`,
      data: { type: won ? 'tournament_advance' : 'tournament_eliminated', tournament_id: tournamentId, team_id: teamId },
    });
  } catch (err) {
    console.warn('[sendTournamentResultPush] failed', err);
  }
}
