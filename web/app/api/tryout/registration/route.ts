import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function loadByToken(sb: ReturnType<typeof supabaseAdmin>, token: string) {
  const { data: a } = await sb
    .from('tryout_assignments')
    .select('*, tryout_players(*)')
    .eq('offer_token', token)
    .single();
  return a as (Record<string, unknown> & { tryout_players: Record<string, unknown> }) | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const sb = supabaseAdmin();
  const a = await loadByToken(sb, token);
  if (!a) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (a.offer_status !== 'Accepted') {
    return NextResponse.json({ error: 'This offer has not been accepted yet.' }, { status: 400 });
  }

  const player = a.tryout_players;
  const { data: club } = await sb.from('clubs').select('name, logo_url, primary_color').eq('id', a.club_id as string).single();

  return NextResponse.json({
    already_submitted: a.registration_status === 'Submitted',
    player_name: player?.full_name,
    team_name: a.team,
    club_name: club?.name,
    club_logo: club?.logo_url,
    club_color: club?.primary_color,
    player: {
      emergency_contact_name: player?.emergency_contact_name ?? '',
      emergency_contact_phone: player?.emergency_contact_phone ?? '',
      emergency_contact_relationship: player?.emergency_contact_relationship ?? '',
      medical_notes: player?.medical_notes ?? '',
      jersey_size: player?.jersey_size ?? '',
      shorts_size: player?.shorts_size ?? '',
      image_permission: player?.image_permission ?? false,
    },
    agreement_signed_name: a.agreement_signed_name ?? '',
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, agreement_signed_name, ...playerFields } = body as {
    token: string; agreement_signed_name: string;
    emergency_contact_name: string; emergency_contact_phone: string; emergency_contact_relationship: string;
    medical_notes: string; jersey_size: string; shorts_size: string; image_permission: boolean;
  };
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  if (!agreement_signed_name?.trim()) return NextResponse.json({ error: 'Signature required' }, { status: 400 });
  if (!playerFields.emergency_contact_name?.trim() || !playerFields.emergency_contact_phone?.trim()) {
    return NextResponse.json({ error: 'Emergency contact name and phone are required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const a = await loadByToken(sb, token);
  if (!a) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (a.offer_status !== 'Accepted') {
    return NextResponse.json({ error: 'This offer has not been accepted yet.' }, { status: 400 });
  }

  await sb.from('tryout_players').update({
    emergency_contact_name: playerFields.emergency_contact_name.trim(),
    emergency_contact_phone: playerFields.emergency_contact_phone.trim(),
    emergency_contact_relationship: playerFields.emergency_contact_relationship?.trim() || null,
    medical_notes: playerFields.medical_notes?.trim() || null,
    jersey_size: playerFields.jersey_size?.trim() || null,
    shorts_size: playerFields.shorts_size?.trim() || null,
    image_permission: !!playerFields.image_permission,
  }).eq('id', (a.tryout_players as { id: string }).id);

  await sb.from('tryout_assignments').update({
    registration_status: 'Submitted',
    registration_submitted_at: new Date().toISOString(),
    agreement_signed_name: agreement_signed_name.trim(),
  }).eq('id', a.id as string);

  return NextResponse.json({ ok: true });
}
