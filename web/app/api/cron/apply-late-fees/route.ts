import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();

  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, late_fee_type, late_fee_amount, late_fee_grace_days')
    .eq('late_fee_enabled', true);

  if (!clubs?.length) return NextResponse.json({ applied: 0 });

  let applied = 0;
  let failed  = 0;

  for (const club of clubs as { id: string; late_fee_type: string; late_fee_amount: number; late_fee_grace_days: number }[]) {
    const { data: teams } = await supabase.from('teams').select('id').eq('club_id', club.id);
    if (!teams?.length) continue;

    const graceCutoff = new Date();
    graceCutoff.setDate(graceCutoff.getDate() - (club.late_fee_grace_days ?? 7));
    const graceCutoffStr = graceCutoff.toISOString().slice(0, 10);

    const { data: fees } = await supabase
      .from('player_fees')
      .select('id, amount_due, discount')
      .in('team_id', teams.map((t: { id: string }) => t.id))
      .in('status', ['outstanding', 'partial'])
      .eq('late_fee_applied', false)
      .not('due_date', 'is', null)
      .lt('due_date', graceCutoffStr);

    if (!fees?.length) continue;

    for (const fee of fees as { id: string; amount_due: number; discount: number }[]) {
      let penalty = 0;
      const base  = Math.max(0, fee.amount_due - (fee.discount ?? 0));

      if (club.late_fee_type === 'fixed') {
        penalty = club.late_fee_amount ?? 0;
      } else {
        penalty = Math.round((base * (club.late_fee_amount ?? 0) / 100) * 100) / 100;
      }

      if (penalty <= 0) continue;

      const { error } = await supabase.from('player_fees').update({
        amount_due:       fee.amount_due + penalty,
        late_fee_applied: true,
      }).eq('id', fee.id);

      if (error) {
        console.error('apply-late-fees: failed to apply late fee', { fee_id: fee.id, club_id: club.id, error: error.message });
        failed++;
        continue;
      }

      applied++;
    }
  }

  if (failed > 0) console.error(`apply-late-fees: ${failed} late fee update(s) failed this run`);

  return NextResponse.json({ applied, failed, clubs: clubs.length });
}
