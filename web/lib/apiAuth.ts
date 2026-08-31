import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type AllowedRole = 'app_admin' | 'org_admin' | 'coach' | 'player';

export async function requireRole(
  req: NextRequest,
  allowed: AllowedRole[],
): Promise<
  | { ok: true; userId: string; role: string; clubId: string | null }
  | { ok: false; response: NextResponse }
> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Validate the JWT via Supabase Auth using the anon key (no service role key needed)
  const anonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: userError?.message ?? 'Unauthorized' }, { status: 401 }) };
  }

  // Read profile using the user's own JWT so RLS applies
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await userClient
    .from('profiles')
    .select('role, club_id')
    .eq('id', user.id)
    .single();

  if (!profile || !(allowed as string[]).includes(profile.role ?? '')) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, role: profile.role, clubId: profile.club_id ?? null };
}

// requireRole only ever resolves access against the caller's single home
// club_id — correct for the common case, but a person can now also be
// org_admin of a second club (club_admins) or a cross-club coach
// (team_members, already club-independent by design). Routes that act on
// a specific club_id need to check THAT club, not just equality with the
// caller's home club — this is the drop-in replacement for the
// `auth.role !== 'app_admin' && auth.clubId !== club_id` check repeated
// across staff/invite/onboarding routes.
export async function hasClubAccess(
  auth: { role: string; clubId: string | null; userId: string },
  targetClubId: string,
  allowed: AllowedRole[],
): Promise<boolean> {
  if (auth.role === 'app_admin') return true;
  if (auth.clubId === targetClubId) return true;

  const db = supabaseAdmin();

  if (allowed.includes('org_admin')) {
    const { data } = await db
      .from('club_admins')
      .select('id')
      .eq('club_id', targetClubId)
      .eq('profile_id', auth.userId)
      .maybeSingle();
    if (data) return true;
  }

  if (allowed.includes('coach')) {
    const { data } = await db
      .from('team_members')
      .select('team_id, teams!inner(club_id)')
      .eq('profile_id', auth.userId)
      .eq('role', 'coach')
      .eq('teams.club_id', targetClubId)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }

  return false;
}
