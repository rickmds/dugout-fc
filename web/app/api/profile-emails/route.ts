import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole, hasClubAccess } from '@/lib/apiAuth';

// Resolves auth emails for a specific list of profile ids — used by
// mobile flows (guest management) that need to email a handful of
// specific people rather than an entire team's parents, so
// sendTeamEmail's /api/team/parent-emails path doesn't fit. Scoped to
// clubs the caller actually has staff access to, same as parent-emails.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { profile_ids } = await req.json();
  if (!Array.isArray(profile_ids) || !profile_ids.length) {
    return NextResponse.json({ error: 'profile_ids required' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: profiles } = await sb.from('profiles').select('id, club_id').in('id', profile_ids);
  const clubIds = [...new Set((profiles ?? []).map((p) => p.club_id).filter(Boolean))] as string[];
  const allowedClubIds = new Set<string>();
  for (const clubId of clubIds) {
    if (await hasClubAccess(auth, clubId, ['org_admin', 'coach'])) allowedClubIds.add(clubId);
  }
  const allowedProfileIds = new Set(
    (profiles ?? []).filter((p) => p.club_id && allowedClubIds.has(p.club_id)).map((p) => p.id)
  );
  if (!allowedProfileIds.size) return NextResponse.json({ recipients: [] });

  const emailByProfileId: Record<string, string> = {};
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data: { users } } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of users ?? []) {
      if (allowedProfileIds.has(u.id) && u.email) emailByProfileId[u.id] = u.email;
    }
    hasMore = (users?.length ?? 0) === 1000;
    page++;
  }

  const recipients = [...allowedProfileIds]
    .filter((id) => emailByProfileId[id])
    .map((id) => ({ email: emailByProfileId[id] }));

  return NextResponse.json({ recipients });
}
