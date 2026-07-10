import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { PULSE_COLORS } from '../constants/colors';

export default function Index() {
  const { session, club, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={PULSE_COLORS.brand.green} size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (club) {
    return <Redirect href={`/(app)/${club.slug}/(tabs)`} />;
  }

  return <Redirect href="/(auth)/find-team" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: PULSE_COLORS.ui.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
