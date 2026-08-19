import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// No per-club timezone in the schema yet — every club so far is US-based,
// so Eastern is the reference clock for "is it nighttime" purposes.
function easternHour(date: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(date),
    10
  );
}

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

  // Runs hourly (see vercel.json) — skip entirely during quiet hours rather
  // than sending. Nothing is lost: each reminder type only fires once
  // (tracked via events.rsvp_reminder_*_sent_at), so an event that becomes
  // "due" overnight just sits eligible until the next daytime run.
  const hour = easternHour(now);
  if (hour >= 21 || hour < 7) {
    return NextResponse.json({ sent: 0, reason: 'quiet_hours' });
  }

  // A reminder is "due" once the event comes within its threshold of
  // rsvp_lock_at (and hasn't closed yet) and hasn't already been sent —
  // a wide, idempotent window rather than a narrow one tied to exactly
  // when the cron happens to run.
  const windows = [
    {
      column: 'rsvp_reminder_24h_sent_at' as const,
      thresholdHours: 25,
      title: '⏰ RSVP closes tomorrow',
      body: (label: string) => `RSVP closes in 24 hours for ${label}`,
    },
    {
      column: 'rsvp_reminder_2h_sent_at' as const,
      thresholdHours: 2,
      title: '🚨 Last chance to RSVP',
      body: (label: string) => `RSVP closes in 2 hours for ${label}`,
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
    const threshold = new Date(now.getTime() + window.thresholdHours * 60 * 60 * 1000);
    const { data: events } = await supabase
      .from('events')
      .select('id, title, team_id, rsvp_lock_at, event_time, teams(clubs(slug))')
      .is(window.column, null)
      .gt('rsvp_lock_at', now.toISOString())
      .lte('rsvp_lock_at', threshold.toISOString())
      .returns<ReminderEvent[]>();

    if (!events?.length) continue;

    for (const ev of events) {
      const { data: players } = await supabase
        .from('players').select('id').eq('team_id', ev.team_id);
      if (!players?.length) { await supabase.from('events').update({ [window.column]: now.toISOString() }).eq('id', ev.id); continue; }

      const { data: rsvps } = await supabase
        .from('event_rsvps').select('player_id').eq('event_id', ev.id);
      const rsvpedIds = new Set((rsvps ?? []).map(r => r.player_id));

      const pendingPlayerIds = players.map(p => p.id).filter(id => !rsvpedIds.has(id));
      if (!pendingPlayerIds.length) { await supabase.from('events').update({ [window.column]: now.toISOString() }).eq('id', ev.id); continue; }

      const { data: invites } = await supabase
        .from('invites').select('player_id, email').in('player_id', pendingPlayerIds);

      const parentProfileIds = (invites ?? [])
        .map(inv => emailToUserId[inv.email?.toLowerCase()])
        .filter(Boolean) as string[];

      // Mark sent regardless of whether anyone ended up eligible for a
      // push — the reminder was "due" for this event either way, and we
      // never want to re-check it every hour for the rest of the day.
      await supabase.from('events').update({ [window.column]: now.toISOString() }).eq('id', ev.id);

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
