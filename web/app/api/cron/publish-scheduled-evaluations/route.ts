import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Publishes any evaluation an admin scheduled for release (via "Schedule…"
// on the batch review page) once its scheduled_publish_at arrives. Runs
// hourly — no need for finer granularity than that for a report release.
//
// Can't reuse web/lib/evaluationRelease.ts's notifyEvaluationsPublished —
// it goes through sendProfilesEmail, which reads the signed-in browser
// user's session and hits a relative /api/profile-emails URL, neither of
// which exist in a cron request. Resolves emails the same way that route
// does (auth.admin.listUsers(), same as web/app/api/cron/cert-expiry's own
// pattern) and calls the send-team-email edge function directly instead.
async function resolveEmails(sb: ReturnType<typeof supabaseAdmin>, profileIds: string[]): Promise<string[]> {
  const idSet = new Set(profileIds);
  const emails: string[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data: { users } } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of users ?? []) {
      if (idSet.has(u.id) && u.email) emails.push(u.email);
    }
    hasMore = (users?.length ?? 0) === 1000;
    page++;
  }
  return emails;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: due } = await sb
    .from('player_evaluations')
    .select('id, player_id, batch_id, period_label')
    .eq('status', 'approved')
    .is('published_at', null)
    .not('scheduled_publish_at', 'is', null)
    .lte('scheduled_publish_at', now);

  if (!due?.length) return NextResponse.json({ published: 0 });

  // Group by batch so one email covers everyone released from the same
  // team/period at once, same as a manual bulk release would.
  const byBatch = new Map<string, typeof due>();
  for (const row of due) {
    const list = byBatch.get(row.batch_id) ?? [];
    list.push(row);
    byBatch.set(row.batch_id, list);
  }

  let published = 0;

  for (const [batchId, rows] of byBatch) {
    const ids = rows.map(r => r.id);
    const { error } = await sb.from('player_evaluations')
      .update({ status: 'published', published_at: now, scheduled_publish_at: null })
      .in('id', ids);
    if (error) continue;
    published += ids.length;

    const { data: batch } = await sb.from('evaluation_batches')
      .select('teams(name), clubs(name, logo_url, primary_color)')
      .eq('id', batchId)
      .single<{ teams: { name: string } | null; clubs: { name: string | null; logo_url: string | null; primary_color: string | null } | null }>();

    const playerIds = rows.map(r => r.player_id).filter(Boolean);
    const { data: players } = await sb.from('players').select('profile_id').in('id', playerIds);
    const profileIds = (players ?? []).map(p => p.profile_id).filter(Boolean) as string[];
    if (!profileIds.length) continue;

    const body = `Your ${rows[0].period_label} report from your coach is now available.`;

    await sb.functions.invoke('send-push', {
      body: { profile_ids: profileIds, title: '📊 Your evaluation is ready', body, data: { type: 'evaluation_published' } },
    }).catch(() => {});

    try {
      const emails = await resolveEmails(sb, profileIds);
      if (emails.length) {
        await sb.functions.invoke('send-team-email', {
          body: {
            to: emails.map(email => ({ email, name: '' })), cc: [], attachments: [],
            subject: '📊 Your evaluation is ready', body, reply_to: null,
            from_name: batch?.clubs?.name ?? 'Coach', team_name: batch?.teams?.name ?? '',
            club_logo_url: batch?.clubs?.logo_url ?? null, club_name: batch?.clubs?.name ?? null,
            primary_color: batch?.clubs?.primary_color ?? null,
          },
        });
      }
    } catch (e) {
      console.error('publish-scheduled-evaluations: email failed', e);
    }
  }

  return NextResponse.json({ published, batches: byBatch.size });
}
