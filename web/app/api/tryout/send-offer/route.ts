import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { mergeTokens } from '@/lib/mergeTokens';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dugoutfc.app';

export async function POST(req: NextRequest) {
  const { player_id, club_id } = await req.json();
  if (!player_id || !club_id) return NextResponse.json({ error: 'player_id and club_id required' }, { status: 400 });

  const sb = supabaseAdmin();

  const [{ data: player }, { data: assignment }, { data: settings }, { data: club }] = await Promise.all([
    sb.from('tryout_players').select('*').eq('id', player_id).single(),
    sb.from('tryout_assignments').select('*').eq('player_id', player_id).eq('club_id', club_id).single(),
    sb.from('tryout_offer_settings').select('*').eq('club_id', club_id).single(),
    sb.from('clubs').select('name').eq('id', club_id).single(),
  ]);

  if (!player)     return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  if (!settings)   return NextResponse.json({ error: 'Offer settings not configured' }, { status: 400 });
  if (!player.email_primary) return NextResponse.json({ error: 'Player has no email' }, { status: 400 });

  // Fetch team-specific fees (fallback to global offer settings)
  const teamName = assignment.team as string | null;
  let teamSeasonFee: string | null = null;
  let teamDepositAmount: string | null = null;
  if (teamName) {
    const { data: team } = await sb.from('tryout_teams')
      .select('season_fee, deposit_amount')
      .eq('club_id', club_id)
      .eq('name', teamName)
      .single();
    teamSeasonFee    = team?.season_fee    ?? null;
    teamDepositAmount = team?.deposit_amount ?? null;
  }

  const resolvedSeasonFee    = teamSeasonFee    ?? settings.season_fee    ?? '';
  const resolvedDepositAmount = teamDepositAmount ?? settings.deposit_amount ?? '';

  // Head coach for this team
  let coachName = '';
  if (teamName) {
    const { data: ca } = await sb
      .from('tryout_coach_assignments')
      .select('tryout_coaches(full_name)')
      .eq('club_id', club_id)
      .eq('team', teamName)
      .eq('role', 'head')
      .maybeSingle();
    coachName = (ca?.tryout_coaches as any)?.full_name ?? '';
  }

  const isU8 = (player.final_age_group ?? '') === 'U8';
  const bodyTemplate = (isU8 && settings.email_body_html_u8) ? settings.email_body_html_u8 : settings.email_body_html;

  const token       = assignment.offer_token as string;
  const acceptLink  = `${APP_URL}/offer-response?token=${token}&action=accept`;
  const declineLink = `${APP_URL}/offer-response?token=${token}&action=decline`;

  const offerDeadlineFmt = settings.offer_deadline
    ? new Date(settings.offer_deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  const body = mergeTokens(bodyTemplate ?? '', {
    coach_name:        coachName,
    player_first_name: player.first_name    ?? '',
    player_full_name:  `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
    parent_name:       player.parent_name   ?? '',
    team_name:         teamName             ?? '',
    age_group:         player.final_age_group ?? '',
    club_name:         club?.name           ?? '',
    season_label:      player.season_label  ?? '',
    offer_deadline:    offerDeadlineFmt,
    season_fee:        resolvedSeasonFee,
    deposit_amount:    resolvedDepositAmount,
    payment_due_date:  settings.payment_due_date ?? '',
    payment_link:      settings.payment_link     ?? '',
    uniform_link:      settings.uniform_shop_url ?? '',
    club_website:      settings.club_website_url ?? '',
    accept_link:       acceptLink,
    decline_link:      declineLink,
  });

  const from = `${settings.from_name ?? club?.name ?? 'Dugout FC'} <noreply@dugoutfc.app>`;

  await resend.emails.send({
    from,
    to: player.email_primary,
    subject: settings.email_subject ?? 'Your Roster Offer',
    html: body,
  });

  await sb.from('tryout_assignments')
    .update({ offer_status: 'Sent', offer_sent_at: new Date().toISOString() })
    .eq('player_id', player_id)
    .eq('club_id', club_id);

  return NextResponse.json({ ok: true });
}
