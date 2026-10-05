import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { withTimeout, TIMEOUT } from '../lib/withTimeout';
import type { Database } from '../types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Club = Database['public']['Tables']['clubs']['Row'];

const CACHE_KEY = 'auth_profile_v1';

interface CachedAuth {
  profile: Profile;
  club: Club | null;
  userId: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  club: Club | null;
  loading: boolean;
  // True only when we couldn't CONFIRM a session within our timeout budget —
  // never set just because there genuinely isn't one. Screens must treat
  // this as "unknown, retry" rather than "signed out": the real session in
  // storage may still be perfectly valid, we just couldn't verify it over a
  // slow connection. Conflating the two meant a flaky network — not an
  // actual sign-out — sent people to a full re-login screen.
  sessionCheckFailed: boolean;
}

interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retrySessionCheck: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Supabase's join-cardinality inference for `clubs(*)` isn't guaranteed to
// stay a single object rather than an array if the relationship is ever
// redefined — typing it as either (matching the defensive Array.isArray
// check already below) means a real shape mismatch fails to compile
// instead of silently returning undefined at runtime.
type ProfileWithClub = Profile & { clubs: Club | Club[] | null };

async function fetchProfileAndClub(userId: string): Promise<{ profile: Profile | null; club: Club | null; error: boolean }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, clubs(*)')
    .eq('id', userId)
    .single<ProfileWithClub>();

  if (error) {
    console.warn('fetchProfileAndClub failed', error);
    return { profile: null, club: null, error: true };
  }

  if (!data) return { profile: null, club: null, error: false };

  const { clubs, ...profileFields } = data;
  const profile = profileFields as Profile;
  const club = Array.isArray(clubs) ? clubs[0] ?? null : clubs ?? null;

  return { profile, club, error: false };
}

async function persistCache(userId: string, profile: Profile, club: Club | null) {
  try {
    const entry: CachedAuth = { profile, club, userId };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

async function readCache(userId: string): Promise<{ profile: Profile; club: Club | null } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CachedAuth = JSON.parse(raw);
    if (entry.userId !== userId) return null;
    return { profile: entry.profile, club: entry.club };
  } catch {
    return null;
  }
}

async function clearCache() {
  try { await AsyncStorage.removeItem(CACHE_KEY); } catch {}
}

