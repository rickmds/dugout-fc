import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendExpoPush } from '@/lib/expoPush';

// Same batching/idempotency shape as rsvp-reminders/route.ts, adapted for
// tournament entry RSVP — one reminder, not the dual 24h/2h pattern
// per-game RSVP uses, since an entry deadline is typically days or weeks
// out (a real commitment/budget decision), not hours before kickoff.
function localHour(date: Date, timeZone: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date),
    10
  );
}

type ReminderTournament = {
  id: string;
  name: string;
  team_id: string;
  entry_rsvp_lock_at: string | null;
  teams: { clubs: { slug: string; timezone: string | null } | null } | null;
};

const THRESHOLD_HOURS = 49; // ~48h notice, +1h buffer against the hourly cron grid

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();
  const threshold = new Date(now.getTime() + THRESHOLD_HOURS * 60 * 60 * 1000);

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, team_id, entry_rsvp_lock_at, teams(clubs(slug, timezone))')
    .is('entry_rsvp_reminder_sent_at', null)
    .is('cancelled_at', null)
    .gt('entry_rsvp_lock_at', now.toISOString())
    .lte('entry_rsvp_lock_at', threshold.toISOString())
    .returns<ReminderTournament[]>();

  if (!tournaments?.length) return NextResponse.json({ sent: 0 });

  // Scans every club in one batch — quiet hours judged per tournament
  // against that tournament's own club timezone, same reasoning as
  // rsvp-reminders. Skipped (not marked sent) rather than sent late, so it
  // just sits eligible until the next hourly run lands in daytime there.
  const eligible = tournaments.filter(t => {
    const clubTimeZone = t.teams?.clubs?.timezone ?? 'America/New_York';
    const hour = localHour(now, clubTimeZone);
    return hour < 21 && hour >= 7;
  });
  if (!eligible.length) return NextResponse.json({ sent: 0 });

  const teamIds = [...new Set(eligible.map(t => t.team_id))];
  const tournamentIds = eligible.map(t => t.id);

  const [{ data: allPlayers }, { data: allEntryRsvps }] = await Promise.all([
    supabase.from('players').select('id, team_id, profile_id').in('team_id', teamIds),
    supabase.from('tournament_rsvps').select('tournament_id, player_id').in('tournament_id', tournamentIds),
  ]);

  const playersByTeam = new Map<string, { id: string; profile_id: string | null }[]>();
  for (const p of allPlayers ?? []) {
    if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, []);
    playersByTeam.get(p.team_id)!.push({ id: p.id, profile_id: p.profile_id });
  }
  const respondedByTournament = new Map<string, Set<string>>();
  for (const r of allEntryRsvps ?? []) {
    if (!respondedByTournament.has(r.tournament_id)) respondedByTournament.set(r.tournament_id, new Set());
    respondedByTournament.get(r.tournament_id)!.add(r.player_id);
  }

  const pendingPlayersByTournament = new Map<string, { id: string; profile_id: string | null }[]>();
  const allPendingPlayerIds = new Set<string>();
  for (const t of eligible) {
    const responded = respondedByTournament.get(t.id) ?? new Set();
    const pending = (playersByTeam.get(t.team_id) ?? []).filter(p => !responded.has(p.id));
    pendingPlayersByTournament.set(t.id, pending);
    for (const p of pending) allPendingPlayerIds.add(p.id);
  }

  const { data: guardianRows } = allPendingPlayerIds.size
    ? await supabase.from('player_guardians').select('player_id, profile_id').in('player_id', [...allPendingPlayerIds])
    : { data: [] };
  const guardiansByPlayer = new Map<string, string[]>();
  for (const g of guardianRows ?? []) {
    if (!guardiansByPlayer.has(g.player_id)) guardiansByPlayer.set(g.player_id, []);
    guardiansByPlayer.get(g.player_id)!.push(g.profile_id);
  }

  // Marked sent regardless of whether anyone ended up eligible for a push —
  // the reminder was "due" for every tournament in `eligible` either way.
  await supabase.from('tournaments').update({ entry_rsvp_reminder_sent_at: now.toISOString() }).in('id', tournamentIds);

  const notificationRows: { profile_id: string; type: string; title: string; body: string; data: Record<string, unknown> }[] = [];
  for (const t of eligible) {
    const pending = pendingPlayersByTournament.get(t.id) ?? [];
    if (!pending.length) continue;

    const parentProfileIds = [...new Set([
      ...pending.map(p => p.profile_id).filter(Boolean) as string[],
      ...pending.flatMap(p => guardiansByPlayer.get(p.id) ?? []),
    ])];
    if (!parentProfileIds.length) continue;

    for (const profile_id of parentProfileIds) {
      notificationRows.push({
        profile_id,
        type: 'tournament_rsvp_reminder',
        title: '⏰ Confirm you\'re in',
        body: `RSVP for ${t.name} closes in 2 days — let your coach know if you're in.`,
        data: {
          type: 'tournament_rsvp_reminder', tournament_id: t.id, team_id: t.team_id,
          club_slug: t.teams?.clubs?.slug ?? '',
        },
      });
    }
  }

  if (!notificationRows.length) return NextResponse.json({ sent: 0 });

  await supabase.from('notifications').insert(notificationRows);

  const allProfileIds = [...new Set(notificationRows.map(n => n.profile_id))];
  const { data: tokenRows } = await supabase.from('push_tokens').select('token, profile_id').in('profile_id', allProfileIds);
  const tokensByProfile = new Map<string, string[]>();
  for (const t of tokenRows ?? []) {
    if (!tokensByProfile.has(t.profile_id)) tokensByProfile.set(t.profile_id, []);
    tokensByProfile.get(t.profile_id)!.push(t.token);
  }

  const messages = notificationRows.flatMap(n =>
    (tokensByProfile.get(n.profile_id) ?? []).map(token => ({
      to: token, title: n.title, body: n.body, sound: 'default' as const,
      data: n.data,
    }))
  );
  if (messages.length) await sendExpoPush(messages);

  return NextResponse.json({ sent: messages.length });
}
