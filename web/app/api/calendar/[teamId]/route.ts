import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// All current clubs are in the US Eastern timezone (no per-club timezone
// column exists yet) — event_time is the wall-clock time a coach typed in,
// meant as local time there, not UTC.
const CLUB_TIME_ZONE = 'America/New_York';

// A bare "DTSTART:20260901T180000" (no Z, no TZID) is technically "floating"
// time per RFC 5545 and should render as 6pm in the VIEWER's own timezone —
// but Google Calendar's URL-subscription reader (and some other clients)
// treat it as UTC instead, which for US Eastern in daylight time silently
// shifted every event 4 hours earlier (6:00 PM training showing as 2:00 PM).
// Emitting an explicit "Z"-suffixed UTC instant sidesteps that ambiguity
// entirely — every client agrees on what a real UTC timestamp means.
function offsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - date.getTime()) / 60000;
}

function localToUtcIcs(dateStr: string, timeStr: string, addMins = 0): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const actualUtcMs = utcGuess.getTime() - offsetMinutes(utcGuess, CLUB_TIME_ZONE) * 60000 + addMins * 60000;
  return new Date(actualUtcMs).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
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
    .select('id, title, type, event_date, event_time, duration_minutes, location, address')
    .eq('team_id', teamId)
    .order('event_date')
    .order('event_time');

  const calName = [team.name, team.age_group, team.season].filter(Boolean).join(' · ');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pulse FC//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-CALDESC:Team schedule powered by Pulse FC',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const ev of events ?? []) {
    const d = ev.event_date.replace(/-/g, '');
    const hasTime = Boolean(ev.event_time);
    const durMins = ev.duration_minutes ?? (ev.type === 'game' ? 90 : 60);

    const dtStart = hasTime ? localToUtcIcs(ev.event_date, ev.event_time!) : d;
    const dtEnd = hasTime ? localToUtcIcs(ev.event_date, ev.event_time!, durMins) : d;

    const loc = ev.address || ev.location || '';
    const typeLabel = ev.type === 'game' ? 'Game' : ev.type === 'training' ? 'Training' : 'Event';

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@pulse-fc.app`);
    lines.push(hasTime ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(hasTime ? `DTEND:${dtEnd}` : `DTEND;VALUE=DATE:${dtEnd}`);
    lines.push(`SUMMARY:${esc(ev.title)}`);
    if (loc) lines.push(`LOCATION:${esc(loc)}`);
    lines.push(`DESCRIPTION:${esc(`${typeLabel} · Pulse FC`)}`);
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
