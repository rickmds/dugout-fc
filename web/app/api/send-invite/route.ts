import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { sendInviteEmail } from '@/lib/sendInviteEmail';

export async function POST(req: NextRequest) {
  // A parent can invite a co-guardian for their own child (mobile
  // profile-setup and the player detail screen's Guardians tab both do
  // this) — 'player' is allowed here specifically for that case, gated
  // below to only their own invite, not the coach/admin club-wide access.
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin', 'player']);
  if (!auth.ok) return auth.response;

  const { invite_id, player_name } = await req.json();

  if (!invite_id) {
    return NextResponse.json({ error: 'invite_id required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: invite, error: invErr } = await supabase
    .from('invites')
    .select('email, token, player_id, teams(id, name, age_group, club_id, clubs(name, logo_url, primary_color, slug))')
    .eq('id', invite_id)
    .single<{
      email: string; token: string; player_id: string | null;
      teams: { id: string; name: string; age_group: string | null; club_id: string; clubs: { name: string; logo_url: string | null; primary_color: string | null; slug: string } | null } | null;
    }>();

  if (invErr || !invite) {
    console.error('invite lookup failed', invErr);
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  const team = invite.teams;

  // A parent may trigger sending for any invite tied to a player they
  // actually guard right now (not just the one they personally created —
  // e.g. a coach originally added the roster invite, or a different
  // guardian is the one resending); coach/org_admin/app_admin keep the
  // existing club-wide check. This guardian-ownership fallback must apply
  // regardless of the caller's global role, not only role === 'player' —
  // an org_admin or coach at their own club can still be a plain guest
  // parent on a *different* club's team (the same "home club" vs "guest
  // team" split TeamContext.tsx's own myRole already models), and was
  // otherwise blocked from managing their own child's invite there.
  let authorized = auth.role === 'app_admin' || team?.club_id === auth.clubId;
  if (!authorized && invite.player_id) {
    const { data: player } = await supabase.from('players').select('profile_id').eq('id', invite.player_id).single();
    if (player?.profile_id === auth.userId) {
      authorized = true;
    } else {
      const { data: guardian } = await supabase
        .from('player_guardians')
        .select('profile_id')
        .eq('player_id', invite.player_id)
        .eq('profile_id', auth.userId)
        .maybeSingle();
      authorized = !!guardian;
    }
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const result = await sendInviteEmail(invite, player_name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
