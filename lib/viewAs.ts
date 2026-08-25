import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const STASH_KEY = 'view_as_admin_stash_v1';
const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

type Stash = { access_token: string; refresh_token: string };

export async function isViewingAs(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(STASH_KEY));
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
