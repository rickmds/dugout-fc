import { Resend } from 'resend';
import { resolveAccent, esc, brandedEmailShell } from '@/lib/emailBranding';

const resend = new Resend(process.env.RESEND_API_KEY);

export type InviteEmailRow = {
  email: string;
  token: string;
  teams: {
    name: string;
    age_group: string | null;
    clubs: { name: string; logo_url: string | null; primary_color: string | null; slug: string } | null;
  } | null;
};

// Shared by /api/send-invite (single) and /api/invites/bulk-resend (many) so
// the email content never drifts between the two call sites.
export async function sendInviteEmail(
  invite: InviteEmailRow,
  playerName?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const team     = invite.teams;
  const club     = team?.clubs;
  const teamName = team?.name      ?? 'your team';
  const ageGroup = team?.age_group ?? null;
  const clubName = club?.name      ?? 'Your Club';
  const logoUrl  = club?.logo_url  ?? null;
  const accent   = resolveAccent(club?.primary_color ?? null);
  const clubSlug = club?.slug ?? null;
  const joinUrl  = `https://pulse-fc.app/join?token=${invite.token}${clubSlug ? `&club=${encodeURIComponent(clubSlug)}` : ''}`;

  const teamDetail = ageGroup
    ? `${esc(teamName)} &nbsp;·&nbsp; ${esc(ageGroup)}`
    : esc(teamName);

  const playerLine = playerName
    ? `<strong style="color:#f9fafb;">${esc(playerName)}</strong> has been added to the <strong style="color:#f9fafb;">${esc(teamName)}</strong> squad at ${esc(clubName)}.`
    : `You have been added to <strong style="color:#f9fafb;">${esc(teamName)}</strong> at ${esc(clubName)}.`;

  const html = brandedEmailShell({
    clubName, logoUrl, accent,
    title: `${playerName ? `${playerName} has been added to ${teamName}` : `You've been invited to join ${teamName}`} · ${clubName}`,
    kicker: 'Welcome to the squad',
    heading: playerName ? `${esc(playerName)} is on ${esc(teamName)}` : `You're on ${esc(teamName)}`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.75;">${playerLine}</p>
      <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">
        ${esc(clubName)} manages the season schedule, game day RSVPs, and team
        communications all in one place. Create your free account below — it takes
        under two minutes.
      </p>`,
    detailPillHtml: `
      <div style="display:inline-block;background:#1a1a1a;border:1px solid #2a2a2a;
                  border-radius:10px;padding:10px 16px;">
        <span style="font-size:11px;font-weight:700;color:#6b7280;
                     text-transform:uppercase;letter-spacing:0.1em;">Team &nbsp;</span>
        <span style="font-size:13px;font-weight:700;color:#e5e7eb;">${teamDetail}</span>
      </div>`,
    ctaLabel: 'Set up your account →',
    ctaUrl: joinUrl,
  });

  const subject = playerName
    ? `${playerName} has been added to ${teamName} · ${clubName}`
    : `You've been invited to join ${teamName} · ${clubName}`;

  const { error } = await resend.emails.send({
    from: `${clubName} <support@pulse-fc.app>`,
    to:   invite.email,
    subject,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    return { ok: false, error: 'Failed to send email' };
  }

  return { ok: true };
}
