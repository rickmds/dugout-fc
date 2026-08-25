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
import { withTimeout, TIMEOUT } from '../../lib/withTimeout';
import { useAuth } from '../../hooks/useAuth';
import { PULSE_COLORS } from '../../constants/colors';
import AuthInput from '../../components/ui/AuthInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorBanner from '../../components/ui/ErrorBanner';

const AGE_GROUPS = ['U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19','Senior'];
const GENDERS: { value: string; label: string }[] = [
  { value: 'boys',  label: 'Boys'  },
  { value: 'girls', label: 'Girls' },
  { value: 'mixed', label: 'Mixed' },
];

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

export default function CreateTeamScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [teamName,  setTeamName]  = useState('');
  const [ageGroup,  setAgeGroup]  = useState('');
  const [gender,    setGender]    = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    if (!teamName.trim()) { setError('Please enter a team name.'); return; }

    setLoading(true);

    // Every write below is timeout-guarded (same pattern as login.tsx/
    // register.tsx) so a stalled connection surfaces as a retryable error
    // instead of a stuck spinner. The sequence is also resumable: retrying
    // after a partial failure reuses whatever club/team already got
    // created rather than inserting duplicates.
    const sessionResult = await withTimeout(supabase.auth.getSession(), 6000);
    if (sessionResult === TIMEOUT) {
      setError('This is taking longer than expected. Check your connection and try again.');
      setLoading(false);
      return;
    }
    const { data: { session } } = sessionResult;
    const user = session?.user;
    if (!user) { setError('No active session found. Please sign out and sign in again.'); setLoading(false); return; }

    const roleResult = await withTimeout(
      supabase.from('profiles').update({ role: 'org_admin' }).eq('id', user.id),
      6000
    );
    if (roleResult === TIMEOUT || roleResult.error) {
      setError("Couldn't set up your account. Check your connection and try again.");
      setLoading(false);
      return;
    }

    // Resumable step 1/2: if an earlier attempt already created a club and
    // linked it to this profile before failing on a later step, reuse it
    // instead of inserting a second, orphaned club.
    const profileResult = await withTimeout(
      supabase.from('profiles').select('club_id').eq('id', user.id).single(),
      6000
    );
    if (profileResult === TIMEOUT || profileResult.error) {
      setError('This is taking longer than expected. Check your connection and try again.');
      setLoading(false);
      return;
    }

    let clubId = profileResult.data?.club_id ?? null;
    let slug = '';

    if (clubId) {
      const clubResult = await withTimeout(supabase.from('clubs').select('slug').eq('id', clubId).single(), 6000);
      if (clubResult !== TIMEOUT && !clubResult.error && clubResult.data) {
        slug = clubResult.data.slug;
      } else {
        // The linked club vanished or couldn't be read — fall back to creating a fresh one below.
        clubId = null;
      }
    }

    if (!clubId) {
      const newSlug = `${toSlug(teamName.trim())}-${randomSuffix()}`;
      const clubResult = await withTimeout(
        supabase.from('clubs').insert({ name: teamName.trim(), slug: newSlug }).select('id, slug').single(),
        6000
      );
      if (clubResult === TIMEOUT || clubResult.error || !clubResult.data) {
        setError("Couldn't create your club. Check your connection and try again.");
        setLoading(false);
        return;
      }
      clubId = clubResult.data.id;
      slug = clubResult.data.slug;

      const profileClubResult = await withTimeout(
        supabase.from('profiles').update({ club_id: clubId }).eq('id', user.id),
        6000
      );
      if (profileClubResult === TIMEOUT || profileClubResult.error) {
        setError("Your club was created, but we couldn't finish linking it to your account. Check your connection, then tap Create again to pick up where you left off.");
        setLoading(false);
        return;
      }
    }

    if (!clubId) {
      setError('Something went wrong setting up your club. Please try again.');
      setLoading(false);
      return;
    }

    // Resumable step 2/2: reuse an existing team under this club rather
    // than creating a duplicate if an earlier attempt got this far before
    // failing on the team_members step.
    let teamId: string | null = null;
    const existingTeamResult = await withTimeout(
      supabase.from('teams').select('id').eq('club_id', clubId).limit(1).maybeSingle(),
      6000
    );
    if (existingTeamResult !== TIMEOUT && !existingTeamResult.error && existingTeamResult.data) {
      teamId = existingTeamResult.data.id;
    }

    if (!teamId) {
      const teamResult = await withTimeout(
        supabase.from('teams').insert({
          club_id: clubId,
          name: teamName.trim(),
          age_group: ageGroup || null,
          gender:    gender    || null,
        }).select('id').single(),
        6000
      );
      if (teamResult === TIMEOUT || teamResult.error || !teamResult.data) {
        setError("Your club was created, but we couldn't create your team. Check your connection, then tap Create again.");
        setLoading(false);
        return;
      }
      teamId = teamResult.data.id;
    }

    // upsert, not insert — (team_id, profile_id) is unique, so this is
    // safe to repeat on retry instead of erroring on a duplicate.
    const memberResult = await withTimeout(
      supabase.from('team_members').upsert(
        { team_id: teamId, profile_id: user.id, role: 'coach' },
        { onConflict: 'team_id,profile_id' }
      ),
      6000
    );
    if (memberResult === TIMEOUT || memberResult.error) {
      setError("Your team was created, but we couldn't finish adding you to it. Check your connection, then tap Create again.");
      setLoading(false);
      return;
    }

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

        <AuthInput label="Team name" value={teamName} onChangeText={setTeamName} placeholder="e.g. Riverside U10 Eagles" />

        {/* Gender pills */}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Gender</Text>
          <View style={styles.pillRow}>
            {GENDERS.map(g => {
              const active = gender === g.value;
              return (
                <TouchableOpacity
                  key={g.value}
                  onPress={() => setGender(active ? '' : g.value)}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{g.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Age group pills */}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Age group</Text>
          <View style={styles.pillWrap}>
            {AGE_GROUPS.map(ag => {
              const active = ageGroup === ag;
              return (
                <TouchableOpacity
                  key={ag}
                  onPress={() => setAgeGroup(active ? '' : ag)}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{ag}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <PrimaryButton title="Create team & go to dashboard" onPress={handleCreate} loading={loading} style={styles.button} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:        { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  container:   { padding: 24, paddingTop: 70, paddingBottom: 40 },
  back:        { marginBottom: 24 },
  backText:    { color: PULSE_COLORS.brand.green, fontSize: 16, fontWeight: '600' },
  heading:     { fontSize: 28, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 8 },
  subheading:  { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, marginBottom: 28 },
  button:      { marginTop: 24 },

  fieldBlock:  { marginBottom: 20 },
  fieldLabel:  { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  pillRow: { flexDirection: 'row', gap: 8 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.surface,
  },
  pillActive: {
    borderColor: PULSE_COLORS.brand.green,
    backgroundColor: `${PULSE_COLORS.brand.green}18`,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: PULSE_COLORS.ui.textSecondary,
  },
  pillTextActive: {
    color: PULSE_COLORS.brand.green,
  },
});
