import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';

// Every call site across the auth flow (login, register, create-team,
// find-team, reset-password, profile-setup) uses this exclusively for
// actionable errors, never a success/info toast — it used to auto-fade to
// invisible after 4 seconds with no way to recall it (the container stayed
// in the layout, leaving an empty gap, but the message itself vanished).
// Errors that require the user to actually do something shouldn't
// disappear on a timer; it stays visible for as long as the parent keeps
// its `error` state set, and goes away naturally once that's cleared
// (typically on the next attempt).
export default function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle" size={16} color={PULSE_COLORS.status.error} style={styles.icon} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: PULSE_COLORS.status.error,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  icon: { marginTop: 1, flexShrink: 0 },
  text: {
    color: PULSE_COLORS.status.error,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
