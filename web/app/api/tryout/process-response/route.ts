import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const action = searchParams.get('action') as 'accept' | 'decline' | null;

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: a } = await sb
    .from('tryout_assignments')
    .select('*, tryout_players(*)')
    .eq('offer_token', token)
    .single();

  if (!a) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

  // If no action, just return the current state for the page to render
  if (!action) {
    const player = (a as { tryout_players: Record<string, string> }).tryout_players;
    const { data: club } = await sb.from('clubs').select('name, logo_url').eq('id', (a as { club_id: string }).club_id).single();
    return NextResponse.json({
      player_name: player?.full_name,
      team_name: (a as { team: string }).team,
      club_name: club?.name,
      club_logo: club?.logo_url,
      current_status: (a as { offer_status: string }).offer_status,
    });
  }

  // Already responded?
  const offerStatus = (a as { offer_status: string }).offer_status;
  if (['Accepted','Declined'].includes(offerStatus)) {
    return NextResponse.json({ already_responded: true, action: offerStatus.toLowerCase() });
  }

  const newStatus = action === 'accept' ? 'Accepted' : 'Declined';
  await sb.from('tryout_assignments').update({
    offer_status: newStatus,
    status: newStatus,
    offer_responded_at: new Date().toISOString(),
  }).eq('id', (a as { id: string }).id);

  const player = (a as { tryout_players: Record<string, string> }).tryout_players;
  const { data: club } = await sb.from('clubs').select('name, logo_url, primary_color').eq('id', (a as { club_id: string }).club_id).single();
  return NextResponse.json({
    ok: true,
    action,
    player_name: player?.full_name,
    team_name: (a as { team: string }).team,
    club_name: club?.name,
    club_logo: club?.logo_url,
    club_color: club?.primary_color,
  });
}
