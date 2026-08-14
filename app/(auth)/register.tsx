import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { signInWithApple, signInWithGoogle } from '../../lib/auth';
import { routeAfterAuth } from '../../lib/authRouting';
import { PULSE_COLORS } from '../../constants/colors';
import AuthInput from '../../components/ui/AuthInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import SocialButton from '../../components/ui/SocialButton';
import ErrorBanner from '../../components/ui/ErrorBanner';

function mapAuthError(message: string): string {
  if (message.includes('User already registered')) return 'An account with this email already exists.';
  return message;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  async function routeAfterRegister(userId: string, isSso = false) {
    const result = await routeAfterAuth(router, userId, refreshProfile, { isSso });
    if (result.type === 'error' || result.type === 'info') {
      // register.tsx has no separate info banner — an org_admin mid-web-setup
      // account can't actually reach this screen (the email would already be
      // registered), so surfacing it via the error banner is a safe fallback.
      setError(result.message);
    }
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
      setAwaitingConfirmation(true);
      return;
    }

    if (data.user) {
      await routeAfterRegister(data.user.id);
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
      await routeAfterRegister(data.user.id, true);
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
      await routeAfterRegister(data.user.id, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apple sign-in failed.');
    } finally {
      setSocialLoading(null);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    try {
      await supabase.auth.resend({ type: 'signup', email });
    } finally {
      setResendLoading(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brandMark}>
            <Image source={require('../../assets/icon.png')} style={styles.brandLogo} />
            <Text style={styles.brandName}>Pulse<Text style={{ color: '#22C55E' }}>FC</Text></Text>
          </View>
          <Text style={styles.heading}>Check your email</Text>
          <Text style={styles.confirmBody}>
            We sent a confirmation link to{'\n'}<Text style={styles.confirmEmail}>{email}</Text>
            {'\n\n'}Click the link in that email to activate your account, then come back here to log in.
          </Text>
          <PrimaryButton
            title={resendLoading ? 'Sending…' : 'Resend confirmation email'}
            onPress={handleResend}
            loading={resendLoading}
            style={styles.createButton}
          />
          <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.switchLink}>
            <Text style={styles.switchText}>
              Already confirmed? <Text style={styles.switchTextBold}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
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
        {Platform.OS === 'ios' && (
          <SocialButton provider="apple" onPress={handleApple} loading={socialLoading === 'apple'} />
        )}

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
  confirmBody: {
    fontSize: 15,
    color: PULSE_COLORS.ui.textSecondary,
    lineHeight: 22,
    marginBottom: 28,
  },
  confirmEmail: {
    color: PULSE_COLORS.ui.text,
    fontWeight: '700',
  },
});
