import { supabase } from '@/lib/supabase';
import { sendProfilesEmail } from '@/lib/emailProfiles';

// Shared by every path that actually publishes an evaluation to its
// family — the per-player "Release Now" button, the team-level "Release
// All Approved" bulk action, and the publish-scheduled-evaluations cron.
// Pulled out of the old approveAll() (which only ever did one thing: mark
// every submitted eval in a batch approved+published in one step) so the
// notification only ever fires for evals actually published *by this
// call*, not every eval in the batch regardless of when it was published.
export async function notifyEvaluationsPublished(opts: {
  playerIds: string[];
  periodLabel: string;
  teamName: string;
  fromName: string | null;
  clubName: string | null;
  clubLogoUrl: string | null;
  clubPrimaryColor: string | null;
}): Promise<void> {
  if (!opts.playerIds.length) return;
  const { data: players } = await supabase.from('players').select('profile_id').in('id', opts.playerIds);
  const profileIds = (players ?? []).map(p => p.profile_id).filter(Boolean) as string[];
  if (!profileIds.length) return;

  const body = `Your ${opts.periodLabel} report from your coach is now available.`;
  supabase.functions.invoke('send-push', {
    body: {
      profile_ids: profileIds,
      title: '📊 Your evaluation is ready',
      body,
      data: { type: 'evaluation_published' },
    },
  }).catch(() => {});

  await sendProfilesEmail({
    profileIds,
    subject: '📊 Your evaluation is ready',
    body,
    fromName: opts.fromName ?? opts.clubName ?? 'Coach',
    teamName: opts.teamName,
    clubName: opts.clubName,
    logoUrl: opts.clubLogoUrl,
    primaryColor: opts.clubPrimaryColor,
  });
}
