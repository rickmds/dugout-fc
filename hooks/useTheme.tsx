import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { DARK_COLORS, LIGHT_COLORS, ThemeColors } from '../constants/colors';

export type ThemeName = 'dark' | 'light';

const STORAGE_KEY = 'theme_preference_v1';

interface ThemeContextValue {
  theme: ThemeName;
  colors: ThemeColors;
  // "Some opacity of the theme's ink color over the surface" — covers both
  // low-alpha overlay/border/divider sites and high-alpha near-solid
  // text/icon sites that were hardcoded to rgba(255,255,255,*) for dark.
  overlay: (alpha: number) => string;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [theme, setThemeState] = useState<ThemeName>('dark');

  // AsyncStorage, not the profiles.theme_preference round trip, is the
  // primary source of truth — it's what a near-instant local write can
  // actually guarantee finishes before a force-quit. Read once on mount so
  // a returning user gets their real choice from the first frame, not the
  // 'dark' default while the network fetch is still out.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') setThemeState(saved);
    });
  }, []);

  // Secondary sync FROM the account — covers a fresh install / new device
  // where local storage has nothing yet, and keeps a second device
  // eventually catching up. No ordering guard against the AsyncStorage
  // read above: both converge to the same value (setTheme writes both),
  // so if this fires first with a stale cached profile it's at most a
  // brief flash, self-corrected once the fresh fetch resolves — never a
  // permanent stick the way losing the race used to be.
  // Depends on the field itself, not profile?.id: useAuth restores a
  // CACHED profile (from before this session's last theme change)
  // immediately on cold start for speed, then replaces it with the real
  // one once the network fetch resolves; both share the same profile.id,
  // so an id-keyed dependency would only ever fire once and never pick up
  // that second, correct value.
  const savedTheme = (profile as { theme_preference?: string } | null)?.theme_preference;
  useEffect(() => {
    if (savedTheme === 'light' || savedTheme === 'dark') setThemeState(savedTheme);
  }, [savedTheme]);

  // Keeps native chrome (status bar, keyboard, system alerts) following the
  // in-app choice rather than the device's own system setting — this app
  // exposes exactly two explicit options, not "follow system".
  useEffect(() => {
    Appearance.setColorScheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    // Local write first and awaited-in-spirit (fire-and-forget is fine
    // here — AsyncStorage's native write is fast enough that it's not the
    // thing at risk of losing a race with a force-quit the way the network
    // request below is) so the choice survives even if the app is killed
    // half a second after tapping the toggle, before any server round
    // trip could plausibly land.
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    // Best-effort cross-device sync — errors intentionally unhandled
    // beyond logging, since the local write above is what actually has to
    // work for this device to remember the choice.
    if (profile) {
      supabase.from('profiles').update({ theme_preference: next }).eq('id', profile.id)
        .then(({ error }) => { if (error) console.warn('theme_preference sync failed', error); });
    }
  }, [profile]);

  const colors = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const overlay = useCallback(
    (alpha: number) => (theme === 'dark' ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`),
    [theme]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, colors, overlay, setTheme }),
    [theme, colors, overlay, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
