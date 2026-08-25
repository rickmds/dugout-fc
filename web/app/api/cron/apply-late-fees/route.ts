import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendExpoPush } from '@/lib/expoPush';

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
      .select('id, amount_due, discount, description, player_id')
      .in('team_id', teams.map((t: { id: string }) => t.id))
      .in('status', ['outstanding', 'partial'])
      .eq('late_fee_applied', false)
      .not('due_date', 'is', null)
      .lt('due_date', graceCutoffStr);

    if (!fees?.length) continue;

    for (const fee of fees as { id: string; amount_due: number; discount: number; description: string; player_id: string }[]) {
      let penalty = 0;
      const base  = Math.max(0, fee.amount_due - (fee.discount ?? 0));

      if (club.late_fee_type === 'fixed') {
        penalty = club.late_fee_amount ?? 0;
      } else {
        penalty = Math.round((base * (club.late_fee_amount ?? 0) / 100) * 100) / 100;
      }

      if (penalty <= 0) continue;

      // Re-assert late_fee_applied=false on the write itself, not just the
      // read above — two overlapping cron runs both pass the read at line
      // 35 before either writes, so without this guard both apply the
      // penalty. With it, whichever writes second affects zero rows
      // instead of double-applying.
      const { data: claimed, error } = await supabase.from('player_fees').update({
        amount_due:       fee.amount_due + penalty,
        late_fee_applied: true,
      }).eq('id', fee.id).eq('late_fee_applied', false).select('id');

      if (error) {
        console.error('apply-late-fees: failed to apply late fee', { fee_id: fee.id, club_id: club.id, error: error.message });
        failed++;
        continue;
      }
      if (!claimed?.length) continue;

      applied++;

      // Nothing ever told the parent a late fee was applied — a family
      // mid-way through paying (a payment intent created against the old,
      // lower balance) would see the fee land in 'partial' status with an
      // unexplained remainder that's actually just this penalty, with no
      // way to tell that apart from having simply underpaid.
      const { data: guardianRows } = await supabase
        .from('player_guardians').select('profile_id').eq('player_id', fee.player_id);
      const { data: playerRow } = await supabase
        .from('players').select('profile_id').eq('id', fee.player_id).single();
      const parentProfileIds = [...new Set([
        ...(guardianRows ?? []).map((g: { profile_id: string }) => g.profile_id),
        ...(playerRow?.profile_id ? [playerRow.profile_id] : []),
      ])];

      if (parentProfileIds.length) {
        const title = '⏰ Late fee applied';
        const body  = `A $${penalty.toFixed(2)} late fee was added to "${fee.description}" for being overdue.`;
        await supabase.from('notifications').insert(
          parentProfileIds.map((profile_id) => ({
            profile_id, type: 'fee_reminder', title, body,
            data: { type: 'fee_reminder', player_fee_id: fee.id },
          }))
        );
        const { data: tokens } = await supabase
          .from('push_tokens').select('token').in('profile_id', parentProfileIds);
        if (tokens?.length) {
          await sendExpoPush(tokens.map((t: { token: string }) => ({
            to: t.token, title, body, sound: 'default',
            data: { type: 'fee_reminder', player_fee_id: fee.id },
          })));
        }
      }
    }
  }

  if (failed > 0) console.error(`apply-late-fees: ${failed} late fee update(s) failed this run`);

  return NextResponse.json({ applied, failed, clubs: clubs.length });
}
