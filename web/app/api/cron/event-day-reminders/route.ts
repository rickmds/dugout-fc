import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC

  const { data: events } = await supabase
    .from('events')
    .select('id, title, type, team_id, event_time, location')
    .eq('event_date', today);

  if (!events?.length) return NextResponse.json({ sent: 0, reason: 'no_events_today' });

  let totalSent = 0;

  for (const ev of events) {
    // All team members
    const { data: members } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', ev.team_id);
    if (!members?.length) continue;

    const profileIds = members.map((m: any) => m.profile_id as string).filter(Boolean);

    const timeStr = ev.event_time ? ev.event_time.slice(0, 5) : null;
    const icon    = ev.type === 'game' ? '🏟️' : ev.type === 'training' ? '⚽' : '📅';
    const kind    = ev.type === 'game' ? 'Game day' : ev.type === 'training' ? 'Training today' : 'Event today';
    const parts   = [ev.title, timeStr, ev.location].filter(Boolean);
    const pushTitle = `${icon} ${kind}`;
    const pushBody  = parts.join(' · ');

    // In-app notifications
    await supabase.from('notifications').insert(
      profileIds.map((profile_id: string) => ({
        profile_id,
        type: 'event_day_reminder',
        title: pushTitle,
        body: pushBody,
        data: { type: 'event_day_reminder', event_id: ev.id },
      }))
    );

    // Push tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('profile_id', profileIds);
    if (!tokens?.length) continue;

    const messages = tokens.map((t: any) => ({
      to: t.token,
      title: pushTitle,
      body: pushBody,
      sound: 'default',
      data: { type: 'event_day_reminder', event_id: ev.id },
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