// getSession() isn't a pure local-storage read — if the cached access
// token has expired (routine on a cold launch after the app's been closed
// a few hours), it makes a real network call to refresh it before
// resolving, with no timeout anywhere in that chain. On shaky cold-launch
// connectivity that call can just stall forever, which leaves `loading`
// stuck true and the whole app on the loading spinner permanently — the
// only fix a user has is force-quitting, which abandons the hung request
// and lets a fresh one succeed. Retrying in-process after a timeout does
// the same thing automatically instead of requiring that.
// 8s (not the original 5s) because this is a REAL network round trip on
// possibly-weak signal (a practice field, spotty wifi) — 5s×2=10s total was
// tight enough that a merely-slow-but-working connection routinely lost the
// race and got treated as "couldn't confirm," which is what used to force
// people into a full re-login far more often than any actual sign-out did.
const SESSION_TIMEOUT_MS = 8000;
// `supabase.auth.getSession()` single-flights concurrent callers through
// auth-js's internal refreshingDeferred when the cached token has expired
// (the routine cold-launch case) — a second top-level call doesn't start an
// independent request, it just awaits the same in-flight refresh attempt 1
// kicked off. Calling getSession() again on timeout was therefore never a
// real second try: both "attempts" raced the exact same network round trip,
// so the user got the appearance of a retry with none of the benefit, and
// on marginal cold-launch LTE (real TCP+TLS handshake, not just a slow
// response) the combined 16s budget still wasn't always enough — the
// abandoned call would go on to succeed a few seconds after we'd already
// shown "Couldn't connect," which is exactly why Retry always worked
// instantly (the session was already warm by the time the user tapped it).
// Fix: hold the one real promise and keep waiting on *it*, with a longer
// total budget, instead of discarding it and racing a redundant call.
async function getSessionWithRetry() {
  const sessionPromise = supabase.auth.getSession();
  const first = await withTimeout(sessionPromise, SESSION_TIMEOUT_MS);
  if (first !== TIMEOUT) return first;
  const second = await withTimeout(sessionPromise, SESSION_TIMEOUT_MS * 1.5);
  return second !== TIMEOUT ? second : null;
}
async function fetchProfileAndClubWithRetry(userId: string) {
  const first = await withTimeout(fetchProfileAndClub(userId), SESSION_TIMEOUT_MS);
  if (first !== TIMEOUT) return first;
  // Unlike getSession() above, this is a plain table query with no
  // client-level single-flighting, so a genuine second attempt is worth
  // making — just given a little more room than the first in case the
  // connection is merely slow rather than actually stuck.
  const second = await withTimeout(fetchProfileAndClub(userId), SESSION_TIMEOUT_MS * 1.5);
  return second !== TIMEOUT ? second : { profile: null, club: null, error: true as const };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    club: null,
    loading: true,
    sessionCheckFailed: false,
  });

  // A ref (not a per-effect closure variable) so retrySessionCheck — called
  // from a screen's Retry button, not from the mount effect — can share the
  // exact same "am I still mounted" guard.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const checkSession = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, sessionCheckFailed: false }));
    // withTimeout only protects against a stalled request — a genuinely
    // rejected promise (a malformed refresh token, a real network error,
    // an internal auth-js exception) propagates straight through
    // Promise.race instead of losing the race, and with no catch here
    // that left `loading` stuck true forever: every path that resets it
    // sits downstream of this call. Same recoverable "couldn't confirm"
    // treatment as a timeout, not a crash with no way back except a
    // force-quit.
    let result: Awaited<ReturnType<typeof getSessionWithRetry>>;
    try {
      result = await getSessionWithRetry();
    } catch (err) {
      console.warn('checkSession: getSessionWithRetry threw', err);
      if (mountedRef.current) {
        setState({ session: null, user: null, profile: null, club: null, loading: false, sessionCheckFailed: true });
      }
      return;
    }
    if (!mountedRef.current) return;

    if (!result) {
      // Both attempts stalled — could be a real connectivity problem, but
      // could just as easily be a merely-slow-but-working connection that
      // lost the race. Either way this means "couldn't confirm," never
      // "confirmed signed out" — the actual session in storage may still be
      // completely valid. sessionCheckFailed lets index.tsx offer a Retry
      // instead of funneling this into a full re-login, which is what
      // conflating the two used to do.
      setState({ session: null, user: null, profile: null, club: null, loading: false, sessionCheckFailed: true });
      return;
    }

    const { data: { session } } = result;

    if (session?.user) {
      // Restore from cache immediately — removes the loading spinner on return visits
      const cached = await readCache(session.user.id);
      if (mountedRef.current && cached) {
        setState({ session, user: session.user, profile: cached.profile, club: cached.club, loading: false, sessionCheckFailed: false });
      }

      // Revalidate in background (or full load if no cache) — same
      // reject-vs-timeout gap as getSessionWithRetry above: a genuine
      // throw here (not just a stall) would otherwise leave `loading`
      // stuck true whenever there's no cache to have already cleared it
      // at the readCache branch above.
      let profile: Profile | null, club: Club | null, error: boolean;
      try {
        ({ profile, club, error } = await fetchProfileAndClubWithRetry(session.user.id));
      } catch (err) {
        console.warn('checkSession: fetchProfileAndClubWithRetry threw', err);
        profile = null; club = null; error = true;
      }
      if (mountedRef.current) {
        if (error) {
          if (cached) {
            // Transient/network failure — keep whatever profile/club we already have
            // (from cache) instead of nulling out valid data.
            setState((prev) => ({ ...prev, session, user: session.user, loading: false, sessionCheckFailed: false }));
          } else {
            // No cache to fall back on AND the live fetch failed — genuinely
            // "couldn't confirm," not "confirmed: this profile has no club."
            // Setting club:null with loading:false here used to read to
            // index.tsx as the latter, sending a real user with a real club
            // to the find-team screen on a flaky connection — recoverable
            // only by a full logout/login (which forces a fresh fetch that
            // usually succeeds). Route through the same Retry UI a failed
            // getSessionWithRetry already uses instead of guessing.
            setState({ session, user: session.user, profile: null, club: null, loading: false, sessionCheckFailed: true });
          }
        } else {
          setState({ session, user: session.user, profile, club, loading: false, sessionCheckFailed: false });
          if (profile) persistCache(session.user.id, profile, club);
        }
      }
    } else {
      setState({ session: null, user: null, profile: null, club: null, loading: false, sessionCheckFailed: false });
    }
  }, []);

  useEffect(() => {
    checkSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return;

      // supabase-js fires INITIAL_SESSION synchronously on subscribe, with
      // the same session the getSessionWithRetry() chain above is already
      // resolving — without this guard, every cold start fired two full
      // fetchProfileAndClubWithRetry() round trips for the same user at
      // once, doubling the network cost of the slowest part of app launch.
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT') {
        clearCache();
        setState({ session: null, user: null, profile: null, club: null, loading: false, sessionCheckFailed: false });
        return;
      }

      if (session?.user) {
        // Same stall risk as the mount-time fetch above — an unprotected
        // call here left session/profile/club stuck at their pre-login
        // values (still null right after signing in), so a screen gated on
        // any of them just sat on its own loading state indefinitely. Also
        // guards the same reject-vs-timeout gap as checkSession: a genuine
        // throw (not just a stall) here used to propagate out of this
        // listener uncaught, leaving loading stuck true with no recovery.
        let profile: Profile | null, club: Club | null, error: boolean;
        try {
          ({ profile, club, error } = await fetchProfileAndClubWithRetry(session.user.id));
        } catch (err) {
          console.warn('onAuthStateChange: fetchProfileAndClubWithRetry threw', err);
          profile = null; club = null; error = true;
        }
        if (mountedRef.current) {
          if (error) {
            // Same distinction as the mount-time path above: only safe to
            // silently keep going if there's an existing profile already in
            // state to fall back on — otherwise this is "couldn't confirm,"
            // not "no club."
            setState((prev) => prev.profile
              ? { ...prev, session, user: session.user, loading: false, sessionCheckFailed: false }
              : { session, user: session.user, profile: null, club: null, loading: false, sessionCheckFailed: true });
          } else {
            setState({ session, user: session.user, profile, club, loading: false, sessionCheckFailed: false });
            if (profile) persistCache(session.user.id, profile, club);
          }
        }
      } else {
        setState({ session: null, user: null, profile: null, club: null, loading: false, sessionCheckFailed: false });
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [checkSession]);

  // Club branding (colors, logo) and the user's own profile (avatar, etc.)
  // are only fetched on session start and after specific in-app actions —
  // a change made elsewhere (the web dashboard, another device) never
  // pushes anything to an already-open app, so it just sits stale until
  // the app is force-quit and relaunched. Refetch whenever the app
  // returns to the foreground so those changes show up without that.
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = state.user?.id ?? null; }, [state.user]);

  useEffect(() => {
    function onAppStateChange(next: AppStateStatus) {
      if (next !== 'active' || !userIdRef.current) return;
      const uid = userIdRef.current;
      fetchProfileAndClub(uid).then(({ profile, club, error }) => {
        if (error) return;
        setState((prev) => (prev.user?.id === uid ? { ...prev, profile, club } : prev));
        if (profile) persistCache(uid, profile, club);
      });
    }
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

  // useCallback (keyed on just the user id, the only field either function
  // actually reads off `state.user`) so identity stays stable across
  // re-renders that don't change who's signed in — otherwise every render
  // of AuthProvider hands all 54 consumers a brand-new function reference,
  // forcing them to re-render regardless of whether anything meaningful
  // changed. See the context-value useMemo below for the other half of this.
  const signOut = useCallback(async () => {
    // Otherwise this device's push token outlives the session — on a
    // shared/handed-down device, the next person to sign in still shares
    // the token row with whoever signed out, and can keep receiving pushes
    // meant for them. Best-effort: a token re-fetch requires notification
    // permission and a live network call, neither guaranteed at sign-out
    // time, so failures here must never block actually signing out.
    if (state.user) {
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: '3b35d5d3-278b-42c4-b66b-1a487815ce31' });
        await supabase.from('push_tokens').delete().eq('profile_id', state.user.id).eq('token', tokenData.data);
      } catch {}
    }
    await supabase.auth.signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.user?.id]);

  const refreshProfile = useCallback(async () => {
    if (!state.user) return;
    const { profile, club, error } = await fetchProfileAndClub(state.user.id);
    if (error) {
      // Transient/network failure — leave the existing cached profile/club alone.
      return;
    }
    setState((prev) => ({ ...prev, profile, club }));
    if (profile) persistCache(state.user.id, profile, club);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.user?.id]);

  // Not awaited by callers — it's a fire-and-forget re-run of the same
  // mount-time check, driven from a screen's Retry button after a failed
  // sessionCheckFailed state. checkSession() itself updates `loading` and
  // `sessionCheckFailed` as it goes, which is what the Retry UI watches.
  const retrySessionCheck = useCallback(() => {
    checkSession();
  }, [checkSession]);

  // Memoized so a re-render of AuthProvider that doesn't actually change
  // `state` (e.g. triggered by an ancestor re-rendering for unrelated
  // reasons) reuses the same value object instead of forcing every
  // consumer — including memo()-wrapped list rows that call useAuth()/
  // useClub() internally — to re-render regardless of whether anything
  // meaningful changed.
  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signOut, refreshProfile, retrySessionCheck }),
    [state, signOut, refreshProfile, retrySessionCheck]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
