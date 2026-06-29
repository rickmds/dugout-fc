import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

export default function AuthLayout() {
  const { session, club, loading } = useAuth();

  if (!loading && session && club) {
    return <Redirect href={`/(app)/${club.slug}/(tabs)`} />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
