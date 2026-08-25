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

  let totalSent = 0;

  for (const ev of events) {
    // All team members
    const { data: members } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', ev.team_id);
    if (!members?.length) continue;

    const profileIds = members.map(m => m.profile_id).filter(Boolean);

    const timeStr = ev.event_time ? ev.event_time.slice(0, 5) : null;
    const icon    = ev.type === 'game' ? '🏟️' : ev.type === 'training' ? '⚽' : '📅';
    const kind    = ev.type === 'game' ? 'Game day' : ev.type === 'training' ? 'Training today' : 'Event today';
    const parts   = [ev.title, timeStr, ev.location].filter(Boolean);
    const pushTitle = `${icon} ${kind}`;
    const pushBody  = parts.join(' · ');

    // In-app notifications
    await supabase.from('notifications').insert(
      profileIds.map(profile_id => ({
        profile_id,
        type: 'event_day_reminder',
        title: pushTitle,
        body: pushBody,
        data: { type: 'event_day_reminder', event_id: ev.id, club_slug: ev.teams?.clubs?.slug ?? '' },
      }))
    );

    // Push tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('profile_id', profileIds);
    if (!tokens?.length) continue;

    const messages = tokens.map(t => ({
      to: t.token,
      title: pushTitle,
      body: pushBody,
      sound: 'default',
      data: { type: 'event_day_reminder', event_id: ev.id },
    }));

    await sendExpoPush(messages);

    totalSent += messages.length;
  }

  return NextResponse.json({ sent: totalSent, events: events.length });
}
