import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function GET(req: NextRequest) {
  // Vercel cron sends requests with the CRON_SECRET in the Authorization header
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Events whose RSVP lock window is within the next 24 hours
  const { data: events } = await supabase
    .from('events')
    .select('id, title, team_id, rsvp_lock_at, event_date, event_time')
    .gte('rsvp_lock_at', now.toISOString())
    .lte('rsvp_lock_at', in24h.toISOString());

  if (!events?.length) return NextResponse.json({ sent: 0, reason: 'no_events' });

  let totalSent = 0;

  for (const ev of events) {
    // All players on the team
    const { data: players } = await supabase
      .from('players')
      .select('id')
      .eq('team_id', ev.team_id);
    if (!players?.length) continue;

    // Players who have already RSVP'd for this event
    const { data: rsvps } = await supabase
      .from('event_rsvps')
      .select('player_id')
      .eq('event_id', ev.id);
    const rsvpedIds = new Set((rsvps ?? []).map((r: any) => r.player_id));

    const pendingPlayerIds = players.map((p: any) => p.id).filter((id: string) => !rsvpedIds.has(id));
    if (!pendingPlayerIds.length) continue;

    // For each pending player, find the parent email via invites
    const { data: invites } = await supabase
      .from('invites')
      .select('player_id, email')
      .in('player_id', pendingPlayerIds);
    if (!invites?.length) continue;

    // Resolve parent auth user IDs in one listUsers call
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailToUserId: Record<string, string> = {};
    users.forEach((u) => { if (u.email) emailToUserId[u.email.toLowerCase()] = u.id; });

    const parentProfileIds = invites
      .map((inv: any) => emailToUserId[inv.email?.toLowerCase()])
      .filter(Boolean);
    if (!parentProfileIds.length) continue;

    const eventLabel = ev.event_time
      ? `${ev.title} at ${ev.event_time.slice(0, 5)}`
      : ev.title;
    const pushTitle = '⏰ RSVP needed';
    const pushBody  = `Please RSVP for ${eventLabel}`;

    // In-app notifications
    await supabase.from('notifications').insert(
      parentProfileIds.map((profile_id: string) => ({
        profile_id,
        type: 'rsvp_reminder',
        title: pushTitle,
        body: pushBody,
        data: { type: 'rsvp_reminder', event_id: ev.id },
      }))
    );

    // Push tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('profile_id', parentProfileIds);
    if (!tokens?.length) continue;

    const messages = tokens.map((t: any) => ({
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

  return NextResponse.json({ sent: totalSent, events: events.length });
}
