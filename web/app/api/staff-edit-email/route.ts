import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';

type Body =
  | { kind: 'pending'; invite_id: string; email: string }
  | { kind: 'active'; profile_id: string; email: string };

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const body = await req.json() as Body;
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
  }

  const db = supabaseAdmin();

  if (body.kind === 'pending') {
    const { data: invite } = await db.from('invites').select('team_id, teams(club_id)').eq('id', body.invite_id).single<{ team_id: string; teams: { club_id: string } | null }>();
    if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    const clubId = invite.teams?.club_id;
    if (auth.role !== 'app_admin' && clubId !== auth.clubId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { error } = await db.from('invites').update({ email }).eq('id', body.invite_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.kind === 'active') {
    const { data: profile } = await db.from('profiles').select('club_id').eq('id', body.profile_id).single();
    if (!profile) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    if (auth.role !== 'app_admin' && profile.club_id !== auth.clubId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { error } = await db.auth.admin.updateUserById(body.profile_id, { email });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}
