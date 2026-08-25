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
import * as Linking from 'expo-linking';
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

export default function FindTeamScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [clubSlug, setClubSlug] = useState('');
  const [clubLoading, setClubLoading] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);
  const [foundClub, setFoundClub] = useState<ClubResult | null>(null);
  // null = not checked yet, false = checked and no invite found, true = found
  const [hasInvite, setHasInvite] = useState<boolean | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);

  // Looking up a club by slug is just for display/branding — it never grants
  // access on its own. Joining a team requires a real, pending invite
  // addressed to this signed-in user's own email, verified server-side by
  // find_my_invite_token(); there is no path here to browse and self-select
  // an arbitrary team the way the old version allowed.
  async function handleFindClub() {
    setClubError(null);
    setFoundClub(null);
    setHasInvite(null);

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

    // Most people only know their club's name, not its URL slug — fall
    // back to a name search before giving up.
    const resolvedClub = club ?? (await supabase
      .from('clubs')
      .select('id, name, slug, logo_url')
      .ilike('name', `%${clubSlug.trim()}%`)
      .limit(1)
      .maybeSingle()
    ).data;

    if (!resolvedClub) {
      setClubLoading(false);
      setClubError('No club found with that name or slug. Ask your coach for your club’s Pulse FC link.');
      return;
    }

    const { data: token, error: tokenErr } = await (supabase as any).rpc('find_my_invite_token', { p_club_slug: resolvedClub.slug });

    setClubLoading(false);
    setFoundClub(resolvedClub);
    setHasInvite(!tokenErr && !!token);
  }

  async function handleJoinTeam() {
    if (!foundClub || !user) return;

    setClubError(null);
    setJoinLoading(true);

    const { data: token, error: tokenErr } = await (supabase as any).rpc('find_my_invite_token', { p_club_slug: foundClub.slug });
    if (tokenErr || !token) {
      setJoinLoading(false);
      setHasInvite(false);
      setClubError('We couldn’t find a pending invite for your account at this club.');
      return;
    }

    const { data: rpcData, error: rpcErr } = await (supabase as any).rpc('accept_invite', { p_token: token as string });
    const result = rpcData as { error?: string; needs_confirmation?: boolean } | null;

    if (rpcErr || result?.error || result?.needs_confirmation) {
      setJoinLoading(false);
      setClubError('Could not join the team. The invite may have expired or already been used.');
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
        <Text style={styles.subheading}>Search for your club to join a team.</Text>

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

              {hasInvite === false && (
                <Text style={styles.noTeams}>
                  We couldn’t find a pending invite for your account at this club. Ask your coach or club admin to send you an invite.
                </Text>
              )}

              {hasInvite && (
                <>
                  <Text style={styles.teamPrompt}>We found a pending invite for you at this club.</Text>
                  <PrimaryButton
                    title="Join team"
                    onPress={handleJoinTeam}
                    loading={joinLoading}
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
