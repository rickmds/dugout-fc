import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Called right after submit_registration succeeds. Builds the real payment
// schedule server-side from the form's stored pricing config and the
// submission's already-persisted payment_choice/amount_due (submit_registration
// is the trust boundary for those two — this route re-derives everything
// else, never trusting a client-supplied schedule). Idempotent: the actual
// check-then-insert happens inside create_registration_installments_if_absent,
// which takes a per-submission advisory lock so two concurrent calls (a
// double-click, a retried fetch) can't both insert a full duplicate schedule.
export async function POST(req: NextRequest) {
  const { submission_id } = await req.json();
  if (!submission_id) return NextResponse.json({ error: 'submission_id required' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: submission } = await supabase
    .from('registration_submissions')
    .select('id, form_id, payment_choice, amount_due')
    .eq('id', submission_id)
    .single();
  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

  if (!submission.payment_choice || submission.amount_due == null || submission.amount_due <= 0) {
    return NextResponse.json({ due_now: null }); // free registration — nothing to schedule
  }

  const { data: form } = await supabase
    .from('registration_forms')
    .select('id, plan_deposit, plan_installments, plan_frequency, plan_day_of_month')
    .eq('id', submission.form_id)
    .single();
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const total = submission.amount_due;
  const today = new Date();
  const dateStr = (d: Date) => d.toISOString().slice(0, 10);

  type Row = { amount: number; due_date: string };
  const rows: Row[] = [];

  if (submission.payment_choice === 'full') {
    rows.push({ amount: total, due_date: dateStr(today) });
  } else {
    const deposit = form.plan_deposit && form.plan_deposit > 0 ? Math.min(form.plan_deposit, total) : 0;
    const n = Math.max(1, form.plan_installments ?? 3);
    const remaining = Math.max(0, total - deposit);
    const perInstallment = Math.round((remaining / n) * 100) / 100;

    if (deposit > 0) rows.push({ amount: deposit, due_date: dateStr(today) });

    const stepDays = form.plan_frequency === 'weekly' ? 7 : 30;
    // A fixed day-of-month pins every installment to a real calendar date
    // (the 1st, the 15th, ...) instead of a rolling N-day interval from
    // whenever the family happened to register — capped at 28 in the
    // column's own check constraint, so new Date(y, m, day) never overflows
    // into the wrong month regardless of month length.
    const dayOfMonth = form.plan_frequency === 'monthly' ? form.plan_day_of_month : null;
    let allocated = 0;
    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      let dueDate: Date;
      if (dayOfMonth) {
        dueDate = new Date(today.getFullYear(), today.getMonth() + i + 1, dayOfMonth);
      } else {
        // First installment is due today when there's no deposit — "some
        // due at registration" doesn't require a named deposit, just that
        // something is payable immediately.
        dueDate = new Date(today);
        if (deposit > 0 || i > 0) dueDate.setDate(dueDate.getDate() + stepDays * (deposit > 0 ? i + 1 : i));
      }
      // Last installment absorbs any rounding remainder so the schedule
      // always sums exactly to the total.
      const amount = isLast ? Math.round((remaining - allocated) * 100) / 100 : perInstallment;
      allocated += amount;
      if (amount > 0) rows.push({ amount, due_date: dateStr(dueDate) });
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .rpc('create_registration_installments_if_absent', { p_submission_id: submission_id, p_rows: rows })
    .order('due_date', { ascending: true });

  if (insertErr || !inserted?.length) {
    console.error('create-installments insert failed', insertErr);
    return NextResponse.json({ error: 'Could not set up payment schedule' }, { status: 500 });
  }

  const dueNow = inserted.find((i: { paid_at: string | null }) => !i.paid_at) ?? null;
  return NextResponse.json({ due_now: dueNow ? { token: dueNow.payment_token, amount: dueNow.amount } : null });
}
