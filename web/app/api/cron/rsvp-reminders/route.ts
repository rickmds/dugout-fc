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
      .is('cancelled_at', null)
      .gt('rsvp_lock_at', now.toISOString())
      .lte('rsvp_lock_at', threshold.toISOString())
      .returns<ReminderEvent[]>();

    if (!events?.length) continue;

    // Skip entirely during this event's own club's quiet hours rather than
    // sending. Nothing is lost: not marked sent, so it just sits eligible
    // until the next hourly run lands in daytime for that club.
    const eligible = events.filter(ev => {
      const clubTimeZone = ev.teams?.clubs?.timezone ?? 'America/New_York';
      const hour = localHour(now, clubTimeZone);
      return hour < 21 && hour >= 7;
    });
    if (!eligible.length) continue;

    // Everything below used to be one round trip per event (players, rsvps,
    // guardians, the mark-sent update, notifications insert, push tokens) —
    // batched here into a handful of round trips across the whole window
    // instead, since this scales directly with club count and event volume.
    const teamIds  = [...new Set(eligible.map(ev => ev.team_id))];
    const eventIds = eligible.map(ev => ev.id);

    const [{ data: allPlayers }, { data: allRsvps }] = await Promise.all([
      supabase.from('players').select('id, team_id, profile_id').in('team_id', teamIds),
      supabase.from('event_rsvps').select('event_id, player_id').in('event_id', eventIds),
    ]);

    const playersByTeam = new Map<string, { id: string; profile_id: string | null }[]>();
    for (const p of allPlayers ?? []) {
      if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, []);
      playersByTeam.get(p.team_id)!.push({ id: p.id, profile_id: p.profile_id });
    }
    const rsvpedByEvent = new Map<string, Set<string>>();
    for (const r of allRsvps ?? []) {
      if (!rsvpedByEvent.has(r.event_id)) rsvpedByEvent.set(r.event_id, new Set());
      rsvpedByEvent.get(r.event_id)!.add(r.player_id);
    }

    const pendingPlayersByEvent = new Map<string, { id: string; profile_id: string | null }[]>();
    const allPendingPlayerIds = new Set<string>();
    for (const ev of eligible) {
      const rsvped = rsvpedByEvent.get(ev.id) ?? new Set();
      const pending = (playersByTeam.get(ev.team_id) ?? []).filter(p => !rsvped.has(p.id));
      pendingPlayersByEvent.set(ev.id, pending);
      for (const p of pending) allPendingPlayerIds.add(p.id);
    }

    // A player can have more than one guardian (player_guardians,
    // additive to the legacy single-column players.profile_id) — this
    // used to resolve "who's the parent" via invites.email -> auth user,
    // a fragile path that misses second guardians entirely and can drift
    // if an email changes. Read the real guardian relationships instead.
    const { data: guardianRows } = allPendingPlayerIds.size
      ? await supabase.from('player_guardians').select('player_id, profile_id').in('player_id', [...allPendingPlayerIds])
      : { data: [] };
    const guardiansByPlayer = new Map<string, string[]>();
    for (const g of guardianRows ?? []) {
      if (!guardiansByPlayer.has(g.player_id)) guardiansByPlayer.set(g.player_id, []);
      guardiansByPlayer.get(g.player_id)!.push(g.profile_id);
    }

    // Mark sent regardless of whether anyone ended up eligible for a push —
    // the reminder was "due" for every event in `eligible` either way, and
    // we never want to re-check it every hour for the rest of the day.
    await supabase.from('events').update({ [window.column]: now.toISOString() }).in('id', eventIds);

    const notificationRows: { profile_id: string; type: string; title: string; body: string; data: Record<string, unknown> }[] = [];
    for (const ev of eligible) {
      const pending = pendingPlayersByEvent.get(ev.id) ?? [];
      if (!pending.length) continue;

      const parentProfileIds = [...new Set([
        ...pending.map(p => p.profile_id).filter(Boolean) as string[],
        ...pending.flatMap(p => guardiansByPlayer.get(p.id) ?? []),
      ])];
      if (!parentProfileIds.length) continue;

      const eventLabel = ev.event_time ? `${ev.title} at ${ev.event_time.slice(0, 5)}` : ev.title;
      for (const profile_id of parentProfileIds) {
        notificationRows.push({
          profile_id, type: 'rsvp_reminder', title: window.title, body: window.body(eventLabel),
          data: { type: 'rsvp_reminder', event_id: ev.id, club_slug: ev.teams?.clubs?.slug ?? '' },
        });
      }
    }

    if (!notificationRows.length) continue;

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
    if (messages.length) {
      await sendExpoPush(messages);
      totalSent += messages.length;
    }
  }

  return NextResponse.json({ sent: totalSent });
}
