import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { DUGOUT_COLORS } from '../../constants/colors';

const OPTIONS = [
  {
    key: 'create',
    emoji: '➕',
    title: 'Set up my own team',
    subtitle: 'Create a team and invite your players and parents',
  },
  {
    key: 'join',
    emoji: '🔍',
    title: 'Join an existing club',
    subtitle: 'Find your club and join as a coach',
  },
] as const;

export default function CoachOptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>How would you like to get started?</Text>
      <Text style={styles.subheading}>You can always add more teams later.</Text>

      <View style={styles.cards}>
        {OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={styles.card}
            activeOpacity={0.75}
            onPress={() =>
              opt.key === 'create'
                ? router.push('/(auth)/create-team')
                : router.push('/(auth)/find-team')
            }
          >
            <Text style={styles.cardEmoji}>{opt.emoji}</Text>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{opt.title}</Text>
              <Text style={styles.cardSubtitle}>{opt.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={() => supabase.auth.signOut()} style={styles.signOutLink}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DUGOUT_COLORS.ui.background,
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 24,
  },
  backText: {
    color: DUGOUT_COLORS.brand.green,
    fontSize: 16,
    fontWeight: '600',
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: DUGOUT_COLORS.ui.text,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    color: DUGOUT_COLORS.ui.textSecondary,
    marginBottom: 36,
  },
  cards: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1,
    borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  cardEmoji: {
    fontSize: 32,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: DUGOUT_COLORS.ui.text,
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: DUGOUT_COLORS.ui.textSecondary,
  },
  chevron: {
    fontSize: 24,
    color: DUGOUT_COLORS.ui.muted,
    fontWeight: '300',
  },
  signOutLink: {
    alignItems: 'center',
    marginTop: 36,
  },
  signOutText: {
    color: DUGOUT_COLORS.ui.muted,
    fontSize: 13,
  },
});
