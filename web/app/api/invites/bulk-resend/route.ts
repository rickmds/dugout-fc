import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole, hasClubAccess } from '@/lib/apiAuth';
import { sendInviteEmail } from '@/lib/sendInviteEmail';

// Resends every still-pending parent/guardian invite for one team in a
// single request — the roster page's "N pending" button. Coach invites
// have their own resend path (/api/staff-resend) and aren't included here.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { team_id } = await req.json();
  if (!team_id) {
    return NextResponse.json({ error: 'team_id required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .select('id, name, age_group, club_id, clubs(name, logo_url, primary_color, slug)')
    .eq('id', team_id)
    .single<{
      id: string; name: string; age_group: string | null; club_id: string;
      clubs: { name: string; logo_url: string | null; primary_color: string | null; slug: string } | null;
    }>();

  if (teamErr || !team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  const allowed = await hasClubAccess(auth, team.club_id, ['org_admin', 'coach', 'app_admin']);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: invites, error: invitesErr } = await supabase
    .from('invites')
    .select('id, email, token, players(full_name)')
    .eq('team_id', team_id)
    .eq('role', 'parent')
    .is('accepted_at', null)
    .returns<{ id: string; email: string; token: string; players: { full_name: string } | null }[]>();

  if (invitesErr) {
    return NextResponse.json({ error: 'Failed to load invites' }, { status: 500 });
  }

  const sent: string[] = [];
  const failed: { id: string; email: string }[] = [];

  for (const inv of invites ?? []) {
    const result = await sendInviteEmail({ email: inv.email, token: inv.token, teams: team }, inv.players?.full_name ?? null);
    if (result.ok) sent.push(inv.id);
    else failed.push({ id: inv.id, email: inv.email });
  }

  return NextResponse.json({ sent, failed });
}
