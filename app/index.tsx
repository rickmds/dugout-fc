import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useTeam } from '../hooks/useTeam';
import { useTheme } from '../hooks/useTheme';
import { PULSE_COLORS, ThemeColors } from '../constants/colors';

export default function Index() {
  const { session, club, loading, sessionCheckFailed, retrySessionCheck } = useAuth();
  const { allTeams, loading: teamsLoading, getActiveTeamId } = useTeam();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Also wait on TeamContext once there's a confirmed session — it's what
  // knows which team was actually last active, which the redirect below
  // needs before it can safely land anywhere other than the profile's own
  // home club.
  if (loading || (session && teamsLoading)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={PULSE_COLORS.brand.green} size="large" />
      </View>
    );
  }

  // We couldn't CONFIRM a session within the timeout budget — not the same
  // as confirmed-signed-out. A real session may still be sitting in
  // storage; sending straight to the welcome/login screen here would look
  // like a forced sign-out for what's often just a slow connection.
  if (sessionCheckFailed) {
    return (
      <View style={styles.loading}>
        <Text style={styles.retryTitle}>Couldn't connect</Text>
        <Text style={styles.retrySubtitle}>Check your connection and try again.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={retrySessionCheck} activeOpacity={0.85}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (club) {
    // Land on whichever club the last-active TEAM actually belongs to, not
    // always the profile's own home club — for a coach/org_admin whose
    // active team is at a second club (reached via team_members, not
    // profile.club_id), always redirecting here to the home club's slug
    // meant ClubSlugGuard then "corrected" the mismatch it saw by switching
    // the ACTIVE TEAM SELECTION to match this URL instead — a real,
    // persisted switch away from whatever team was actually in use, on
    // every single cold launch.
    const activeTeam = allTeams.find((t) => t.id === getActiveTeamId());
    const slug = activeTeam?.club?.slug ?? club.slug;
    return <Redirect href={`/(app)/${slug}/(tabs)`} />;
  }

  return <Redirect href="/(auth)/find-team" />;
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loading: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    retryTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 4 },
    retrySubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 6, textAlign: 'center' },
    retryBtn: {
      marginTop: 20, paddingHorizontal: 24, paddingVertical: 12,
      borderRadius: 12, backgroundColor: PULSE_COLORS.brand.green,
    },
    retryBtnText: { fontSize: 14, fontWeight: '800', color: '#06210F' },
  });
}
