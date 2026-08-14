import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Public, unauthenticated lookup for the payment page — the payment_token
// itself (an opaque uuid, not guessable) is the only credential a parent
// has. Runs on the service role so the anon key never needs table-wide
// read access to player_fees; only these specific display columns are
// ever returned for the one row matching the token.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const db = supabaseAdmin();

  const { data, error } = await db
    .from('player_fees')
    .select(`
      id, payment_token, description, amount_due, amount_paid, discount, due_date, status, installment_number, installment_total, payee_type, payment_instructions,
      players!inner(full_name),
      teams!inner(name, clubs!inner(name, logo_url, primary_color, slug, stripe_fee_handling, allow_partial_payments, hardship_fund_enabled))
    `)
    .eq('payment_token', token)
    .single<{
      id: string; payment_token: string | null; description: string; amount_due: number; amount_paid: number;
      discount: number | null; due_date: string | null; status: string; installment_number: number | null; installment_total: number | null;
      payee_type: 'club' | 'coach'; payment_instructions: string | null;
      players: { full_name: string } | null;
      teams: { name: string; clubs: { name: string; logo_url: string | null; primary_color: string | null; slug: string; stripe_fee_handling: string | null; allow_partial_payments: boolean | null; hardship_fund_enabled: boolean | null } | null } | null;
    }>();

  if (error || !data) return NextResponse.json({ error: 'Fee not found' }, { status: 404 });

  const club = data.teams?.clubs;
  return NextResponse.json({
    id:                     data.id,
    payment_token:          data.payment_token,
    description:            data.description,
    amount_due:             data.amount_due,
    amount_paid:            data.amount_paid,
    discount:               data.discount,
    due_date:               data.due_date,
    status:                 data.status,
    allow_partial_payments: club?.allow_partial_payments ?? false,
    stripe_fee_handling:    club?.stripe_fee_handling ?? 'absorb',
    hardship_fund_enabled:  club?.hardship_fund_enabled ?? false,
    installment_number:     data.installment_number ?? null,
    installment_total:      data.installment_total ?? null,
    payee_type:             data.payee_type ?? 'club',
    payment_instructions:   data.payment_instructions ?? null,
    player_name:            data.players?.full_name ?? 'Player',
    team_name:              data.teams?.name ?? 'Team',
    club_name:              club?.name ?? 'Club',
    club_logo:              club?.logo_url ?? null,
    club_color:             club?.primary_color ?? '#22C55E',
    club_slug:              club?.slug ?? '',
  });
}
