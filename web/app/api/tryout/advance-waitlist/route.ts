import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { advanceWaitlistForTeam } from '@/lib/tryoutWaitlist';

// Called by the Team Builder right after staff manually marks a
// team-placed player as Declined (the equivalent of a family calling in
// to decline) — advances that team's ordered waitlist by one, same as a
// family declining their own offer via the emailed link.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { club_id, team } = await req.json();
  if (!club_id || !team) return NextResponse.json({ error: 'club_id and team required' }, { status: 400 });
  if (auth.role !== 'app_admin' && club_id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { promoted } = await advanceWaitlistForTeam(supabaseAdmin(), club_id, team);
  return NextResponse.json({ ok: true, promoted });
}
