import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';

const { width } = Dimensions.get('window');

const FEATURES = [
  { icon: 'calendar-outline' as const, label: 'Schedules' },
  { icon: 'people-outline' as const, label: 'Roster' },
  { icon: 'chatbubble-outline' as const, label: 'Chat' },
  { icon: 'trophy-outline' as const, label: 'Lineups' },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const logoAnim    = useRef(new Animated.Value(0)).current;
  const titleAnim   = useRef(new Animated.Value(0)).current;
  const featureAnim = useRef(new Animated.Value(0)).current;
  const ctaAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(160, [
      Animated.spring(logoAnim,    { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.timing(titleAnim,   { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(featureAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(ctaAnim,     { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const logoScale = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const titleY    = titleAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const featureY  = featureAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
      {/* Background glows */}
      <View style={styles.glowTopRight} />
      <View style={styles.glowBottomLeft} />

      {/* Logo */}
      <Animated.View style={[styles.logoSection, { opacity: logoAnim, transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoGlowRing}>
          <Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
      </Animated.View>

      {/* Title + tagline */}
      <Animated.View style={[styles.titleSection, { opacity: titleAnim, transform: [{ translateY: titleY }] }]}>
        <Text style={styles.appName}>
          PULSE<Text style={styles.appNameGreen}> FC</Text>
        </Text>
        <Text style={styles.tagline}>Built for the pitch. Built for your club.</Text>
      </Animated.View>

      {/* Feature chips */}
      <Animated.View style={[styles.chipsRow, { opacity: featureAnim, transform: [{ translateY: featureY }] }]}>
        {FEATURES.map((f) => (
          <View key={f.label} style={styles.chip}>
            <Ionicons name={f.icon} size={16} color={PULSE_COLORS.brand.green} />
            <Text style={styles.chipLabel}>{f.label}</Text>
          </View>
        ))}
      </Animated.View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* CTA */}
      <Animated.View style={[styles.cta, { opacity: ctaAnim }]}>
        <TouchableOpacity onPress={() => router.push('/(auth)/register')} activeOpacity={0.88}>
          <LinearGradient
            colors={['#28D464', '#16A34A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Get started</Text>
            <Ionicons name="arrow-forward" size={18} color="#000" style={{ marginLeft: 6 }} />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push('/(auth)/login')}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Already have an account? <Text style={styles.secondaryBtnHighlight}>Log in</Text></Text>
        </TouchableOpacity>

        <Text style={styles.legalText}>By continuing you agree to our Terms of Service</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    paddingHorizontal: 28,
    justifyContent: 'center',
    gap: 36,
  },

  glowTopRight: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(34,197,94,0.07)',
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: 100,
    left: -120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(34,197,94,0.05)',
  },

  logoSection: {
    alignItems: 'center',
  },
  logoGlowRing: {
    width: 120,
    height: 120,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  logoImage: {
    width: 96,
    height: 96,
    borderRadius: 20,
  },

  titleSection: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 42,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  appNameGreen: {
    color: PULSE_COLORS.brand.green,
  },
  tagline: {
    fontSize: 15,
    color: PULSE_COLORS.ui.textSecondary,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 0.1,
  },

  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.18)',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: PULSE_COLORS.ui.text,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 12,
  },

  cta: {
    gap: 12,
  },
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: PULSE_COLORS.ui.muted,
    fontSize: 15,
    fontWeight: '500',
  },
  secondaryBtnHighlight: {
    color: '#fff',
    fontWeight: '700',
  },
  legalText: {
    color: PULSE_COLORS.ui.muted,
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.6,
  },
});
