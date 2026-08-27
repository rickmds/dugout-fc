import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendExpoPush } from '@/lib/expoPush';

// Runs hourly so this can land at 8am in each club's OWN local time — see
// event-day-reminders/route.ts for the full reasoning (same pattern here).
const SEND_HOUR = 8;

function localHour(date: Date, timeZone: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date),
    10
  );
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();

  const { data: allClubs } = await supabase
    .from('clubs')
    .select('id, late_fee_type, late_fee_amount, late_fee_grace_days, timezone')
    .eq('late_fee_enabled', true);

  const clubs = (allClubs ?? []).filter(c => localHour(now, c.timezone ?? 'America/New_York') === SEND_HOUR);

  if (!clubs?.length) return NextResponse.json({ applied: 0 });

  let applied = 0;
  let failed  = 0;
  // Collected across every club so the notification lookup/send below can
  // run as a handful of batched round trips instead of 3-5 per fee — with
  // clubs each running full fee schedules, that per-row shape scaled
  // directly with club count and got proportionally slower every month.
  // Only the CAS update itself (the correctness-critical part, guarding
  // against overlapping cron runs double-applying the same penalty) stays
  // per-row.
  const appliedFees: { id: string; description: string; player_id: string; penalty: number }[] = [];

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
      appliedFees.push({ id: fee.id, description: fee.description, player_id: fee.player_id, penalty });
    }
  }

  // Nothing ever told the parent a late fee was applied — a family mid-way
  // through paying (a payment intent created against the old, lower
  // balance) would see the fee land in 'partial' status with an
  // unexplained remainder that's actually just this penalty, with no way
  // to tell that apart from having simply underpaid.
  if (appliedFees.length) {
    const playerIds = [...new Set(appliedFees.map(f => f.player_id))];
    const [{ data: guardianRows }, { data: playerRows }] = await Promise.all([
      supabase.from('player_guardians').select('player_id, profile_id').in('player_id', playerIds),
      supabase.from('players').select('id, profile_id').in('id', playerIds),
    ]);

    const parentsByPlayer = new Map<string, Set<string>>();
    for (const g of guardianRows ?? []) {
      if (!parentsByPlayer.has(g.player_id)) parentsByPlayer.set(g.player_id, new Set());
      parentsByPlayer.get(g.player_id)!.add(g.profile_id);
    }
    for (const p of playerRows ?? []) {
      if (!p.profile_id) continue;
      if (!parentsByPlayer.has(p.id)) parentsByPlayer.set(p.id, new Set());
      parentsByPlayer.get(p.id)!.add(p.profile_id);
    }

    const notificationRows: { profile_id: string; type: string; title: string; body: string; data: Record<string, unknown> }[] = [];
    for (const fee of appliedFees) {
      const title = '⏰ Late fee applied';
      const body  = `A $${fee.penalty.toFixed(2)} late fee was added to "${fee.description}" for being overdue.`;
      for (const profile_id of parentsByPlayer.get(fee.player_id) ?? []) {
        notificationRows.push({ profile_id, type: 'fee_reminder', title, body, data: { type: 'fee_reminder', player_fee_id: fee.id } });
      }
    }

    if (notificationRows.length) {
      await supabase.from('notifications').insert(notificationRows);

      const allProfileIds = [...new Set(notificationRows.map(n => n.profile_id))];
      const { data: tokenRows } = await supabase.from('push_tokens').select('token, profile_id').in('profile_id', allProfileIds);
      const tokensByProfile = new Map<string, string[]>();
      for (const t of tokenRows ?? []) {
        if (!tokensByProfile.has(t.profile_id)) tokensByProfile.set(t.profile_id, []);
        tokensByProfile.get(t.profile_id)!.push(t.token);
      }

      const pushMessages = notificationRows.flatMap(n =>
        (tokensByProfile.get(n.profile_id) ?? []).map(token => ({
          to: token, title: n.title, body: n.body, sound: 'default' as const, data: n.data,
        }))
      );
      if (pushMessages.length) await sendExpoPush(pushMessages);
    }
  }

  if (failed > 0) console.error(`apply-late-fees: ${failed} late fee update(s) failed this run`);

  return NextResponse.json({ applied, failed, clubs: clubs.length });
}
