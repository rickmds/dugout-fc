import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Club = Database['public']['Tables']['clubs']['Row'];

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
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();

  if (!profile?.club_id) {
    return { profile: profile ?? null, club: null };
  }

  const { data: club } = await supabase.from('clubs').select('*').eq('id', profile.club_id).single();

  return { profile, club: club ?? null };
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
        const { profile, club } = await fetchProfileAndClub(session.user.id);
        if (mounted) setState({ session, user: session.user, profile, club, loading: false });
      } else {
        setState({ session: null, user: null, profile: null, club: null, loading: false });
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        const { profile, club } = await fetchProfileAndClub(session.user.id);
        if (mounted) setState({ session, user: session.user, profile, club, loading: false });
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
