import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Notifications had no expiry — everyone's list only ever grew. read_at is
// set by a DB trigger (supabase/migrations/20260825000029_notification_read_at_expiry.sql)
// the moment a notification is marked read; this deletes anything read
// more than 30 days ago. Unread notifications are never touched here —
// they stay until the user reads or manually clears them.
const EXPIRY_DAYS = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const cutoff = new Date(Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('read', true)
    .lt('read_at', cutoff);

  if (error) {
    console.error('cleanup-notifications: delete failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0 });
}
