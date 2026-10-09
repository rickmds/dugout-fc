import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { sendTryoutOfferEmail } from '@/lib/tryoutOffer';

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { player_id, club_id } = await req.json();
  if (!player_id || !club_id) return NextResponse.json({ error: 'player_id and club_id required' }, { status: 400 });
  if (auth.role !== 'app_admin' && club_id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await sendTryoutOfferEmail(supabaseAdmin(), player_id, club_id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
