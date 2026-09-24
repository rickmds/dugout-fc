import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Public, unauthenticated lookup for the /pay-registration/[token] page.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: inst } = await supabase
    .from('registration_installments')
    .select('id, submission_id, amount, due_date, paid_at')
    .eq('payment_token', token)
    .single();
  if (!inst) return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });

  const { data: submission } = await supabase
    .from('registration_submissions')
    .select('id, form_id, amount_due, amount_paid')
    .eq('id', inst.submission_id)
    .single();
  if (!submission) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  const { data: form } = await supabase
    .from('registration_forms')
    .select('id, title, currency, club_id')
    .eq('id', submission.form_id)
    .single();
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const { data: club } = await supabase
    .from('clubs')
    .select('name, slug, logo_url, primary_color')
    .eq('id', form.club_id)
    .single();

  const { count: futureCount } = await supabase
    .from('registration_installments')
    .select('id', { count: 'exact', head: true })
    .eq('submission_id', submission.id)
    .neq('id', inst.id)
    .is('paid_at', null);

  return NextResponse.json({
    amount: inst.amount,
    due_date: inst.due_date,
    paid: !!inst.paid_at,
    currency: form.currency ?? 'USD',
    form_title: form.title,
    club_name: club?.name ?? 'Your Club',
    club_logo_url: club?.logo_url ?? null,
    club_color: club?.primary_color ?? null,
    total_due: submission.amount_due,
    total_paid: submission.amount_paid,
    has_future_installments: (futureCount ?? 0) > 0,
  });
}
