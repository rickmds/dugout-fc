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

  const { data: events } = await supabase
    .from('events')
    .select('id, title, type, team_id, event_time, location, teams(clubs(slug))')
    .eq('event_date', today)
    .is('cancelled_at', null)
    .returns<{
      id: string; title: string; type: string; team_id: string; event_time: string | null; location: string | null;
      teams: { clubs: { slug: string } | null } | null;
    }[]>();

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

  const notificationRows: { profile_id: string; type: string; title: string; body: string; data: Record<string, unknown> }[] = [];
  for (const ev of events) {
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
