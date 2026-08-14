import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

export default function AuthLayout() {
  const { session, profile, club, loading } = useAuth();

  // Only bounce a fully-onboarded user back into the app — otherwise this
  // would immediately redirect someone away from welcome-tour/profile-setup
  // right back into (app)/_layout's own redirect into this same group,
  // an infinite loop between the two layouts.
  if (!loading && session && club && profile?.onboarded_at) {
    return <Redirect href={`/(app)/${club.slug}/(tabs)`} />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
