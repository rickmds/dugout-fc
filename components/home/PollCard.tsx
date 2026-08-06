import { useState, memo } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { PULSE_COLORS } from '../../constants/colors';

export type PollOption = {
  id: string;
  label: string;
  sort_order: number;
};

export type Poll = {
  id: string;
  question: string;
  closes_at: string | null;
  is_anonymous: boolean;
  is_multiple_choice: boolean;
  result_visibility: 'always' | 'after_vote' | 'after_close';
  rsvp_gated: boolean;
  event_id: string | null;
  created_by: string | null;
  options: PollOption[];
  votes: { option_id: string; profile_id: string }[];
  totalParticipants: number;
};

type Props = {
  poll: Poll;
  myProfileId: string;
  isCoach: boolean;
  myRsvpEventIds?: Set<string>;
  primaryColor: string;
  rgba: (a: number) => string;
  onDelete: (pollId: string) => void;
  onVoteChange: (pollId: string, optionIds: string[]) => void;
};

function timeLeft(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Closes in < 1h';
  if (h < 24) return `Closes in ${h}h`;
  return `Closes in ${Math.floor(h / 24)}d`;
}

const PollCard = memo(function PollCard({ poll, myProfileId, isCoach, myRsvpEventIds, primaryColor, rgba, onDelete, onVoteChange }: Props) {
  const [voting, setVoting] = useState(false);

  const myVotedOptionIds = new Set(
    poll.votes.filter(v => v.profile_id === myProfileId).map(v => v.option_id)
  );
  const hasVoted = myVotedOptionIds.size > 0;
  const isClosed = poll.closes_at ? new Date(poll.closes_at) <= new Date() : false;

  // Count votes per option
  const voteCounts: Record<string, number> = {};
  for (const v of poll.votes) {
    voteCounts[v.option_id] = (voteCounts[v.option_id] ?? 0) + 1;
  }
  const totalVoters = new Set(poll.votes.map(v => v.profile_id)).size;
  const maxCount = Math.max(1, ...Object.values(voteCounts));

  // RSVP gate check
  const isRsvpBlocked = poll.rsvp_gated && poll.event_id
    && myRsvpEventIds && !myRsvpEventIds.has(poll.event_id)
    && !isCoach;

  // Result visibility
  const showResults = isCoach
    || isClosed
    || poll.result_visibility === 'always'
    || (poll.result_visibility === 'after_vote' && hasVoted);

  async function handleVote(optionId: string) {
    if (voting || isClosed || isRsvpBlocked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVoting(true);

    const alreadyVotedThis = myVotedOptionIds.has(optionId);

    if (alreadyVotedThis) {
      // Toggle off
      const { error } = await (supabase as any)
        .from('team_poll_votes')
        .delete()
        .eq('poll_id', poll.id)
        .eq('option_id', optionId)
        .eq('profile_id', myProfileId);
      if (!error) {
        const next = [...myVotedOptionIds].filter(id => id !== optionId);
        onVoteChange(poll.id, next);
      }
    } else {
      if (!poll.is_multiple_choice) {
        // Remove previous vote first
        await (supabase as any)
          .from('team_poll_votes')
          .delete()
          .eq('poll_id', poll.id)
          .eq('profile_id', myProfileId);
      }
      const { error } = await (supabase as any)
        .from('team_poll_votes')
        .insert({ poll_id: poll.id, option_id: optionId, profile_id: myProfileId });
      if (!error) {
        const next = poll.is_multiple_choice
          ? [...myVotedOptionIds, optionId]
          : [optionId];
        onVoteChange(poll.id, next);
      }
    }
    setVoting(false);
  }

  function confirmDelete() {
    Alert.alert('Delete poll?', 'This will remove the poll and all votes.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(poll.id) },
    ]);
  }

  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: primaryColor }]} />
      <View style={styles.body}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="bar-chart-outline" size={13} color={primaryColor} />
            <Text style={[styles.pollLabel, { color: primaryColor }]}>POLL</Text>
            {poll.is_anonymous && (
              <View style={styles.anonBadge}>
                <Ionicons name="eye-off-outline" size={10} color={PULSE_COLORS.ui.muted} />
                <Text style={styles.anonText}>Anonymous</Text>
              </View>
            )}
            {poll.is_multiple_choice && (
              <View style={styles.anonBadge}>
                <Text style={styles.anonText}>Multi-select</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            {poll.closes_at && (
              <Text style={[styles.closeLabel, isClosed && { color: PULSE_COLORS.status.error }]}>
                {timeLeft(poll.closes_at)}
              </Text>
            )}
            {isCoach && (
              <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={14} color={PULSE_COLORS.ui.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Question */}
        <Text style={styles.question}>{poll.question}</Text>

        {/* RSVP gate message */}
        {isRsvpBlocked && (
          <View style={styles.gateRow}>
            <Ionicons name="lock-closed-outline" size={13} color={PULSE_COLORS.ui.muted} />
            <Text style={styles.gateText}>RSVP attending to vote</Text>
          </View>
        )}

        {/* Options */}
        {poll.options.sort((a, b) => a.sort_order - b.sort_order).map(opt => {
          const count = voteCounts[opt.id] ?? 0;
          const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
          const isSelected = myVotedOptionIds.has(opt.id);
          const canVote = !isClosed && !isRsvpBlocked && !voting && !isCoach;
          const isLeading = showResults && totalVoters > 0 && count === maxCount && count > 0;

          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.option,
                isLeading && { borderColor: primaryColor, borderWidth: 1.5 },
                isSelected && { backgroundColor: rgba(0.08) },
                !canVote && { opacity: isClosed ? 0.7 : 1 },
              ]}
              onPress={() => handleVote(opt.id)}
              activeOpacity={canVote ? 0.75 : 1}
              disabled={!canVote}
            >
              {/* Progress fill */}
              {showResults && totalVoters > 0 && (
                <View
                  style={[
                    styles.optionFill,
                    {
                      width: `${(count / maxCount) * 100}%` as any,
                      backgroundColor: isLeading ? rgba(0.26) : isSelected ? rgba(0.15) : 'rgba(255,255,255,0.04)',
                    },
                  ]}
                />
              )}

              <View style={styles.optionRow}>
                {/* Checkbox/radio */}
                <View style={[
                  poll.is_multiple_choice ? styles.checkbox : styles.radio,
                  isSelected && { borderColor: primaryColor, backgroundColor: primaryColor },
                  !isSelected && isLeading && { borderColor: primaryColor },
                ]}>
                  {isSelected && (
                    <Ionicons
                      name={poll.is_multiple_choice ? 'checkmark' : 'ellipse'}
                      size={poll.is_multiple_choice ? 10 : 6}
                      color="#fff"
                    />
                  )}
                </View>

                <Text style={[
                  styles.optionLabel,
                  isLeading && { color: PULSE_COLORS.ui.text, fontWeight: '700' },
                  isSelected && { color: PULSE_COLORS.ui.text, fontWeight: '600' },
                ]}>
                  {opt.label}
                </Text>

                {showResults && totalVoters > 0 && (
                  <View style={styles.pctRow}>
                    {isLeading && (
                      <Ionicons name="trophy" size={12} color="#F59E0B" />
                    )}
                    <Text style={[
                      styles.optionPct,
                      isLeading && { color: primaryColor, fontWeight: '800', fontSize: 13 },
                      isSelected && !isLeading && { color: primaryColor, fontWeight: '700' },
                    ]}>
                      {pct}%
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Footer */}
        <View style={styles.footer}>
          {showResults ? (
            <Text style={styles.footerText}>
              {totalVoters} {totalVoters === 1 ? 'response' : 'responses'}
              {isCoach && poll.totalParticipants > 0
                ? ` · ${poll.totalParticipants - totalVoters} haven't voted`
                : ''}
            </Text>
          ) : (
            <Text style={styles.footerText}>
              {poll.result_visibility === 'after_close' ? 'Results revealed when poll closes' : 'Vote to see results'}
            </Text>
          )}
          {isCoach && (
            <Text style={styles.viewOnly}>View only</Text>
          )}
          {!hasVoted && !isClosed && !isRsvpBlocked && !isCoach && (
            <Text style={[styles.tapHint, { color: primaryColor }]}>
              {poll.is_multiple_choice ? 'Select all that apply' : 'Tap to vote'}
            </Text>
          )}
        </View>

      </View>
    </View>
  );
});
export default PollCard;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  accent: { width: 3 },
  body: { flex: 1, padding: 14, gap: 10 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  pollLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  anonBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  anonText: { fontSize: 10, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
  closeLabel: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  question: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text, lineHeight: 20 },

  gateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gateText: { fontSize: 12, color: PULSE_COLORS.ui.muted, fontStyle: 'italic' },

  option: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
    minHeight: 44,
    justifyContent: 'center',
  },
  optionFill: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    borderRadius: 10,
    minWidth: 4,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 11, gap: 10,
  },
  radio: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkbox: {
    width: 16, height: 16, borderRadius: 4,
    borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  optionLabel: { flex: 1, fontSize: 14, color: PULSE_COLORS.ui.textSecondary },
  optionPct: { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '600', minWidth: 32, textAlign: 'right' },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 11, color: PULSE_COLORS.ui.muted },
  tapHint: { fontSize: 11, fontWeight: '600' },
  viewOnly: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontStyle: 'italic' },
});
