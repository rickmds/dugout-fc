import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Eligible fees: unpaid/partial, created 7+ days ago, not reminded in the last 7 days
  const { data: fees, error } = await supabase
    .from('player_fees')
    .select('id')
    .in('status', ['pending', 'partial'])
    .lt('created_at', sevenDaysAgo)
    .or(`last_reminded_at.is.null,last_reminded_at.lt.${sevenDaysAgo}`);

  if (error) {
    console.error('fee-reminders cron: query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!fees?.length) {
    return NextResponse.json({ sent: 0 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.pulse-fc.app';
  let sent = 0;
  let failed = 0;

  // Process in batches of 5 to stay well within Vercel function timeout
  for (let i = 0; i < fees.length; i += 5) {
    const batch = fees.slice(i, i + 5);
    await Promise.allSettled(
      batch.map(async (fee) => {
        try {
          const res = await fetch(`${baseUrl}/api/send-fee-reminder`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cron-secret': process.env.CRON_SECRET!,
            },
            body: JSON.stringify({ player_fee_id: fee.id }),
          });
          if (res.ok) { sent++; } else { failed++; }
        } catch {
          failed++;
        }
      }),
    );
  }

  console.log(`fee-reminders cron: sent=${sent} failed=${failed} total=${fees.length}`);
  return NextResponse.json({ sent, failed, total: fees.length });
}
