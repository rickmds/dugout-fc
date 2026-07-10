import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { signInWithApple, signInWithGoogle } from '../../lib/auth';
import { PULSE_COLORS } from '../../constants/colors';
import AuthInput from '../../components/ui/AuthInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import SocialButton from '../../components/ui/SocialButton';
import ErrorBanner from '../../components/ui/ErrorBanner';

function mapAuthError(message: string): string {
  if (message.includes('User already registered')) return 'An account with this email already exists.';
  return message;
}

async function acceptInviteIfPending(): Promise<string | null> {
  const token = await AsyncStorage.getItem('pendingInviteToken');
  if (!token) return null;
  await AsyncStorage.removeItem('pendingInviteToken');
  const { data, error: rpcError } = await supabase.rpc('accept_invite', { p_token: token });
  if (rpcError) return null;
  return (data as { club_slug?: string } | null)?.club_slug ?? null;
}

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);

  async function routeAfterRegister() {
    const clubSlug = await acceptInviteIfPending();
    if (!clubSlug) {
      router.replace('/(auth)/find-team');
      return;
    }
    router.replace(`/(app)/${clubSlug}/(tabs)` as never);
  }

  async function handleRegister() {
    setError(null);

    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);

    if (signUpError) {
      setError(mapAuthError(signUpError.message));
      return;
    }

    if (data.user && !data.session) {
      setError('Check your email and click the confirmation link, then log in to continue.');
      return;
    }

    if (data.user) {
      await routeAfterRegister();
    }
  }

  async function handleGoogle() {
    setError(null);
    setSocialLoading('google');
    try {
      await signInWithGoogle();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setSocialLoading(null);
        return;
      }
      await routeAfterRegister();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      setSocialLoading(null);
    }
  }

  async function handleApple() {
    setError(null);
    setSocialLoading('apple');
    try {
      await signInWithApple();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setSocialLoading(null);
        return;
      }
      await routeAfterRegister();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apple sign-in failed.');
    } finally {
      setSocialLoading(null);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}>
          <Image source={require('../../assets/icon.png')} style={styles.brandLogo} />
          <Text style={styles.brandName}>Pulse<Text style={{ color: '#22C55E' }}>FC</Text></Text>
        </View>
        <Text style={styles.heading}>Create account</Text>

        {error && <ErrorBanner message={error} />}

        <AuthInput label="Full name" value={fullName} onChangeText={setFullName} placeholder="Jane Smith" />
        <AuthInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <AuthInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureToggle
          placeholder="At least 8 characters"
        />

        <PrimaryButton title="Create account" onPress={handleRegister} loading={loading} style={styles.createButton} />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <SocialButton provider="google" onPress={handleGoogle} loading={socialLoading === 'google'} />
        <SocialButton provider="apple" onPress={handleApple} loading={socialLoading === 'apple'} />

        <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.switchLink}>
          <Text style={styles.switchText}>
            Already have an account? <Text style={styles.switchTextBold}>Log in</Text>
          </Text>
        </TouchableOpacity>

        <Text style={styles.terms}>By creating an account you agree to our Terms of Service</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: PULSE_COLORS.ui.background,
  },
  container: {
    padding: 24,
    paddingTop: 70,
  },
  brandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 32,
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
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
    marginBottom: 24,
  },
  createButton: {
    marginTop: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: PULSE_COLORS.ui.border,
  },
  dividerText: {
    color: PULSE_COLORS.ui.textSecondary,
    marginHorizontal: 12,
    fontSize: 13,
  },
  switchLink: {
    marginTop: 28,
    alignItems: 'center',
  },
  switchText: {
    color: PULSE_COLORS.ui.textSecondary,
    fontSize: 14,
  },
  switchTextBold: {
    color: PULSE_COLORS.brand.green,
    fontWeight: '700',
  },
  terms: {
    color: PULSE_COLORS.ui.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
});
