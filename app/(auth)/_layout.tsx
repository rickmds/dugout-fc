import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

// The in-app "Contact Support" screen only exists at a club-scoped route
// (it needs a signed-in profile and a resolved club for branding), so it's
// unreachable to exactly the population most likely to need it: anyone
// still stuck somewhere in this pre-login stack (a dead-end club lookup, a
// login that won't go through, etc). This is a club-independent, no-auth-
// required escape hatch available on every screen in the auth flow.
function NeedHelpLink() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 10 }]}>
      <TouchableOpacity
        onPress={() => Linking.openURL('mailto:support@pulse-fc.app')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Text style={styles.text}>Need help?</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AuthLayout() {
  const { session, profile, club, loading } = useAuth();

  // Only bounce a fully-onboarded user back into the app — e.g. if they
  // navigate back to /(auth)/profile-setup after already finishing it.
  if (!loading && session && club && profile?.onboarded_at) {
    return <Redirect href={`/(app)/${club.slug}/(tabs)`} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      <NeedHelpLink />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, zIndex: 10 },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    textDecorationLine: 'underline',
  },
});
