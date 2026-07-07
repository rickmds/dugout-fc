import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: p } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if ((p as { role: string } | null)?.role !== 'app_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { clubId } = await req.json() as { clubId: string };
  if (!clubId) return NextResponse.json({ error: 'Missing clubId' }, { status: 400 });

  // Get all teams
  const { data: teams } = await admin.from('teams').select('id').eq('club_id', clubId);
  const teamIds = (teams ?? []).map((t: { id: string }) => t.id);

  if (teamIds.length > 0) {
    // Events + dependent records
    const { data: events } = await admin.from('events').select('id').in('team_id', teamIds);
    const eventIds = (events ?? []).map((e: { id: string }) => e.id);

    if (eventIds.length > 0) {
      const { data: lineups } = await admin.from('lineups').select('id').in('event_id', eventIds);
      const lineupIds = (lineups ?? []).map((l: { id: string }) => l.id);
      if (lineupIds.length > 0) {
        await admin.from('lineup_positions').delete().in('lineup_id', lineupIds);
        await admin.from('sub_plans').delete().in('lineup_id', lineupIds);
        await admin.from('lineups').delete().in('id', lineupIds);
      }
      await admin.from('event_rsvps').delete().in('event_id', eventIds);
      await admin.from('events').delete().in('id', eventIds);
    }

    // Players + roster
    await admin.from('player_development_notes').delete().in('team_id', teamIds);
    await admin.from('players').delete().in('team_id', teamIds);
    await admin.from('team_members').delete().in('team_id', teamIds);
    await admin.from('invites').delete().in('team_id', teamIds);
    await admin.from('announcements').delete().in('team_id', teamIds);

    // Conversations
    const { data: convs } = await admin.from('conversations').select('id').in('team_id', teamIds);
    const convIds = (convs ?? []).map((c: { id: string }) => c.id);
    if (convIds.length > 0) {
      await admin.from('messages').delete().in('conversation_id', convIds);
      await admin.from('conversation_participants').delete().in('conversation_id', convIds);
      await admin.from('conversations').delete().in('id', convIds);
    }

    await admin.from('teams').delete().eq('club_id', clubId);
  }

  // Detach profiles
  await admin.from('profiles').update({ club_id: null }).eq('club_id', clubId);
  await admin.from('notifications').delete().eq('profile_id', user.id); // skip — notifications are per-user not per-club

  // Delete club
  const { error } = await admin.from('clubs').delete().eq('id', clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
