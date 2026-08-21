import { Webhook } from 'standardwebhooks';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveAccent, brandedEmailShell, esc } from '@/lib/emailBranding';

// Supabase's built-in auth emails (signup confirmation, password recovery,
// email change) have no idea which club a user belongs to — the template
// engine only sees a handful of built-in variables, not this app's own
// club/branding data. This "Send Email" auth hook intercepts every one of
// those emails before Supabase sends its own default, and sends a
// club-branded one via the same Resend + emailBranding.ts shell already
// used for coach invites. Enabling the hook (Supabase dashboard →
// Authentication → Hooks) makes Supabase stop sending its own email for
// *every* action type, so this must handle all of them, not just recovery.
//
// Payload is verified via the Standard Webhooks scheme Supabase signs
// these with — SUPABASE_AUTH_HOOK_SECRET is the secret shown when the hook
// is created in the dashboard, not something generated here.

const resend = new Resend(process.env.RESEND_API_KEY);

type EmailActionType =
  | 'signup' | 'recovery' | 'invite' | 'magiclink'
  | 'email_change_current' | 'email_change_new' | 'email_change'
  | 'reauthentication';

type HookPayload = {
  user: { id: string; email: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: EmailActionType;
    site_url: string;
    token_hash_new?: string;
    token_new?: string;
  };
};

type ClubBranding = { name: string; logo_url: string | null; primary_color: string | null };

function normalizeClubEmbed(c: ClubBranding | ClubBranding[] | null | undefined): ClubBranding | null {
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

// GoTrue requires application/json on every response from the hook — a bare
// Response(JSON.stringify(...)) defaults to text/plain and is rejected with
// "hook_payload_invalid_content_type", even on a 200.
function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!secret) {
    console.error('SUPABASE_AUTH_HOOK_SECRET not set');
    return jsonResponse({ error: 'Hook not configured' }, 500);
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let event: HookPayload;
  try {
    // Supabase's dashboard-generated secret is "v1,whsec_<base64>", but the
    // standardwebhooks lib only strips a bare "whsec_" prefix — leaving the
    // "v1," on breaks base64 decoding, which GoTrue then reports as the
    // unrelated-sounding "Hook requires authorization token".
    const wh = new Webhook(secret.replace(/^v1,whsec_/, ''));
    event = wh.verify(payload, headers) as HookPayload;
  } catch {
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  const { user, email_data } = event;
  const { token_hash, redirect_to, email_action_type } = email_data;

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('profiles')
    .select('club_id, clubs(name, logo_url, primary_color)')
    .eq('id', user.id)
    .maybeSingle();
  const club = normalizeClubEmbed(profile?.clubs as ClubBranding | ClubBranding[] | null);

  const clubName = club?.name ?? 'Pulse FC';
  const logoUrl = club?.logo_url ?? null;
  const accent = resolveAccent(club?.primary_color);

  // Reconstructs the same link Supabase's own {{ .ConfirmationURL }} would
  // have produced — used for the action types where a "prefetch consumes
  // the token" problem hasn't come up, so the security model here stays
  // exactly as it was, just wrapped in club branding.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const legacyVerifyUrl =
    `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to)}`;

  let subject: string;
  let html: string;

  if (email_action_type === 'recovery') {
    // Redeems only on a real tap on the reset-password page — see
    // web/app/reset-password/page.tsx. Built off redirect_to (the exact
    // value login.tsx passes to resetPasswordForEmail), not site_url —
    // site_url just mirrors the dashboard's Auth "Site URL" setting, which
    // is currently misconfigured to the project's own API URL.
    const recoveryUrl = new URL(redirect_to);
    recoveryUrl.searchParams.set('token_hash', token_hash);
    recoveryUrl.searchParams.set('type', 'recovery');
    const ctaUrl = recoveryUrl.toString();
    subject = `Reset your password — ${clubName}`;
    html = brandedEmailShell({
      clubName, logoUrl, accent,
      title: subject,
      kicker: 'Account security',
      heading: 'Reset your password',
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.75;">
          We received a request to reset the password for your <strong style="color:#f9fafb;">${esc(clubName)}</strong> account on Pulse FC. Click below to choose a new one.
        </p>
        <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">
          This link expires in <strong style="color:#f9fafb;">1 hour</strong>. If you didn't request this, you can safely ignore this email — your password won't change.
        </p>`,
      ctaLabel: 'Reset password →',
      ctaUrl,
    });
  } else if (email_action_type === 'signup') {
    subject = `Confirm your email — ${clubName}`;
    html = brandedEmailShell({
      clubName, logoUrl, accent,
      title: subject,
      kicker: 'Welcome',
      heading: `Confirm your email`,
      bodyHtml: `
        <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">
          Click below to confirm your email and finish setting up your <strong style="color:#f9fafb;">${esc(clubName)}</strong> account on Pulse FC.
        </p>`,
      ctaLabel: 'Confirm email →',
      ctaUrl: legacyVerifyUrl,
    });
  } else if (
    email_action_type === 'email_change' ||
    email_action_type === 'email_change_current' ||
    email_action_type === 'email_change_new'
  ) {
    subject = `Confirm your new email — ${clubName}`;
    html = brandedEmailShell({
      clubName, logoUrl, accent,
      title: subject,
      kicker: 'Account security',
      heading: 'Confirm your new email address',
      bodyHtml: `
        <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">
          Click below to confirm this email change on your <strong style="color:#f9fafb;">${esc(clubName)}</strong> account. If you didn't request this, you can safely ignore this email.
        </p>`,
      ctaLabel: 'Confirm email →',
      ctaUrl: legacyVerifyUrl,
    });
  } else {
    // magiclink / invite / reauthentication — not currently used by this
    // app's own flows (invites go through the app's own Resend emails
    // already), but handled so the hook never silently drops an email
    // Supabase itself decided to send.
    subject = `Sign in — ${clubName}`;
    html = brandedEmailShell({
      clubName, logoUrl, accent,
      title: subject,
      kicker: 'Account security',
      heading: 'Confirm this request',
      bodyHtml: `
        <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">
          Click below to continue on your <strong style="color:#f9fafb;">${esc(clubName)}</strong> account.
        </p>`,
      ctaLabel: 'Continue →',
      ctaUrl: legacyVerifyUrl,
    });
  }

  const { error: sendErr } = await resend.emails.send({
    from: `${clubName} <support@pulse-fc.app>`,
    to: user.email,
    subject,
    html,
  });

  if (sendErr) {
    console.error('auth-email-hook send failed', sendErr);
    return jsonResponse({ error: 'Failed to send email' }, 500);
  }

  return jsonResponse({}, 200);
}
