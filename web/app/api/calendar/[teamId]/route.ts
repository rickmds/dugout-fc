import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function addMinutes(date: string, time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  const d = date.replace(/-/g, '');
  return `${d}T${String(eh).padStart(2, '0')}${String(em).padStart(2, '0')}00`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  const supabase = supabaseAdmin();

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, age_group, season')
    .eq('id', teamId)
    .single();

  if (!team) return new NextResponse('Not found', { status: 404 });

  const { data: events } = await supabase
    .from('events')
    .select('id, title, type, event_date, event_time, location, address')
    .eq('team_id', teamId)
    .order('event_date')
    .order('event_time');

  const calName = [team.name, team.age_group, team.season].filter(Boolean).join(' · ');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dugout FC//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-CALDESC:Team schedule powered by Dugout FC',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const ev of events ?? []) {
    const d = ev.event_date.replace(/-/g, '');
    const hasTime = Boolean(ev.event_time);
    const durMins = ev.type === 'game' ? 90 : 60;

    const dtStart = hasTime
      ? `${d}T${ev.event_time!.replace(/:/g, '').slice(0, 6).padEnd(6, '0')}`
      : d;
    const dtEnd = hasTime
      ? addMinutes(ev.event_date, ev.event_time!, durMins)
      : d;

    const loc = ev.address || ev.location || '';
    const typeLabel = ev.type === 'game' ? 'Game' : ev.type === 'training' ? 'Training' : 'Event';

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@dugoutfc.app`);
    lines.push(hasTime ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(hasTime ? `DTEND:${dtEnd}` : `DTEND;VALUE=DATE:${dtEnd}`);
    lines.push(`SUMMARY:${esc(ev.title)}`);
    if (loc) lines.push(`LOCATION:${esc(loc)}`);
    lines.push(`DESCRIPTION:${esc(`${typeLabel} · Dugout FC`)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
