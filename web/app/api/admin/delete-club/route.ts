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

  // push_tokens/notifications reference profiles, not clubs, so they'd
  // survive a club delete untouched unless cleared explicitly — a
  // now-clubless account shouldn't keep stale notifications/push targets
  // for a club that no longer exists.
  const { data: clubProfiles } = await admin.from('profiles').select('id').eq('club_id', clubId);
  const memberIds = (clubProfiles ?? []).map((p: { id: string }) => p.id);
  if (memberIds.length > 0) {
    await admin.from('push_tokens').delete().in('profile_id', memberIds);
    await admin.from('notifications').delete().in('profile_id', memberIds);
  }

  // admin_delete_club (see migration 20260824000001) runs as one atomic
  // Postgres function instead of dozens of sequential app-level deletes —
  // nearly every table already has ON DELETE CASCADE back to
  // clubs/teams/events/players/conversations (profiles.club_id is ON
  // DELETE SET NULL), so this resolves the whole graph in a single
  // transaction: either the entire club is gone, or none of it is,
  // instead of a partial delete failing halfway through and leaving teams
  // stripped of players/invites/conversations but still existing.
  const { error } = await admin.rpc('admin_delete_club', { p_club_id: clubId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
