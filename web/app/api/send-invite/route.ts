import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { resolveAccent, esc, brandedEmailShell } from '@/lib/emailBranding';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { invite_id, player_name } = await req.json();

  if (!invite_id) {
    return NextResponse.json({ error: 'invite_id required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: invite, error: invErr } = await supabase
    .from('invites')
    .select('email, token, teams(id, name, age_group, club_id, clubs(name, logo_url, primary_color, slug))')
    .eq('id', invite_id)
    .single<{
      email: string; token: string;
      teams: { id: string; name: string; age_group: string | null; club_id: string; clubs: { name: string; logo_url: string | null; primary_color: string | null; slug: string } | null } | null;
    }>();

  if (invErr || !invite) {
    console.error('invite lookup failed', invErr);
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  const team = invite.teams;

  // Verify the invite belongs to the auth user's club
  if (auth.role !== 'app_admin' && team?.club_id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const club       = team?.clubs;
  const teamName   = team?.name      ?? 'your team';
  const ageGroup   = team?.age_group ?? null;
  const clubName   = club?.name      ?? 'Your Club';
  const logoUrl    = club?.logo_url  ?? null;
  const rawColor   = club?.primary_color ?? null;
  const accent     = resolveAccent(rawColor);
  const clubSlug   = club?.slug ?? null;
  const joinUrl    = `https://pulse-fc.app/join?token=${invite.token}${clubSlug ? `&club=${encodeURIComponent(clubSlug)}` : ''}`;

  const teamDetail = ageGroup
    ? `${esc(teamName)} &nbsp;·&nbsp; ${esc(ageGroup)}`
    : esc(teamName);

  const playerLine = player_name
    ? `<strong style="color:#f9fafb;">${esc(player_name)}</strong> has been added to the <strong style="color:#f9fafb;">${esc(teamName)}</strong> squad at ${esc(clubName)}.`
    : `You have been added to <strong style="color:#f9fafb;">${esc(teamName)}</strong> at ${esc(clubName)}.`;

  const html = brandedEmailShell({
    clubName, logoUrl, accent,
    title: `${player_name ? `${player_name} has been added to ${teamName}` : `You've been invited to join ${teamName}`} · ${clubName}`,
    kicker: 'Welcome to the squad',
    heading: player_name ? `${esc(player_name)} is on ${esc(teamName)}` : `You're on ${esc(teamName)}`,
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
    secondaryHtml: `
      <tr>
        <td style="padding:0 32px 8px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
            Or open the app and enter code &nbsp;
            <strong style="color:#9ca3af;font-family:'Courier New',Courier,monospace;
                           letter-spacing:1.5px;">${esc(invite.token)}</strong>
          </p>
        </td>
      </tr>`,
  });

  const subject = player_name
    ? `${player_name} has been added to ${teamName} · ${clubName}`
    : `You've been invited to join ${teamName} · ${clubName}`;

  const { error } = await resend.emails.send({
    from: `${clubName} <support@pulse-fc.app>`,
    to:   invite.email,
    subject,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    return NextResponse.json({ error: 'Failed to send email', detail: error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
