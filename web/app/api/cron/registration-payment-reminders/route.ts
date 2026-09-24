import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';
import { formatCurrency } from '@/lib/formatCurrency';

const resend = new Resend(process.env.RESEND_API_KEY);
const REMINDER_COOLDOWN_DAYS = 3;

// The only automated part of a registration payment plan today — a future
// installment is scheduled (see /api/registration/create-installments) but
// nothing charges it automatically. This is what actually gets a family
// back to /pay-registration/[token] for each payment as it comes due,
// instead of the schedule silently sitting unpaid forever.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const cooldownAgo = new Date(Date.now() - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: due, error } = await supabase
    .from('registration_installments')
    .select('id, submission_id, amount, due_date, payment_token')
    .is('paid_at', null)
    .lte('due_date', today)
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${cooldownAgo}`);

  if (error) {
    console.error('registration-payment-reminders cron: query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due?.length) return NextResponse.json({ sent: 0 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.pulse-fc.app';
  let sent = 0, failed = 0;

  for (const inst of due) {
    try {
      const { data: submission } = await supabase
        .from('registration_submissions')
        .select('id, form_id, data')
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
        .from('clubs').select('name, logo_url, primary_color').eq('id', form.club_id).single();

      const dataEntries = Object.entries((submission.data ?? {}) as Record<string, string>);
      const parentEmail = dataEntries.find(([k]) => k.toLowerCase().includes('email'))?.[1];
      if (!parentEmail) { failed++; continue; }

      const clubName = club?.name ?? 'Your club';
      const accent   = club?.primary_color && /^#[0-9a-f]{6}$/i.test(club.primary_color) ? club.primary_color : '#22C55E';
      const amountFmt = formatCurrency(inst.amount, form.currency);
      const payUrl = `${baseUrl}/pay-registration/${inst.payment_token}`;

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="height:4px;background:${accent};"></td></tr>
<tr><td style="padding:32px 28px;">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;">Payment due</p>
  <h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#111827;">${form.title}</h1>
  <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount due</p>
  <p style="margin:0 0 20px;font-size:28px;font-weight:900;color:${accent};">${amountFmt}</p>
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
      sent++;
    } catch (err) {
      console.error('registration-payment-reminders: send failed', err);
      failed++;
    }
  }

  console.log(`registration-payment-reminders cron: sent=${sent} failed=${failed} total=${due.length}`);
  return NextResponse.json({ sent, failed, total: due.length });
}
