import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendExpoPush } from '@/lib/expoPush';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC

  type DayEvent = {
    id: string; title: string; type: string; team_id: string; event_time: string | null; location: string | null;
    tournament_id: string | null;
    teams: { clubs: { slug: string } | null } | null;
  };

  const { data: events } = await supabase
    .from('events')
    .select('id, title, type, team_id, event_time, location, tournament_id, teams(clubs(slug))')
    .eq('event_date', today)
    .is('cancelled_at', null)
    .returns<DayEvent[]>();

  if (!events?.length) return NextResponse.json({ sent: 0, reason: 'no_events_today' });

  // Batched across the whole day's events instead of one round trip per
  // event for team_members / notifications / push_tokens each — this cron
  // scales with (clubs × games/trainings scheduled that day), which grows
  // with every club onboarded.
  const teamIds = [...new Set(events.map(ev => ev.team_id))];
  const { data: allMembers } = await supabase.from('team_members').select('team_id, profile_id').in('team_id', teamIds);
  const membersByTeam = new Map<string, string[]>();
  for (const m of allMembers ?? []) {
    if (!m.profile_id) continue;
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
    membersByTeam.get(m.team_id)!.push(m.profile_id);
  }

  // A team with 2+ games under the SAME tournament today gets one
  // consolidated push instead of one per game — otherwise a 3-game
  // tournament day means 3 separate "Game day" notifications, which is the
  // opposite of what a digest is for. A tournament game that's the only one
  // for its tournament today still goes through the normal per-event path.
  const tournamentGroups = new Map<string, DayEvent[]>();
  const singletons: DayEvent[] = [];
  for (const ev of events) {
    if (!ev.tournament_id) { singletons.push(ev); continue; }
    const key = `${ev.team_id}|${ev.tournament_id}`;
    if (!tournamentGroups.has(key)) tournamentGroups.set(key, []);
    tournamentGroups.get(key)!.push(ev);
  }
  const consolidatedGroups: DayEvent[][] = [];
  for (const group of tournamentGroups.values()) {
    if (group.length >= 2) consolidatedGroups.push(group);
    else singletons.push(...group);
  }

  const tournamentIds = [...new Set(consolidatedGroups.map(g => g[0].tournament_id as string))];
  const { data: tournamentRows } = tournamentIds.length
    ? await supabase.from('tournaments').select('id, name').in('id', tournamentIds)
    : { data: [] as { id: string; name: string }[] };
  const tournamentNameById = new Map((tournamentRows ?? []).map(t => [t.id, t.name]));

  function fmt12h(t: string): string {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  const notificationRows: { profile_id: string; type: string; title: string; body: string; data: Record<string, unknown> }[] = [];

  for (const ev of singletons) {
    const profileIds = membersByTeam.get(ev.team_id) ?? [];
    if (!profileIds.length) continue;

    const timeStr = ev.event_time ? ev.event_time.slice(0, 5) : null;
    const icon    = ev.type === 'game' ? '🏟️' : ev.type === 'training' ? '⚽' : '📅';
    const kind    = ev.type === 'game' ? 'Game day' : ev.type === 'training' ? 'Training today' : 'Event today';
    const parts   = [ev.title, timeStr, ev.location].filter(Boolean);
    const pushTitle = `${icon} ${kind}`;
    const pushBody  = parts.join(' · ');

    for (const profile_id of profileIds) {
      notificationRows.push({
        profile_id, type: 'event_day_reminder', title: pushTitle, body: pushBody,
        data: { type: 'event_day_reminder', event_id: ev.id, club_slug: ev.teams?.clubs?.slug ?? '' },
      });
    }
  }

  for (const group of consolidatedGroups) {
    const { team_id, tournament_id, teams } = group[0];
    const profileIds = membersByTeam.get(team_id) ?? [];
    if (!profileIds.length) continue;

    const tName = tournamentNameById.get(tournament_id as string) ?? 'Tournament';
    const times = group.map(ev => ev.event_time?.slice(0, 5)).filter((t): t is string => !!t).sort().map(fmt12h);
    const pushTitle = `🏆 ${tName} today`;
    const pushBody = `${group.length} games today${times.length ? `: ${times.join(', ')}` : ''}`;

    for (const profile_id of profileIds) {
      notificationRows.push({
        profile_id, type: 'tournament_game_day', title: pushTitle, body: pushBody,
        data: { type: 'tournament_game_day', tournament_id, team_id, club_slug: teams?.clubs?.slug ?? '' },
      });
    }
  }

  if (!notificationRows.length) return NextResponse.json({ sent: 0, events: events.length });

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
      to: token, title: n.title, body: n.body, sound: 'default' as const, data: n.data,
    }))
  );
  if (messages.length) await sendExpoPush(messages);

  return NextResponse.json({ sent: messages.length, events: events.length });
}
