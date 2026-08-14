import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

export default function AppLayout() {
  const { session, profile, club, loading } = useAuth();

  if (!loading && !session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  // Central, one-time gate for first-run welcome + profile completion —
  // every entry path (deep link, invite-match, find-team, create-team,
  // coach-options) passes through here before reaching the tabs, so it
  // can't be silently skipped by one path the way login.tsx vs
  // register.tsx's post-auth routing once diverged.
  if (!loading && session && profile && club && !profile.onboarded_at) {
    return <Redirect href="/(auth)/club-welcome" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Switching to a team at a different club changes this [clubSlug]
          segment's value, which this Stack (not the one inside it) treats
          as the actual screen transition — content already updates
          instantly via context, so the default slide here is what reads
          as the change-then-slide double motion. */}
      <Stack.Screen name="[clubSlug]" options={{ animation: 'none' }} />
    </Stack>
  );
}
