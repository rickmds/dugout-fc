import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { DUGOUT_COLORS } from '../../constants/colors';
import AuthInput from '../../components/ui/AuthInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorBanner from '../../components/ui/ErrorBanner';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleReset() {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark-circle" size={56} color={DUGOUT_COLORS.brand.green} />
          </View>
          <Text style={styles.doneTitle}>Password updated</Text>
          <Text style={styles.doneSub}>You can now log in with your new password.</Text>
          <PrimaryButton
            title="Go to Log In"
            onPress={() => router.replace('/(auth)/login')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(auth)/login')}>
            <Ionicons name="chevron-back" size={22} color={DUGOUT_COLORS.ui.text} />
          </TouchableOpacity>

          <Text style={styles.title}>Set new password</Text>
          <Text style={styles.sub}>Choose a strong password for your account.</Text>

          {error && <ErrorBanner message={error} />}

          <AuthInput
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureToggle
            placeholder="At least 8 characters"
            autoFocus
          />
          <AuthInput
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureToggle
            placeholder="Repeat your new password"
          />

          <PrimaryButton
            title="Update password"
            onPress={handleReset}
            loading={loading}
            disabled={!password || !confirm}
          />

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            style={styles.backLinkBtn}
          >
            <Text style={styles.backLinkText}>Back to log in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  scroll: { padding: 24, paddingTop: 16, paddingBottom: 60 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 30, fontWeight: '800', color: DUGOUT_COLORS.ui.text,
    letterSpacing: -0.5, marginBottom: 8,
  },
  sub: {
    fontSize: 15, color: DUGOUT_COLORS.ui.textSecondary,
    lineHeight: 22, marginBottom: 32,
  },
  backLinkBtn: { alignItems: 'center', marginTop: 20 },
  backLinkText: { color: DUGOUT_COLORS.ui.muted, fontSize: 14, fontWeight: '500' },
  doneWrap: {
    flex: 1, justifyContent: 'center',
    padding: 32, gap: 12,
  },
  doneIcon: { marginBottom: 8 },
  doneTitle: {
    fontSize: 28, fontWeight: '800', color: DUGOUT_COLORS.ui.text, letterSpacing: -0.5,
  },
  doneSub: {
    fontSize: 15, color: DUGOUT_COLORS.ui.textSecondary,
    lineHeight: 22, marginBottom: 12,
  },
});
