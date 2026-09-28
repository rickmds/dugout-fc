import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { PULSE_COLORS } from '../../../../constants/colors';
import ClubHeader from '../../../../components/ui/ClubHeader';
import PollCard, { type Poll } from '../../../../components/home/PollCard';

// A poll notification used to just dump someone on Home, where they had to
// scroll to find the one poll they were notified about — this screen exists
// so that tap can land somewhere that IS the poll, nothing else.
export default function PollDetailScreen() {
  const { clubSlug, pollId } = useLocalSearchParams<{ clubSlug: string; pollId: string }>();
  const { primaryColor, rgba } = useClub();
  const { profile } = useAuth();
  const { team, allTeams, selectTeam } = useTeam();
  const router = useRouter();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [linkedEventTitle, setLinkedEventTitle] = useState<string | null>(null);
  const [myRsvpEventIds, setMyRsvpEventIds] = useState<Set<string>>(new Set());
  const [voterNames, setVoterNames] = useState<Record<string, string>>({});
  const [nonResponderIds, setNonResponderIds] = useState<string[]>([]);
  const [nonResponderCount, setNonResponderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const isCoach = team?.myRole === 'org_admin' || team?.myRole === 'coach';

  useEffect(() => {
    if (!pollId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId, team?.id]);

  async function load() {
    setLoading(true);
    const sb = supabase as any;

    const { data: pollRow } = await sb
      .from('team_polls')
      .select('id, team_id, question, closes_at, is_anonymous, is_multiple_choice, result_visibility, rsvp_gated, event_id, created_by')
      .eq('id', pollId)
      .maybeSingle();

    if (!pollRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    // A notification tap lands here without ever switching the active team
    // (see app/_layout.tsx's notification handler — it only navigates), so
    // realign to the poll's own team first, same fix already applied to
    // event/[eventId].tsx and tournament/[tournamentId].tsx for the
    // identical class of bug.
    if (pollRow.team_id !== team?.id && allTeams.some((t) => t.id === pollRow.team_id)) {
      const pollTeam = allTeams.find((t) => t.id === pollRow.team_id);
      selectTeam(pollRow.team_id);
      if (pollTeam?.club?.slug && pollTeam.club.slug !== clubSlug) {
        router.replace(`/(app)/${pollTeam.club.slug}/poll/${pollId}` as any);
      }
      return;
    }

    const teamIsCoach = team?.myRole === 'org_admin' || team?.myRole === 'coach';

    const [optionsRes, votesRes, guardedRes, namesRes, nonRespRes] = await Promise.all([
      sb.from('team_poll_options').select('id, poll_id, label, sort_order').eq('poll_id', pollId),
      sb.from('team_poll_votes').select('poll_id, option_id, profile_id').eq('poll_id', pollId),
      sb.rpc('get_my_guarded_players').select('id').eq('team_id', pollRow.team_id),
      // Player name(s), not the parent account's own name — a coach reads
      // "who voted" as which family/kid, and a parent guarding twins on
      // this team gets both names joined.
      teamIsCoach ? sb.rpc('get_guardian_player_names', { p_team_id: pollRow.team_id }) : Promise.resolve({ data: [] }),
      // Nudge targets — a player/family counts as responded once ANY
      // guardian voted, so this is NOT just team_members minus voters
      // (that double-counts a player with two linked guardian accounts).
      teamIsCoach ? sb.rpc('get_poll_nonresponders', { p_poll_id: pollId }) : Promise.resolve({ data: [] }),
    ]);

    const votes = (votesRes.data ?? []) as { option_id: string; profile_id: string }[];

    if (pollRow.rsvp_gated && pollRow.event_id) {
      const guardedIds = ((guardedRes.data ?? []) as { id: string }[]).map((p) => p.id);
      if (guardedIds.length > 0) {
        const { data: rsvpRows } = await supabase
          .from('event_rsvps')
          .select('event_id')
          .eq('event_id', pollRow.event_id)
          .in('player_id', guardedIds)
          .eq('status', 'attending');
        setMyRsvpEventIds(new Set((rsvpRows ?? []).length > 0 ? [pollRow.event_id] : []));
      } else {
        setMyRsvpEventIds(new Set());
      }
    } else {
      setMyRsvpEventIds(new Set());
    }

    if (pollRow.event_id) {
      const { data: evRow } = await supabase.from('events').select('title').eq('id', pollRow.event_id).maybeSingle();
      setLinkedEventTitle((evRow as any)?.title ?? null);
    } else {
      setLinkedEventTitle(null);
    }

    if (teamIsCoach) {
      setVoterNames(Object.fromEntries(
        ((namesRes.data ?? []) as { profile_id: string; player_names: string | null }[]).map((r) => [r.profile_id, r.player_names ?? ''])
      ));
      const nonResponders = (nonRespRes.data ?? []) as { player_id: string; guardian_profile_ids: string[] }[];
      setNonResponderCount(nonResponders.length);
      setNonResponderIds([...new Set(nonResponders.flatMap((r) => r.guardian_profile_ids))]);
    } else {
      setVoterNames({});
      setNonResponderCount(0);
      setNonResponderIds([]);
    }

    setPoll({
      id: pollRow.id,
      question: pollRow.question,
      closes_at: pollRow.closes_at,
      is_anonymous: pollRow.is_anonymous,
      is_multiple_choice: pollRow.is_multiple_choice,
      result_visibility: pollRow.result_visibility,
      rsvp_gated: pollRow.rsvp_gated,
      event_id: pollRow.event_id,
      created_by: pollRow.created_by,
      options: (optionsRes.data ?? []) as Poll['options'],
      votes,
    });
    setLoading(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('team_polls').delete().eq('id', id);
    if (error) { Alert.alert('Error', 'Could not delete poll.'); return; }
    router.back();
  }

  function handleVoteChange(_pollId: string, optionIds: string[]) {
    if (!poll || !profile) return;
    setPoll((prev) => {
      if (!prev) return prev;
      const otherVotes = prev.votes.filter((v) => v.profile_id !== profile.id);
      const myNewVotes = optionIds.map((oid) => ({ poll_id: prev.id, option_id: oid, profile_id: profile.id }));
      return { ...prev, votes: [...otherVotes, ...myNewVotes] };
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  if (notFound || !poll) {
    return (
      <View style={styles.container}>
        <ClubHeader title="Poll" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>This poll no longer exists.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ClubHeader title="Poll" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {linkedEventTitle && (
          <TouchableOpacity
            style={[styles.linkedBanner, { borderColor: `${primaryColor}40`, backgroundColor: rgba(0.06) }]}
            onPress={() => router.push(`/(app)/${clubSlug}/event/${poll.event_id}` as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="link-outline" size={13} color={primaryColor} />
            <Text style={[styles.linkedText, { color: primaryColor }]} numberOfLines={1}>Linked to: {linkedEventTitle}</Text>
          </TouchableOpacity>
        )}

        <PollCard
          poll={poll}
          myProfileId={profile?.id ?? ''}
          isCoach={isCoach}
          myRsvpEventIds={myRsvpEventIds}
          voterNames={voterNames}
          nonResponderProfileIds={nonResponderIds}
          nonResponderCount={nonResponderCount}
          primaryColor={primaryColor}
          rgba={rgba}
          onDelete={handleDelete}
          onVoteChange={handleVoteChange}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PULSE_COLORS.ui.background },
  errorText: { fontSize: 14, color: PULSE_COLORS.ui.textSecondary },
  scroll: { padding: 16 },

  linkedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 10,
  },
  linkedText: { fontSize: 13, fontWeight: '600', flex: 1 },
});
