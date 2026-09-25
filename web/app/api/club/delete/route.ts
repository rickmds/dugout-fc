import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Self-serve version of web/app/api/admin/delete-club/route.ts — same
// atomic admin_delete_club() RPC, but gated to an org_admin deleting their
// OWN home club rather than app_admin deleting any club. Settings ->
// Danger Zone used to just alert() and tell the DOC to email support,
// which meant offboarding wasn't actually "zero involvement from Rick" the
// way onboarding is.
export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: p } = await admin.from('profiles').select('role, club_id').eq('id', user.id).single();
  const profile = p as { role: string; club_id: string | null } | null;

  const { clubId, clubNameConfirm } = await req.json() as { clubId: string; clubNameConfirm: string };
  if (!clubId) return NextResponse.json({ error: 'Missing clubId' }, { status: 400 });

  // Only the club's own org_admin can self-serve delete it — never another
  // club's org_admin, and never a coach even if they have club_admins
  // access to this club. app_admin still goes through the super-admin route.
  if (!profile || profile.role !== 'org_admin' || profile.club_id !== clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: club } = await admin.from('clubs').select('name').eq('id', clubId).single();
  if (!club || (club as { name: string }).name !== clubNameConfirm) {
    return NextResponse.json({ error: 'Club name does not match.' }, { status: 400 });
  }

  const { data: clubProfiles } = await admin.from('profiles').select('id').eq('club_id', clubId);
  const memberIds = (clubProfiles ?? []).map((row: { id: string }) => row.id);
  if (memberIds.length > 0) {
    await admin.from('push_tokens').delete().in('profile_id', memberIds);
    await admin.from('notifications').delete().in('profile_id', memberIds);
  }

  const { error } = await admin.rpc('admin_delete_club', { p_club_id: clubId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
