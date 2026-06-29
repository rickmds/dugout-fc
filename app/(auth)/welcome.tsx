import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DUGOUT_COLORS } from '../../constants/colors';

const FEATURES = [
  { icon: 'calendar-outline' as const, label: 'Schedules & RSVPs', desc: 'Events in one place' },
  { icon: 'people-outline' as const, label: 'Roster Management', desc: 'Players, positions, contacts' },
  { icon: 'chatbubble-outline' as const, label: 'Team Chat', desc: 'Real-time group messaging' },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Background accent */}
      <View style={styles.bgAccentTop} />
      <View style={styles.bgAccentBottom} />

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {/* Logo mark */}
        <View style={styles.logoWrap}>
          <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
          <View style={styles.logoTextRow}>
            <Text style={styles.logoWord}>Dugout</Text>
            <Text style={styles.logoWordGreen}>FC</Text>
          </View>
          <Text style={styles.tagline}>Your club. Your game.</Text>
        </View>

        {/* Feature list */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.icon} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={20} color={DUGOUT_COLORS.brand.green} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* CTA buttons */}
      <Animated.View style={[styles.cta, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(auth)/register')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Get started</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push('/(auth)/login')}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Log in</Text>
        </TouchableOpacity>

        <Text style={styles.legalText}>By continuing you agree to our Terms of Service</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DUGOUT_COLORS.ui.background,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 100,
    paddingBottom: 50,
  },

  bgAccentTop: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(34,197,94,0.05)',
  },
  bgAccentBottom: {
    position: 'absolute',
    bottom: 80,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(34,197,94,0.04)',
  },

  content: {
    flex: 1,
    justifyContent: 'center',
  },

  logoWrap: {
    alignItems: 'flex-start',
    marginBottom: 52,
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: 16,
  },
  logoTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 6,
  },
  logoWord: {
    fontSize: 36,
    fontWeight: '900',
    color: DUGOUT_COLORS.ui.text,
    letterSpacing: -1,
  },
  logoWordGreen: {
    fontSize: 36,
    fontWeight: '900',
    color: DUGOUT_COLORS.brand.green,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: DUGOUT_COLORS.ui.textSecondary,
    fontWeight: '400',
  },

  features: {
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  featureIconWrap: {
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
  featureText: {
    flex: 1,
  },
  featureLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: DUGOUT_COLORS.ui.text,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    color: DUGOUT_COLORS.ui.textSecondary,
  },

  cta: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: DUGOUT_COLORS.brand.green,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DUGOUT_COLORS.ui.border,
  },
  secondaryBtnText: {
    color: DUGOUT_COLORS.ui.text,
    fontSize: 17,
    fontWeight: '700',
  },
  legalText: {
    color: DUGOUT_COLORS.ui.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
});
