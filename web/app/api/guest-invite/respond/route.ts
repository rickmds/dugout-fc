import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const guestId = searchParams.get('guestId');

  if (!guestId) return NextResponse.json({ error: 'guestId required' }, { status: 400 });

  const db = supabaseAdmin();

  // Fetch the guest row + event + team + club in one go
  const { data: guest, error } = await db
    .from('event_guests')
    .select(`
      id, full_name, role, status,
      player_id, profile_id,
      events (
        id, title, type, event_date, event_time, location, address, home_away,
        teams ( name, club_id, clubs ( name, logo_url, primary_color, slug ) )
      )
    `)
    .eq('id', guestId)
    .single();

  if (error || !guest) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  const ev    = (guest as any).events;
  const team  = ev?.teams;
  const club  = team?.clubs;

  return NextResponse.json({
    guest_id:    guest.id,
    full_name:   guest.full_name,
    role:        guest.role,
    status:      guest.status,
    event_id:    ev?.id,
    event_title: ev?.title,
    event_type:  ev?.type,
    event_date:  ev?.event_date,
    event_time:  ev?.event_time,
    location:    ev?.location ?? ev?.address ?? null,
    home_away:   ev?.home_away ?? null,
    team_name:   team?.name ?? null,
    club_name:   club?.name ?? null,
    club_logo:   club?.logo_url ?? null,
    club_color:  club?.primary_color ?? null,
    club_slug:   club?.slug ?? null,
  });
}

export async function POST(req: NextRequest) {
  const { guestId, action } = await req.json() as { guestId: string; action: 'accept' | 'decline' };

  if (!guestId || !action) return NextResponse.json({ error: 'guestId and action required' }, { status: 400 });
  if (action !== 'accept' && action !== 'decline') return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 });

  const db     = supabaseAdmin();
  const status = action === 'accept' ? 'confirmed' : 'declined';

  const { data: guest, error: fetchErr } = await db
    .from('event_guests')
    .select('id, full_name, role, status, player_id, profile_id, event_id, events(title, team_id, teams(name, club_id, clubs(name)))')
    .eq('id', guestId)
    .single();

  if (fetchErr || !guest) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if ((guest as any).status !== 'pending') {
    return NextResponse.json({ ok: true, already_responded: true, status: (guest as any).status });
  }

  const { error: updateErr } = await db
    .from('event_guests')
    .update({ status, responded_at: new Date().toISOString() } as any)
    .eq('id', guestId);

  if (updateErr) return NextResponse.json({ error: 'Could not update invite' }, { status: 500 });

  const ev      = (guest as any).events;
  const team    = ev?.teams;
  const club    = team?.clubs;
  const eventId = (guest as any).event_id;

  // Write event_rsvps for player guests so RSVP counts stay accurate
  if (action === 'accept' && (guest as any).player_id) {
    await db.from('event_rsvps').upsert(
      { event_id: eventId, player_id: (guest as any).player_id, responded_by: null, status: 'attending' },
      { onConflict: 'event_id,player_id' }
    );
  }

  // Notify coaches on accept and decline
  const { data: coaches } = await db
    .from('team_members')
    .select('profile_id')
    .eq('team_id', ev?.team_id ?? '')
    .eq('role', 'coach');

  const coachIds = ((coaches ?? []) as any[]).map(c => c.profile_id as string).filter(Boolean);
  if (coachIds.length > 0) {
    const roleLabel = (guest as any).role === 'coach' ? 'coach' : 'guest player';
    const guestName = (guest as any).full_name as string;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        profile_ids: coachIds,
        title: action === 'accept' ? 'Guest confirmed ✓' : 'Guest declined',
        body: action === 'accept'
          ? `${guestName} confirmed as ${roleLabel} — ${ev?.title ?? 'your event'}.`
          : `${guestName} declined the ${roleLabel} invitation for ${ev?.title ?? 'your event'}.`,
        data: {
          type:      action === 'accept' ? 'guest_accepted' : 'guest_response',
          event_id:  eventId,
          club_slug: club?.slug ?? '',
        },
      }),
    });
  }

  return NextResponse.json({ ok: true, status });
}
