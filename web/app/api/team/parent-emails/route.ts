import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { team_id } = await req.json();
  if (!team_id) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: team } = await sb.from('teams').select('club_id').eq('id', team_id).single();
  if (!team || (auth.role !== 'app_admin' && team.club_id !== auth.clubId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [playersRes, invitesRes, membersRes] = await Promise.all([
    sb.from('players').select('id, full_name, profile_id').eq('team_id', team_id),
    sb.from('invites').select('player_id, email, guardian_name').eq('team_id', team_id),
    sb.from('team_members')
      .select('profile_id, profiles:profile_id(full_name)')
      .eq('team_id', team_id)
      .eq('role', 'parent'),
  ]);

  const players = playersRes.data ?? [];
  const invites = invitesRes.data ?? [];
  const members = (membersRes.data ?? []) as unknown as { profile_id: string | null; profiles: { full_name: string | null } | null }[];

  // Build lookup maps
  const playerById: Record<string, string> = {};
  const playerByProfileId: Record<string, string> = {};
  for (const p of players) {
    playerById[p.id] = p.full_name ?? 'Unknown';
    if (p.profile_id) playerByProfileId[p.profile_id] = p.full_name ?? 'Unknown';
  }

  // Get auth emails for parent profiles
  const profileIds = members.map((m) => m.profile_id as string).filter(Boolean);
  const emailByProfileId: Record<string, string> = {};
  if (profileIds.length > 0) {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const { data: { users } } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      for (const u of users ?? []) {
        if (profileIds.includes(u.id) && u.email) emailByProfileId[u.id] = u.email;
      }
      hasMore = (users?.length ?? 0) === 1000;
      page++;
    }
  }

  // Group emails by player — each player appears once with ALL their emails
  // Key: player_id for roster players, email for team-level invites (no player_id)
  const grouped: Record<string, { player_name: string; emails: Set<string> }> = {};

  // 1. Invite records — group by player_id so multiple guardian emails merge into one row
  for (const inv of invites) {
    if (!inv.email) continue;
    const playerName = inv.player_id ? (playerById[inv.player_id] ?? 'Unknown player') : 'Team member';
    const groupKey = inv.player_id ?? `anon-${inv.email.toLowerCase()}`;
    if (!grouped[groupKey]) grouped[groupKey] = { player_name: playerName, emails: new Set() };
    grouped[groupKey].emails.add(inv.email);
  }

  // 2. Parent profiles whose auth email isn't already covered
  const allInviteEmails = new Set(
    Object.values(grouped).flatMap((g) => [...g.emails].map((e) => e.toLowerCase()))
  );
  for (const m of members) {
    const profileId = m.profile_id as string;
    const email = emailByProfileId[profileId];
    if (!email || allInviteEmails.has(email.toLowerCase())) continue;
    const playerName = playerByProfileId[profileId] ?? (m.profiles?.full_name ?? 'Parent');
    const groupKey = `member-${profileId}`;
    if (!grouped[groupKey]) grouped[groupKey] = { player_name: playerName, emails: new Set() };
    grouped[groupKey].emails.add(email);
  }

  const recipients = Object.entries(grouped).map(([key, data]) => ({
    key,
    player_name: data.player_name,
    emails: [...data.emails],
  }));

  return NextResponse.json({ recipients });
}
