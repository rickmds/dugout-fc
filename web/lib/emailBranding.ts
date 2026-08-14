// Shared branded-email shell — dark card, club logo/initials header, accent
// bar, CTA button, optional App Store CTA, footer. Previously duplicated
// near-verbatim across send-invite, registration-confirm, send-fee-reminder,
// send-fee-notification, and the stripe webhook; this is the one copy.

export function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22c55e';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22c55e';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#22c55e';
  if ((r < 10 && g < 10 && b < 10) || (r > 245 && g > 245 && b > 245)) return '#22c55e';
  return hex;
}

export function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#000000' : '#ffffff';
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const APP_STORE_URL = 'https://apps.apple.com/us/app/pulse-fc/id6797330659';

export function logoBlockHtml({ logoUrl, clubName, accent, btnText }: {
  logoUrl: string | null; clubName: string; accent: string; btnText: string;
}): string {
  const initials = clubName.split(' ').slice(0, 2).map(w => (w[0] ?? '').toUpperCase()).join('');
  return logoUrl
    ? `<img src="${esc(logoUrl)}" width="56" height="56" alt="${esc(clubName)}"
         style="display:inline-block;border-radius:14px;border:2px solid rgba(255,255,255,0.06);" />`
    : `<div style="display:inline-block;width:56px;height:56px;line-height:56px;text-align:center;
                   border-radius:14px;background:${accent};vertical-align:middle;">
         <span style="font-size:20px;font-weight:900;color:${btnText};">${esc(initials)}</span>
       </div>`;
}

export function brandedEmailShell({
  clubName, logoUrl, accent,
  title, kicker, heading, bodyHtml, detailPillHtml,
  ctaLabel, ctaUrl, secondaryHtml, showAppStoreCta = true,
}: {
  clubName: string;
  logoUrl: string | null;
  accent: string;
  title: string;
  kicker: string;
  heading: string;
  bodyHtml: string;
  detailPillHtml?: string;
  ctaLabel: string;
  ctaUrl: string;
  secondaryHtml?: string;
  showAppStoreCta?: boolean;
}): string {
  const btnText = contrastText(accent);
  const year = new Date().getFullYear();
  const logoBlock = logoBlockHtml({ logoUrl, clubName, accent, btnText });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#080808;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;">
    <tr>
      <td align="center" style="padding:40px 16px 64px;">
        <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

          <!-- Club identity header -->
          <tr>
            <td style="text-align:center;padding-bottom:24px;">
              ${logoBlock}
              <p style="margin:10px 0 0;font-size:13px;font-weight:700;color:#9ca3af;
                         letter-spacing:0.05em;text-transform:uppercase;">${esc(clubName)}</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #1f1f1f;border-radius:20px;
                       overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,0.6);">

              <!-- Accent bar -->
              <div style="height:4px;background:${accent};"></div>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:32px 32px 24px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;
                               text-transform:uppercase;letter-spacing:0.12em;">${esc(kicker)}</p>
                    <h1 style="margin:0 0 0;font-size:26px;font-weight:800;color:#f9fafb;
                                line-height:1.2;letter-spacing:-0.5px;">
                      ${heading}
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 32px;">
                    <div style="height:1px;background:#1e1e1e;"></div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px 32px 20px;">
                    ${bodyHtml}
                  </td>
                </tr>

                ${detailPillHtml ? `
                <tr>
                  <td style="padding:0 32px 24px;">
                    ${detailPillHtml}
                  </td>
                </tr>` : ''}

                <!-- Primary CTA -->
                <tr>
                  <td style="padding:0 32px 16px;text-align:center;">
                    <a href="${esc(ctaUrl)}"
                       style="display:inline-block;background:${accent};color:${btnText};
                              text-decoration:none;font-size:16px;font-weight:800;
                              padding:16px 48px;border-radius:12px;letter-spacing:-0.1px;line-height:1;">
                      ${esc(ctaLabel)}
                    </a>
                  </td>
                </tr>

                ${secondaryHtml ?? ''}

                ${showAppStoreCta ? `
                <tr>
                  <td style="padding:4px 32px 20px;">
                    <div style="height:1px;background:#1a1a1a;"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px;text-align:center;">
                    <p style="margin:0 0 12px;font-size:12px;color:#6b7280;
                               text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Already have the app?</p>
                    <a href="${APP_STORE_URL}"
                       style="display:inline-block;background:#1a1a1a;color:#d1d5db;
                              border:1px solid #2a2a2a;text-decoration:none;
                              font-size:14px;font-weight:700;padding:12px 28px;
                              border-radius:10px;line-height:1;">
                      Download on the App Store
                    </a>
                  </td>
                </tr>` : ''}

              </table>

              <!-- Footer -->
              <div style="border-top:1px solid #181818;padding:16px 32px;background:#0d0d0d;">
                <p style="margin:0;font-size:12px;color:#374151;line-height:1.7;">
                  ${esc(clubName)} uses
                  <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a>
                  for club management.
                  &nbsp;&middot;&nbsp;
                  If you weren't expecting this email, you can safely ignore it.
                  &nbsp;&middot;&nbsp;
                  &copy; ${year} ${esc(clubName)}
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
