import { supabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';
import { resolveAccent, esc } from '@/lib/emailHelpers';
import { sendExpoPush } from '@/lib/expoPush';
import { resolveProfileEmails } from '@/lib/resolveProfileEmails';

const resend = new Resend(process.env.RESEND_API_KEY);

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type RegInstallment = { id: string; amount: number; refunded_amount: number; last_refund_id: string | null; submission_id: string };
type TryoutInstallment = { id: string; amount: number; refunded_amount: number; last_refund_id: string | null; assignment_id: string };

export type MatchedInstallment =
  | ({ kind: 'registration' } & RegInstallment)
  | ({ kind: 'tryout' } & TryoutInstallment);

// A refund/dispute webhook only carries the Stripe payment_intent id —
// figure out which of the two installment tables (if either) that charge
// belongs to. Registration and tryout installments never share a
// payment_intent, so at most one of these two lookups can match.
export async function findInstallmentByPaymentIntent(paymentIntentId: string): Promise<MatchedInstallment | null> {
  const supabase = supabaseAdmin();

  const { data: reg } = await supabase
    .from('registration_installments')
    .select('id, amount, refunded_amount, last_refund_id, submission_id')
    .eq('reference', paymentIntentId)
    .maybeSingle<RegInstallment>();
  if (reg) return { kind: 'registration', ...reg };

  const { data: tryout } = await supabase
    .from('tryout_installments')
    .select('id, amount, refunded_amount, last_refund_id, assignment_id')
    .eq('reference', paymentIntentId)
    .maybeSingle<TryoutInstallment>();
  if (tryout) return { kind: 'tryout', ...tryout };

  return null;
}

type ClubInfo = { id: string; name: string; slug: string | null; logo_url: string | null; primary_color: string | null } | null;

async function resolveClubAndFamily(match: MatchedInstallment): Promise<{ club: ClubInfo; familyEmail: string | null; label: string }> {
  const supabase = supabaseAdmin();

  if (match.kind === 'registration') {
    const { data: submission } = await supabase
      .from('registration_submissions')
      .select('id, form_id, data')
      .eq('id', match.submission_id)
      .single();
    const { data: form } = await supabase
      .from('registration_forms')
      .select('id, title, club_id, clubs(id, name, slug, logo_url, primary_color)')
      .eq('id', submission?.form_id ?? '')
      .single();
    const club = (form?.clubs ?? null) as ClubInfo;
    const dataEntries = Object.entries((submission?.data ?? {}) as Record<string, string>);
    const familyEmail = dataEntries.find(([k]) => k.toLowerCase().includes('email'))?.[1] ?? null;
    return { club, familyEmail, label: form?.title ?? 'Registration' };
  }

  const { data: assignment } = await supabase
    .from('tryout_assignments')
    .select('id, club_id, team, player_id')
    .eq('id', match.assignment_id)
    .single();
  const { data: player } = await supabase
    .from('tryout_players').select('full_name, email_primary').eq('id', assignment?.player_id ?? '').single();
  const { data: club } = await supabase
    .from('clubs').select('id, name, slug, logo_url, primary_color').eq('id', assignment?.club_id ?? '').single<ClubInfo>();
  return { club, familyEmail: player?.email_primary ?? null, label: `${assignment?.team ?? 'Tryout'} — ${player?.full_name ?? 'Player'}` };
}

function alertHtml(opts: { accent: string; heading: string; body: string }): string {
  return `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:32px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;background:#111111;border:1px solid #222222;border-radius:16px;overflow:hidden;">
  <div style="height:3px;background:${opts.accent};"></div>
  <div style="padding:28px;">
    <h1 style="margin:0 0 12px;font-size:19px;font-weight:800;color:#f9fafb;">${esc(opts.heading)}</h1>
    <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.7;">${esc(opts.body)}</p>
  </div>
</div>
</body></html>`;
}

async function notifyStaff(match: MatchedInstallment, opts: { type: string; title: string; body: string; emailSubject: string; emailBody: string }) {
  const supabase = supabaseAdmin();
  const { club, label } = await resolveClubAndFamily(match);
  if (!club?.id) return;

  const { data: admins } = await supabase.from('profiles').select('id').eq('club_id', club.id).in('role', ['org_admin', 'app_admin']);
  const staffIds = (admins ?? []).map(a => a.id as string);
  if (!staffIds.length) return;

  await supabase.from('notifications').insert(staffIds.map(profile_id => ({
    profile_id, type: opts.type, title: opts.title, body: `${label} — ${opts.body}`, data: { type: opts.type },
  })));

  const { data: tokens } = await supabase.from('push_tokens').select('token').in('profile_id', staffIds);
  if (tokens?.length) {
    await sendExpoPush(tokens.map(t => ({ to: t.token, title: opts.title, body: `${label} — ${opts.body}`, sound: 'default', data: { type: opts.type } })));
  }

  const emailMap = await resolveProfileEmails(supabase, staffIds);
  const to = [...emailMap.values()];
  if (!to.length) return;
  try {
    await resend.emails.send({
      from: 'Pulse FC <support@pulse-fc.app>', to,
      subject: opts.emailSubject,
      html: alertHtml({ accent: resolveAccent(club.primary_color), heading: opts.title, body: `${label} — ${opts.emailBody}` }),
    });
  } catch (e) {
    console.error('installmentRefunds: staff alert email failed', e);
  }
}

async function notifyFamily(match: MatchedInstallment, opts: { subject: string; heading: string; body: string }) {
  const { club, familyEmail } = await resolveClubAndFamily(match);
  if (!familyEmail) return;
  const clubName = club?.name ?? 'Your club';
  try {
    await resend.emails.send({
      from: `${clubName} <support@pulse-fc.app>`, to: familyEmail, subject: opts.subject,
      html: alertHtml({ accent: resolveAccent(club?.primary_color), heading: opts.heading, body: opts.body }),
    });
  } catch (e) {
    console.error('installmentRefunds: family email failed', e);
  }
}

// Mirrors lib/refunds.ts's applyRefund, but for the registration/tryout
// installment tables instead of fee_payments — same CAS-on-refunded_amount
// idempotency shape, plus a last_refund_id check up front so a redelivered
// webhook for the exact same Stripe refund is a clean no-op. A full refund
// clears paid_at so the installment becomes payable again (the public pay
// pages and create-payment-intent both gate on paid_at IS NULL); a partial
// refund leaves it marked paid.
export async function applyInstallmentRefund(match: MatchedInstallment, opts: {
  amount: number; stripeRefundId: string; reason: string | null;
}): Promise<{ ok: true; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  if (match.last_refund_id === opts.stripeRefundId) return { ok: true, alreadyProcessed: true };

  const supabase = supabaseAdmin();
  const table = match.kind === 'registration' ? 'registration_installments' : 'tryout_installments';

  const newRefunded = round2(match.refunded_amount + opts.amount);
  const isFullRefund = newRefunded >= match.amount - 0.01;

  const patch: Record<string, unknown> = { refunded_amount: newRefunded, last_refund_id: opts.stripeRefundId };
  if (isFullRefund) patch.paid_at = null;

  const { data: claimed, error } = await supabase
    .from(table)
    .update(patch)
    .eq('id', match.id)
    .eq('refunded_amount', match.refunded_amount)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!claimed?.length) return { ok: true, alreadyProcessed: true };

  if (match.kind === 'registration') {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: current } = await supabase
        .from('registration_submissions').select('amount_paid, amount_due').eq('id', match.submission_id).single();
      if (!current) break;
      const prevPaid = Number(current.amount_paid ?? 0);
      const newPaid = Math.max(0, round2(prevPaid - opts.amount));
      const newStatus = newPaid <= 0 ? 'unpaid' : (current.amount_due != null && newPaid >= current.amount_due - 0.01 ? 'paid' : 'partial');
      const { data: claimedSub, error: subErr } = await supabase
        .from('registration_submissions')
        .update({ amount_paid: newPaid, payment_status: newStatus })
        .eq('id', match.submission_id)
        .eq('amount_paid', prevPaid)
        .select('id');
      if (subErr) break;
      if (claimedSub?.length) break;
    }
  }

  const fmtAmount = `$${opts.amount.toFixed(2)}`;
  await notifyStaff(match, {
    type: 'payment_refunded', title: '💸 Refund issued',
    body: `${fmtAmount} refunded`, emailSubject: `💸 Refund issued — ${fmtAmount}`, emailBody: `${fmtAmount} was refunded.`,
  });
  await notifyFamily(match, {
    subject: `Refund confirmation — ${fmtAmount}`,
    heading: '💸 Refund issued',
    body: `${fmtAmount} has been refunded${opts.reason ? ` (${opts.reason.replace(/_/g, ' ')})` : ''}. This typically appears back on your original payment method within 5–10 business days.`,
  });

  return { ok: true };
}

