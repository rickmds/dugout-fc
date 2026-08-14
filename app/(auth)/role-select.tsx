import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { PULSE_COLORS } from '../../constants/colors';

type RoleKey = 'org_admin' | 'coach' | 'player';

const ROLES: {
  key: RoleKey;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'org_admin',
    icon: 'shield-outline',
    title: 'Club Admin',
    subtitle: 'Set up and manage your soccer club',
  },
  {
    key: 'coach',
    icon: 'clipboard-outline',
    title: 'Coach',
    subtitle: 'Manage your team, events, and roster',
  },
  {
    key: 'player',
    icon: 'person-outline',
    title: 'Parent / Player',
    subtitle: 'View schedules, RSVP, and stay connected',
  },
];

export default function RoleSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function handleSelect(role: RoleKey) {
    // The role write and final destination now live in role-benefits.tsx —
    // this screen only decides which role's benefits to show next.
    router.push({ pathname: '/(auth)/role-benefits', params: { role } } as never);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.brandMark}>
        <View style={styles.brandRing}>
          <Text style={styles.brandLetter}>D</Text>
        </View>
        <Text style={styles.brandName}>Pulse<Text style={{ color: PULSE_COLORS.brand.green }}>FC</Text></Text>
      </View>

      <Text style={styles.heading}>What's your role?</Text>
      <Text style={styles.subheading}>We'll tailor the experience for you.</Text>

      <View style={styles.cards}>
        {ROLES.map((role) => (
          <TouchableOpacity
            key={role.key}
            style={styles.card}
            onPress={() => handleSelect(role.key)}
            activeOpacity={0.75}
          >
            <View style={styles.cardIcon}>
              <Ionicons name={role.icon} size={22} color={PULSE_COLORS.brand.green} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{role.title}</Text>
              <Text style={styles.cardSubtitle}>{role.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome' as never); }} style={styles.signOutLink}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PULSE_COLORS.ui.background,
    paddingHorizontal: 24,
  },
  brandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 36,
  },
  brandRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PULSE_COLORS.brand.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLetter: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000',
  },
  brandName: {
    fontSize: 20,
    fontWeight: '900',
    color: PULSE_COLORS.ui.text,
    letterSpacing: -0.5,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: PULSE_COLORS.ui.text,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 15,
    color: PULSE_COLORS.ui.textSecondary,
    marginBottom: 32,
  },
  cards: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PULSE_COLORS.ui.text,
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: PULSE_COLORS.ui.textSecondary,
    lineHeight: 18,
  },
  signOutLink: {
    alignItems: 'center',
    marginTop: 32,
  },
  signOutText: {
    color: PULSE_COLORS.ui.muted,
    fontSize: 13,
  },
});
