import type { useRouter } from 'expo-router';
import { supabase } from './supabase';

type Router = ReturnType<typeof useRouter>;

export type PostAuthResult =
  | { type: 'routed' }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string };

// Neither query below has a timeout on the SDK call itself, so on a flaky
// connection one can stall forever — same class of bug already hardened
// against in login.tsx's own sign-in call and useAuth.tsx's session
// restore. Since this runs on every login (not just SSO), a stuck call
// here reads as "login just hangs," fixed only by a force-quit that
// abandons the request. Race a timeout instead so it surfaces as a
// retryable error.
const TIMEOUT = Symbol('timeout');
function withTimeout<T>(promise: PromiseLike<T>, ms = 6000): Promise<T | typeof TIMEOUT> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), ms)),
  ]);
}

// Single source of truth for "what happens right after someone
// authenticates" — used by both login.tsx and register.tsx, which used to
// each maintain their own copy. That drift is exactly how fresh signups
// ended up skipping the role picker entirely: register.tsx's copy never
// grew the role-select branch that login.tsx's did.
//
// Invite acceptance is deliberately NOT handled here (or anywhere else in
// the app) — every invite, whether the person already has an account or
// not, completes on the web at pulse-fc.app/join. That's the one place
// "does this email already have a profile?" is resolved, so there's a
// single source of truth for it instead of the app and the web each doing
// their own matching and risking drifting apart.
export async function routeAfterAuth(
  router: Router,
  userId: string,
  refreshProfile: () => Promise<void>,
  opts: { isSso?: boolean } = {}
): Promise<PostAuthResult> {
  // SSO creates the profile row via a DB trigger; give it time to fire.
  let profile: { role: string | null; club_id: string | null } | null = null;
  const attempts = opts.isSso ? 4 : 1;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    const result = await withTimeout(supabase.from('profiles').select('role, club_id').eq('id', userId).single());
    if (result === TIMEOUT) continue;
    profile = result.data;
    if (result.data) break;
  }
  if (!profile) return { type: 'error', message: 'Failed to load your profile. Please try again.' };

  // 2. Already fully onboarded (returning user) — straight into the app.
  if (profile.club_id) {
    const clubResult = await withTimeout(supabase.from('clubs').select('slug').eq('id', profile.club_id).single());
    if (clubResult === TIMEOUT) return { type: 'error', message: 'Failed to load your club. Please try again.' };
    const { data: club, error: clubError } = clubResult;
    if (clubError) return { type: 'error', message: 'Failed to load your club. Please try again.' };
    if (club?.slug) {
      router.replace(`/(app)/${club.slug}/(tabs)`);
      return { type: 'routed' };
    }
  }

  // 3. No role yet — ask what they're here to do. (Anyone with a pending
  // invite should have completed it on web/join already — see file-level
  // comment above — so there's nothing to auto-match here.)
  if (!profile.role) {
    router.replace('/(auth)/role-select');
    return { type: 'routed' };
  }

  // 4. org_admin who started signup on web but hasn't finished the wizard.
  if (profile.role === 'org_admin') {
    return { type: 'info', message: 'Your club setup is not finished yet. Visit pulse-fc.app/onboarding to complete setup. Or sign out below.' };
  }

  // 5. Fallback — has a role but somehow no club (e.g. skipped find-team earlier).
  router.replace('/(auth)/find-team');
  return { type: 'routed' };
}
