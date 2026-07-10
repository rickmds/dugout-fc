import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: invite, error } = await db
    .from('invites')
    .select('id, email, role, accepted_at, players(full_name), teams(name, age_group, club_id, clubs(name, slug, logo_url, primary_color))')
    .eq('token', token)
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const inv = invite as any;

  if (inv.accepted_at) {
    return NextResponse.json({ already_accepted: true });
  }

  return NextResponse.json({
    player_name:      inv.players?.full_name    ?? null,
    team_name:        inv.teams?.name           ?? 'Your Team',
    team_age_group:   inv.teams?.age_group      ?? null,
    club_name:        inv.teams?.clubs?.name    ?? 'Your Club',
    club_logo_url:    inv.teams?.clubs?.logo_url  ?? null,
    primary_color:    inv.teams?.clubs?.primary_color ?? null,
    club_slug:        inv.teams?.clubs?.slug    ?? null,
    pre_filled_email: inv.email                 ?? '',
    role:             inv.role                  ?? 'parent',
  });
}
