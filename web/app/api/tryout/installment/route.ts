import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Public, unauthenticated lookup for the /pay-tryout/[token] page.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: inst } = await supabase
    .from('tryout_installments')
    .select('id, assignment_id, amount, due_date, paid_at')
    .eq('payment_token', token)
    .single();
  if (!inst) return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });

  const { data: assignment } = await supabase
    .from('tryout_assignments')
    .select('id, club_id, team, player_id')
    .eq('id', inst.assignment_id)
    .single();
  if (!assignment) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  const { data: club } = await supabase
    .from('clubs')
    .select('name, logo_url, primary_color, currency')
    .eq('id', assignment.club_id)
    .single();

  const { count: futureCount } = await supabase
    .from('tryout_installments')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignment.id)
    .neq('id', inst.id)
    .is('paid_at', null);

  return NextResponse.json({
    amount: inst.amount,
    due_date: inst.due_date,
    paid: !!inst.paid_at,
    currency: club?.currency ?? 'USD',
    form_title: `${assignment.team ?? 'Roster'} — Season Fee`,
    club_name: club?.name ?? 'Your Club',
    club_logo_url: club?.logo_url ?? null,
    club_color: club?.primary_color ?? null,
    has_future_installments: (futureCount ?? 0) > 0,
  });
}
