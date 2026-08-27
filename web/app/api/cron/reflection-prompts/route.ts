import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { zonedTimeToUtc } from '@/lib/timezone';
import { sendExpoPush } from '@/lib/expoPush';

// Falls back to a deliberately conservative estimate when an event has no
// duration_minutes set — long enough to clear warmup, halftime, and extra
// time for any age group. The one hard requirement from the product call
// was "never beforehand"; erring toward a slightly later prompt is the
// safe direction to be wrong in, erring early is not.
const FALLBACK_GAME_DURATION_MINUTES = 120;
const PROMPT_WINDOW_MINUTES = 30;

type CandidateEvent = {
  id: string; team_id: string; title: string; event_date: string; event_time: string | null; duration_minutes: number | null;
  teams: { name: string; clubs: { slug: string | null; timezone: string | null } | null } | null;
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();

  // Candidate set: recent game events with a known start time that
  // haven't been prompted yet. Exact eligibility (has the assumed end
  // time fallen inside the 30-minute prompt window) is computed below in
  // JS — Supabase's query builder can't cleanly combine a date + time
  // column into one comparable timestamp.
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: candidates, error } = await supabase
    .from('events')
    .select('id, team_id, title, event_date, event_time, duration_minutes, teams!inner(name, clubs!inner(slug, timezone))')
    .eq('type', 'game')
    .is('reflection_prompt_sent_at', null)
    .not('event_time', 'is', null)
    .gte('event_date', twoDaysAgo)
    .returns<CandidateEvent[]>();

  if (error) {
    console.error('reflection-prompts cron: query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligible = (candidates ?? []).filter(ev => {
    // One event with a bad date/time/timezone must not throw here — this
    // runs inside .filter() over every candidate, so an uncaught throw
    // would kill reflection prompts for every OTHER event in this run too,
    // not just the bad one, with nobody watching a cron job to notice.
    try {
      const start = zonedTimeToUtc(ev.event_date, ev.event_time!, ev.teams?.clubs?.timezone ?? 'America/New_York');
      const durationMinutes = ev.duration_minutes ?? FALLBACK_GAME_DURATION_MINUTES;
      const windowStart = new Date(start.getTime() + durationMinutes * 60000);
      const windowEnd   = new Date(windowStart.getTime() + PROMPT_WINDOW_MINUTES * 60000);
      return now >= windowStart && now <= windowEnd;
    } catch (err) {
      console.error(`reflection-prompts cron: skipping event ${ev.id}`, err);
      return false;
    }
  });

  let notified = 0;
  let events = 0;

  for (const event of eligible) {
    // Atomic claim — if this returns no rows, another overlapping
    // invocation already grabbed this event; skip rather than double-send.
    const { data: claimed } = await supabase
      .from('events')
      .update({ reflection_prompt_sent_at: now.toISOString() })
      .eq('id', event.id)
      .is('reflection_prompt_sent_at', null)
      .select('id');
    if (!claimed?.length) continue;

    events++;
    notified += await notifyRoster(supabase, event);
  }

  console.log(`reflection-prompts cron: events=${events} notified=${notified}`);
  return NextResponse.json({ events, notified });
}

async function notifyRoster(supabase: ReturnType<typeof supabaseAdmin>, event: CandidateEvent): Promise<number> {
  const { data: players } = await supabase
    .from('players').select('id, full_name, profile_id').eq('team_id', event.team_id);
  if (!players?.length) return 0;

  const { data: guardianRows } = await supabase
    .from('player_guardians').select('player_id, profile_id').in('player_id', players.map(p => p.id));

  const clubSlug = event.teams?.clubs?.slug ?? '';
  let notified = 0;

  for (const player of players) {
    const guardianIds = new Set<string>();
    if (player.profile_id) guardianIds.add(player.profile_id);
    for (const g of guardianRows ?? []) if (g.player_id === player.id) guardianIds.add(g.profile_id);
    if (guardianIds.size === 0) continue;

    const notifBody = `Tap to share how ${player.full_name.split(' ')[0]} felt about ${event.title || 'the game'}`;
    await supabase.from('notifications').insert(
      Array.from(guardianIds).map(profile_id => ({
        profile_id,
        type: 'reflection_prompt',
        title: '🎯 How did the game go?',
        body: notifBody,
        data: { type: 'reflection_prompt', event_id: event.id, player_id: player.id, club_slug: clubSlug },
      })),
    );

    const { data: tokens } = await supabase
      .from('push_tokens').select('token').in('profile_id', Array.from(guardianIds));
    if (tokens?.length) {
      await sendExpoPush(tokens.map(t => ({
        to: t.token, title: '🎯 How did the game go?', body: notifBody, sound: 'default',
        data: { type: 'reflection_prompt', event_id: event.id, player_id: player.id, club_slug: clubSlug },
      })));
    }
    notified++;
  }

  return notified;
}
