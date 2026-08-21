import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
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
}

interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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
const SESSION_TIMEOUT_MS = 5000;
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
async function getSessionWithRetry() {
  const first = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
  if (first) return first;
  return withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
}
async function fetchProfileAndClubWithRetry(userId: string) {
  const first = await withTimeout(fetchProfileAndClub(userId), SESSION_TIMEOUT_MS);
  if (first) return first;
  const second = await withTimeout(fetchProfileAndClub(userId), SESSION_TIMEOUT_MS);
  return second ?? { profile: null, club: null, error: true as const };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    club: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    getSessionWithRetry().then(async (result) => {
      if (!mounted) return;

      if (!result) {
        // Both attempts stalled — a real connectivity problem, not just a
        // one-off hiccup. Don't leave the spinner up forever: fall through
        // to the signed-out state so (app)/_layout's own `!loading &&
        // !session` check can redirect somewhere the user can actually act
        // (retry, or the app's normal offline handling), rather than a
        // screen with nothing to tap.
        setState({ session: null, user: null, profile: null, club: null, loading: false });
        return;
      }

      const { data: { session } } = result;

      if (session?.user) {
        // Restore from cache immediately — removes the loading spinner on return visits
        const cached = await readCache(session.user.id);
        if (mounted && cached) {
          setState({ session, user: session.user, profile: cached.profile, club: cached.club, loading: false });
        }

        // Revalidate in background (or full load if no cache)
        const { profile, club, error } = await fetchProfileAndClubWithRetry(session.user.id);
        if (mounted) {
          if (error) {
            // Transient/network failure — keep whatever profile/club we already have
            // (from cache, or null if there was none) instead of nulling out valid data.
            setState((prev) => ({ ...prev, session, user: session.user, loading: false }));
          } else {
            setState({ session, user: session.user, profile, club, loading: false });
            if (profile) persistCache(session.user.id, profile, club);
          }
        }
      } else {
        setState({ session: null, user: null, profile: null, club: null, loading: false });
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        clearCache();
        setState({ session: null, user: null, profile: null, club: null, loading: false });
        return;
      }

      if (session?.user) {
        // Same stall risk as the mount-time fetch above — an unprotected
        // call here left session/profile/club stuck at their pre-login
        // values (still null right after signing in), so a screen gated on
        // any of them just sat on its own loading state indefinitely.
        const { profile, club, error } = await fetchProfileAndClubWithRetry(session.user.id);
        if (mounted) {
          if (error) {
            // Transient/network failure — leave the existing profile/club in state alone.
            setState((prev) => ({ ...prev, session, user: session.user, loading: false }));
          } else {
            setState({ session, user: session.user, profile, club, loading: false });
            if (profile) persistCache(session.user.id, profile, club);
          }
        }
      } else {
        setState({ session: null, user: null, profile: null, club: null, loading: false });
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

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

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function refreshProfile() {
    if (!state.user) return;
    const { profile, club, error } = await fetchProfileAndClub(state.user.id);
    if (error) {
      // Transient/network failure — leave the existing cached profile/club alone.
      return;
    }
    setState((prev) => ({ ...prev, profile, club }));
    if (profile) persistCache(state.user.id, profile, club);
  }

  return (
    <AuthContext.Provider value={{ ...state, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
