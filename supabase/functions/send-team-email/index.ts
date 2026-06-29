import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Recipient {
  email: string;
  name: string;
}

interface Attachment {
  filename: string;
  content: string;  // base64
  type: string;     // MIME type
  disposition: string;
}

interface Payload {
  to: Recipient[];
  cc: Recipient[];
  subject: string;
  body: string;
  reply_to: string | null;
  from_name: string;
  team_name: string;
  attachments: Attachment[];
  // Club branding
  club_logo_url?: string | null;
  club_name?: string | null;
  primary_color?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { to, cc, subject, body, reply_to, from_name, team_name, attachments, club_logo_url, club_name, primary_color } = payload;

  if (!to?.length || !subject || !body) {
    return new Response(JSON.stringify({ error: 'to, subject, and body are required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const fromEmail   = (payload as any).from_email ?? 'noreply@dugoutfc.app';
  const fromAddress = from_name && team_name
    ? `${from_name} · ${team_name} <${fromEmail}>`
    : `Dugout FC <${fromEmail}>`;

  const toAddresses  = to.map((r) => r.email);
  const ccAddresses  = cc?.map((r) => r.email) ?? [];

  const html = buildHtml({ body, from_name, team_name, subject, club_logo_url, club_name, primary_color });

  const resendBody: Record<string, unknown> = {
    from:    fromAddress,
    to:      toAddresses,
    subject,
    html,
    text:    body,
  };

  if (ccAddresses.length > 0) resendBody.cc = ccAddresses;
  if (reply_to)               resendBody.reply_to = reply_to;

  if (attachments?.length > 0) {
    resendBody.attachments = attachments.map((a) => ({
      filename:     a.filename,
      content:      a.content,
      content_type: a.type,
    }));
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(resendBody),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const data = await res.json();
  return new Response(JSON.stringify({ id: data.id }), {
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
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 145 ? '#000000' : '#ffffff';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── HTML template ────────────────────────────────────────────────────────────

function buildHtml({ body, from_name, team_name, subject, club_logo_url, club_name, primary_color }: {
  body: string;
  from_name: string;
  team_name: string;
  subject: string;
  club_logo_url?: string | null;
  club_name?: string | null;
  primary_color?: string | null;
}): string {

  const accent      = resolveAccent(primary_color);
  const btnTextCol  = contrastText(accent);
  const displayClub = club_name || 'Dugout FC';
  const year        = new Date().getFullYear();

  // ── Extract invite link so we can render it as a CTA button ─────────────────
  const inviteMatch = body.match(/https:\/\/dugoutfc\.app\/join\?token=([A-Za-z0-9_-]+)/);
  const inviteLink  = inviteMatch?.[0] ?? null;
  const inviteToken = inviteMatch?.[1] ?? null;

  // Strip the raw link + surrounding lines from body text when showing a button
  let cleanBody = body;
  if (inviteLink) {
    cleanBody = cleanBody
      .replace(/Accept your invite:\s*\n[^\n]*/g, '')
      .replace(/Or enter your invite code:[^\n]*/g, '')
      .replace(/Invite code:[^\n]*/g, '')
      .replace(inviteLink, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ── Render body as proper paragraphs ────────────────────────────────────────
  const pStyle = 'margin:0 0 18px;font-size:15px;color:#d1d5db;line-height:1.75;';
  const sigStyle = 'margin:0;font-size:14px;color:#9ca3af;line-height:1.6;font-style:italic;';

  // Split off trailing "— Name" signature line if present
  const sigMatch = cleanBody.match(/\n\n—\s+.+$/s);
  const sigLine  = sigMatch ? sigMatch[0].trim() : null;
  const mainBody = sigLine ? cleanBody.slice(0, cleanBody.lastIndexOf(sigMatch![0])).trim() : cleanBody;

  const bodyHtml = mainBody
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p style="${pStyle}">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const signatureHtml = sigLine
    ? `<p style="${sigStyle}">${escapeHtml(sigLine)}</p>`
    : '';

  // ── CTA button for invite emails ─────────────────────────────────────────────
  const ctaHtml = inviteLink ? `
      <div style="padding:8px 28px 28px;text-align:center;">
        <a href="${inviteLink}"
           style="display:inline-block;background:${accent};color:${btnTextCol};text-decoration:none;
                  font-size:16px;font-weight:800;padding:15px 40px;border-radius:12px;
                  letter-spacing:0.2px;line-height:1;">
          Accept Invite &rarr;
        </a>
        ${inviteToken
          ? `<p style="margin:18px 0 0;font-size:12px;color:#6b7280;">
               Or enter your invite code: <strong style="color:#9ca3af;font-family:monospace,monospace;letter-spacing:1px;">${escapeHtml(inviteToken)}</strong>
             </p>`
          : ''}
      </div>` : '';

  // ── Club logo / initials header ───────────────────────────────────────────────
  const initials = displayClub
    .split(' ')
    .slice(0, 2)
    .map((w: string) => (w[0] ?? '').toUpperCase())
    .join('');

  const logoHtml = club_logo_url
    ? `<div style="text-align:center;padding:36px 28px 28px;">
        <img src="${club_logo_url}" width="60" height="60" alt="${escapeHtml(displayClub)}"
          style="display:inline-block;border-radius:14px;" />
        <p style="margin:12px 0 0;font-size:19px;font-weight:800;color:#f9fafb;letter-spacing:-0.4px;">${escapeHtml(displayClub)}</p>
      </div>`
    : `<div style="text-align:center;padding:36px 28px 28px;">
        <div style="display:inline-block;width:60px;height:60px;line-height:60px;text-align:center;
                    border-radius:14px;background:${accent};vertical-align:middle;">
          <span style="font-size:22px;font-weight:900;color:${btnTextCol};">${escapeHtml(initials)}</span>
        </div>
        <p style="margin:12px 0 0;font-size:19px;font-weight:800;color:#f9fafb;letter-spacing:-0.4px;">${escapeHtml(displayClub)}</p>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px 64px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Club logo / name -->
          <tr><td>${logoHtml}</td></tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #222222;border-radius:20px;
                       overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">

              <!-- Accent bar -->
              <div style="height:3px;background:${accent};"></div>

              <!-- Team label + subject -->
              <div style="padding:28px 28px 20px;">
                <p style="margin:0 0 8px;font-size:11px;color:#6b7280;text-transform:uppercase;
                           letter-spacing:1.5px;font-weight:700;">${escapeHtml(team_name)}</p>
                <h1 style="margin:0;font-size:22px;font-weight:800;color:#f9fafb;
                            line-height:1.3;letter-spacing:-0.4px;">${escapeHtml(subject)}</h1>
              </div>

              <!-- Divider -->
              <div style="height:1px;background:#1e1e1e;margin:0 28px;"></div>

              <!-- Body -->
              <div style="padding:24px 28px ${inviteLink ? '4px' : '0'};">
                ${bodyHtml}
                ${signatureHtml}
              </div>

              <!-- CTA (invite emails only) -->
              ${ctaHtml}

              <!-- Footer -->
              <div style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
                <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                  Sent by <strong style="color:#9ca3af;">${escapeHtml(from_name)}</strong> via
                  <a href="https://dugoutfc.app" style="color:${accent};text-decoration:none;font-weight:600;">Dugout FC</a>
                  &nbsp;&middot;&nbsp;
                  <span style="color:#374151;">&copy; ${year} Dugout FC</span>
                </p>
              </div>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
