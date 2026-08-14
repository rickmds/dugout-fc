import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';

// Coaches invited to exactly one team go through the invites table and
// don't get a `profiles` row until they accept (see lib/coachInvite.ts) —
// so the Staff page needs to merge two sources to show everyone: accepted
// staff (profiles, joined against auth.users for email/last-active) and
// still-pending team-based coach invites.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const club_id = req.nextUrl.searchParams.get('club_id');
  if (!club_id) return NextResponse.json({ error: 'club_id required' }, { status: 400 });
  if (auth.role !== 'app_admin' && auth.clubId !== club_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = supabaseAdmin();

  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, role, avatar_url, created_at')
    .eq('club_id', club_id)
    .in('role', ['coach', 'org_admin'])
    .order('full_name');

  const activeRows = await Promise.all((profiles ?? []).map(async (p) => {
    const [{ data: tm }, { data: userRes }] = await Promise.all([
      db.from('team_members').select('team_id').eq('profile_id', p.id),
      db.auth.admin.getUserById(p.id),
    ]);
    return {
      kind: 'active' as const,
      id: p.id,
      full_name: p.full_name,
      role: p.role,
      avatar_url: p.avatar_url,
      email: userRes?.user?.email ?? null,
      assigned_teams: (tm ?? []).map(t => t.team_id as string),
      createdAt: p.created_at,
      lastSignInAt: userRes?.user?.last_sign_in_at ?? null,
      invitedAt: userRes?.user?.invited_at ?? p.created_at,
    };
  }));

  const { data: teams } = await db.from('teams').select('id, name').eq('club_id', club_id);
  const teamIds = (teams ?? []).map(t => t.id);
  const teamNameById = new Map((teams ?? []).map(t => [t.id, t.name]));

  const { data: pendingInvites } = teamIds.length
    ? await db.from('invites').select('id, email, team_id, created_at').in('team_id', teamIds).eq('role', 'coach').is('accepted_at', null)
    : { data: [] };

  const pendingRows = (pendingInvites ?? []).map(inv => ({
    kind: 'pending' as const,
    inviteId: inv.id,
    email: inv.email,
    teamId: inv.team_id,
    teamName: teamNameById.get(inv.team_id) ?? 'Unknown team',
    createdAt: inv.created_at,
  }));

  return NextResponse.json({ staff: [...activeRows, ...pendingRows] });
}
