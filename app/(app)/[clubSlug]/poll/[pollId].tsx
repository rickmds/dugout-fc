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
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { sendProfilesPush } from '../../../../lib/push';
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
  const [nudging, setNudging] = useState(false);
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

    const [optionsRes, votesRes, guardedRes, memberRes, namesRes] = await Promise.all([
      sb.from('team_poll_options').select('id, poll_id, label, sort_order').eq('poll_id', pollId),
      sb.from('team_poll_votes').select('poll_id, option_id, profile_id').eq('poll_id', pollId),
      sb.rpc('get_my_guarded_players').select('id').eq('team_id', pollRow.team_id),
      teamIsCoach
        ? supabase.from('team_members').select('profile_id').eq('team_id', pollRow.team_id).eq('role', 'parent')
        : Promise.resolve({ data: [] }),
      teamIsCoach ? sb.rpc('get_team_member_names', { p_team_id: pollRow.team_id }) : Promise.resolve({ data: [] }),
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
        ((namesRes.data ?? []) as { profile_id: string; full_name: string | null }[]).map((r) => [r.profile_id, r.full_name ?? ''])
      ));
      const votedIds = new Set(votes.map((v) => v.profile_id));
      const memberIds = ((memberRes.data ?? []) as { profile_id: string }[]).map((r) => r.profile_id);
      setNonResponderIds(memberIds.filter((id) => !votedIds.has(id)));
    } else {
      setVoterNames({});
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
      totalParticipants: ((memberRes.data ?? []) as unknown[]).length,
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

  async function handleNudge() {
    if (!poll || !team) return;
    if (!nonResponderIds.length) {
      Alert.alert('All caught up', 'Everyone has already voted.');
      return;
    }

    const COOLDOWN_MS = 30 * 60 * 1000;
    const storageKey = `poll_nudge_last_${poll.id}`;
    const lastStr = await AsyncStorage.getItem(storageKey);
    if (lastStr) {
      const elapsed = Date.now() - parseInt(lastStr, 10);
      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        Alert.alert('Too soon', `Wait ${remaining} more minute${remaining !== 1 ? 's' : ''} before nudging again.`);
        return;
      }
    }

    setNudging(true);
    await sendProfilesPush({
      profileIds: nonResponderIds,
      title: 'New poll',
      body: poll.question,
      data: { type: 'team_poll', poll_id: poll.id, ...(poll.event_id ? { event_id: poll.event_id } : {}) },
    });
    await AsyncStorage.setItem(storageKey, String(Date.now()));
    setNudging(false);
    Alert.alert('Nudge sent', `Reminded ${nonResponderIds.length} parent${nonResponderIds.length !== 1 ? 's' : ''} to vote.`);
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
          primaryColor={primaryColor}
          rgba={rgba}
          onDelete={handleDelete}
          onVoteChange={handleVoteChange}
        />

        {isCoach && nonResponderIds.length > 0 && (
          <TouchableOpacity
            style={styles.nudgeBtn}
            onPress={handleNudge}
            activeOpacity={0.7}
            disabled={nudging}
          >
            <Ionicons name="notifications-outline" size={14} color={PULSE_COLORS.ui.muted} />
            <Text style={styles.nudgeBtnText}>
              {nudging ? 'Sending…' : `Nudge ${nonResponderIds.length} who haven't voted`}
            </Text>
          </TouchableOpacity>
        )}
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

  nudgeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10, marginTop: 12,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  nudgeBtnText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
});
