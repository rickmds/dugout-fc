import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useTeam } from '../hooks/useTeam';
import { useTheme } from '../hooks/useTheme';
import { PULSE_COLORS, ThemeColors } from '../constants/colors';

// Every known stall in this screen's own chain (getSession, the profile
// fetch, the teams fetch) already has its own timeout — but that's exactly
// the kind of guarantee that's only as good as this file's knowledge of
// every path through two other hooks' internals, and already missed one
// real gap once (TeamContext's loading flag). Rather than keep chasing
// each new way this chain could stall, this is an unconditional ceiling on
// the one thing that actually matters: never leave someone looking at a
// bare, un-actionable spinner. If still gated past this many ms, show
// Retry regardless of which upstream flag technically caused it — the
// same "stop trusting the chain to always resolve, force an exit instead"
// fix already applied to the splash video for the same underlying reason.
const STUCK_TOO_LONG_MS = 12000;

export default function Index() {
  const { session, club, loading, sessionCheckFailed, retrySessionCheck } = useAuth();
  const { allTeams, loading: teamsLoading, teamsLoadError, refetch: retryTeamsFetch, getActiveTeamId } = useTeam();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const gated = loading || !!(session && teamsLoading);
  const [stuckTooLong, setStuckTooLong] = useState(false);
  const gatedSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gated) {
      gatedSinceRef.current = null;
      setStuckTooLong(false);
      return;
    }
    if (gatedSinceRef.current == null) gatedSinceRef.current = Date.now();
    const elapsed = Date.now() - gatedSinceRef.current;
    const t = setTimeout(() => setStuckTooLong(true), Math.max(0, STUCK_TOO_LONG_MS - elapsed));
    return () => clearTimeout(t);
  }, [gated]);

  if (gated && stuckTooLong) {
    return (
      <View style={styles.loading}>
        <Text style={styles.retryTitle}>This is taking longer than expected</Text>
        <Text style={styles.retrySubtitle}>Check your connection and try again.</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => { setStuckTooLong(false); gatedSinceRef.current = null; retrySessionCheck(); if (session) retryTeamsFetch(); }}
          activeOpacity={0.85}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Also wait on TeamContext once there's a confirmed session — it's what
  // knows which team was actually last active, which the redirect below
  // needs before it can safely land anywhere other than the profile's own
  // home club.
  if (gated) {
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

  // Same "couldn't confirm, not confirmed-empty" distinction as
  // sessionCheckFailed above, one step later in cold start — a stalled
  // team fetch used to leave the user on the bare spinner above forever,
  // with no way out short of force-quitting. See TeamContext.tsx's
  // teamsLoadError for the full reasoning.
  if (session && teamsLoadError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.retryTitle}>Couldn't connect</Text>
        <Text style={styles.retrySubtitle}>Check your connection and try again.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={retryTeamsFetch} activeOpacity={0.85}>
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
