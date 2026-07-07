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
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setError('No active session found. Please sign out and sign in again.'); setLoading(false); return; }

    const clubId = uuid();
    const teamId = uuid();
    const slug   = `${toSlug(teamName.trim())}-${randomSuffix()}`;

    const { error: roleErr } = await supabase.from('profiles').update({ role: 'org_admin' }).eq('id', user.id);
    if (roleErr) { setError(`Account setup failed: ${roleErr.message}`); setLoading(false); return; }

    const { error: clubErr } = await supabase.from('clubs').insert({ id: clubId, name: teamName.trim(), slug });
    if (clubErr) { setError(`Failed to create club: ${clubErr.message}`); setLoading(false); return; }

    await supabase.from('profiles').update({ club_id: clubId }).eq('id', user.id);

    const { error: teamErr } = await supabase.from('teams').insert({
      id: teamId, club_id: clubId,
      name: teamName.trim(),
      age_group: ageGroup || null,
      gender:    gender    || null,
    });
    if (teamErr) { setError(`Failed to create team: ${teamErr.message}`); setLoading(false); return; }

    await supabase.from('team_members').insert({ team_id: teamId, profile_id: user.id, role: 'coach' });
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
  flex:        { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  container:   { padding: 24, paddingTop: 70, paddingBottom: 40 },
  back:        { marginBottom: 24 },
  backText:    { color: DUGOUT_COLORS.brand.green, fontSize: 16, fontWeight: '600' },
  heading:     { fontSize: 28, fontWeight: '800', color: DUGOUT_COLORS.ui.text, marginBottom: 8 },
  subheading:  { fontSize: 14, color: DUGOUT_COLORS.ui.textSecondary, marginBottom: 28 },
  button:      { marginTop: 24 },

  fieldBlock:  { marginBottom: 20 },
  fieldLabel:  { fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.ui.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  pillRow: { flexDirection: 'row', gap: 8 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.surface,
  },
  pillActive: {
    borderColor: DUGOUT_COLORS.brand.green,
    backgroundColor: `${DUGOUT_COLORS.brand.green}18`,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: DUGOUT_COLORS.ui.textSecondary,
  },
  pillTextActive: {
    color: DUGOUT_COLORS.brand.green,
  },
});
