import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase';

type AllowedRole = 'app_admin' | 'org_admin' | 'coach';

/**
 * Verifies the Bearer token in the Authorization header and checks the caller's
 * role against the allowed list. Returns the verified user + profile on success,
 * or a ready-to-return NextResponse error on failure.
 */
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

  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await db
    .from('profiles')
    .select('role, club_id')
    .eq('id', user.id)
    .single();

  if (!profile || !(allowed as string[]).includes(profile.role ?? '')) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, role: profile.role, clubId: profile.club_id ?? null };
}
