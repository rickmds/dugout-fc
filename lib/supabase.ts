import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// autoRefreshToken: true above only schedules a JS timer to refresh the
// access token before it expires — and React Native suspends JS timers
// while the app is backgrounded, so that scheduled refresh never fires
// during a real sleep. Without this, an access token that expires while
// the app is asleep just stays expired: reopening the app after a long
// enough sleep hits a window where every authenticated query fails until
// something else happens to trigger a refresh — which reads as "logged
// out," and separately corrupts anything that fetches a list and treats
// an empty/failed result as "genuinely nothing here" (see TeamContext's
// fetchTeams — this is the same root cause as teams appearing to flip on
// wake). This is Supabase's own documented fix for React Native: manually
// start/stop the refresh timer around actual foreground/background
// transitions instead of relying on the timer surviving a sleep.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

// 'change' above only fires on a later TRANSITION — it never fires for the
// app's already-active state at cold launch, since there's no prior state
// to compare against. Without this, every cold launch skips starting the
// refresh timer entirely until the app is backgrounded and foregrounded at
// least once, leaving the very first getSession() call (made moments later
// by useAuth's checkSession) to race a token refresh with nothing backing
// it up — independent of connection quality, and exactly why a manual
// Retry right after a failed cold start "just works": by then the app's
// been through a real state check and the timer is finally running.
if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
