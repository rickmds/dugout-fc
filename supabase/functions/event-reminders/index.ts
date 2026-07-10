import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function sendPush(payload: {
  profile_ids: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  if (!payload.profile_ids.length) return;
  await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowIso = now.toISOString();
  // RSVP reminder window: events whose lock closes within the next 36 hours
  const window36h = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();
  // Guest deadline window: events within the next 48 hours
  const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];

  // ── 1. Game day push — events happening today ────────────────────────────
  const { data: todayEvents } = await supabase
    .from('events')
    .select('id, title, type, team_id, teams!inner(clubs!inner(slug))')
    .eq('event_date', todayStr)
    .is('cancelled_at', null);

  for (const event of todayEvents ?? []) {
    const { data: members } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', event.team_id);
    if (!members?.length) continue;

    const profileIds = members.map((m: any) => m.profile_id as string);
    const clubSlug = (event.teams as any)?.clubs?.slug ?? '';
    const typeLabel = event.type === 'game' ? 'Game day' : event.type === 'training' ? 'Training today' : 'Event today';

    await sendPush({
      profile_ids: profileIds,
      title: typeLabel,
      body: event.title,
      data: { type: 'game_day', event_id: event.id, club_slug: clubSlug },
    });
  }

  // ── 2. RSVP reminder — events where lock closes within 36h but is still open ──
  const { data: rsvpEvents } = await supabase
    .from('events')
    .select('id, title, type, team_id, rsvp_lock_at, teams!inner(clubs!inner(slug))')
    .gt('rsvp_lock_at', nowIso)      // still open right now
    .lte('rsvp_lock_at', window36h)   // closes within 36 hours
    .is('cancelled_at', null);

  for (const event of rsvpEvents ?? []) {
    // Only send to players who haven't responded yet
    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, profile_id')
      .eq('team_id', event.team_id)
      .not('profile_id', 'is', null);

    if (!allPlayers?.length) continue;

    const { data: existingRsvps } = await supabase
      .from('event_rsvps')
      .select('player_id')
      .eq('event_id', event.id);

    const respondedIds = new Set((existingRsvps ?? []).map((r: any) => r.player_id as string));
    const pendingProfileIds = (allPlayers as any[])
      .filter((p) => !respondedIds.has(p.id) && p.profile_id)
      .map((p) => p.profile_id as string);

    if (!pendingProfileIds.length) continue;

    const lockTime = new Date(event.rsvp_lock_at);
    const hoursLeft = Math.round((lockTime.getTime() - now.getTime()) / (60 * 60 * 1000));
    const hoursText = hoursLeft <= 1 ? 'less than 1 hour' : `${hoursLeft} hours`;
    const clubSlug = (event.teams as any)?.clubs?.slug ?? '';

    await sendPush({
      profile_ids: pendingProfileIds,
      title: 'RSVP closes soon',
      body: `${event.title} — ${hoursText} left to respond`,
      data: { type: 'rsvp_reminder', event_id: event.id, club_slug: clubSlug },
    });
  }

  // ── 3. Guest deadline reminder — coaches notified when guests haven't confirmed ──
  const { data: upcomingEvents } = await supabase
    .from('events')
    .select('id, title, team_id, teams!inner(clubs!inner(slug))')
    .gte('event_date', todayStr)
    .lte('event_date', tomorrow)
    .is('cancelled_at', null);

  for (const event of upcomingEvents ?? []) {
    const { data: pendingGuests } = await supabase
      .from('event_guests')
      .select('id')
      .eq('event_id', event.id)
      .eq('status', 'pending');

    if (!pendingGuests?.length) continue;

    // Push to all coaches on this team
    const { data: coaches } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', event.team_id)
      .eq('role', 'coach');

    if (!coaches?.length) continue;

    const clubSlug = (event.teams as any)?.clubs?.slug ?? '';
    await sendPush({
      profile_ids: coaches.map((c: any) => c.profile_id as string),
      title: 'Guest not confirmed',
      body: `${pendingGuests.length} guest${pendingGuests.length !== 1 ? 's' : ''} haven't confirmed for ${event.title}`,
      data: { type: 'guest_reminder', event_id: event.id, club_slug: clubSlug },
    });
  }

  return new Response(JSON.stringify({ ok: true, ran_at: nowIso }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
