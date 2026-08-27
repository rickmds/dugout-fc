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

// Game-day pushes and RSVP reminders used to live here too, but they
// duplicated (with worse logic — no quiet hours, no per-club timezone
// awareness, no tournament consolidation) the dedicated
// web/app/api/cron/event-day-reminders and rsvp-reminders Vercel crons.
// Those crons previously never actually ran (CRON_SECRET was missing from
// the Vercel production env, so every invocation 401'd) — this edge
// function's pg_cron job was the only thing actually sending these. Now
// that CRON_SECRET is set and the Vercel crons work, removed here to avoid
// double notifications. Guest-deadline reminders have no Vercel
// equivalent, so that job stays.
Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  // Guest deadline window: events within the next 48 hours
  const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];

  // ── Guest deadline reminder — coaches notified when guests haven't confirmed ──
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

  return new Response(JSON.stringify({ ok: true, ran_at: now.toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