// A dispute debits the club's balance immediately — flag it so staff aren't
// relying on noticing it in their Stripe balance on their own. Guarded on
// disputed_at the same way handleDisputeCreated guards fee_payments.
export async function flagInstallmentDisputed(match: MatchedInstallment, dispute: { status: string; amount: number }) {
  const supabase = supabaseAdmin();
  const table = match.kind === 'registration' ? 'registration_installments' : 'tryout_installments';

  const { data: current } = await supabase.from(table).select('disputed_at').eq('id', match.id).single();
  if (current?.disputed_at) return;

  await supabase.from(table).update({ disputed_at: new Date().toISOString(), dispute_status: dispute.status }).eq('id', match.id);

  const amount = `$${(dispute.amount / 100).toFixed(2)}`;
  await notifyStaff(match, {
    type: 'payment_disputed', title: '⚠️ Payment disputed',
    body: `${amount} disputed`,
    emailSubject: `⚠️ Payment disputed — ${amount}`,
    emailBody: `${amount} — the payer's bank has disputed this charge. It's already been withdrawn from your balance pending the outcome.`,
  });
}

export async function updateInstallmentDisputeStatus(match: MatchedInstallment, status: string) {
  const supabase = supabaseAdmin();
  const table = match.kind === 'registration' ? 'registration_installments' : 'tryout_installments';
  await supabase.from(table).update({ dispute_status: status }).eq('id', match.id);
}
