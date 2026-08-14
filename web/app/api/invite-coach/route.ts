import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { inviteFirst, instantCreate, resolveAccent } from '@/lib/coachInvite';

type CoachInput = { full_name: string; email: string; team_ids: string[]; role?: 'coach' | 'org_admin' };

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin', 'coach']);
  if (!auth.ok) return auth.response;

  const { club_id, coaches } = await req.json() as { club_id: string; coaches: CoachInput[] };
  if (!club_id || !Array.isArray(coaches) || coaches.length === 0) {
    return NextResponse.json({ error: 'club_id and coaches[] required' }, { status: 400 });
  }
  if (auth.role !== 'app_admin' && auth.clubId !== club_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = supabaseAdmin();

  const { data: club } = await db.from('clubs').select('name, logo_url, primary_color, slug').eq('id', club_id).single();
  if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

  const clubName = club.name;
  const accent = resolveAccent(club.primary_color);
  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const c of coaches) {
    const email = (c.email ?? '').trim().toLowerCase();
    const full_name = (c.full_name ?? '').trim();
    const teamIds = (c.team_ids ?? []).filter(Boolean);
    const role = c.role === 'org_admin' ? 'org_admin' : 'coach';

    if (!email || !full_name) { results.push({ email, ok: false, error: 'Missing name or email' }); continue; }

    // A plain coach can only invite another single-team coach to a team
    // they themselves belong to — no org_admin grants, no multi-team/instant-create.
    if (auth.role === 'coach') {
      if (role !== 'coach' || teamIds.length !== 1) {
        results.push({ email, ok: false, error: 'Not permitted' }); continue;
      }
      const { data: membership } = await db
        .from('team_members')
        .select('id')
        .eq('team_id', teamIds[0])
        .eq('profile_id', auth.userId)
        .maybeSingle();
      if (!membership) { results.push({ email, ok: false, error: 'Not permitted' }); continue; }
    }

    try {
      if (role === 'coach' && teamIds.length === 1) {
        await inviteFirst({ db, club_id, clubName, logoUrl: club.logo_url, slug: club.slug, accent, email, full_name, teamId: teamIds[0], createdBy: auth.userId });
      } else {
        await instantCreate({ db, club_id, clubName, logoUrl: club.logo_url, accent, email, full_name, teamIds, role });
      }
      results.push({ email, ok: true });
    } catch (err) {
      console.error('invite-coach failed for', email, err);
      results.push({ email, ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return NextResponse.json({ results });
}
