import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { mergeTokens } from '@/lib/mergeTokens';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dugoutfc.app';

export async function POST(req: NextRequest) {
  const { assignment_id } = await req.json();
  if (!assignment_id) return NextResponse.json({ error: 'assignment_id required' }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: a } = await sb.from('tryout_assignments').select('*, tryout_players(*)').eq('id', assignment_id).single();
  if (!a) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const player = (a as { tryout_players: Record<string, string> }).tryout_players;
  const clubId = (a as { club_id: string }).club_id;

  const { data: settings } = await sb.from('tryout_offer_settings').select('*').eq('club_id', clubId).single();
  const { data: club } = await sb.from('clubs').select('name').eq('id', clubId).single();

  if (!settings) return NextResponse.json({ error: 'Offer settings not configured' }, { status: 400 });
  if (!player?.email_primary) return NextResponse.json({ error: 'Player has no email' }, { status: 400 });

  const isU8 = (player.final_age_group ?? '') === 'U8';
  const bodyTemplate = (isU8 && settings.email_body_html_u8) ? settings.email_body_html_u8 : settings.email_body_html;

  const token = (a as { offer_token: string }).offer_token;
  const acceptLink = `${APP_URL}/offer-response?token=${token}&action=accept`;
  const declineLink = `${APP_URL}/offer-response?token=${token}&action=decline`;

  const body = mergeTokens(bodyTemplate ?? '', {
    player_first_name: player.first_name ?? '',
    player_full_name: player.full_name ?? '',
    parent_name: player.parent_name ?? '',
    team_name: (a as { team: string }).team ?? '',
    age_group: player.final_age_group ?? '',
    club_name: club?.name ?? '',
    season_label: player.season_label ?? '',
    offer_deadline: settings.offer_deadline ? new Date(settings.offer_deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
    teamsnap_url: settings.teamsnap_registration_url ?? '',
    accept_link: acceptLink,
    decline_link: declineLink,
  });

  const from = `${settings.from_name ?? club?.name ?? 'Dugout FC'} <noreply@dugoutfc.app>`;

  await resend.emails.send({
    from,
    to: player.email_primary,
    subject: settings.email_subject ?? 'Your Roster Offer',
    html: body,
  });

  await sb.from('tryout_assignments').update({ offer_status: 'Sent', offer_sent_at: new Date().toISOString() }).eq('id', assignment_id);

  return NextResponse.json({ ok: true });
}
