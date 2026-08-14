import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { posthog } from '../../lib/posthog';
import { PULSE_COLORS } from '../../constants/colors';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorBanner from '../../components/ui/ErrorBanner';

type Match = {
  invite_id: string;
  token: string;
  player_name: string | null;
  team_name: string;
  club_name: string;
  invite_role: string;
};

export default function InviteMatchScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('find_my_pending_invites').then(({ data }) => {
      const rows = (data ?? []) as Match[];
      if (rows.length === 0) {
        router.replace('/(auth)/role-select');
        return;
      }
      setMatches(rows);
      setSelected(new Set(rows.map((r) => r.invite_id)));
      setLoading(false);
    });
  }, [router]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleJoin() {
    setError(null);
    const chosen = matches.filter((m) => selected.has(m.invite_id));
    if (chosen.length === 0) return;
    setJoining(true);

    let lastSlug: string | null = null;
    for (const match of chosen) {
      const { data, error: rpcError } = await supabase.rpc('accept_invite', { p_token: match.token });
      if (rpcError) {
        setJoining(false);
        setError(`Could not join ${match.team_name}. Please try again.`);
        return;
      }
      const slug = (data as { club_slug?: string } | null)?.club_slug;
      if (slug) lastSlug = slug;
    }

    posthog.capture('onboarding_completed', { path: 'invite_automatch', count: chosen.length });
    await refreshProfile();
    setJoining(false);
    if (lastSlug) {
      router.replace(`/(app)/${lastSlug}/(tabs)` as never);
    } else {
      router.replace('/(auth)/profile-setup');
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PULSE_COLORS.brand.green} />
      </View>
    );
  }

  const multiple = matches.length > 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-done-circle" size={30} color={PULSE_COLORS.brand.green} />
      </View>
      <Text style={styles.heading}>{multiple ? 'We found your invites' : 'We found your invite'}</Text>
      <Text style={styles.subheading}>
        {multiple ? 'Join one or both — you can always add more later.' : 'Is this you?'}
      </Text>

      {error && <ErrorBanner message={error} />}

      <View style={styles.cards}>
        {matches.map((m) => {
          const checked = selected.has(m.invite_id);
          return (
            <TouchableOpacity
              key={m.invite_id}
              style={[styles.card, checked && styles.cardChecked]}
              onPress={() => toggle(m.invite_id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>
                  {m.player_name ?? (m.invite_role === 'coach' ? 'Coach' : 'You')} — {m.team_name}
                </Text>
                <Text style={styles.cardSubtitle}>{m.club_name}</Text>
              </View>
              <Ionicons
                name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={checked ? PULSE_COLORS.brand.green : PULSE_COLORS.ui.muted}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <PrimaryButton
        title={joining ? 'Joining…' : selected.size > 1 ? `Join ${selected.size} teams` : 'Join'}
        onPress={handleJoin}
        loading={joining}
        disabled={selected.size === 0}
        style={styles.joinButton}
      />

      <TouchableOpacity onPress={() => router.replace('/(auth)/role-select')} style={styles.notMeLink}>
        <Text style={styles.notMeText}>That&apos;s not me</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background, paddingHorizontal: 24 },
  center: { flex: 1, backgroundColor: PULSE_COLORS.ui.background, alignItems: 'center', justifyContent: 'center' },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  heading: { fontSize: 26, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 6 },
  subheading: { fontSize: 15, color: PULSE_COLORS.ui.textSecondary, marginBottom: 28 },
  cards: { gap: 10, marginBottom: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 16,
  },
  cardChecked: { borderColor: PULSE_COLORS.brand.green, backgroundColor: 'rgba(34,197,94,0.06)' },
  cardText: { flex: 1, paddingRight: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 3 },
  cardSubtitle: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary },
  joinButton: { marginTop: 20 },
  notMeLink: { alignItems: 'center', marginTop: 20 },
  notMeText: { color: PULSE_COLORS.ui.muted, fontSize: 13, textDecorationLine: 'underline' },
});
