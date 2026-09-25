import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveFeePlan, plansToMap, normalizeDueType, type Installment as FeeInstallment } from '@/lib/tryoutFeePlan';

// Called right after the post-acceptance registration form (agreement
// signature) is submitted. Materializes whatever cost + installment plan
// the club actually configured in Cost & Installments (the exact same
// resolveFeePlan() the offer email itself used to fill in {{season_fee}}/
// {{installment_plan}}) into real, individually payable rows — never
// recomputes a generic schedule the way registration's create-installments
// does, since here the club already specified due dates/labels explicitly.
// Idempotent: the check-then-insert happens inside
// create_tryout_installments_if_absent, which takes a per-assignment
// advisory lock so two concurrent calls can't both insert a duplicate
// schedule.
export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: assignment } = await supabase
    .from('tryout_assignments')
    .select('id, club_id, team, offer_status')
    .eq('offer_token', token)
    .single();
  if (!assignment) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  if (assignment.offer_status !== 'Accepted') {
    return NextResponse.json({ error: 'This offer has not been accepted yet.' }, { status: 400 });
  }

  let teamAgeGroup: string | null = null;
  let teamSeasonFeeOverride: string | null = null;
  let teamDepositOverride: string | null = null;
  if (assignment.team) {
    const { data: team } = await supabase
      .from('tryout_teams')
      .select('age_group, season_fee, deposit_amount')
      .eq('club_id', assignment.club_id)
      .eq('name', assignment.team)
      .single();
    teamAgeGroup          = team?.age_group      ?? null;
    teamSeasonFeeOverride = team?.season_fee     ?? null;
    teamDepositOverride   = team?.deposit_amount ?? null;
  }

  const { data: feePlanRows } = await supabase
    .from('tryout_fee_plans')
    .select('age_groups, season_fee, installments')
    .eq('club_id', assignment.club_id)
    .order('created_at', { ascending: true });

  const resolved = resolveFeePlan(teamAgeGroup, teamSeasonFeeOverride, teamDepositOverride, plansToMap(feePlanRows ?? []));
  if (resolved.seasonFee == null || resolved.seasonFee <= 0) {
    return NextResponse.json({ due_now: null }); // nothing configured (or free) for this age group — no payment step
  }

  const today = new Date().toISOString().slice(0, 10);
  type Row = { label: string; amount: number; due_date: string };
  const rows: Row[] = [];

  if (resolved.installments.length === 0) {
    rows.push({ label: 'Season Fee', amount: resolved.seasonFee, due_date: today });
  } else {
    for (const inst of resolved.installments as FeeInstallment[]) {
      if (inst.amount == null || inst.amount <= 0) continue;
      const dueType = normalizeDueType(inst);
      if (dueType === 'tbd') continue; // nothing to schedule until the club sets a real date
      const dueDate = dueType === 'acceptance' ? today : inst.due_date;
      if (!dueDate) continue;
      rows.push({ label: inst.label || 'Installment', amount: inst.amount, due_date: dueDate });
    }
  }

  if (rows.length === 0) return NextResponse.json({ due_now: null });

  const { data: inserted, error: insertErr } = await supabase
    .rpc('create_tryout_installments_if_absent', { p_assignment_id: assignment.id, p_rows: rows })
    .order('due_date', { ascending: true });

  if (insertErr || !inserted?.length) {
    console.error('tryout create-installments insert failed', insertErr);
    return NextResponse.json({ error: 'Could not set up payment schedule' }, { status: 500 });
  }

  const dueNow = inserted.find((i: { paid_at: string | null }) => !i.paid_at) ?? null;
  return NextResponse.json({ due_now: dueNow ? { token: dueNow.payment_token, amount: dueNow.amount } : null });
}
