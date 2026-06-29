import { Stack } from 'expo-router';
import { TeamProvider } from '../../../hooks/TeamContext';

export default function ClubLayout() {
  return (
    <TeamProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </TeamProvider>
  );
}
