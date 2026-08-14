import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

export default function AuthLayout() {
  const { session, profile, club, loading } = useAuth();

  // Only bounce a fully-onboarded user back into the app — e.g. if they
  // navigate back to /(auth)/profile-setup after already finishing it.
  if (!loading && session && club && profile?.onboarded_at) {
    return <Redirect href={`/(app)/${club.slug}/(tabs)`} />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
