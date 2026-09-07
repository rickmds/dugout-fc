import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

const STASH_KEY = 'view_as_admin_stash_v1';
const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

type Stash = { access_token: string; refresh_token: string };

export async function isViewingAs(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(STASH_KEY));
}

// usePushNotifications() re-registers this device's Expo push token under
// whatever profile.id useAuth() currently resolves to — which genuinely
// changes across a View As session swap, same as any other sign-in. Because
// push_tokens is keyed unique(profile_id, token) rather than unique(token),
// that re-registration ADDS a second row for this device rather than moving
// the existing one — so without this cleanup a device ends up registered
// under both the admin's own profile_id and the impersonated parent's, and
// stays that way indefinitely: the admin keeps receiving that parent's real
// notifications forever after Exit, since nothing ever deletes the stray
// row. Mirrors the exact cleanup useAuth.tsx's signOut() already does for
// the equivalent "device token outlives the session" case on normal sign-out.
async function detachThisDevicePushToken(profileId: string) {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: '3b35d5d3-278b-42c4-b66b-1a487815ce31' });
    await supabase.from('push_tokens').delete().eq('profile_id', profileId).eq('token', tokenData.data);
  } catch {
    // Best-effort, same as signOut()'s equivalent cleanup — a permissions
    // prompt never having been granted, or no token yet, shouldn't block
    // switching accounts.
  }
}

// Real session swap, not a client-side overlay — the app becomes that
// parent as far as Supabase (and every RLS policy) is concerned. The
// admin's own tokens are stashed first so Exit can restore the real
// session afterward.
export async function startViewAs(targetProfileId: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No active session.' };

  const res = await fetch(`${APP_URL}/api/admin/view-as`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ profile_id: targetProfileId }),
  });
  let body: { token_hash?: string; full_name?: string; error?: string } | null;
  try { body = await res.json(); } catch { body = null; }

  if (!res.ok || !body?.token_hash) {
    return { ok: false, error: body?.error ?? 'Could not start View As.' };
  }

  const stash: Stash = { access_token: session.access_token, refresh_token: session.refresh_token };
  await AsyncStorage.setItem(STASH_KEY, JSON.stringify(stash));

  // Detach the admin's own profile from this device BEFORE swapping — so
  // usePushNotifications' re-registration effect (fired below by the
  // session change) only ever creates a row for the impersonated parent,
  // not a second one left over for the admin, which would otherwise mean
  // the admin's device receives the parent's pushes too WHILE impersonating.
  await detachThisDevicePushToken(session.user.id);

  const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: body.token_hash, type: 'magiclink' });
  if (verifyErr) {
    await AsyncStorage.removeItem(STASH_KEY);
    return { ok: false, error: 'Could not switch to that account.' };
  }

  return { ok: true, name: body.full_name ?? 'Parent' };
}

export async function exitViewAs(): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = await AsyncStorage.getItem(STASH_KEY);
  if (!raw) return { ok: true };
  const stash: Stash = JSON.parse(raw);

  // Still signed in as the impersonated parent at this point — detach this
  // device's token from THEIR profile now, before restoring the admin
  // session, or the stray row lives forever and the admin keeps receiving
  // that real parent's notifications indefinitely after Exit.
  const { data: { session: impersonatedSession } } = await supabase.auth.getSession();
  if (impersonatedSession?.user?.id) {
    await detachThisDevicePushToken(impersonatedSession.user.id);
  }

  const { error } = await supabase.auth.setSession({ access_token: stash.access_token, refresh_token: stash.refresh_token });
  await AsyncStorage.removeItem(STASH_KEY);

  if (error) {
    // The stashed admin session couldn't be restored (expired from being
    // parked too long) — sign out fully rather than silently leaving
    // someone stuck logged in as the parent with no obvious way back.
    await supabase.auth.signOut();
    return { ok: false, error: 'Your admin session had expired — please log back in.' };
  }
  return { ok: true };
}
