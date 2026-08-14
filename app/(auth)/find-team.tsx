import { useEffect, useState } from 'react';
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
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { PULSE_COLORS } from '../../constants/colors';
import AuthInput from '../../components/ui/AuthInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorBanner from '../../components/ui/ErrorBanner';

interface ClubResult {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface TeamOption {
  id: string;
  name: string;
  age_group: string | null;
}

export default function FindTeamScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [inviteToken, setInviteToken] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [clubSlug, setClubSlug] = useState('');
  const [clubLoading, setClubLoading] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);
  const [foundClub, setFoundClub] = useState<ClubResult | null>(null);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);

  async function acceptInviteToken(token: string) {
    setInviteError(null);
    setInviteLoading(true);
    const { data, error: rpcError } = await supabase.rpc('accept_invite', { p_token: token });
    setInviteLoading(false);

    const inviteData = data as { club_slug?: string } | null;
    if (rpcError || !inviteData?.club_slug) {
      setInviteError('Invalid or expired invite code. Please check and try again.');
      return;
    }

    await refreshProfile();
    router.replace(`/(app)/${inviteData.club_slug}/(tabs)` as never);
  }

  async function handleInviteSubmit() {
    if (!inviteToken.trim()) {
      setInviteError('Please enter your invite code.');
      return;
    }
    await acceptInviteToken(inviteToken.trim());
  }

  // If a deep-link invite arrived while the app was already authenticated
  // and sitting on this screen (e.g. backgrounded mid-flow), it would
  // otherwise sit orphaned in AsyncStorage forever — consume it here too.
  useEffect(() => {
    AsyncStorage.getItem('pendingInviteToken').then(async (token) => {
      if (!token) return;
      await AsyncStorage.removeItem('pendingInviteToken');
      setInviteToken(token);
      await acceptInviteToken(token);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  async function handleFindClub() {
    setClubError(null);
    setFoundClub(null);
    setTeams([]);
    setSelectedTeamId(null);

    if (!clubSlug.trim()) {
      setClubError('Please enter a club slug.');
      return;
    }

    setClubLoading(true);
    const { data: club } = await supabase
      .from('clubs')
      .select('id, name, slug, logo_url')
      .eq('slug', clubSlug.trim().toLowerCase())
      .single();

    if (!club) {
      setClubLoading(false);
      setClubError('No club found with that slug.');
      return;
    }

    const { data: clubTeams } = await supabase
      .from('teams')
      .select('id, name, age_group')
      .eq('club_id', club.id);

    setClubLoading(false);
    setFoundClub(club);
    setTeams(clubTeams ?? []);
  }

  async function handleJoinTeam() {
    if (!foundClub || !selectedTeamId || !user) return;

    setClubError(null);
    setJoinLoading(true);

    const { error: memberErr } = await supabase
      .from('team_members')
      .insert({ team_id: selectedTeamId, profile_id: user.id, role: 'parent' });
    if (memberErr) {
      setJoinLoading(false);
      setClubError('Could not join the team. Please try again.');
      return;
    }

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ club_id: foundClub.id, role: 'player' })
      .eq('id', user.id);
    if (profileErr) {
      setJoinLoading(false);
      setClubError('Could not join the team. Please try again.');
      return;
    }

    setJoinLoading(false);
    await refreshProfile();
    router.replace('/(auth)/profile-setup');
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Find your team</Text>
        <Text style={styles.subheading}>Join with an invite code or search for your club.</Text>

        {user?.email?.endsWith('@privaterelay.appleid.com') && (
          <View style={styles.relayHint}>
            <Text style={styles.relayHintText}>
              You signed in with a private Apple email. If your coach invited you, they likely used your real email — enter the invite code below instead.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>I have an invite code</Text>
          {inviteError && <ErrorBanner message={inviteError} />}
          <AuthInput
            label="Invite code"
            value={inviteToken}
            onChangeText={setInviteToken}
            placeholder="Enter your invite code"
          />
          <PrimaryButton title="Join with code" onPress={handleInviteSubmit} loading={inviteLoading} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Find my club</Text>
          {clubError && <ErrorBanner message={clubError} />}
          <AuthInput
            label="Club slug"
            value={clubSlug}
            onChangeText={setClubSlug}
            placeholder="e.g. mds-academy"
          />
          <PrimaryButton title="Search" onPress={handleFindClub} loading={clubLoading} variant="outline" />

          {foundClub && (
            <View style={styles.clubResult}>
              <Text style={styles.clubName}>{foundClub.name}</Text>

              {teams.length === 0 ? (
                <Text style={styles.noTeams}>This club has no teams set up yet.</Text>
              ) : (
                <>
                  <Text style={styles.teamPrompt}>Select your team:</Text>
                  {teams.map((team) => (
                    <TouchableOpacity
                      key={team.id}
                      onPress={() => setSelectedTeamId(team.id)}
                      style={[styles.teamOption, selectedTeamId === team.id && styles.teamOptionSelected]}
                    >
                      <Text style={styles.teamOptionText}>
                        {team.name}
                        {team.age_group ? ` · ${team.age_group}` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <PrimaryButton
                    title="Join team"
                    onPress={handleJoinTeam}
                    loading={joinLoading}
                    disabled={!selectedTeamId}
                    style={styles.joinButton}
                  />
                </>
              )}
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => Linking.openURL('https://pulse-fc.app/onboarding')}
          style={styles.coachLink}
        >
          <Text style={styles.coachLinkText}>I&apos;m a coach setting up a new club</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/(auth)/profile-setup')} style={styles.skipLink}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/welcome' as never); }} style={styles.signOutLink}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
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
    padding: 16,
    paddingTop: 80,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: PULSE_COLORS.ui.text,
  },
  subheading: {
    fontSize: 14,
    color: PULSE_COLORS.ui.textSecondary,
    marginTop: 6,
    marginBottom: 24,
  },
  relayHint: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  relayHintText: { color: '#F59E0B', fontSize: 12.5, lineHeight: 18 },
  card: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    color: PULSE_COLORS.ui.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  clubResult: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: PULSE_COLORS.ui.border,
    paddingTop: 16,
  },
  clubName: {
    color: PULSE_COLORS.ui.text,
    fontSize: 16,
    fontWeight: '700',
  },
  noTeams: {
    color: PULSE_COLORS.ui.textSecondary,
    fontSize: 13,
    marginTop: 8,
  },
  teamPrompt: {
    color: PULSE_COLORS.ui.textSecondary,
    fontSize: 13,
    marginTop: 12,
    marginBottom: 8,
  },
  teamOption: {
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  teamOptionSelected: {
    borderColor: PULSE_COLORS.brand.green,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  teamOptionText: {
    color: PULSE_COLORS.ui.text,
    fontSize: 14,
  },
  joinButton: {
    marginTop: 8,
  },
  coachLink: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  coachLinkText: {
    color: PULSE_COLORS.brand.green,
    fontSize: 14,
    fontWeight: '600',
  },
  skipLink: {
    alignItems: 'center',
  },
  skipText: {
    color: PULSE_COLORS.ui.muted,
    fontSize: 13,
  },
  signOutLink: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  signOutText: {
    color: PULSE_COLORS.ui.muted,
    fontSize: 13,
  },
});
