import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveAccent, esc, brandedEmailShell } from '@/lib/emailBranding';

const resend = new Resend(process.env.RESEND_API_KEY);

// A coach tied to exactly one team goes through the same invite-first flow
// as parents (an `invites` row, accepted via /join) — that's what makes
// "pending vs joined" status possible at all. `invites.team_id` is NOT NULL
// in the schema, so a club-wide coach (no team, or assigned to several)
// can't get an invite row without a migration — those fall back to the
// original instant-account-creation mechanism instead, just with the same
// branded email everyone else gets now.

// ── Invite-first: creates/reuses an `invites` row, sends a /join link.
// Calling this again for the same email+team reuses the existing pending
// invite instead of creating a duplicate — that's also what powers "resend".
export async function inviteFirst({ db, club_id, clubName, logoUrl, slug, accent, email, full_name, teamId, createdBy }: {
  db: ReturnType<typeof supabaseAdmin>; club_id: string; clubName: string; logoUrl: string | null; slug: string | null;
  accent: string; email: string; full_name: string; teamId: string; createdBy: string;
}) {
  const { data: team } = await db.from('teams').select('name, club_id').eq('id', teamId).single();
  if (!team || team.club_id !== club_id) throw new Error('Team not found in this club');

  const { data: existing } = await db
    .from('invites')
    .select('id, token')
    .eq('email', email)
    .eq('team_id', teamId)
    .eq('role', 'coach')
    .is('accepted_at', null)
    .maybeSingle();

  let token: string;
  if (existing) {
    token = existing.token;
  } else {
    const { data: inserted, error: insErr } = await db
      .from('invites')
      .insert({ team_id: teamId, email, role: 'coach', created_by: createdBy })
      .select('token')
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? 'Failed to create invite');
    token = inserted.token;
  }

  const joinUrl = `https://pulse-fc.app/join?token=${token}${slug ? `&club=${encodeURIComponent(slug)}` : ''}`;

  const html = brandedEmailShell({
    clubName, logoUrl, accent,
    title: `You've been invited to coach at ${clubName}`,
    kicker: "You've been added as a coach",
    heading: `Welcome to ${esc(clubName)}, ${esc(full_name.split(' ')[0] || full_name)} 👋`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.75;">
        You've been set up as a coach for <strong style="color:#f9fafb;">${esc(team.name)}</strong> at
        <strong style="color:#f9fafb;">${esc(clubName)}</strong> on Pulse FC.
      </p>
      <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">
        Click below to create your account — your team's roster, schedule, and chat are already set up and waiting.
      </p>`,
    detailPillHtml: `
      <div style="display:inline-block;background:#1a1a1a;border:1px solid #2a2a2a;
                  border-radius:10px;padding:10px 16px;">
        <span style="font-size:11px;font-weight:700;color:#6b7280;
                     text-transform:uppercase;letter-spacing:0.1em;">Team &nbsp;</span>
        <span style="font-size:13px;font-weight:700;color:#e5e7eb;">${esc(team.name)}</span>
      </div>`,
    ctaLabel: 'Set up my account →',
    ctaUrl: joinUrl,
  });

  const { error: sendErr } = await resend.emails.send({
    from: `${clubName} <support@pulse-fc.app>`,
    to: email,
    subject: `You've been added as a coach at ${clubName}`,
    html,
  });
  if (sendErr) throw new Error('Failed to send email');
}

