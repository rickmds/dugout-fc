import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: invite, error } = await db
    .from('invites')
    .select('id, email, role, accepted_at, players(full_name), teams(name, age_group, club_id, clubs(name, slug, logo_url, primary_color)), clubs(name, slug, logo_url, primary_color)')
    .eq('token', token)
    .single<{
      id: string; email: string; role: string; accepted_at: string | null;
      players: { full_name: string } | null;
      teams: { name: string; age_group: string | null; club_id: string; clubs: { name: string; slug: string; logo_url: string | null; primary_color: string | null } | null } | null;
      clubs: { name: string; slug: string; logo_url: string | null; primary_color: string | null } | null;
    }>();

  if (error || !invite) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const inv = invite;

  if (inv.accepted_at) {
    return NextResponse.json({ already_accepted: true });
  }

  // A club-wide invite (org_admin, or a coach not tied to one team) has no
  // `teams` row at all — club info comes straight off `clubs` instead, and
  // there's no single team name to show.
  const clubInfo = inv.teams?.clubs ?? inv.clubs ?? null;

  return NextResponse.json({
    player_name:      inv.players?.full_name    ?? null,
    team_name:        inv.teams?.name           ?? null,
    team_age_group:   inv.teams?.age_group      ?? null,
    club_name:        clubInfo?.name            ?? 'Your Club',
    club_logo_url:    clubInfo?.logo_url        ?? null,
    primary_color:    clubInfo?.primary_color   ?? null,
    club_slug:        clubInfo?.slug            ?? null,
    pre_filled_email: inv.email                 ?? '',
    role:             inv.role                  ?? 'parent',
  });
}
