import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: p } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if ((p as { role: string } | null)?.role !== 'app_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const clubId = req.nextUrl.searchParams.get('clubId');
  if (!clubId) return NextResponse.json({ error: 'Missing clubId' }, { status: 400 });

  const { data: teams } = await admin.from('teams').select('id, name').eq('club_id', clubId);
  const teamIds = (teams ?? []).map(t => t.id);
  if (!teamIds.length) return NextResponse.json({ players: [] });

  const { data: players } = await admin
    .from('players')
    .select('id, full_name, jersey_number, team_id, profile_id')
    .in('team_id', teamIds)
    .order('full_name');
  if (!players?.length) return NextResponse.json({ players: [] });

  const playerIds = players.map(pl => pl.id);
  const { data: guardianLinks } = await admin
    .from('player_guardians')
    .select('player_id, profile_id')
    .in('player_id', playerIds);

  // Merge the join-table links with the legacy single-column slot — some
  // older rows only ever had players.profile_id set directly.
  const guardiansByPlayer: Record<string, Set<string>> = {};
  for (const pl of players as { id: string; profile_id: string | null }[]) {
    if (pl.profile_id) (guardiansByPlayer[pl.id] ??= new Set()).add(pl.profile_id);
  }
  for (const g of (guardianLinks ?? []) as { player_id: string; profile_id: string }[]) {
    (guardiansByPlayer[g.player_id] ??= new Set()).add(g.profile_id);
  }

  const guardianIds = [...new Set(Object.values(guardiansByPlayer).flatMap(s => [...s]))];
  const { data: guardianProfiles } = guardianIds.length
    ? await admin.from('profiles').select('id, full_name').in('id', guardianIds)
    : { data: [] };
  const nameById: Record<string, string | null> = {};
  for (const gp of (guardianProfiles ?? []) as { id: string; full_name: string | null }[]) nameById[gp.id] = gp.full_name;

  const emailById: Record<string, string | null> = {};
  await Promise.all(guardianIds.map(async id => {
    const { data: { user: u } } = await admin.auth.admin.getUserById(id);
    emailById[id] = u?.email ?? null;
  }));

  const teamNameById: Record<string, string> = {};
  for (const t of teams ?? []) teamNameById[t.id] = t.name;

  const result = (players as { id: string; full_name: string; jersey_number: number | null; team_id: string }[]).map(pl => ({
    id: pl.id,
    full_name: pl.full_name,
    jersey_number: pl.jersey_number,
    team_id: pl.team_id,
    team_name: teamNameById[pl.team_id] ?? 'Unknown team',
    guardians: [...(guardiansByPlayer[pl.id] ?? [])].map(gid => ({
      name: nameById[gid] ?? null,
      email: emailById[gid] ?? null,
    })),
  }));

  return NextResponse.json({ players: result });
}
