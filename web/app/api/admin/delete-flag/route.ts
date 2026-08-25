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

  const { kind, ids } = await req.json() as { kind: 'orphaned_staff' | 'stale_invite' | 'unclaimed_player'; ids: string[] };
  if (!kind || !ids?.length) return NextResponse.json({ error: 'Missing kind or ids' }, { status: 400 });

  // The client's id list came from whenever the Health Flags panel last
  // loaded — by the time "Delete all" is clicked, a flagged row can have
  // stopped matching (a staff member got re-assigned a club, an invite
  // got accepted) without the panel refreshing. Re-check each id against
  // the same criteria that flagged it in the first place, right before
  // deleting, instead of trusting the client's stale snapshot.
  const staleCutoff = new Date(Date.now() - 14 * 86400000).toISOString();

  if (kind === 'orphaned_staff') {
    const { data: stillOrphaned } = await admin
      .from('profiles')
      .select('id')
      .in('id', ids)
      .is('club_id', null)
      .in('role', ['coach', 'org_admin']);
    const validIds = (stillOrphaned ?? []).map((p: { id: string }) => p.id);
    if (!validIds.length) return NextResponse.json({ error: 'No longer orphaned — nothing to delete' }, { status: 409 });

    // Deleting the auth user (not just the profiles row) — profiles.id has
    // ON DELETE CASCADE from auth.users, so this removes the profile too.
    // Deleting only the profile row would go the wrong way: a dangling
    // auth account with no profile, which is a worse orphan than the one
    // we started with.
    // One admin API call per user (no bulk endpoint) — collect partial
    // failures instead of letting one bad id fail the whole batch.
    const deletedIds: string[] = [];
    for (const id of validIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (!error) deletedIds.push(id);
    }
    if (deletedIds.length === 0) return NextResponse.json({ error: 'Could not delete any accounts' }, { status: 500 });
    return NextResponse.json({ success: true, deletedIds });
  } else if (kind === 'stale_invite') {
    const { data: stillStale } = await admin
      .from('invites')
      .select('id')
      .in('id', ids)
      .is('accepted_at', null)
      .lt('created_at', staleCutoff);
    const validIds = (stillStale ?? []).map((i: { id: string }) => i.id);
    if (!validIds.length) return NextResponse.json({ error: 'No longer stale — nothing to delete' }, { status: 409 });

    const { error } = await admin.from('invites').delete().in('id', validIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deletedIds: validIds });
  } else if (kind === 'unclaimed_player') {
    const { data: guardianRows } = await admin.from('player_guardians').select('player_id').in('player_id', ids);
    const guardedIds = new Set((guardianRows ?? []).map((g: { player_id: string }) => g.player_id));
    const { data: stillUnclaimed } = await admin
      .from('players')
      .select('id')
      .in('id', ids)
      .is('profile_id', null)
      .lt('created_at', staleCutoff);
    const validIds = (stillUnclaimed ?? []).map((p: { id: string }) => p.id).filter((id) => !guardedIds.has(id));
    if (!validIds.length) return NextResponse.json({ error: 'No longer unclaimed — nothing to delete' }, { status: 409 });

    // admin_delete_player is SECURITY DEFINER with its own internal
    // authorization check (app_admin, or org_admin/coach of that player's
    // own team) keyed off auth.uid() — calling it with the service-role
    // client would carry no JWT and auth.uid() would resolve to null, so
    // this forwards the real app_admin's own token instead, the same way
    // a client would call it, rather than bypassing that check entirely.
    const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const deletedIds: string[] = [];
    for (const id of validIds) {
      const { error } = await asUser.rpc('admin_delete_player', { p_player_id: id });
      if (!error) deletedIds.push(id);
    }
    if (deletedIds.length === 0) return NextResponse.json({ error: 'Could not delete any players' }, { status: 500 });
    return NextResponse.json({ success: true, deletedIds });
  } else {
    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  }
}
