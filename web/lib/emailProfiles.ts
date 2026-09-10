import { supabase } from '@/lib/supabase';

// Web sibling to sendTeamEmail (lib/emailTeam.ts) for flows that need to
// email a specific handful of people by profile id — e.g. the players/
// guardians covered by one evaluation batch — rather than a team's full
// parent list. Resolves recipients via /api/profile-emails (service role,
// club-scoped) then makes one send-team-email call.
export async function sendProfilesEmail(opts: {
  profileIds: string[];
  subject: string;
  body: string;
  fromName: string;
  teamName: string;
  clubName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}): Promise<void> {
  try {
    if (!opts.profileIds.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';

    const res = await fetch('/api/profile-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ profile_ids: opts.profileIds }),
    });
    const json = await res.json().catch(() => null) as { recipients?: { email: string }[] } | null;
    const to = (json?.recipients ?? []).map((r) => ({ email: r.email, name: '' }));
    if (!to.length) return;

    await supabase.functions.invoke('send-team-email', {
      body: {
        to, cc: [], subject: opts.subject, body: opts.body, reply_to: null,
        from_name: opts.fromName, team_name: opts.teamName, attachments: [],
        club_logo_url: opts.logoUrl, club_name: opts.clubName, primary_color: opts.primaryColor,
      },
    });
  } catch { /* best-effort — never block the publish action */ }
}
