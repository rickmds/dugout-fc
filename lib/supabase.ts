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
