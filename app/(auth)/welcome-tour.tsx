import { useRef, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View, type ViewToken } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { posthog } from '../../lib/posthog';
import { PULSE_COLORS } from '../../constants/colors';
import { ROLE_CONTENT, type RoleKey } from '../../constants/roleContent';
import PrimaryButton from '../../components/ui/PrimaryButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Shown once, the first time someone actually reaches the app (triggered
// centrally from (app)/_layout.tsx, not chained off any one join path) —
// a quick swipeable run-through before they land on Home for real.
export default function WelcomeTourScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, club } = useAuth();
  const role: RoleKey = (profile?.role as RoleKey) in ROLE_CONTENT ? (profile!.role as RoleKey) : 'player';
  const content = ROLE_CONTENT[role];

  const slides = [
    { key: 'welcome', text: `Welcome to ${club?.name ?? 'your club'}!`, isTitle: true },
    ...content.benefits.map((b, i) => ({ key: `b${i}`, text: b, isTitle: false })),
  ];

  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  function goNext() {
    if (index >= slides.length - 1) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  function finish() {
    posthog.capture('onboarding_tour_completed', { role });
    router.replace('/(auth)/profile-setup');
  }

  function skip() {
    posthog.capture('onboarding_tour_skipped', { role, atSlide: index });
    router.replace('/(auth)/profile-setup');
  }

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.topRow}>
        <View style={[styles.roleIconWrap, { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)' }]}>
          <Ionicons name={content.icon} size={16} color={PULSE_COLORS.brand.green} />
          <Text style={styles.roleIconText}>{content.title}</Text>
        </View>
        <TouchableOpacity onPress={skip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
            {item.isTitle ? (
              <Text style={styles.slideTitle}>{item.text}</Text>
            ) : (
              <>
                <View style={styles.checkWrap}>
                  <Ionicons name="checkmark-circle" size={40} color={PULSE_COLORS.brand.green} />
                </View>
                <Text style={styles.slideBody}>{item.text}</Text>
              </>
            )}
          </View>
        )}
      />

      <View style={styles.dots}>
        {slides.map((s, i) => (
          <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <PrimaryButton
        title={index >= slides.length - 1 ? "Let's finish setting up" : 'Next'}
        onPress={goNext}
        style={styles.nextButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background, paddingHorizontal: 24 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  roleIconWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  roleIconText: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.brand.green },
  skipText: { color: PULSE_COLORS.ui.muted, fontSize: 14, fontWeight: '600' },

  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  slideTitle: { fontSize: 28, fontWeight: '800', color: PULSE_COLORS.ui.text, textAlign: 'center' },
  checkWrap: { marginBottom: 20 },
  slideBody: { fontSize: 19, fontWeight: '600', color: PULSE_COLORS.ui.text, textAlign: 'center', lineHeight: 27 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12, marginBottom: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: PULSE_COLORS.ui.border },
  dotActive: { backgroundColor: PULSE_COLORS.brand.green, width: 18 },

  nextButton: { marginTop: 12 },
});
