import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { posthog } from '../../lib/posthog';
import { PULSE_COLORS } from '../../constants/colors';
import { resolveAccent, clubInitials, contrastText } from '../../lib/brandColor';
import PrimaryButton from '../../components/ui/PrimaryButton';

// Shown once, right after joining — mirrors the pre-login welcome.tsx's
// visual language (glow ring, staggered entrance, bold letter-spaced
// title) with the club's own branding instead of Pulse FC's. Deliberately
// a single static screen, not a carousel — nothing here scrolls
// horizontally, so there's no width-mismatch class of bug to worry about.
export default function ClubWelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { club } = useAuth();
  const accent = resolveAccent(club?.primary_color);
  const initials = clubInitials(club?.name);

  const crestAnim = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const ctaAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    posthog.capture('onboarding_welcome_viewed');
    Animated.stagger(160, [
      Animated.spring(crestAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.timing(titleAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(ctaAnim,   { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once on mount
  }, []);

  function continueToProfile() {
    posthog.capture('onboarding_welcome_continued');
    router.replace('/(auth)/profile-setup');
  }

  const crestScale = crestAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const titleY = titleAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.glowTopRight, { backgroundColor: `${accent}12` }]} />
      <View style={[styles.glowBottomLeft, { backgroundColor: `${accent}0d` }]} />

      <View style={styles.center}>
        <Animated.View style={{ opacity: crestAnim, transform: [{ scale: crestScale }] }}>
          <View style={[styles.crestRing, { borderColor: `${accent}33`, shadowColor: accent }]}>
            {club?.logo_url ? (
              <Image source={{ uri: club.logo_url }} style={styles.crestImage} />
            ) : (
              <View style={[styles.crestFallback, { backgroundColor: accent }]}>
                <Text style={[styles.crestInitials, { color: contrastText(accent) }]}>{initials}</Text>
              </View>
            )}
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: titleAnim, transform: [{ translateY: titleY }] }}>
          <Text style={styles.eyebrow}>WELCOME TO</Text>
          <Text
            style={styles.clubName}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {club?.name ?? 'your club'}
          </Text>
          <Text style={styles.subtitle}>You&rsquo;re in — let&rsquo;s get your profile set up.</Text>
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: ctaAnim }}>
        <PrimaryButton
          title="Continue"
          onPress={continueToProfile}
          color={accent}
          textColor={contrastText(accent)}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background, paddingHorizontal: 28, justifyContent: 'space-between' },

  glowTopRight: { position: 'absolute', top: -100, right: -100, width: 320, height: 320, borderRadius: 160 },
  glowBottomLeft: { position: 'absolute', bottom: 100, left: -120, width: 260, height: 260, borderRadius: 130 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 },

  crestRing: {
    width: 120, height: 120, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 30,
  },
  crestImage: { width: 96, height: 96, borderRadius: 20 },
  crestFallback: { width: 96, height: 96, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  crestInitials: { fontSize: 32, fontWeight: '800' },

  eyebrow: {
    fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 2, textAlign: 'center', marginBottom: 6,
  },
  clubName: {
    fontSize: 40, fontWeight: '900', color: PULSE_COLORS.ui.text,
    letterSpacing: -1, textAlign: 'center', lineHeight: 44,
  },
  subtitle: {
    fontSize: 15, fontWeight: '500', color: PULSE_COLORS.ui.textSecondary,
    textAlign: 'center', marginTop: 12,
  },
});
