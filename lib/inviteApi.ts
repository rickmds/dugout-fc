import { supabase } from './supabase';

// Single source of truth for invite emails — mobile calls the exact same
// Next.js API routes the web dashboard and onboarding wizard use, so
// branding, redirect links, and the accept-flow are never duplicated
// (and can't silently drift out of sync) across platforms.
const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  };
}

// None of these had a timeout or a try/catch — a real network error (not
// just a bad HTTP status) threw out of the fetch, and since none of their
// callers wrap the call in try/catch either, that exception propagated all
// the way up as an unhandled rejection. In the Guardians tab specifically,
// that left the save button's spinner stuck forever with no alert shown at
// all (the invite row itself still gets created earlier, so it looked like
// "the invite just didn't go through" with nothing indicating why). Same
// class of bug as today's login-hang fix — bound the request and turn a
// thrown error into a clean `false` instead.
async function postWithTimeout(url: string, body: unknown, ms = 10000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok;
  } catch (e) {
    console.error(`[inviteApi] POST ${url} failed`, e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type CoachInviteInput = {
  full_name: string;
  email: string;
  team_ids: string[];
  role?: 'coach' | 'org_admin';
};

// Creates (or reuses) the coach account/invite server-side and sends the
// branded invite email. Returns true only if every coach in the batch succeeded.
export async function sendCoachInvites(clubId: string, coaches: CoachInviteInput[]): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${APP_URL}/api/invite-coach`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ club_id: clubId, coaches }),
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const { results } = await res.json();
    return Array.isArray(results) && results.every((r: { ok: boolean }) => r.ok);
  } catch (e) {
    console.error('[inviteApi] sendCoachInvites failed', e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Sends the branded email for an `invites` row that already exists
// (parent invites are still created client-side — only the email is shared).
export async function sendParentInviteEmail(inviteId: string, playerName?: string): Promise<boolean> {
  return postWithTimeout(`${APP_URL}/api/send-invite`, { invite_id: inviteId, player_name: playerName });
}

// Resends the branded "you've been added as a coach" email for a still-pending
// coach invite — same route the web Staff page uses for its Resend action.
export async function resendCoachInvite(inviteId: string): Promise<boolean> {
  return postWithTimeout(`${APP_URL}/api/staff-resend`, { kind: 'pending', invite_id: inviteId });
}

// Creates a parent-role invite for a player and sends the email — the
// shared "add another guardian" action used both from the player detail
// screen's Guardians tab and from first-run profile completion. RLS lets
// this through for a coach, or for an existing guardian of that same
// player (is_player_guardian) — never for anyone else.
export async function addGuardianInvite(opts: {
  teamId: string;
  playerId: string;
  email: string;
  createdBy: string;
  guardianName?: string;
  playerName?: string;
}): Promise<{ ok: true; emailSent: boolean } | { ok: false; error: string }> {
  const row = {
    team_id: opts.teamId,
    player_id: opts.playerId,
    email: opts.email.trim().toLowerCase(),
    guardian_name: opts.guardianName?.trim() || null,
    created_by: opts.createdBy,
  };

  let { data: inviteData, error } = await supabase.from('invites').insert(row).select('id').single();

  // An RLS failure here is most often a stale access token (this screen can
  // sit open a while during first-run profile setup) rather than a real
  // permissions gap — one silent session refresh + retry before giving up.
  if (error?.code === '42501') {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) {
      ({ data: inviteData, error } = await supabase.from('invites').insert(row).select('id').single());
    }
  }

  if (error || !inviteData?.id) {
    // Server-side simulation of this exact check has passed every time this
    // has been investigated, so the remaining suspect is what's actually on
    // the wire — decode the real access token's own claims (zero reliance
    // on any local simulation) to settle it definitively next time.
    const { data: { session } } = await supabase.auth.getSession();
    let tokenClaims: unknown = null;
    try {
      const payload = session?.access_token?.split('.')[1];
      tokenClaims = payload ? JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) : null;
    } catch { /* best-effort only */ }
    console.error('[addGuardianInvite] failed', { row, error, tokenClaims });
    return {
      ok: false,
      error: error?.code === '42501'
        ? "Couldn't send that invite — please try again in a moment."
        : (error?.message ?? 'Could not create invite'),
    };
  }
  // The invite row exists either way — worth telling the caller apart from
  // "email actually went out" so the UI doesn't claim success when the
  // other guardian was never actually notified.
  const emailSent = await sendParentInviteEmail(inviteData.id, opts.playerName);
  if (!emailSent) console.error('[addGuardianInvite] invite created but email failed to send', { inviteId: inviteData.id });
  return { ok: true, emailSent };
}
