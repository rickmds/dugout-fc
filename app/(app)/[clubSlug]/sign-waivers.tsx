import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../constants/colors';

type WaiverItem = {
  id: string;
  title: string;
  body: string;
  playerIds: string[];
  playerNames: string[];
};

export default function SignWaiversScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [waivers, setWaivers] = useState<WaiverItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [signedName, setSignedName] = useState('');
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) loadWaivers();
  }, [profile?.id]);

  async function loadWaivers() {
    setLoading(true);

    const { data: club } = await supabase
      .from('clubs')
      .select('id')
      .eq('slug', clubSlug)
      .single();

    if (!club) { goToHome(); return; }

    const { data: memberRows } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('profile_id', profile!.id);

    if (!memberRows?.length) { goToHome(); return; }

    const { data: clubTeams } = await supabase
      .from('teams')
      .select('id')
      .eq('club_id', club.id)
      .in('id', memberRows.map(r => r.team_id));

    if (!clubTeams?.length) { goToHome(); return; }

    const clubTeamIds = clubTeams.map(t => t.id);

    // get_my_guarded_players() also checks player_guardians — otherwise a
    // second guardian could never sign their own kid's required waivers.
    const { data: players } = await (supabase as any)
      .rpc('get_my_guarded_players')
      .select('id, full_name, team_id')
      .in('team_id', clubTeamIds);

    if (!players?.length) { goToHome(); return; }

    const playerIds = players.map((p: { id: string }) => p.id);

    const { data: assignments } = await supabase
      .from('waiver_assignments')
      .select('waiver_id, team_id, waivers(id, title, body)')
      .in('team_id', clubTeamIds);

    if (!assignments?.length) { goToHome(); return; }

    const { data: sigs } = await supabase
      .from('waiver_signatures')
      .select('waiver_id, player_id')
      .in('player_id', playerIds);

    const signed = new Set((sigs ?? []).map(s => `${s.waiver_id}:${s.player_id}`));

    const waiverMap = new Map<string, WaiverItem>();

    for (const a of assignments) {
      const w = a.waivers as { id: string; title: string; body: string } | null;
      if (!w) continue;

      const teamPlayers = players.filter((p: { team_id: string }) => p.team_id === a.team_id);
      const unsigned = teamPlayers.filter((p: { id: string }) => !signed.has(`${w.id}:${p.id}`));
      if (!unsigned.length) continue;

      if (waiverMap.has(w.id)) {
        const ex = waiverMap.get(w.id)!;
        unsigned.forEach((p: { id: string; full_name: string }) => {
          if (!ex.playerIds.includes(p.id)) {
            ex.playerIds.push(p.id);
            ex.playerNames.push(p.full_name);
          }
        });
      } else {
        waiverMap.set(w.id, {
          id: w.id,
          title: w.title,
          body: w.body,
          playerIds: unsigned.map((p: { id: string }) => p.id),
          playerNames: unsigned.map((p: { full_name: string }) => p.full_name),
        });
      }
    }

    const list = Array.from(waiverMap.values());
    if (!list.length) { goToHome(); return; }

    setWaivers(list);
    setLoading(false);
  }

  function goToHome() {
    router.replace(`/(app)/${clubSlug}/(tabs)` as never);
  }

  async function handleSign() {
    if (!signedName.trim()) {
      setError('Type your full name to sign.');
      return;
    }

    setSigning(true);
    setError(null);
    const waiver = waivers[currentIndex];

    try {
      const { error: insertError } = await supabase
        .from('waiver_signatures')
        .insert(waiver.playerIds.map(pid => ({
          waiver_id: waiver.id,
          player_id: pid,
          signed_by_name: signedName.trim(),
        })));

      if (insertError) throw insertError;

      if (currentIndex < waivers.length - 1) {
        setCurrentIndex(i => i + 1);
        setSignedName('');
      } else {
        goToHome();
      }
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={PULSE_COLORS.brand.green} size="large" />
      </View>
    );
  }

  const waiver = waivers[currentIndex];
  const isLast = currentIndex === waivers.length - 1;
  const total = waivers.length;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress */}
        {total > 1 && (
          <View style={styles.progressRow}>
            {waivers.map((_, i) => (
              <View key={i} style={[styles.progressDot, i <= currentIndex && styles.progressDotActive]} />
            ))}
          </View>
        )}

        {/* Header */}
        <Text style={styles.eyebrow}>
          {total > 1 ? `WAIVER ${currentIndex + 1} OF ${total}` : 'CLUB WAIVER'}
        </Text>
        <Text style={styles.heading}>{waiver.title}</Text>

        {waiver.playerNames.length > 0 && (
          <View style={styles.signingForRow}>
            <Text style={styles.signingForLabel}>Signing for: </Text>
            <Text style={styles.signingForName}>{waiver.playerNames.join(', ')}</Text>
          </View>
        )}

        {/* Body */}
        <View style={styles.bodyCard}>
          <Text style={styles.bodyText}>{waiver.body}</Text>
        </View>

        {/* Signature section */}
        <View style={styles.signSection}>
          <Text style={styles.signLabel}>Type your full name to sign</Text>
          <TextInput
            style={styles.nameInput}
            value={signedName}
            onChangeText={t => { setSignedName(t); setError(null); }}
            placeholder="Full name"
            placeholderTextColor={PULSE_COLORS.ui.muted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSign}
          />
          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            onPress={handleSign}
            disabled={signing || !signedName.trim()}
            activeOpacity={0.85}
            style={[styles.signButton, (!signedName.trim() || signing) && styles.signButtonDisabled]}
          >
            <Text style={styles.signButtonText}>
              {signing ? 'Signing…' : isLast ? 'Sign & Enter App' : 'Sign & Next Waiver'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={goToHome} style={styles.skipLink}>
          <Text style={styles.skipText}>Remind me later</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: PULSE_COLORS.ui.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    paddingHorizontal: 20,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 24,
  },
  progressDot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  progressDotActive: {
    backgroundColor: PULSE_COLORS.brand.green,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: PULSE_COLORS.brand.green,
    marginBottom: 8,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: PULSE_COLORS.ui.text,
    marginBottom: 12,
  },
  signingForRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  signingForLabel: {
    fontSize: 13,
    color: PULSE_COLORS.ui.textSecondary,
  },
  signingForName: {
    fontSize: 13,
    fontWeight: '600',
    color: PULSE_COLORS.ui.text,
  },
  bodyCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    padding: 16,
    marginBottom: 24,
    maxHeight: 340,
  },
  bodyText: {
    fontSize: 13,
    color: PULSE_COLORS.ui.textSecondary,
    lineHeight: 20,
  },
  signSection: {
    gap: 10,
    marginBottom: 20,
  },
  signLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: PULSE_COLORS.ui.text,
  },
  nameInput: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: PULSE_COLORS.ui.text,
  },
  errorText: {
    fontSize: 13,
    color: '#F87171',
  },
  signButton: {
    backgroundColor: PULSE_COLORS.brand.green,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  signButtonDisabled: {
    opacity: 0.4,
  },
  signButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  skipLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 13,
    color: PULSE_COLORS.ui.muted,
  },
});
