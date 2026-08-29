import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

// Apple rejected a build over a Sign in with Apple bug on iPad; rather than
// debug a review-only repro, both social sign-in buttons were hidden from
// login/register (removing just Apple while keeping Google would trip
// Guideline 4.8, which requires Apple whenever another third-party login is
// offered). The functions below and their native setup stay wired up so this
// is a one-line flip once the underlying bug is understood, not a redo.
export const SOCIAL_AUTH_ENABLED = false;

// Only wraps the pure network legs (fetching the OAuth URL, exchanging the
// code/token for a session) — never the steps waiting on the person
// themselves (the browser sheet, Face ID), which can legitimately take far
// longer than this without anything being wrong.
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), 6000)),
  ]);
}

export async function signInWithGoogle(): Promise<void> {
  const redirectUrl = Linking.createURL('/');

  const { data, error } = await withTimeout(
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    }),
    'Starting Google sign-in'
  );

  if (error) throw error;
  if (!data?.url) throw new Error('No OAuth URL returned');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  if (result.type === 'success') {
    // PKCE flow — code in query params
    const queryString = result.url.split('?')[1] || '';
    const params = new URLSearchParams(queryString);
    const code = params.get('code');

    if (code) {
      const { error: exchangeError } = await withTimeout(supabase.auth.exchangeCodeForSession(code), 'Completing Google sign-in');
      if (exchangeError) throw exchangeError;
      return;
    }

    // Implicit flow fallback — tokens in hash fragment
    const fragment = new URLSearchParams(result.url.split('#')[1] || '');
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token') ?? '';
    if (accessToken) {
      const { error: sessionError } = await withTimeout(
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
        'Completing Google sign-in'
      );
      if (sessionError) throw sessionError;
    }
  }
}

export async function signInWithApple(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple Sign-In failed: no identity token returned');
  }

  const { error } = await withTimeout(
    supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    }),
    'Completing Apple sign-in'
  );

  if (error) throw error;
}
