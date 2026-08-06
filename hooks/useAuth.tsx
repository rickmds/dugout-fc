import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

async function fetchProfileAndClub(userId: string): Promise<{ profile: Profile | null; club: Club | null }> {
  const { data } = await supabase
    .from('profiles')
    .select('*, clubs(*)')
    .eq('id', userId)
    .single();

  if (!data) return { profile: null, club: null };

  const { clubs, ...profileFields } = data as any;
  const profile = profileFields as Profile;
  const club = (Array.isArray(clubs) ? clubs[0] ?? null : clubs ?? null) as Club | null;

  return { profile, club };
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

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;

      if (session?.user) {
        // Restore from cache immediately — removes the loading spinner on return visits
        const cached = await readCache(session.user.id);
        if (mounted && cached) {
          setState({ session, user: session.user, profile: cached.profile, club: cached.club, loading: false });
        }

        // Revalidate in background (or full load if no cache)
        const { profile, club } = await fetchProfileAndClub(session.user.id);
        if (mounted) {
          setState({ session, user: session.user, profile, club, loading: false });
          if (profile) persistCache(session.user.id, profile, club);
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
        const { profile, club } = await fetchProfileAndClub(session.user.id);
        if (mounted) {
          setState({ session, user: session.user, profile, club, loading: false });
          if (profile) persistCache(session.user.id, profile, club);
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

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function refreshProfile() {
    if (!state.user) return;
    const { profile, club } = await fetchProfileAndClub(state.user.id);
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
