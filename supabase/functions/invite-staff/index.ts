import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Payload {
  email: string;
  full_name: string | null;
  role: 'coach' | 'org_admin';
  club_id: string;
  team_ids: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
  const APP_URL    = Deno.env.get('APP_URL') ?? 'https://pulse-fc.app';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { email, full_name, role, club_id, team_ids } = payload;

  if (!email || !role || !club_id) {
    return new Response(JSON.stringify({ error: 'email, role, and club_id are required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Fetch club branding ──────────────────────────────────────────────────
  const { data: club } = await supabase
    .from('clubs')
    .select('name, logo_url, primary_color')
    .eq('id', club_id)
    .single();

  // ── Fetch team names ─────────────────────────────────────────────────────
  let teamNames: string[] = [];
  if (team_ids?.length) {
    const { data: teams } = await supabase
      .from('teams').select('name').in('id', team_ids);
    teamNames = (teams ?? []).map((t: any) => t.name as string);
  }

  // ── Generate invite link (no Supabase default email sent) ───────────────
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: `${APP_URL}/dashboard`,
      data: { role, club_id, full_name: full_name ?? null },
    },
  });

  if (linkError || !linkData?.user) {
    return new Response(JSON.stringify({ error: linkError?.message ?? 'Failed to generate invite link' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const userId     = linkData.user.id;
  const inviteLink = (linkData.properties as any)?.action_link as string | undefined;

  // ── Pre-create profile ───────────────────────────────────────────────────
  await supabase.from('profiles').upsert(
    { id: userId, club_id, full_name: full_name ?? null, role },
    { onConflict: 'id' },
  );

  // ── Pre-assign teams ─────────────────────────────────────────────────────
  if (team_ids?.length) {
    await supabase.from('team_members').upsert(
      team_ids.map((team_id) => ({ team_id, profile_id: userId, role: 'coach' })),
      { onConflict: 'team_id,profile_id' },
    );
  }

  // ── Send branded invite email via Resend ─────────────────────────────────
  if (RESEND_KEY && inviteLink) {
    const clubName  = club?.name ?? 'Your Club';
    const roleLabel = role === 'org_admin' ? 'Club Admin' : 'Coach';
    const teamList  = teamNames.length > 0 ? teamNames.join(', ') : null;

    const html = buildInviteHtml({
      clubName,
      roleLabel,
      teamList,
      inviteLink,
      logoUrl:      club?.logo_url      ?? null,
      primaryColor: club?.primary_color ?? null,
    });

    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    `${clubName} <info@pulse-fc.app>`,
        to:      [email],
        subject: `You've been invited to join ${clubName}`,
        html,
        text: [
          `You've been invited to join ${clubName} on Pulse FC as ${roleLabel === 'Club Admin' ? 'a Club Admin' : 'a Coach'}.`,
          teamList ? `Teams: ${teamList}` : null,
          `Accept your invite (expires in 24 hours): ${inviteLink}`,
        ].filter(Boolean).join('\n\n'),
      }),
    });
  }

  return new Response(JSON.stringify({ ok: true, user_id: userId }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22c55e';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22c55e';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#22c55e';
  if ((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)) return '#22c55e';
  return hex;
}

function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum > 145 ? '#000000' : '#ffffff';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildInviteHtml({ clubName, roleLabel, teamList, inviteLink, logoUrl, primaryColor }: {
  clubName:     string;
  roleLabel:    string;
  teamList:     string | null;
  inviteLink:   string;
  logoUrl:      string | null;
  primaryColor: string | null;
}): string {
  const accent     = resolveAccent(primaryColor);
  const btnText    = contrastText(accent);
  const year       = new Date().getFullYear();
  const initials   = clubName.split(' ').slice(0, 2).map((w) => (w[0] ?? '').toUpperCase()).join('');
  const article    = roleLabel === 'Club Admin' ? 'a' : 'a';

  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" width="60" height="60" alt="${esc(clubName)}"
         style="display:inline-block;border-radius:14px;" />`
    : `<div style="display:inline-block;width:60px;height:60px;line-height:60px;text-align:center;
                   border-radius:14px;background:${accent};vertical-align:middle;">
         <span style="font-size:22px;font-weight:900;color:${btnText};">${esc(initials)}</span>
       </div>`;

  const teamsRow = teamList
    ? `<tr>
         <td style="padding:0 28px 20px;">
           <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:14px 18px;">
             <table cellpadding="0" cellspacing="0" width="100%">
               <tr>
                 <td style="width:28px;vertical-align:top;font-size:18px;line-height:1.4;">🏟️</td>
                 <td style="vertical-align:top;padding-left:10px;">
                   <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;
                              text-transform:uppercase;letter-spacing:1.2px;">Teams assigned</p>
                   <p style="margin:0;font-size:14px;color:#d1d5db;font-weight:600;">${esc(teamList)}</p>
                 </td>
               </tr>
             </table>
           </div>
         </td>
       </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>You've been invited to join ${esc(clubName)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px 64px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo + Club name -->
          <tr>
            <td style="text-align:center;padding-bottom:28px;">
              ${logoHtml}
              <p style="margin:12px 0 0;font-size:18px;font-weight:800;color:#f9fafb;
                         letter-spacing:-0.3px;">${esc(clubName)}</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #222222;border-radius:20px;
                       overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">

              <!-- Accent bar -->
              <div style="height:3px;background:${accent};"></div>

              <!-- Headline -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:32px 28px 24px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;
                               text-transform:uppercase;letter-spacing:1.5px;">You're invited</p>
                    <h1 style="margin:0;font-size:24px;font-weight:800;color:#f9fafb;line-height:1.25;
                                letter-spacing:-0.5px;">
                      Join ${esc(clubName)}<br>as ${article} ${esc(roleLabel)}
                    </h1>
                  </td>
                </tr>

                <!-- Divider -->
                <tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>

                <!-- Body text -->
                <tr>
                  <td style="padding:24px 28px 20px;">
                    <p style="margin:0 0 14px;font-size:15px;color:#d1d5db;line-height:1.7;">
                      You've been invited to manage <strong style="color:#f9fafb;">${esc(clubName)}</strong>
                      on <strong style="color:${accent};">Pulse FC</strong> — the all-in-one platform
                      for soccer club management.
                    </p>
                    <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.7;">
                      Click the button below to accept your invite and set up your account.
                      This link expires in <strong style="color:#f9fafb;">24 hours</strong>.
                    </p>
                  </td>
                </tr>

                <!-- Team assignment row (if any) -->
                ${teamsRow}

                <!-- CTA button -->
                <tr>
                  <td style="padding:4px 28px 32px;text-align:center;">
                    <a href="${esc(inviteLink)}"
                       style="display:inline-block;background:${accent};color:${btnText};
                              text-decoration:none;font-size:16px;font-weight:800;
                              padding:16px 48px;border-radius:12px;letter-spacing:0.2px;line-height:1;">
                      Accept Invite &rarr;
                    </a>
                    <p style="margin:16px 0 0;font-size:12px;color:#4b5563;">
                      Button not working?
                      <a href="${esc(inviteLink)}" style="color:${accent};text-decoration:underline;word-break:break-all;">
                        Copy this link
                      </a>
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
                    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                      ${esc(clubName)} uses
                      <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a>
                      for club management.
                      &nbsp;&middot;&nbsp;
                      If you weren't expecting this, you can safely ignore it.
                      &nbsp;&middot;&nbsp; &copy; ${year} ${esc(clubName)}
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
