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

  const { kind, id } = await req.json() as { kind: 'orphaned_staff' | 'stale_invite'; id: string };
  if (!kind || !id) return NextResponse.json({ error: 'Missing kind or id' }, { status: 400 });

  if (kind === 'orphaned_staff') {
    // Deleting the auth user (not just the profiles row) — profiles.id has
    // ON DELETE CASCADE from auth.users, so this removes the profile too.
    // Deleting only the profile row would go the wrong way: a dangling
    // auth account with no profile, which is a worse orphan than the one
    // we started with.
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (kind === 'stale_invite') {
    const { error } = await admin.from('invites').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
