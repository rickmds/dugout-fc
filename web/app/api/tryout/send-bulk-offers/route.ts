import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { mergeTokens } from '@/lib/mergeTokens';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dugoutfc.app';

export async function POST(req: NextRequest) {
  const { club_id, team_name } = await req.json();
  if (!club_id || !team_name) return NextResponse.json({ error: 'club_id and team_name required' }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: assignments } = await sb
    .from('tryout_assignments')
    .select('*, tryout_players(*)')
    .eq('club_id', club_id)
    .eq('team', team_name)
    .eq('offer_status', 'NotSent')
    .in('status', ['Offer','Unassigned']);

  if (!assignments?.length) return NextResponse.json({ sent: 0 });

  const { data: settings } = await sb.from('tryout_offer_settings').select('*').eq('club_id', club_id).single();
  const { data: club } = await sb.from('clubs').select('name').eq('id', club_id).single();
  if (!settings) return NextResponse.json({ error: 'Offer settings not configured' }, { status: 400 });

  let sent = 0;
  const now = new Date().toISOString();

  for (const a of assignments) {
    const player = (a as { tryout_players: Record<string, string> }).tryout_players;
    if (!player?.email_primary) continue;

    const isU8 = (player.final_age_group ?? '') === 'U8';
    const bodyTemplate = (isU8 && settings.email_body_html_u8) ? settings.email_body_html_u8 : settings.email_body_html;
    const token = (a as { offer_token: string }).offer_token;
    const acceptLink = `${APP_URL}/offer-response?token=${token}&action=accept`;
    const declineLink = `${APP_URL}/offer-response?token=${token}&action=decline`;

    const body = mergeTokens(bodyTemplate ?? '', {
      player_first_name: player.first_name ?? '',
      player_full_name: player.full_name ?? '',
      parent_name: player.parent_name ?? '',
      team_name: team_name,
      age_group: player.final_age_group ?? '',
      club_name: club?.name ?? '',
      season_label: player.season_label ?? '',
      offer_deadline: settings.offer_deadline ? new Date(settings.offer_deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
      accept_link: acceptLink,
      decline_link: declineLink,
    });

    try {
      await resend.emails.send({
        from: `${settings.from_name ?? club?.name ?? 'Dugout FC'} <noreply@dugoutfc.app>`,
        to: player.email_primary,
        subject: settings.email_subject ?? 'Your Roster Offer',
        html: body,
      });
      await sb.from('tryout_assignments').update({ offer_status: 'Sent', offer_sent_at: now }).eq('id', a.id);
      sent++;
    } catch {
      // continue on individual send failure
    }
  }

  return NextResponse.json({ sent });
}
