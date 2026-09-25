import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { mergeTokens } from '@/lib/mergeTokens';
import { requireRole } from '@/lib/apiAuth';
import { resolveFeePlan, renderInstallmentPlanHtml, formatCurrency, plansToMap } from '@/lib/tryoutFeePlan';
import { resolveOfferLetter, lettersToMap } from '@/lib/tryoutOfferLetter';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { club_id, team_name } = await req.json();
  if (!club_id || !team_name) return NextResponse.json({ error: 'club_id and team_name required' }, { status: 400 });
  if (auth.role !== 'app_admin' && club_id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = supabaseAdmin();

  const { data: assignments } = await sb
    .from('tryout_assignments')
    .select('*, tryout_players(*)')
    .eq('club_id', club_id)
    .eq('team', team_name)
    .eq('offer_status', 'NotSent')
    .in('status', ['Offer','Unassigned']);

  if (!assignments?.length) return NextResponse.json({ sent: 0 });

  const [{ data: settings }, { data: club }, { data: feePlanRows }, { data: team }, { data: letterRows }] = await Promise.all([
    sb.from('tryout_offer_settings').select('*').eq('club_id', club_id).single(),
    sb.from('clubs').select('name, currency').eq('id', club_id).single(),
    sb.from('tryout_fee_plans').select('age_groups, season_fee, installments').eq('club_id', club_id).order('created_at', { ascending: true }),
    sb.from('tryout_teams').select('age_group, season_fee, deposit_amount').eq('club_id', club_id).eq('name', team_name).single(),
    sb.from('tryout_offer_letter_templates').select('age_groups, subject, from_name, body_html').eq('club_id', club_id).order('created_at', { ascending: true }),
  ]);
  if (!settings) return NextResponse.json({ error: 'Offer settings not configured' }, { status: 400 });
  const lettersByAgeGroup = lettersToMap(letterRows ?? []);

  // Same for every recipient in this batch — resolve once, not per player.
  const currency = club?.currency ?? 'USD';
  const feePlan = resolveFeePlan(team?.age_group ?? null, team?.season_fee ?? null, team?.deposit_amount ?? null, plansToMap(feePlanRows ?? []));
  const resolvedSeasonFee     = formatCurrency(feePlan.seasonFee, currency);
  const resolvedDepositAmount = feePlan.installments[0]?.amount != null ? formatCurrency(feePlan.installments[0].amount, currency) : '';
  const installmentPlanHtml   = renderInstallmentPlanHtml(feePlan, currency);
  const offerDeadlineFmt = settings.offer_deadline
    ? new Date(settings.offer_deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  let coachName = '';
  const { data: ca } = await sb
    .from('tryout_coach_assignments')
    .select('tryout_coaches(full_name)')
    .eq('club_id', club_id)
    .eq('team', team_name)
    .eq('role', 'head')
    .maybeSingle();
  coachName = (ca?.tryout_coaches as unknown as { full_name: string } | null)?.full_name ?? '';

  let trainingScheduleHtml = '';
  const { data: slots } = await sb
    .from('tryout_practice_slots')
    .select('day_of_week, start_time, end_time, field_name, sub_zone')
    .eq('club_id', club_id)
    .eq('team', team_name);
  if (slots && slots.length > 0) {
    const dayOrder: Record<string, number> = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
    const fmtTime = (t: string | null) => {
      if (!t) return '';
      const [h, m] = t.split(':');
      const hr = parseInt(h);
      return `${hr % 12 || 12}:${m}${hr >= 12 ? 'pm' : 'am'}`;
    };
    const items = [...slots]
      .sort((a, b) => (dayOrder[a.day_of_week] ?? 7) - (dayOrder[b.day_of_week] ?? 7))
      .map(s => {
        const time = s.start_time && s.end_time ? `${fmtTime(s.start_time)}–${fmtTime(s.end_time)}` : '';
        const venue = [s.field_name, s.sub_zone].filter(Boolean).join(', ');
        return `<li><strong>${s.day_of_week}</strong> ${time}${venue ? ` — ${venue}` : ''}</li>`;
      }).join('');
    trainingScheduleHtml = `<ul style="margin:0;padding-left:18px;">${items}</ul>`;
  }

  let sent = 0;
  const now = new Date().toISOString();

  for (const a of assignments) {
    const player = (a as { tryout_players: Record<string, string> }).tryout_players;
    if (!player?.email_primary) continue;

    const letter = resolveOfferLetter(
      player.final_age_group ?? null,
      lettersByAgeGroup,
      settings.email_subject ?? 'Your Roster Offer',
      settings.from_name ?? club?.name ?? 'Pulse FC',
    );
    const token = (a as { offer_token: string }).offer_token;
    const acceptLink = `${APP_URL}/offer-response?token=${token}&action=accept`;
    const declineLink = `${APP_URL}/offer-response?token=${token}&action=decline`;

    const body = mergeTokens(letter.bodyHtml, {
      coach_name:        coachName,
      training_schedule: trainingScheduleHtml,
      player_first_name: player.first_name ?? '',
      player_full_name:  player.full_name ?? '',
      parent_name:       player.parent_name ?? '',
      team_name:         team_name,
      age_group:         player.final_age_group ?? '',
      club_name:         club?.name ?? '',
      season_label:      player.season_label ?? '',
      offer_deadline:    offerDeadlineFmt,
      season_fee:        resolvedSeasonFee,
      deposit_amount:    resolvedDepositAmount,
      installment_plan:  installmentPlanHtml,
      payment_due_date:  settings.payment_due_date ?? '',
      payment_link:      settings.payment_link     ?? '',
      uniform_link:      settings.uniform_shop_url ?? '',
      club_website:      settings.club_website_url ?? '',
      accept_link:       acceptLink,
      decline_link:      declineLink,
    });

    try {
      await resend.emails.send({
        from: `${letter.fromName} <support@pulse-fc.app>`,
        to: player.email_primary,
        subject: letter.subject,
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
