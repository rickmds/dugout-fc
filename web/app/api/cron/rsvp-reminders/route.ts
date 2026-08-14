import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ReminderEvent = {
  id: string;
  title: string;
  team_id: string;
  rsvp_lock_at: string | null;
  event_time: string | null;
  teams: { clubs: { slug: string } | null } | null;
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();

  // Two reminder windows (cron runs hourly — each window is 1h wide so each event hits once):
  // 1. 24h reminder  — lock_at between 23h and 25h from now
  // 2. Last-chance   — lock_at between now and 2h from now
  const windows = [
    {
      from: new Date(now.getTime() + 23 * 60 * 60 * 1000),
      to:   new Date(now.getTime() + 25 * 60 * 60 * 1000),
      title: '⏰ RSVP closes tomorrow',
      body:  (label: string) => `RSVP closes in 24 hours for ${label}`,
    },
    {
      from: now,
      to:   new Date(now.getTime() + 2 * 60 * 60 * 1000),
      title: '🚨 Last chance to RSVP',
      body:  (label: string) => `RSVP closes in 2 hours for ${label}`,
    },
  ];

  let totalSent = 0;

  // Resolve all auth users once (paginated — listUsers caps at 1000 per page)
  const emailToUserId: Record<string, string> = {};
  let page = 1;
  while (true) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    users.forEach((u) => { if (u.email) emailToUserId[u.email.toLowerCase()] = u.id; });
    const nextPage = data && 'nextPage' in data ? data.nextPage : null;
    if (!nextPage) break;
    page = nextPage;
  }

  for (const window of windows) {
    const { data: events } = await supabase
      .from('events')
      .select('id, title, team_id, rsvp_lock_at, event_time, teams(clubs(slug))')
      .gte('rsvp_lock_at', window.from.toISOString())
      .lte('rsvp_lock_at', window.to.toISOString())
      .returns<ReminderEvent[]>();

    if (!events?.length) continue;

    for (const ev of events) {
      const { data: players } = await supabase
        .from('players').select('id').eq('team_id', ev.team_id);
      if (!players?.length) continue;

      const { data: rsvps } = await supabase
        .from('event_rsvps').select('player_id').eq('event_id', ev.id);
      const rsvpedIds = new Set((rsvps ?? []).map(r => r.player_id));

      const pendingPlayerIds = players.map(p => p.id).filter(id => !rsvpedIds.has(id));
      if (!pendingPlayerIds.length) continue;

      const { data: invites } = await supabase
        .from('invites').select('player_id, email').in('player_id', pendingPlayerIds);
      if (!invites?.length) continue;

      const parentProfileIds = invites
        .map(inv => emailToUserId[inv.email?.toLowerCase()])
        .filter(Boolean) as string[];
      if (!parentProfileIds.length) continue;

      const eventLabel = ev.event_time
        ? `${ev.title} at ${ev.event_time.slice(0, 5)}`
        : ev.title;
      const pushTitle = window.title;
      const pushBody  = window.body(eventLabel);

      await supabase.from('notifications').insert(
        parentProfileIds.map(profile_id => ({
          profile_id,
          type: 'rsvp_reminder',
          title: pushTitle,
          body: pushBody,
          data: { type: 'rsvp_reminder', event_id: ev.id, club_slug: ev.teams?.clubs?.slug ?? '' },
        }))
      );

      const { data: tokens } = await supabase
        .from('push_tokens').select('token').in('profile_id', parentProfileIds);
      if (!tokens?.length) continue;

      const messages = tokens.map(t => ({
        to: t.token,
        title: pushTitle,
        body: pushBody,
        sound: 'default',
        data: { type: 'rsvp_reminder', event_id: ev.id },
      }));

      for (let i = 0; i < messages.length; i += 100) {
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(messages.slice(i, i + 100)),
        });
      }

      totalSent += messages.length;
    }
  }

  return NextResponse.json({ sent: totalSent });
}
