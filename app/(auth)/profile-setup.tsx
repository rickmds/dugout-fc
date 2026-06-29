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
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { DUGOUT_COLORS } from '../../constants/colors';
import AuthInput from '../../components/ui/AuthInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorBanner from '../../components/ui/ErrorBanner';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { user, profile, club, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function finishAndRedirect() {
    await refreshProfile();
    if (club) {
      router.replace(`/(app)/${club.slug}/(tabs)`);
    } else {
      router.replace('/(auth)/find-team');
    }
  }

  async function handleContinue() {
    if (!user) return;
    setError(null);
    setLoading(true);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null })
      .eq('id', user.id);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await finishAndRedirect();
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Almost there!</Text>
        <Text style={styles.subheading}>Set up your profile</Text>

        {error && <ErrorBanner message={error} />}

        <AuthInput label="Full name" value={fullName} onChangeText={setFullName} placeholder="Jane Smith" />

        <PrimaryButton title="Let's go" onPress={handleContinue} loading={loading} style={styles.continueButton} />

        <TouchableOpacity onPress={finishAndRedirect} style={styles.skipLink}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: DUGOUT_COLORS.ui.background,
  },
  container: {
    padding: 16,
    paddingTop: 80,
    alignItems: 'stretch',
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: DUGOUT_COLORS.ui.text,
    textAlign: 'center',
  },
  subheading: {
    fontSize: 15,
    color: DUGOUT_COLORS.ui.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 32,
  },
  continueButton: {
    marginTop: 12,
  },
  skipLink: {
    alignItems: 'center',
    marginTop: 20,
  },
  skipText: {
    color: DUGOUT_COLORS.ui.muted,
    fontSize: 13,
  },
});
