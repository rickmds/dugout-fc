import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';
import { mergeTokens } from '@/lib/mergeTokens';
import { resolveFeePlan, renderInstallmentPlanHtml, formatCurrency, plansToMap } from '@/lib/tryoutFeePlan';
import { resolveOfferLetter, lettersToMap } from '@/lib/tryoutOfferLetter';

type SupabaseAdmin = ReturnType<typeof supabaseAdmin>;

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

export type SendTryoutOfferResult = { ok: true } | { ok: false; error: string; status: number };

// The actual send: resolves fee plan + letter template + coach name +
// practice schedule, merges tokens, sends via Resend, marks offer_status
// Sent. Pulled out of the send-offer API route so the waitlist
// auto-advance path (web/lib/tryoutWaitlist.ts) can fire the same real
// offer email a staff click would, without round-tripping through its own
// auth-gated HTTP endpoint.
export async function sendTryoutOfferEmail(sb: SupabaseAdmin, player_id: string, club_id: string): Promise<SendTryoutOfferResult> {
  const [{ data: player }, { data: assignment }, { data: settings }, { data: club }, { data: feePlanRows }, { data: letterRows }] = await Promise.all([
    sb.from('tryout_players').select('*').eq('id', player_id).eq('club_id', club_id).single(),
    sb.from('tryout_assignments').select('*').eq('player_id', player_id).eq('club_id', club_id).single(),
    sb.from('tryout_offer_settings').select('*').eq('club_id', club_id).single(),
    sb.from('clubs').select('name, currency').eq('id', club_id).single(),
    sb.from('tryout_fee_plans').select('age_groups, season_fee, installments').eq('club_id', club_id).order('created_at', { ascending: true }),
    sb.from('tryout_offer_letter_templates').select('age_groups, subject, from_name, body_html').eq('club_id', club_id).order('created_at', { ascending: true }),
  ]);

  if (!player)     return { ok: false, error: 'Player not found', status: 404 };
  if (!assignment) return { ok: false, error: 'Assignment not found', status: 404 };
  if (!settings)   return { ok: false, error: 'Offer settings not configured', status: 400 };
  if (!player.email_primary) return { ok: false, error: 'Player has no email', status: 400 };

  const teamName = assignment.team as string | null;
  let teamAgeGroup: string | null = null;
  let teamSeasonFeeOverride: string | null = null;
  let teamDepositOverride: string | null = null;
  if (teamName) {
    const { data: team } = await sb.from('tryout_teams')
      .select('age_group, season_fee, deposit_amount')
      .eq('club_id', club_id)
      .eq('name', teamName)
      .single();
    teamAgeGroup          = team?.age_group      ?? null;
    teamSeasonFeeOverride = team?.season_fee     ?? null;
    teamDepositOverride   = team?.deposit_amount ?? null;
  }

  const currency = club?.currency ?? 'USD';
  const feePlan = resolveFeePlan(teamAgeGroup, teamSeasonFeeOverride, teamDepositOverride, plansToMap(feePlanRows ?? []));
  const resolvedSeasonFee     = formatCurrency(feePlan.seasonFee, currency);
  const resolvedDepositAmount = feePlan.installments[0]?.amount != null ? formatCurrency(feePlan.installments[0].amount, currency) : '';
  const installmentPlanHtml   = renderInstallmentPlanHtml(feePlan, currency);

  let coachName = '';
  if (teamName) {
    const { data: ca } = await sb
      .from('tryout_coach_assignments')
      .select('tryout_coaches(full_name)')
      .eq('club_id', club_id)
      .eq('team', teamName)
      .eq('role', 'head')
      .maybeSingle();
    coachName = (ca?.tryout_coaches as unknown as { full_name: string } | null)?.full_name ?? '';
  }

  let trainingScheduleHtml = '';
  if (teamName) {
    const { data: slots } = await sb
      .from('tryout_practice_slots')
      .select('day_of_week, start_time, end_time, field_name, sub_zone')
      .eq('club_id', club_id)
      .eq('team', teamName);
    if (slots && slots.length > 0) {
      const dayOrder: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
      const fmt = (t: string | null) => {
        if (!t) return '';
        const [h, m] = t.split(':');
        const hr = parseInt(h);
        return `${hr % 12 || 12}:${m}${hr >= 12 ? 'pm' : 'am'}`;
      };
      const items = [...slots]
        .sort((a, b) => (dayOrder[a.day_of_week] ?? 7) - (dayOrder[b.day_of_week] ?? 7))
        .map(s => {
          const time = s.start_time && s.end_time ? `${fmt(s.start_time)}–${fmt(s.end_time)}` : '';
          const venue = [s.field_name, s.sub_zone].filter(Boolean).join(', ');
          return `<li><strong>${s.day_of_week}</strong> ${time}${venue ? ` — ${venue}` : ''}</li>`;
        }).join('');
      trainingScheduleHtml = `<ul style="margin:0;padding-left:18px;">${items}</ul>`;
    }
  }

  const letter = resolveOfferLetter(
    player.final_age_group ?? null,
    lettersToMap(letterRows ?? []),
    settings.email_subject ?? 'Your Roster Offer',
    settings.from_name ?? club?.name ?? 'Pulse FC',
  );

  const token       = assignment.offer_token as string;
  const acceptLink  = `${APP_URL}/offer-response?token=${token}&action=accept`;
  const declineLink = `${APP_URL}/offer-response?token=${token}&action=decline`;

  const offerDeadlineFmt = settings.offer_deadline
    ? new Date(settings.offer_deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  const body = mergeTokens(letter.bodyHtml, {
    coach_name:        coachName,
    training_schedule: trainingScheduleHtml,
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
    installment_plan:  installmentPlanHtml,
    payment_due_date:  settings.payment_due_date ?? '',
    payment_link:      settings.payment_link     ?? '',
    uniform_link:      settings.uniform_shop_url ?? '',
    club_website:      settings.club_website_url ?? '',
    accept_link:       acceptLink,
    decline_link:      declineLink,
  });

  const from = `${letter.fromName} <support@pulse-fc.app>`;

  try {
    await resend.emails.send({ from, to: player.email_primary, subject: letter.subject, html: body });
  } catch (e) {
    console.error('sendTryoutOfferEmail: resend failed', e);
    return { ok: false, error: 'Could not send the offer email. Please try again.', status: 502 };
  }

  await sb.from('tryout_assignments')
    .update({ offer_status: 'Sent', offer_sent_at: new Date().toISOString() })
    .eq('player_id', player_id)
    .eq('club_id', club_id);

  return { ok: true };
}
