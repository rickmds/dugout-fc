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

export type CoachInviteInput = {
  full_name: string;
  email: string;
  team_ids: string[];
  role?: 'coach' | 'org_admin';
};

// Creates (or reuses) the coach account/invite server-side and sends the
// branded invite email. Returns true only if every coach in the batch succeeded.
export async function sendCoachInvites(clubId: string, coaches: CoachInviteInput[]): Promise<boolean> {
  const res = await fetch(`${APP_URL}/api/invite-coach`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ club_id: clubId, coaches }),
  });
  if (!res.ok) return false;
  const { results } = await res.json();
  return Array.isArray(results) && results.every((r: { ok: boolean }) => r.ok);
}

// Sends the branded email for an `invites` row that already exists
// (parent invites are still created client-side — only the email is shared).
export async function sendParentInviteEmail(inviteId: string, playerName?: string): Promise<boolean> {
  const res = await fetch(`${APP_URL}/api/send-invite`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ invite_id: inviteId, player_name: playerName }),
  });
  return res.ok;
}

// Resends the branded "you've been added as a coach" email for a still-pending
// coach invite — same route the web Staff page uses for its Resend action.
export async function resendCoachInvite(inviteId: string): Promise<boolean> {
  const res = await fetch(`${APP_URL}/api/staff-resend`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ kind: 'pending', invite_id: inviteId }),
  });
  return res.ok;
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
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: inviteData, error } = await supabase.from('invites').insert({
    team_id: opts.teamId,
    player_id: opts.playerId,
    email: opts.email.trim().toLowerCase(),
    guardian_name: opts.guardianName?.trim() || null,
    created_by: opts.createdBy,
  }).select('id').single();
  if (error || !inviteData?.id) return { ok: false, error: error?.message ?? 'Could not create invite' };
  await sendParentInviteEmail(inviteData.id, opts.playerName);
  return { ok: true };
}
