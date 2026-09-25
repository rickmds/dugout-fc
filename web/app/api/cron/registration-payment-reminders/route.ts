import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';
import { formatCurrency } from '@/lib/formatCurrency';
import { buildRegistrationChargeBody } from '@/lib/registrationCharge';
import { handleRegistrationPaymentComplete } from '../../stripe/webhook/route';
import { claimInstallmentForCharge, releaseInstallmentChargeLock } from '@/lib/installmentChargeLock';

const resend = new Resend(process.env.RESEND_API_KEY);
const REMINDER_COOLDOWN_DAYS = 3;

// For a family that opted into autopay when they paid their first
// installment (see /api/registration/create-payment-intent), this attempts
// an off-session charge against their saved card. Anyone else — or an
// off-session attempt that fails (declined, or a card requiring live 3DS
// authentication, which can never succeed off-session) — falls back to the
// email-a-link behavior this cron always had.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  const supabase = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const cooldownAgo = new Date(Date.now() - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: due, error } = await supabase
    .from('registration_installments')
    .select('id, submission_id, amount, due_date, payment_token, charge_attempts')
    .is('paid_at', null)
    .lte('due_date', today)
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${cooldownAgo}`);

  if (error) {
    console.error('registration-payment-reminders cron: query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due?.length) return NextResponse.json({ sent: 0 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.pulse-fc.app';
  let autoCharged = 0, emailed = 0, failed = 0;

  for (const inst of due) {
    try {
      const { data: submission } = await supabase
        .from('registration_submissions')
        .select('id, form_id, data, autopay_consent, stripe_customer_id, stripe_payment_method_id')
        .eq('id', inst.submission_id)
        .single();
      if (!submission) { failed++; continue; }

      const { data: form } = await supabase
        .from('registration_forms')
        .select('id, title, currency, club_id')
        .eq('id', submission.form_id)
        .single();
      if (!form) { failed++; continue; }

      const { data: club } = await supabase
        .from('clubs')
        .select('id, name, slug, logo_url, primary_color, stripe_fee_handling, stripe_connect_account_id, stripe_connect_onboarded')
        .eq('id', form.club_id)
        .single();

      const clubName = club?.name ?? 'Your club';
      const accent   = club?.primary_color && /^#[0-9a-f]{6}$/i.test(club.primary_color) ? club.primary_color : '#22C55E';
      const amountFmt = formatCurrency(inst.amount, form.currency);

      // ── Try an off-session auto-charge first ───────────────────────────
      const canAutoCharge = !!stripeKey && submission.autopay_consent && submission.stripe_customer_id && submission.stripe_payment_method_id;
      if (canAutoCharge) {
        // A family paying this exact installment manually right now holds
        // this lock — skip the auto-charge attempt this cycle rather than
        // risk a second, concurrent Stripe charge for the same installment.
        const claimed = await claimInstallmentForCharge(supabase, 'registration_installments', inst.id);
        if (!claimed) { continue; }

        const charge = buildRegistrationChargeBody({
          amount: inst.amount, currency: form.currency ?? 'USD', club,
          installmentId: inst.id, paymentToken: inst.payment_token, submissionId: submission.id,
        });
        if (!('error' in charge)) {
          charge.body.set('customer', submission.stripe_customer_id!);
          charge.body.set('payment_method', submission.stripe_payment_method_id!);
          charge.body.set('off_session', 'true');
          charge.body.set('confirm', 'true');

          const idempotencyKey = `pi_reg_auto_${inst.id}_${charge.chargeAmount}_${inst.charge_attempts}`;
          const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey },
            body: charge.body,
          });
          let pi: { id?: string; status?: string; payment_method?: string; amount_received?: number; error?: { message?: string } } | null;
          try { pi = await piRes.json(); } catch { pi = null; }
          await releaseInstallmentChargeLock(supabase, 'registration_installments', inst.id);

          if (piRes.ok && pi?.status === 'succeeded') {
            await handleRegistrationPaymentComplete({
              registration_installment_id: inst.id,
              amount: (pi.amount_received ?? Math.round(inst.amount * 100)) / 100,
              payment_intent_id: pi.id!,
              payment_method_id: pi.payment_method ?? null,
            });
            autoCharged++;
            continue; // no email needed — it worked
          }

          // Declined, requires live authentication, or any other Stripe
          // error — record it and fall through to the email fallback below.
          await supabase.from('registration_installments').update({
            charge_attempts: (inst.charge_attempts ?? 0) + 1,
            last_charge_error: pi?.error?.message ?? `Stripe error ${piRes.status}`,
          }).eq('id', inst.id);
        } else {
          await releaseInstallmentChargeLock(supabase, 'registration_installments', inst.id);
        }
      }

      // ── Fallback: email the payment link ───────────────────────────────
      const dataEntries = Object.entries((submission.data ?? {}) as Record<string, string>);
      const parentEmail = dataEntries.find(([k]) => k.toLowerCase().includes('email'))?.[1];
      if (!parentEmail) { failed++; continue; }

      const payUrl = `${baseUrl}/pay-registration/${inst.payment_token}`;
      const chargeFailedNote = canAutoCharge
        ? `<p style="margin:0 0 20px;font-size:13px;color:#DC2626;">We tried to charge your card on file and it didn&apos;t go through. Please pay using the button below.</p>`
        : '';

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="height:4px;background:${accent};"></td></tr>
<tr><td style="padding:32px 28px;">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;">Payment due</p>
  <h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#111827;">${form.title}</h1>
  <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount due</p>
  <p style="margin:0 0 20px;font-size:28px;font-weight:900;color:${accent};">${amountFmt}</p>
  ${chargeFailedNote}
  <a href="${payUrl}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;font-size:15px;">Pay now</a>
  <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">This is part of your registration for ${clubName}. If you've already paid this, you can ignore this email.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

      await resend.emails.send({
        from: `${clubName} <support@pulse-fc.app>`,
        to: parentEmail,
        subject: `Payment due: ${form.title} — ${amountFmt}`,
        html,
      });

      await supabase.from('registration_installments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', inst.id);
      emailed++;
    } catch (err) {
      console.error('registration-payment-reminders: failed', err);
      failed++;
    }
  }

  console.log(`registration-payment-reminders cron: auto_charged=${autoCharged} emailed=${emailed} failed=${failed} total=${due.length}`);
  return NextResponse.json({ auto_charged: autoCharged, emailed, failed, total: due.length });
}
