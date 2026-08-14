import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { posthog } from '../../lib/posthog';
import { PULSE_COLORS } from '../../constants/colors';
import { ROLE_CONTENT, type RoleKey } from '../../constants/roleContent';
import PrimaryButton from '../../components/ui/PrimaryButton';

export default function RoleBenefitsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role: roleParam } = useLocalSearchParams<{ role: string }>();
  const role: RoleKey = (roleParam as RoleKey) in ROLE_CONTENT ? (roleParam as RoleKey) : 'player';
  const [loading, setLoading] = useState(false);
  const content = ROLE_CONTENT[role];

  async function handleContinue() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      if (role === 'player') {
        // Never downgrade an already-elevated role — mirrors the same
        // non-downgrade guard accept_invite uses.
        const { data: current } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (!current?.role || !['coach', 'org_admin', 'app_admin'].includes(current.role)) {
          await supabase.from('profiles').update({ role: 'player' }).eq('id', session.user.id);
        }
      } else {
        await supabase.from('profiles').update({ role }).eq('id', session.user.id);
      }
    }
    posthog.capture('onboarding_role_selected', { role });
    setLoading(false);

    if (role === 'org_admin') { router.replace('/(auth)/create-team' as never); return; }
    if (role === 'coach') { router.replace('/(auth)/coach-options'); return; }
    router.replace('/(auth)/find-team');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={20} color={PULSE_COLORS.brand.green} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.iconWrap}>
        <Ionicons name={content.icon} size={28} color={PULSE_COLORS.brand.green} />
      </View>
      <Text style={styles.heading}>{content.title}</Text>
      <Text style={styles.subheading}>Here&apos;s what you get</Text>

      <View style={styles.list}>
        {content.benefits.map((b) => (
          <View key={b} style={styles.row}>
            <Ionicons name="checkmark-circle" size={18} color={PULSE_COLORS.brand.green} style={styles.rowIcon} />
            <Text style={styles.rowText}>{b}</Text>
          </View>
        ))}
      </View>

      <PrimaryButton title="Continue" onPress={handleContinue} loading={loading} style={styles.continueButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background, paddingHorizontal: 24 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 28 },
  backText: { color: PULSE_COLORS.brand.green, fontSize: 16, fontWeight: '600' },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  heading: { fontSize: 26, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 6 },
  subheading: { fontSize: 15, color: PULSE_COLORS.ui.textSecondary, marginBottom: 28 },
  list: { gap: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowIcon: { marginTop: 1 },
  rowText: { flex: 1, fontSize: 15, color: PULSE_COLORS.ui.text, lineHeight: 21 },
  continueButton: { marginTop: 32 },
});