// ── Instant-create: club-wide coaches (no single team), multi-team
// coaches, and org_admins — an `invites` row can't represent these without
// a schema change, so the account is created immediately and the email
// carries a password-setup (recovery) link straight to the dashboard.
export async function instantCreate({ db, club_id, clubName, logoUrl, accent, email, full_name, teamIds, role }: {
  db: ReturnType<typeof supabaseAdmin>; club_id: string; clubName: string; logoUrl: string | null; accent: string;
  email: string; full_name: string; teamIds: string[]; role: 'coach' | 'org_admin';
}) {
  let userId: string | null = null;
  let isNewUser = true;
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email, email_confirm: false, user_metadata: { full_name },
  });

  if (createErr) {
    isNewUser = false;
    let page = 1;
    while (!userId && page < 20) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (!data?.users?.length) break;
      const found = data.users.find(u => u.email?.toLowerCase() === email);
      if (found) userId = found.id;
      if (data.users.length < 200) break;
      page++;
    }
    if (!userId) throw new Error(createErr.message);
  } else {
    userId = created.user.id;
  }

  if (isNewUser) {
    // Fresh auth user — the on_auth_user_created trigger already inserted a
    // bare profiles row keyed to this club; fill in their identity fields.
    await db.from('profiles').upsert(
      { id: userId, full_name, role, club_id },
      { onConflict: 'id', ignoreDuplicates: false },
    );
  } else {
    // Existing user: never touch club_id — they may already belong to a
    // different club, and relocating their home club here would be wrong.
    // But DO raise their global role if they've never been elevated before
    // (e.g. they were only ever a parent) — team_members access alone isn't
    // enough, since a few things (editing a team's own details, the "My
    // Teams" list in Settings) still key off profiles.role directly. Never
    // downgrade someone who's already coach/org_admin/app_admin.
    const { data: existing } = await db.from('profiles').select('role').eq('id', userId).single();
    const currentRole = existing?.role ?? 'player';
    if (!['coach', 'org_admin', 'app_admin'].includes(currentRole)) {
      await db.from('profiles').update({ role }).eq('id', userId);
    }
  }

  for (const teamId of teamIds) {
    await db.from('team_members').upsert(
      { team_id: teamId, profile_id: userId, role: 'coach' },
      { onConflict: 'team_id,profile_id', ignoreDuplicates: true },
    );
  }

  if (isNewUser) {
    await resendSetupEmail({ db, clubName, logoUrl, accent, email, full_name, role });
  } else {
    await sendAddedToTeamEmail({ clubName, logoUrl, accent, email, full_name });
  }
}

// For a person who already has an account (possibly at another club) —
// no password/setup step needed, just a heads-up that they now also have
// access here. Distinct from resendSetupEmail, which implies a first-time
// account that still needs a password.
export async function sendAddedToTeamEmail({ clubName, logoUrl, accent, email, full_name }: {
  clubName: string; logoUrl: string | null; accent: string;
  email: string; full_name: string;
}) {
  const html = brandedEmailShell({
    clubName, logoUrl, accent,
    title: `You've been added at ${clubName}`,
    kicker: "You've been added as a coach",
    heading: `Welcome to ${esc(clubName)}, ${esc(full_name.split(' ')[0] || full_name)} 👋`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.75;">
        You've been added as a coach at <strong style="color:#f9fafb;">${esc(clubName)}</strong> on Pulse FC,
        using your existing account.
      </p>
      <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">
        Sign in as usual and switch teams to see ${esc(clubName)}'s roster, schedule, and chat.
      </p>`,
    ctaLabel: 'Open Pulse FC →',
    ctaUrl: 'https://pulse-fc.app/login',
  });

  const { error: sendErr } = await resend.emails.send({
    from: `${clubName} <support@pulse-fc.app>`,
    to: email,
    subject: `You've been added as a coach at ${clubName}`,
    html,
  });
  if (sendErr) throw new Error('Failed to send email');
}

// Regenerates a fresh recovery link and re-sends the branded setup email —
// used both by instantCreate (first send) and the standalone resend action
// for an account that exists but has never signed in.
export async function resendSetupEmail({ db, clubName, logoUrl, accent, email, full_name, role }: {
  db: ReturnType<typeof supabaseAdmin>; clubName: string; logoUrl: string | null; accent: string;
  email: string; full_name: string; role: 'coach' | 'org_admin';
}) {
  const { data: linkData } = await db.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: 'https://pulse-fc.app/dashboard' },
  });
  const setupLink = linkData?.properties?.action_link ?? 'https://pulse-fc.app/login';

  const roleLabel = role === 'org_admin' ? 'an admin' : 'a coach';
  const html = brandedEmailShell({
    clubName, logoUrl, accent,
    title: `You've been added as ${roleLabel} at ${clubName}`,
    kicker: `You've been added as ${roleLabel}`,
    heading: `Welcome to ${esc(clubName)}, ${esc(full_name.split(' ')[0] || full_name)} 👋`,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.75;">
        You've been set up as ${roleLabel} at <strong style="color:#f9fafb;">${esc(clubName)}</strong> on Pulse FC.
      </p>
      <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">
        Click below to set your password — the roster, schedule, and dashboard are already set up and waiting.
      </p>`,
    ctaLabel: 'Set up my account →',
    ctaUrl: setupLink,
  });

  const { error: sendErr } = await resend.emails.send({
    from: `${clubName} <support@pulse-fc.app>`,
    to: email,
    subject: `You've been added as ${roleLabel} at ${clubName}`,
    html,
  });
  if (sendErr) throw new Error('Failed to send email');
}

export { resolveAccent };
