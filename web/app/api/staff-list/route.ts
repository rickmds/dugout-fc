import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole, hasClubAccess } from '@/lib/apiAuth';

// Coaches invited to exactly one team go through the invites table and
// don't get a `profiles` row until they accept (see lib/coachInvite.ts) —
// so the Staff page needs to merge two sources to show everyone: accepted
// staff (profiles, joined against auth.users for email/last-active) and
// still-pending team-based coach invites.
//
// Since multi-club membership, "staff at this club" is no longer just
// "profiles.club_id = this club" — a person can also reach a club as an
// org_admin via club_admins (a second club, home club is elsewhere) or as
// a coach via team_members (already club-independent). Each row below is
// tagged with `via` so the client knows which table(s) an edit/remove
// action needs to touch — writing to `profiles` for a non-home row would
// silently corrupt that person's real home-club identity.
export async function GET(req: NextRequest) {
  // Broadened beyond org_admin/app_admin so a person whose HOME role is
  // 'coach' but who is ALSO org_admin of this specific club via
  // club_admins can get past this first gate — the real authorization
  // happens below via hasClubAccess, scoped to this exact club_id.
  const auth = await requireRole(req, ['org_admin', 'app_admin', 'coach']);
  if (!auth.ok) return auth.response;

  const club_id = req.nextUrl.searchParams.get('club_id');
  if (!club_id) return NextResponse.json({ error: 'club_id required' }, { status: 400 });
  if (!(await hasClubAccess(auth, club_id, ['org_admin', 'app_admin']))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = supabaseAdmin();

  const [{ data: homeProfiles }, { data: clubAdminRows }, { data: teams }] = await Promise.all([
    // Must include app_admin, not just coach/org_admin — otherwise an
    // app_admin's own home-club row (e.g. Rick on his own MDS Academy
    // staff page) never classifies as 'home' and instead falls through to
    // being tagged as a cross-club club_admins/team_members row. That's
    // not just a cosmetic mislabel: the edit modal's promote/demote logic
    // for those rows creates a club_admins grant and deletes ALL of that
    // person's team_members rows across the (possibly multi-club-
    // contaminated) current team list — which is exactly how an
    // app_admin's real cross-club coach assignments got silently wiped
    // out from their OWN home club's staff page.
    db.from('profiles')
      .select('id, full_name, role, avatar_url, created_at')
      .eq('club_id', club_id)
      .in('role', ['coach', 'org_admin', 'app_admin'])
      .order('full_name'),
    db.from('club_admins').select('profile_id, created_at').eq('club_id', club_id),
    db.from('teams').select('id, name').eq('club_id', club_id),
  ]);

  const teamIds = (teams ?? []).map(t => t.id as string);
  const teamNameById = new Map((teams ?? []).map(t => [t.id, t.name]));
  const homeIds = new Set((homeProfiles ?? []).map(p => p.id));

  const { data: crossClubCoachRows } = teamIds.length
    ? await db.from('team_members')
        .select('profile_id, team_id, created_at')
        .eq('role', 'coach')
        .in('team_id', teamIds)
    : { data: [] as { profile_id: string; team_id: string; created_at: string }[] };

  // A cross-club coach can have rows on more than one of this club's
  // teams — collapse to one row per profile, keeping every team_id.
  const crossClubTeamsByProfile = new Map<string, string[]>();
  const earliestByProfile = new Map<string, string>();
  for (const r of crossClubCoachRows ?? []) {
    if (homeIds.has(r.profile_id)) continue; // already covered by the home-club query
    const list = crossClubTeamsByProfile.get(r.profile_id) ?? [];
    list.push(r.team_id);
    crossClubTeamsByProfile.set(r.profile_id, list);
    const prev = earliestByProfile.get(r.profile_id);
    if (!prev || r.created_at < prev) earliestByProfile.set(r.profile_id, r.created_at);
  }

  const clubAdminIds = (clubAdminRows ?? [])
    .map(r => r.profile_id as string)
    .filter(id => !homeIds.has(id));
  const clubAdminCreatedAt = new Map((clubAdminRows ?? []).map(r => [r.profile_id, r.created_at]));

  const extraProfileIds = [...new Set([...clubAdminIds, ...crossClubTeamsByProfile.keys()])];
  const { data: extraProfiles } = extraProfileIds.length
    ? await db.from('profiles').select('id, full_name, avatar_url').in('id', extraProfileIds)
    : { data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] };
  const extraProfileById = new Map((extraProfiles ?? []).map(p => [p.id, p]));

  async function toActiveRow(
    id: string,
    full_name: string | null,
    role: string,
    avatar_url: string | null,
    createdAt: string,
    via: 'home' | 'club_admins' | 'team_members',
    assignedTeams: string[],
  ) {
    const { data: userRes } = await db.auth.admin.getUserById(id);
    return {
      kind: 'active' as const,
      id,
      full_name,
      role,
      avatar_url,
      email: userRes?.user?.email ?? null,
      assigned_teams: assignedTeams,
      createdAt,
      lastSignInAt: userRes?.user?.last_sign_in_at ?? null,
      invitedAt: userRes?.user?.invited_at ?? createdAt,
      via,
    };
  }

  const homeRows = await Promise.all((homeProfiles ?? []).map(async (p) => {
    // Scoped to THIS club's own teams — a home-club profile who's ALSO a
    // cross-club coach elsewhere (e.g. Rick coaching at Maroons) has
    // team_members rows there too; without this filter they'd leak onto
    // this club's staff list as raw team ids (not in this club's own
    // `teams` list, so the UI can't resolve them to a name at all).
    const { data: tm } = teamIds.length
      ? await db.from('team_members').select('team_id').eq('profile_id', p.id).in('team_id', teamIds)
      : { data: [] as { team_id: string }[] };
    return toActiveRow(p.id, p.full_name, p.role, p.avatar_url, p.created_at, 'home', (tm ?? []).map(t => t.team_id as string));
  }));

  // A person can reach this club via club_admins AND independently have
  // team_members rows here too (e.g. added as a coach before later being
  // made org_admin) — same person, two separate DB facts. Show them once:
  // club_admins wins (it's the superset — implicit access to every team),
  // but keep their team_members list on that one row rather than dropping
  // it, so downgrading them back to coach in the edit modal still shows
  // which teams they were actually on.
  const clubAdminOnlyRows = await Promise.all(clubAdminIds.map(async (id) => {
    const p = extraProfileById.get(id);
    return toActiveRow(id, p?.full_name ?? null, 'org_admin', p?.avatar_url ?? null, clubAdminCreatedAt.get(id) ?? new Date().toISOString(), 'club_admins', crossClubTeamsByProfile.get(id) ?? []);
  }));

  const clubAdminIdSet = new Set(clubAdminIds);
  const crossClubCoachOnlyRows = await Promise.all(
    [...crossClubTeamsByProfile.entries()]
      .filter(([id]) => !clubAdminIdSet.has(id))
      .map(async ([id, teamIds]) => {
        const p = extraProfileById.get(id);
        return toActiveRow(id, p?.full_name ?? null, 'coach', p?.avatar_url ?? null, earliestByProfile.get(id) ?? new Date().toISOString(), 'team_members', teamIds);
      })
  );

  const activeRows = [...homeRows, ...clubAdminOnlyRows, ...crossClubCoachOnlyRows];

  const { data: pendingInvites } = await db
    .from('invites')
    .select('id, email, role, team_id, team_ids, created_at')
    .eq('club_id', club_id)
    .in('role', ['coach', 'org_admin'])
    .is('accepted_at', null);

  const pendingRows = (pendingInvites ?? []).map(inv => ({
    kind: 'pending' as const,
    inviteId: inv.id,
    email: inv.email,
    role: inv.role,
    teamId: inv.team_id,
    teamIds: inv.team_id ? [inv.team_id] : (inv.team_ids ?? []),
    teamName: inv.team_id ? (teamNameById.get(inv.team_id) ?? 'Unknown team') : null,
    createdAt: inv.created_at,
  }));

  return NextResponse.json({ staff: [...activeRows, ...pendingRows] });
}
