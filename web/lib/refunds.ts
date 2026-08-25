import { supabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';
import { resolveAccent, contrastText, esc } from '@/lib/emailHelpers';
import { sendExpoPush } from '@/lib/expoPush';

const resend = new Resend(process.env.RESEND_API_KEY);

export type RefundMode = 'full' | 'percent' | 'amount' | 'external';

type FeeWithClub = {
  id: string; amount_due: number; amount_paid: number; discount: number; description: string; player_id: string;
  teams: { id: string; name: string; clubs: { id: string; name: string; slug: string | null; logo_url: string | null; primary_color: string | null } | null } | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Card network rules (and several state laws) require a surcharge to be
// returned in full on a full refund, and prorated on a partial refund —
// it can't just sit with the club/platform once the underlying fee is
// reversed. Given only a single lump-sum refund total (as Stripe's
// charge.refunded webhook gives us for a refund issued outside our own
// UI), this recovers the base/surcharge split proportional to the
// ORIGINAL payment's own split, clamped to what's actually still
// refundable on each leg.
export function splitRefundAmount(params: {
  totalRefund: number;
  originalBase: number;
  originalSurcharge: number; // 0 when the fee wasn't passed to the payer
  remainingBase: number;
  remainingSurcharge: number;
}): { baseAmount: number; surchargeAmount: number } {
  const { totalRefund, originalBase, originalSurcharge, remainingBase, remainingSurcharge } = params;
  if (originalSurcharge <= 0 || originalBase <= 0) {
    return { baseAmount: round2(Math.min(totalRefund, remainingBase)), surchargeAmount: 0 };
  }
  // This refund covers everything still outstanding on both legs — hand
  // back the exact remainders rather than the proportional formula below.
  // That formula independently clamps each leg to what's left, and when
  // both clamps bind on the same call the two clamped amounts can sum to
  // a cent or two less than totalRefund, permanently stranding it (never
  // refunded on either leg, never reflected in the ledger).
  if (round2(totalRefund) >= round2(remainingBase + remainingSurcharge)) {
    return { baseAmount: round2(remainingBase), surchargeAmount: round2(remainingSurcharge) };
  }
  const baseFraction  = originalBase / (originalBase + originalSurcharge);
  const baseAmount      = round2(Math.min(totalRefund * baseFraction, remainingBase));
  const surchargeAmount = round2(Math.min(totalRefund - baseAmount, remainingSurcharge));
  return { baseAmount, surchargeAmount };
}

// Single source of truth for what happens once a refund has actually been
// decided (either issued by us via Stripe, or reflected back from a
// charge.refunded webhook event for a refund issued outside our UI) —
// records the audit row, walks player_fees.amount_paid back down, and
// notifies the parent. Idempotent on stripe_refund_id: a duplicate
// webhook delivery, or a refund the API route already recorded, hits the
// unique constraint on fee_refunds.stripe_refund_id and is a no-op.
export async function applyRefund(params: {
  feePaymentId: string;
  amount: number; // dollars — the base-fee portion of fee_payments.amount being refunded
  surchargeAmount?: number; // dollars — the processing-fee surcharge portion being returned, if any
  mode: RefundMode;
  stripeRefundId: string | null;
  reason: string | null;
  refundedBy: string | null;
}): Promise<{ ok: true; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  const { feePaymentId, amount, surchargeAmount = 0, mode, stripeRefundId, reason, refundedBy } = params;
  const supabase = supabaseAdmin();

  const { data: payment } = await supabase
    .from('fee_payments')
    .select('id, player_fee_id, refunded_amount, refunded_surcharge')
    .eq('id', feePaymentId)
    .single();
  if (!payment) return { ok: false, error: 'Payment not found' };

  const { error: insertErr } = await supabase.from('fee_refunds').insert({
    fee_payment_id: feePaymentId,
    player_fee_id:  payment.player_fee_id,
    amount, surcharge_amount: surchargeAmount, mode,
    stripe_refund_id: stripeRefundId,
    reason, refunded_by: refundedBy,
  });
  if (insertErr) {
    // Same Stripe refund already recorded (our own API call got there
    // first, or this is a redelivered webhook) — nothing left to do.
    if (insertErr.code === '23505') return { ok: true, alreadyProcessed: true };
    return { ok: false, error: `Could not record refund: ${insertErr.message}` };
  }

  await supabase.from('fee_payments')
    .update({
      refunded_amount:    round2(Number(payment.refunded_amount ?? 0) + amount),
      refunded_surcharge: round2(Number(payment.refunded_surcharge ?? 0) + surchargeAmount),
    })
    .eq('id', feePaymentId);

  const { data: fee } = await supabase
    .from('player_fees')
    .select('id, amount_due, amount_paid, discount, description, player_id, teams!inner(id, name, clubs!inner(id, name, slug, logo_url, primary_color))')
    .eq('id', payment.player_fee_id)
    .single<FeeWithClub>();
  if (!fee) return { ok: true };

  // The surcharge was never part of amount_due/amount_paid — only the
  // base-fee portion moves the ledger.
  const newPaid   = Math.max(0, (fee.amount_paid ?? 0) - amount);
  const balance   = Math.max(0, (fee.amount_due ?? 0) - (fee.discount ?? 0));
  const newStatus = newPaid <= 0 ? 'outstanding' : newPaid >= balance - 0.01 ? 'paid' : 'partial';

  await supabase.from('player_fees').update({ amount_paid: newPaid, status: newStatus }).eq('id', fee.id);

  await notifyParent(supabase, fee, round2(amount + surchargeAmount));

  return { ok: true };
}

async function notifyParent(
  supabase: ReturnType<typeof supabaseAdmin>,
  fee: FeeWithClub,
  amountRefunded: number,
) {
  const { data: player } = await supabase
    .from('players').select('full_name, profile_id').eq('id', fee.player_id).single();
  const parentProfileId = player?.profile_id as string | null;
  const fmtAmount = `$${amountRefunded.toFixed(2)}`;
  const club = fee.teams?.clubs;
  const clubName = club?.name ?? 'Your club';
  const accent = resolveAccent(club?.primary_color);

  if (parentProfileId) {
    await supabase.from('notifications').insert({
      profile_id: parentProfileId,
      type:  'payment_refunded',
      title: '💸 Refund issued',
      body:  `${fee.description} · ${fmtAmount} refunded`,
      data:  { player_fee_id: fee.id, type: 'payment_refunded' },
    });

    const { data: tokens } = await supabase.from('push_tokens').select('token').eq('profile_id', parentProfileId);
    if (tokens?.length) {
      await sendExpoPush(tokens.map(t => ({
        to: t.token, title: '💸 Refund issued',
        body: `${fee.description} · ${fmtAmount} refunded`,
        sound: 'default',
        data: { type: 'payment_refunded', player_fee_id: fee.id },
      })));
    }
  }

  const { data: invite } = await supabase
    .from('invites').select('email')
    .eq('player_id', fee.player_id)
    .order('created_at', { ascending: false })
    .limit(1).single();
  if (!invite?.email) return;

  const year     = new Date().getFullYear();
  const btnText  = contrastText(accent);
  const initials = clubName.split(' ').slice(0, 2).map((w: string) => (w[0] ?? '').toUpperCase()).join('');
  const logoHtml = club?.logo_url
    ? `<img src="${esc(club.logo_url)}" width="56" height="56" alt="${esc(clubName)}" style="display:inline-block;border-radius:12px;" />`
    : `<div style="display:inline-block;width:56px;height:56px;line-height:56px;text-align:center;border-radius:12px;background:${accent};vertical-align:middle;"><span style="font-size:20px;font-weight:900;color:${btnText};">${esc(initials)}</span></div>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Refund confirmation</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:48px 20px 64px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td style="text-align:center;padding-bottom:28px;">${logoHtml}<p style="margin:10px 0 0;font-size:17px;font-weight:800;color:#f9fafb;">${esc(clubName)}</p></td></tr>
<tr><td style="background:#111111;border:1px solid #222222;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
<div style="height:3px;background:#3B82F6;"></div>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 28px 20px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Refund Confirmation</p>
  <h1 style="margin:0;font-size:22px;font-weight:800;color:#f9fafb;line-height:1.3;">💸 Refund issued</h1>
</td></tr>
<tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>
<tr><td style="padding:24px 28px 28px;">
  <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;overflow:hidden;">
    <div style="height:2px;background:#3B82F6;"></div>
    <table cellpadding="0" cellspacing="0" width="100%" style="padding:18px 20px;">
      <tr><td><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Description</p>
        <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#f9fafb;">${esc(fee.description)}</p></td></tr>
      <tr><td><p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Amount refunded</p>
        <p style="margin:0;font-size:24px;font-weight:900;color:#3B82F6;letter-spacing:-0.5px;">${esc(fmtAmount)}</p></td></tr>
    </table>
  </div>
</td></tr>
<tr><td style="padding:0 28px 24px;"><p style="margin:0;font-size:14px;color:#9ca3af;line-height:1.7;">This typically appears back on your original payment method within 5–10 business days. Contact your club administrator with any questions.</p></td></tr>
<tr><td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
  <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">${esc(clubName)} uses <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a> for club management. &middot; &copy; ${year} ${esc(clubName)}</p>
</td></tr>
</table></td></tr>
</table></td></tr></table>
</body></html>`;

  await resend.emails.send({
    from:    `${clubName} <support@pulse-fc.app>`,
    to:      invite.email,
    subject: `Refund confirmation: ${fee.description} — ${fmtAmount}`,
    html,
  });
}
