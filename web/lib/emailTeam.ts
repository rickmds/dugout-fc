import { supabase } from '@/lib/supabase';

type Recipient = { email: string; name: string };

// Shared by every event-notification flow that needs to email a team (or a
// set of linked teams) once — resolves recipients via /api/team/parent-emails
// (more complete than querying `invites` directly: it also covers parents
// added via team_members with no invite row), dedupes by lowercased email
// ACROSS all team ids in one pass, then makes exactly one send-team-email
// call. Calling this once per team in a propagate-to-linked-teams scenario
// would email a family with kids on two linked teams twice for the same
// event — always pass every relevant team id in one call instead of looping.
export async function sendTeamEmail(opts: {
  teamIds: string[];
  subject: string;
  body: string;
  fromName: string;
  teamName: string;
  clubName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';

    const seen = new Set<string>();
    const to: Recipient[] = [];
    for (const teamId of opts.teamIds) {
      const res = await fetch('/api/team/parent-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ team_id: teamId }),
      });
      const json = await res.json().catch(() => null) as { recipients?: { player_name: string; emails: string[] }[] } | null;
      for (const r of json?.recipients ?? []) {
        for (const email of r.emails) {
          const key = email.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          to.push({ email, name: r.player_name });
        }
      }
    }
    if (!to.length) return;

    await supabase.functions.invoke('send-team-email', {
      body: {
        to, cc: [], subject: opts.subject, body: opts.body, reply_to: null,
        from_name: opts.fromName, team_name: opts.teamName, attachments: [],
        club_logo_url: opts.logoUrl, club_name: opts.clubName, primary_color: opts.primaryColor,
      },
    });
  } catch { /* best-effort — never block the cancel/restore action */ }
}
