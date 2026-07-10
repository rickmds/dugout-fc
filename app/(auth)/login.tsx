import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { signInWithApple, signInWithGoogle } from '../../lib/auth';
import { PULSE_COLORS } from '../../constants/colors';
import AuthInput from '../../components/ui/AuthInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import SocialButton from '../../components/ui/SocialButton';
import ErrorBanner from '../../components/ui/ErrorBanner';

function mapAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'Email or password is incorrect.';
  if (message.includes('Email not confirmed')) return 'Please confirm your email before logging in.';
  return message;
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [hasPendingInvite, setHasPendingInvite] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('pendingInviteToken').then((t) => setHasPendingInvite(!!t));
  }, []);

  async function routeAfterAuth(userId: string) {
    const token = await AsyncStorage.getItem('pendingInviteToken');
    if (token) {
      await AsyncStorage.removeItem('pendingInviteToken');
      const { data, error: rpcError } = await supabase.rpc('accept_invite', { p_token: token });
      if (rpcError) { setLoading(false); setError('Failed to accept invite. Please try again.'); return; }
      const slug = (data as { club_slug?: string } | null)?.club_slug;
      if (!slug) { setLoading(false); setError('Club not found. Please contact your coach.'); return; }
      router.replace(`/(app)/${slug}/(tabs)` as never);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, club_id')
      .eq('id', userId)
      .single();

    if (profileError) { setError('Failed to load your profile. Please try again.'); return; }

    if (profile?.club_id) {
      const { data: club, error: clubError } = await supabase.from('clubs').select('slug').eq('id', profile.club_id).single();
      if (clubError) { setError('Failed to load your club. Please try again.'); return; }
      if (club?.slug) {
        router.replace(`/(app)/${club.slug}/(tabs)`);
        return;
      }
    }

    if (!profile?.role) {
      router.replace('/(auth)/role-select');
      return;
    }

    if (profile.role === 'org_admin') {
      setInfo('Your club setup is not finished yet. Please visit pulse-fc.app/onboarding to finish setting up your club.');
      return;
    }

    router.replace('/(auth)/find-team');
  }

  async function handleLogin() {
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) { setError(mapAuthError(signInError.message)); return; }
    if (data.user) await routeAfterAuth(data.user.id);
  }

  async function handleForgotPassword() {
    setError(null);
    setInfo(null);
    if (!email) {
      setError('Enter your email above first, then tap "Forgot password?"');
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/reset-password'),
    });
    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setInfo('Check your email for a link to reset your password.');
  }

  async function handleGoogle() {
    setError(null); setInfo(null);
    setSocialLoading('google');
    try {
      await signInWithGoogle();
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await routeAfterAuth(data.user.id);
      } else {
        setSocialLoading(null);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally { setSocialLoading(null); }
  }

  async function handleApple() {
    setError(null); setInfo(null);
    setSocialLoading('apple');
    try {
      await signInWithApple();
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await routeAfterAuth(data.user.id);
      } else {
        setSocialLoading(null);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apple sign-in failed.');
    } finally { setSocialLoading(null); }
  }

  return (
    <SafeAreaView style={st.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={st.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Hero ── */}
          <View style={st.hero}>
            <View style={st.logoGlow}>
              <View style={st.logoRing}>
                <Image source={require('../../assets/icon.png')} style={st.logo} />
              </View>
            </View>
            <Text style={st.wordmark}>
              Pulse<Text style={st.wordmarkAccent}>FC</Text>
            </Text>
            <Text style={st.tagline}>Soccer club management</Text>
          </View>

          {/* ── Pending invite ── */}
          {hasPendingInvite && (
            <View style={st.inviteBanner}>
              <View style={st.inviteDot} />
              <Text style={st.inviteText}>You've been invited to join a team. Log in to accept.</Text>
            </View>
          )}

          {/* ── Heading ── */}
          <Text style={st.heading}>Welcome back</Text>
          <Text style={st.subheading}>Sign in to your account</Text>

          {/* ── Feedback ── */}
          {error && <ErrorBanner message={error} />}
          {info && (
            <View style={st.infoBanner}>
              <Text style={st.infoText}>{info}</Text>
            </View>
          )}

          {/* ── Form ── */}
          <View style={st.form}>
            <AuthInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              placeholder="you@example.com"
            />

            <View>
              <View style={st.passwordHeader}>
                <Text style={st.passwordLabel}>Password</Text>
                <TouchableOpacity onPress={handleForgotPassword} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={st.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              <AuthInput
                label=""
                value={password}
                onChangeText={setPassword}
                secureToggle
                placeholder="••••••••"
              />
            </View>
          </View>

          <PrimaryButton title="Log in" onPress={handleLogin} loading={loading} />

          {/* ── Divider ── */}
          <View style={st.divider}>
            <View style={st.dividerLine} />
            <Text style={st.dividerText}>or continue with</Text>
            <View style={st.dividerLine} />
          </View>

          {/* ── Social ── */}
          <SocialButton provider="apple" onPress={handleApple} loading={socialLoading === 'apple'} />
          <SocialButton provider="google" onPress={handleGoogle} loading={socialLoading === 'google'} />

          {/* ── Register ── */}
          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={st.registerLink} activeOpacity={0.7}>
            <Text style={st.registerText}>
              Don&apos;t have an account?{'  '}
              <Text style={st.registerBold}>Create one</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root:  { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  flex:  { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },

  // Hero
  hero: { alignItems: 'center', paddingTop: 40, paddingBottom: 36 },
  logoGlow: {
    width: 96, height: 96,
    borderRadius: 28,
    backgroundColor: 'rgba(34,197,94,0.08)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  logoRing: {
    width: 76, height: 76,
    borderRadius: 20,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 76, height: 76, borderRadius: 20 },
  wordmark: {
    fontSize: 28,
    fontWeight: '900',
    color: PULSE_COLORS.ui.text,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  wordmarkAccent: { color: PULSE_COLORS.brand.green },
  tagline: {
    fontSize: 14,
    color: PULSE_COLORS.ui.muted,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Invite banner
  inviteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: 12, padding: 14, marginBottom: 20,
  },
  inviteDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: PULSE_COLORS.brand.green, flexShrink: 0,
  },
  inviteText: { color: PULSE_COLORS.brand.green, fontSize: 14, lineHeight: 20, flex: 1 },

  // Heading
  heading:    { fontSize: 26, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  subheading: { fontSize: 14, color: PULSE_COLORS.ui.muted, marginBottom: 24 },

  // Info
  infoBanner: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: 12, padding: 14, marginBottom: 16,
  },
  infoText: { color: PULSE_COLORS.brand.green, fontSize: 14, lineHeight: 20 },

  // Form
  form: { gap: 4, marginBottom: 4 },
  passwordHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6,
  },
  passwordLabel: { fontSize: 13, fontWeight: '500', color: PULSE_COLORS.ui.textSecondary },
  forgotText:    { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.brand.green },

  // Divider
  divider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 24, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: PULSE_COLORS.ui.border },
  dividerText: { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  // Register
  registerLink: { marginTop: 32, alignItems: 'center' },
  registerText: { fontSize: 14, color: PULSE_COLORS.ui.muted },
  registerBold: { color: PULSE_COLORS.brand.green, fontWeight: '700' },
});
