import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole, hasClubAccess } from '@/lib/apiAuth';
import { inviteFirst, inviteClubWide, resendSetupEmail, resolveAccent } from '@/lib/coachInvite';

type Body =
  | { kind: 'pending'; invite_id: string }
  | { kind: 'active'; profile_id: string };

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin', 'coach']);
  if (!auth.ok) return auth.response;

  const body = await req.json() as Body;
  const db = supabaseAdmin();

  if (auth.role === 'coach' && body.kind !== 'pending') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.kind === 'pending') {
    const { data: invite } = await db
      .from('invites')
      .select('email, role, team_id, club_id, team_ids, teams(club_id, name, clubs(name, logo_url, primary_color, slug)), clubs(name, logo_url, primary_color, slug)')
      .eq('id', body.invite_id)
      .single<{
        email: string; role: string; team_id: string | null; club_id: string | null; team_ids: string[] | null;
        teams: { club_id: string; name: string; clubs: { name: string; logo_url: string | null; primary_color: string | null; slug: string | null } | null } | null;
        clubs: { name: string; logo_url: string | null; primary_color: string | null; slug: string | null } | null;
      }>();
    if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

    const team = invite.teams;
    const clubId = invite.team_id ? team?.club_id : invite.club_id;
    const club = invite.team_id ? team?.clubs : invite.clubs;
    if (!clubId || !(await hasClubAccess(auth, clubId, ['org_admin', 'app_admin', 'coach']))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (auth.role === 'coach') {
      // Plain coaches can only resend a single-team invite for a team
      // they themselves belong to — never a club-wide admin/multi-team one.
      if (!invite.team_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const { data: membership } = await db
        .from('team_members')
        .select('id')
        .eq('team_id', invite.team_id)
        .eq('profile_id', auth.userId)
        .maybeSingle();
      if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (invite.team_id) {
      await inviteFirst({
        db, club_id: clubId, clubName: club?.name ?? 'Your Club', logoUrl: club?.logo_url ?? null,
        slug: club?.slug ?? null, accent: resolveAccent(club?.primary_color), email: invite.email,
        full_name: invite.email.split('@')[0], teamId: invite.team_id, createdBy: auth.userId,
      });
    } else {
      await inviteClubWide({
        db, club_id: clubId, clubName: club?.name ?? 'Your Club', logoUrl: club?.logo_url ?? null,
        slug: club?.slug ?? null, accent: resolveAccent(club?.primary_color), email: invite.email,
        full_name: invite.email.split('@')[0], teamIds: invite.team_ids ?? [],
        role: invite.role === 'org_admin' ? 'org_admin' : 'coach', createdBy: auth.userId,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === 'active') {
    const { data: profile } = await db.from('profiles').select('full_name, role, club_id').eq('id', body.profile_id).single();
    if (!profile || !profile.club_id || !(await hasClubAccess(auth, profile.club_id, ['org_admin', 'app_admin']))) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }
    const { data: userRes } = await db.auth.admin.getUserById(body.profile_id);
    const email = userRes?.user?.email;
    if (!email) return NextResponse.json({ error: 'No email on file for this account' }, { status: 400 });

    const { data: club } = await db.from('clubs').select('name, logo_url, primary_color').eq('id', profile.club_id).single();

    await resendSetupEmail({
      db, clubName: club?.name ?? 'Your Club', logoUrl: club?.logo_url ?? null,
      accent: resolveAccent(club?.primary_color), email, full_name: profile.full_name ?? email,
      role: profile.role === 'org_admin' ? 'org_admin' : 'coach',
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

// Cancel a still-pending team-based coach invite.
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const invite_id = req.nextUrl.searchParams.get('invite_id');
  if (!invite_id) return NextResponse.json({ error: 'invite_id required' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: invite } = await db.from('invites').select('team_id, club_id, teams(club_id)').eq('id', invite_id).single<{ team_id: string | null; club_id: string | null; teams: { club_id: string } | null }>();
  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  const clubId = invite.team_id ? invite.teams?.club_id : invite.club_id;
  if (!clubId || !(await hasClubAccess(auth, clubId, ['org_admin', 'app_admin']))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.from('invites').delete().eq('id', invite_id);
  return NextResponse.json({ ok: true });
}
