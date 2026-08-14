import type { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { posthog } from './posthog';

type Router = ReturnType<typeof useRouter>;

export type PostAuthResult =
  | { type: 'routed' }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string };

type PendingInviteMatch = {
  invite_id: string;
  token: string;
  player_name: string | null;
  team_name: string;
  club_name: string;
  invite_role: string;
};

// Single source of truth for "what happens right after someone
// authenticates" — used by both login.tsx and register.tsx, which used to
// each maintain their own copy. That drift is exactly how fresh signups
// ended up skipping the role picker entirely: register.tsx's copy never
// grew the role-select branch that login.tsx's did.
export async function routeAfterAuth(
  router: Router,
  userId: string,
  refreshProfile: () => Promise<void>,
  opts: { isSso?: boolean } = {}
): Promise<PostAuthResult> {
  // 1. Deep-link invite token always wins — explicit, deliberate action.
  const pendingToken = await AsyncStorage.getItem('pendingInviteToken');
  if (pendingToken) {
    await AsyncStorage.removeItem('pendingInviteToken');
    const { data, error: rpcError } = await supabase.rpc('accept_invite', { p_token: pendingToken });
    if (rpcError) return { type: 'error', message: 'Failed to accept invite. Please try again.' };
    const slug = (data as { club_slug?: string } | null)?.club_slug;
    if (!slug) return { type: 'error', message: 'Club not found. Please contact your coach.' };
    await refreshProfile();
    posthog.capture('onboarding_completed', { path: 'deep_link' });
    router.replace(`/(app)/${slug}/(tabs)` as never);
    return { type: 'routed' };
  }

  // SSO creates the profile row via a DB trigger; give it time to fire.
  let profile: { role: string | null; club_id: string | null } | null = null;
  const attempts = opts.isSso ? 4 : 1;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    const { data } = await supabase.from('profiles').select('role, club_id').eq('id', userId).single();
    profile = data;
    if (data) break;
  }
  if (!profile) return { type: 'error', message: 'Failed to load your profile. Please try again.' };

  // 2. Already fully onboarded (returning user) — straight into the app.
  if (profile.club_id) {
    const { data: club, error: clubError } = await supabase.from('clubs').select('slug').eq('id', profile.club_id).single();
    if (clubError) return { type: 'error', message: 'Failed to load your club. Please try again.' };
    if (club?.slug) {
      router.replace(`/(app)/${club.slug}/(tabs)`);
      return { type: 'routed' };
    }
  }

  // 3. No club yet — see if there's a pending invite waiting on this email
  // before ever showing the role picker. Covers the ~99% of parents (and
  // coaches) who signed up with the same email their invite was sent to.
  const { data: matches } = await supabase.rpc('find_my_pending_invites');
  const inviteMatches = (matches ?? []) as PendingInviteMatch[];
  if (inviteMatches.length > 0) {
    posthog.capture('onboarding_invite_automatched', { count: inviteMatches.length });
    router.replace('/(auth)/invite-match' as never);
    return { type: 'routed' };
  }

  // 4. No role yet — ask what they're here to do.
  if (!profile.role) {
    router.replace('/(auth)/role-select');
    return { type: 'routed' };
  }

  // 5. org_admin who started signup on web but hasn't finished the wizard.
  if (profile.role === 'org_admin') {
    return { type: 'info', message: 'Your club setup is not finished yet. Visit pulse-fc.app/onboarding to complete setup. Or sign out below.' };
  }

  // 6. Fallback — has a role but somehow no club (e.g. skipped find-team earlier).
  router.replace('/(auth)/find-team');
  return { type: 'routed' };
}
