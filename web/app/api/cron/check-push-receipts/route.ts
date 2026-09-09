import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

// Solo-developer alert address — send-push's own DB insert already proves a
// notification was *attempted*; this is the only place that can say
// whether Apple/Google actually delivered it. Deliberately not a push
// notification: if push delivery is the very thing that's broken, an alert
// that relies on push to reach anyone would never arrive.
const ALERT_EMAIL = 'rick@mdssoccer.com';

// Expo's own guidance: wait at least ~15 minutes after sending before a
// receipt is meaningful to check.
const MIN_AGE_MINUTES = 15;
// Expo accepts up to 1000 receipt ids per getReceipts call (separate from
// the 100-per-batch limit on sending pushes themselves).
const RECEIPT_BATCH_SIZE = 1000;
// A receipt Expo has no record of after this long (queue expired, or the
// ticket id was simply never valid) would otherwise retry forever — stop
// asking and record it as unknown instead.
const GIVE_UP_HOURS = 48;

type ExpoReceipt = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();
  const ageThreshold = new Date(now.getTime() - MIN_AGE_MINUTES * 60 * 1000).toISOString();
  const giveUpThreshold = new Date(now.getTime() - GIVE_UP_HOURS * 60 * 60 * 1000).toISOString();

  const { data: pending } = await supabase
    .from('push_receipts')
    .select('id, ticket_id, token, notification_type, title, team_id, created_at')
    .eq('status', 'pending')
    .lte('created_at', ageThreshold)
    .limit(RECEIPT_BATCH_SIZE);

  if (!pending?.length) return NextResponse.json({ checked: 0 });

  const idToRow = new Map(pending.map((r) => [r.ticket_id, r]));
  const chunks: string[][] = [];
  const ids = pending.map((r) => r.ticket_id);
  for (let i = 0; i < ids.length; i += RECEIPT_BATCH_SIZE) chunks.push(ids.slice(i, i + RECEIPT_BATCH_SIZE));

  const receipts: Record<string, ExpoReceipt> = {};
  for (const chunk of chunks) {
    try {
      const res = await fetch(RECEIPTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ids: chunk }),
      });
      const json = await res.json().catch(() => null) as { data?: Record<string, ExpoReceipt> } | null;
      Object.assign(receipts, json?.data ?? {});
    } catch (err) {
      console.error('check-push-receipts: getReceipts call failed', err);
    }
  }

  const dyingTokens: string[] = [];
  // Real problems worth an email — anything other than the routine
  // "this device is gone" case, which is expected attrition, not a bug.
  const realFailures: { title: string; notification_type: string; error_code: string; error_message: string }[] = [];
  let checkedCount = 0;
  let deviceGoneCount = 0;

  for (const row of pending) {
    const receipt = receipts[row.ticket_id];
    if (receipt) {
      checkedCount++;
      if (receipt.status === 'ok') {
        await supabase.from('push_receipts').update({ status: 'ok', checked_at: now.toISOString() }).eq('id', row.id);
      } else {
        const errorCode = receipt.details?.error ?? 'Unknown';
        await supabase.from('push_receipts').update({
          status: 'error', error_code: errorCode, error_message: receipt.message ?? null, checked_at: now.toISOString(),
        }).eq('id', row.id);
        if (errorCode === 'DeviceNotRegistered') {
          dyingTokens.push(row.token);
          deviceGoneCount++;
        } else {
          realFailures.push({ title: row.title, notification_type: row.notification_type, error_code: errorCode, error_message: receipt.message ?? '' });
        }
      }
    } else if (row.created_at <= giveUpThreshold) {
      await supabase.from('push_receipts').update({ status: 'error', error_code: 'no_receipt', checked_at: now.toISOString() }).eq('id', row.id);
    }
    // Otherwise: Expo has no answer yet — leave pending, retried next run.
  }

  if (dyingTokens.length) {
    await supabase.from('push_tokens').delete().in('token', dyingTokens);
  }

  // Two alert triggers: any error type that isn't routine device attrition,
  // or — even if every single failure IS "just" DeviceNotRegistered — a
  // failure rate high enough to look like a mass event (a credential
  // dying looks exactly like a wave of DeviceNotRegistered, not its own
  // distinct error) rather than the normal trickle of people who deleted
  // the app.
  const totalFailures = realFailures.length + deviceGoneCount;
  const failureRate = checkedCount > 0 ? totalFailures / checkedCount : 0;
  const suspiciousVolume = checkedCount >= 10 && failureRate >= 0.25;

  if (realFailures.length > 0 || suspiciousVolume) {
    await sendAlert({ realFailures, deviceGoneCount, checkedCount, failureRate, suspiciousVolume });
  }

  // Resolved rows are only ever useful for the window right after a send —
  // nothing reads them once checked, so this keeps the table from growing
  // forever instead of needing its own separate cleanup cron.
  const oldCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('push_receipts').delete().neq('status', 'pending').lt('checked_at', oldCutoff);

  return NextResponse.json({
    checked: checkedCount,
    ok: checkedCount - totalFailures,
    device_gone: deviceGoneCount,
    real_failures: realFailures.length,
    alerted: realFailures.length > 0 || suspiciousVolume,
  });
}

async function sendAlert(opts: {
  realFailures: { title: string; notification_type: string; error_code: string; error_message: string }[];
  deviceGoneCount: number; checkedCount: number; failureRate: number; suspiciousVolume: boolean;
}) {
  const { realFailures, deviceGoneCount, checkedCount, failureRate, suspiciousVolume } = opts;

  const errorLines = realFailures
    .slice(0, 20)
    .map((f) => `<li><b>${f.error_code}</b> — "${f.title}" (${f.notification_type}): ${f.error_message}</li>`)
    .join('');

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#0a0a0a;padding:32px;color:#f9fafb;">
  <h2 style="margin:0 0 8px;">⚠️ Push delivery issue detected</h2>
  <p style="color:#9ca3af;margin:0 0 20px;">Checked ${checkedCount} recent push receipts — ${Math.round(failureRate * 100)}% failed.</p>
  ${suspiciousVolume ? `<p style="background:#3a1a1a;border:1px solid #7f1d1d;border-radius:8px;padding:12px 16px;color:#fca5a5;">Failure rate is high enough to look like a systemic problem (a dead push credential can look exactly like a wave of "device gone" errors), not just normal attrition.</p>` : ''}
  ${realFailures.length ? `<p><b>${realFailures.length}</b> non-routine error(s):</p><ul style="color:#d1d5db;">${errorLines}</ul>` : ''}
  <p style="color:#6b7280;font-size:13px;">${deviceGoneCount} additional "device gone" (routine, already pruned).</p>
</body></html>`;

  const text = `Push delivery issue detected.\nChecked ${checkedCount} receipts — ${Math.round(failureRate * 100)}% failed.\n` +
    (realFailures.length ? `\nNon-routine errors:\n${realFailures.map((f) => `- ${f.error_code}: ${f.title} (${f.notification_type}) — ${f.error_message}`).join('\n')}\n` : '') +
    `\n${deviceGoneCount} additional device-gone (routine).`;

  try {
    await resend.emails.send({
      from: 'Pulse FC Alerts <support@pulse-fc.app>',
      to: ALERT_EMAIL,
      subject: `⚠️ Push delivery issue — ${realFailures.length} error(s), ${Math.round(failureRate * 100)}% failure rate`,
      html,
      text,
    });
  } catch (err) {
    console.error('check-push-receipts: alert email failed to send', err);
  }
}
