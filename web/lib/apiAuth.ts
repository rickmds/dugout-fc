import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type AllowedRole = 'app_admin' | 'org_admin' | 'coach';

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
