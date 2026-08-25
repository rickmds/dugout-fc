import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendExpoPush } from '@/lib/expoPush';

// This cron scans events across every club in one batch, so quiet hours
// have to be judged per event against that event's own club timezone, not
// one global gate — otherwise a club outside US Eastern either gets woken
// at 2am their time or has its daytime window silently skipped.
function localHour(date: Date, timeZone: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date),
    10
  );
}

type ReminderEvent = {
  id: string;
  title: string;
  team_id: string;
  rsvp_lock_at: string | null;
  event_time: string | null;
  teams: { clubs: { slug: string; timezone: string | null } | null } | null;
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();

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

  for (const window of windows) {
    const threshold = new Date(now.getTime() + window.thresholdHours * 60 * 60 * 1000);
    const { data: events } = await supabase
      .from('events')
      .select('id, title, team_id, rsvp_lock_at, event_time, teams(clubs(slug, timezone))')
      .is(window.column, null)
      .gt('rsvp_lock_at', now.toISOString())
      .lte('rsvp_lock_at', threshold.toISOString())
      .returns<ReminderEvent[]>();

    if (!events?.length) continue;

    for (const ev of events) {
      // Skip entirely during this event's own club's quiet hours rather
      // than sending. Nothing is lost: not marked sent, so it just sits
      // eligible until the next hourly run lands in daytime for that club.
      const clubTimeZone = ev.teams?.clubs?.timezone ?? 'America/New_York';
      const hour = localHour(now, clubTimeZone);
      if (hour >= 21 || hour < 7) continue;

      const { data: players } = await supabase
        .from('players').select('id, profile_id').eq('team_id', ev.team_id);
      if (!players?.length) { await supabase.from('events').update({ [window.column]: now.toISOString() }).eq('id', ev.id); continue; }

      const { data: rsvps } = await supabase
        .from('event_rsvps').select('player_id').eq('event_id', ev.id);
      const rsvpedIds = new Set((rsvps ?? []).map(r => r.player_id));

      const pendingPlayers = players.filter(p => !rsvpedIds.has(p.id));
      if (!pendingPlayers.length) { await supabase.from('events').update({ [window.column]: now.toISOString() }).eq('id', ev.id); continue; }

      // A player can have more than one guardian (player_guardians,
      // additive to the legacy single-column players.profile_id) — this
      // used to resolve "who's the parent" via invites.email -> auth user,
      // a fragile path that misses second guardians entirely and can drift
      // if an email changes. Read the real guardian relationships instead.
      const { data: guardianRows } = await supabase
        .from('player_guardians').select('player_id, profile_id')
        .in('player_id', pendingPlayers.map(p => p.id));

      const parentProfileIds = [...new Set([
        ...pendingPlayers.map(p => p.profile_id).filter(Boolean),
        ...(guardianRows ?? []).map(g => g.profile_id),
      ])] as string[];

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

      await sendExpoPush(messages);

      totalSent += messages.length;
    }
  }

  return NextResponse.json({ sent: totalSent });
}
