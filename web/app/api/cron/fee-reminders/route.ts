import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Runs hourly so this can land at 8am in each club's OWN local time — see
// event-day-reminders/route.ts for the full reasoning (same pattern here).
const SEND_HOUR = 8;

function localHour(date: Date, timeZone: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date),
    10
  );
}

type FeeCandidate = { id: string; players: { teams: { clubs: { timezone: string | null } | null } | null } | null };

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Eligible fees: unpaid/partial, created 7+ days ago, not reminded in the last 7 days
  const { data: candidates, error } = await supabase
    .from('player_fees')
    .select('id, players(teams(clubs(timezone)))')
    .in('status', ['outstanding', 'partial'])
    .lt('created_at', sevenDaysAgo)
    .or(`last_reminded_at.is.null,last_reminded_at.lt.${sevenDaysAgo}`)
    .returns<FeeCandidate[]>();

  if (error) {
    console.error('fee-reminders cron: query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fees = (candidates ?? []).filter(f => {
    const clubTimeZone = f.players?.teams?.clubs?.timezone ?? 'America/New_York';
    return localHour(now, clubTimeZone) === SEND_HOUR;
  });

  if (!fees.length) {
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
