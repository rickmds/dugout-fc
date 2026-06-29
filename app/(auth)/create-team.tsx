import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { DUGOUT_COLORS } from '../../constants/colors';
import AuthInput from '../../components/ui/AuthInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorBanner from '../../components/ui/ErrorBanner';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function CreateTeamScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [teamName, setTeamName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    if (!teamName.trim()) {
      setError('Please enter a team name.');
      return;
    }

    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
      setError('No active session found. Please sign out and sign in again.');
      setLoading(false);
      return;
    }

    const clubId = uuid();
    const teamId = uuid();
    const slug = `${toSlug(teamName.trim())}-${randomSuffix()}`;

    // 1. Set role to org_admin first so current_user_role() passes the clubs_insert policy
    const { error: roleErr } = await supabase
      .from('profiles')
      .update({ role: 'org_admin' })
      .eq('id', user.id);

    if (roleErr) {
      setError(`Account setup failed: ${roleErr.message}`);
      setLoading(false);
      return;
    }

    // 2. Insert club with pre-generated ID — no .select() needed so clubs_select policy is never hit
    const { error: clubErr } = await supabase
      .from('clubs')
      .insert({ id: clubId, name: teamName.trim(), slug });

    if (clubErr) {
      setError(`Failed to create club: ${clubErr.message}`);
      setLoading(false);
      return;
    }

    // 3. Attach club to profile so current_user_club_id() = clubId for the team insert
    await supabase
      .from('profiles')
      .update({ club_id: clubId })
      .eq('id', user.id);

    // 4. Insert team — club_id = current_user_club_id() now passes teams_insert policy
    const { error: teamErr } = await supabase
      .from('teams')
      .insert({ id: teamId, club_id: clubId, name: teamName.trim(), age_group: ageGroup.trim() || null });

    if (teamErr) {
      setError(`Failed to create team: ${teamErr.message}`);
      setLoading(false);
      return;
    }

    // 5. Add self as coach — is_team_coach() passes because current_user_role() = 'org_admin'
    await supabase
      .from('team_members')
      .insert({ team_id: teamId, profile_id: user.id, role: 'coach' });

    // Refresh auth context so useTeam picks up the new club_id immediately
    await refreshProfile();

    setLoading(false);
    router.replace(`/(app)/${slug}/(tabs)`);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>Set up your team</Text>
        <Text style={styles.subheading}>
          You'll be the manager. Invite players and parents once you're in.
        </Text>

        {error && <ErrorBanner message={error} />}

        <AuthInput
          label="Team name"
          value={teamName}
          onChangeText={setTeamName}
          placeholder="e.g. Riverside U10 Eagles"
        />

        <AuthInput
          label="Age group (optional)"
          value={ageGroup}
          onChangeText={setAgeGroup}
          placeholder="e.g. U10, U12, U14"
        />

        <PrimaryButton
          title="Create team & go to dashboard"
          onPress={handleCreate}
          loading={loading}
          style={styles.button}
        />
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
    padding: 24,
    paddingTop: 70,
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
    fontSize: 28,
    fontWeight: '800',
    color: DUGOUT_COLORS.ui.text,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    color: DUGOUT_COLORS.ui.textSecondary,
    marginBottom: 28,
  },
  button: {
    marginTop: 8,
  },
});
