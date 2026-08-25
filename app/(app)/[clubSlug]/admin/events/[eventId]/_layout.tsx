import { Stack } from 'expo-router';

// Match tracker is opened from app/(app)/[clubSlug]/event/[eventId].tsx via a
// real React Native <Modal> around <MatchTrackerContent> — not by navigating
// to this route — specifically because `gestureEnabled: false` on a
// Stack.Screen does not actually suppress the iOS edge-swipe/interactive-pop
// gesture in this Expo Router setup (a documented, previously-hit bug in
// this project). match-tracker.tsx's default export is kept only as a thin
// fallback for any future direct navigation to this route; deliberately not
// given `gestureEnabled: false` here since that option doesn't work and
// would just be a false promise of protection for a screen holding live,
// only-periodically-saved match state.
export default function EventLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="match-tracker"
        options={{ presentation: 'fullScreenModal' }}
      />
    </Stack>
  );
}
