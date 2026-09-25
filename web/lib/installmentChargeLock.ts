import { supabaseAdmin } from '@/lib/supabase';

type InstallmentTable = 'registration_installments' | 'tryout_installments';

const STALE_AFTER_MS = 5 * 60 * 1000;

// Stress-test finding #4 (High): the on-session create-payment-intent route
// and the off-session cron auto-charge used different Stripe idempotency-key
// prefixes (pi_reg_ vs pi_reg_auto_, pi_tryout_ vs pi_tryout_auto_) for the
// SAME installment — Stripe's own idempotency can't dedupe across two
// different keys, so nothing stopped both paths from creating a real charge
// for the same installment if they happened to run at the same time (e.g. a
// family paying manually right as the daily reminder cron fires). This is a
// plain CAS via ordinary row locking, same idiom as the paid_at IS NULL
// claim used elsewhere: only one concurrent UPDATE can win the row lock, the
// loser's WHERE clause re-evaluates against the winner's just-committed
// charge_lock_at and no longer matches. Self-heals after 5 minutes in case a
// caller crashes before releasing.
export async function claimInstallmentForCharge(
  supabase: ReturnType<typeof supabaseAdmin>,
  table: InstallmentTable,
  id: string,
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data } = await supabase
    .from(table)
    .update({ charge_lock_at: new Date().toISOString() })
    .eq('id', id)
    .is('paid_at', null)
    .or(`charge_lock_at.is.null,charge_lock_at.lt.${staleBefore}`)
    .select('id');
  return !!data?.length;
}

export async function releaseInstallmentChargeLock(
  supabase: ReturnType<typeof supabaseAdmin>,
  table: InstallmentTable,
  id: string,
): Promise<void> {
  await supabase.from(table).update({ charge_lock_at: null }).eq('id', id);
}
