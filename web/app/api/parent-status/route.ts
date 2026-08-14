import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';

// Once a parent accepts their invite, `players.profile_id` links to their
// real auth.users account — that's the only way to look up "last active",
// since profiles carries no email/login-timestamp columns at all.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  const player_id = req.nextUrl.searchParams.get('player_id');
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: player } = await db
    .from('players')
    .select('profile_id, teams(club_id)')
    .eq('id', player_id)
    .single<{ profile_id: string | null; teams: { club_id: string } | null }>();

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  const clubId = player.teams?.club_id;
  if (auth.role !== 'app_admin' && clubId !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!player.profile_id) return NextResponse.json({ lastSignInAt: null });

  const { data: userRes } = await db.auth.admin.getUserById(player.profile_id);
  return NextResponse.json({ lastSignInAt: userRes?.user?.last_sign_in_at ?? null });
}
