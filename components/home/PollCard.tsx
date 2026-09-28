import { useState, memo } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { sendProfilesPush } from '../../lib/push';
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
};

type Props = {
  poll: Poll;
  myProfileId: string;
  isCoach: boolean;
  myRsvpEventIds?: Set<string>;
  /** profile_id -> full_name, for the coach-only "who voted" reveal. Only
   * ever fetched for a coach (see index.tsx), fetched once per team rather
   * than per-poll — this component still gates the actual reveal on
   * !poll.is_anonymous itself, since the map has no idea which poll it's
   * being used for. */
  voterNames?: Record<string, string>;
  /** Every guardian account of a still-non-responding player — coach-only,
   * this is who the Nudge button actually pushes to. Can include BOTH
   * guardians of one player (e.g. two parents), which is why this is kept
   * separate from nonResponderCount below rather than just using its
   * length — the displayed count is players/families, not accounts.
   * Undefined for a plain parent viewer, same as voterNames. */
  nonResponderProfileIds?: string[];
  /** How many players/families haven't voted — a family counts as
   * responded once ANY of its guardians has voted, so this is NOT
   * nonResponderProfileIds.length (that counts accounts, which
   * double-counts a player with two linked guardians). */
  nonResponderCount?: number;
  /** An option a CO-guardian of one of this viewer's own players already
   * voted for on this poll — a player can have two linked guardian
   * accounts (e.g. both parents), and nothing used to stop both from
   * casting their own, possibly conflicting vote for the same kid.
   * Present for any non-coach viewer (fetched regardless of whether
   * they've voted themselves), null/undefined when there's no conflict. */
  familyVoteOptionId?: string | null;
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

const PollCard = memo(function PollCard({ poll, myProfileId, isCoach, myRsvpEventIds, voterNames, nonResponderProfileIds, nonResponderCount, familyVoteOptionId, primaryColor, rgba, onDelete, onVoteChange }: Props) {
  const [voting, setVoting] = useState(false);
  const [revealOptionId, setRevealOptionId] = useState<string | null>(null);
  const [nudging, setNudging] = useState(false);

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

  // Only a coach, only a non-anonymous poll — this is what actually
  // enforces the Anonymous toggle for this feature, not voterNames being
  // present (that's fetched once per team, with no idea which poll it's
  // used for).
  const canRevealVoters = isCoach && !poll.is_anonymous && !!voterNames;
  function namesForOption(optionId: string): string[] {
    return poll.votes
      .filter(v => v.option_id === optionId)
      .map(v => voterNames?.[v.profile_id] || 'Unknown')
      .sort((a, b) => a.localeCompare(b));
  }

  // RSVP gate check
  const isRsvpBlocked = poll.rsvp_gated && poll.event_id
    && myRsvpEventIds && !myRsvpEventIds.has(poll.event_id)
    && !isCoach;

  // A co-guardian of one of this viewer's own players already voted — only
  // blocks a FIRST vote from this account (one that would create a second,
  // possibly-conflicting answer for the same kid); doesn't retroactively
  // touch a vote this account already cast before the conflict existed.
  const familyOption = familyVoteOptionId ? poll.options.find(o => o.id === familyVoteOptionId) : undefined;
  const familyConflict = !isCoach && !hasVoted && !!familyVoteOptionId;

  // Result visibility
  const showResults = isCoach
    || isClosed
    || poll.result_visibility === 'always'
    || (poll.result_visibility === 'after_vote' && (hasVoted || familyConflict));

  async function handleVote(optionId: string) {
    if (voting || isClosed || isRsvpBlocked || familyConflict) return;
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

  async function handleNudge() {
    if (!nonResponderProfileIds?.length) return;
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
      profileIds: nonResponderProfileIds,
      title: 'New poll',
      body: poll.question,
      data: { type: 'team_poll', poll_id: poll.id, ...(poll.event_id ? { event_id: poll.event_id } : {}) },
    });
    await AsyncStorage.setItem(storageKey, String(Date.now()));
    setNudging(false);
    const familyCount = nonResponderCount ?? nonResponderProfileIds.length;
    Alert.alert('Nudge sent', `Reminded ${familyCount} famil${familyCount !== 1 ? 'ies' : 'y'} to vote.`);
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

        {/* A co-guardian already answered for this same player */}
        {familyConflict && (
          <View style={styles.gateRow}>
            <Ionicons name="people-outline" size={13} color={PULSE_COLORS.ui.muted} />
            <Text style={styles.gateText}>
              Already answered by your family{familyOption ? `: ${familyOption.label}` : ''}
            </Text>
          </View>
        )}

        {/* Options */}
        {poll.options.sort((a, b) => a.sort_order - b.sort_order).map(opt => {
          const count = voteCounts[opt.id] ?? 0;
          const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
          const isSelected = myVotedOptionIds.has(opt.id);
          const canVote = !isClosed && !isRsvpBlocked && !voting && !isCoach && !familyConflict;
          const canReveal = canRevealVoters && count > 0;
          const isLeading = showResults && totalVoters > 0 && count === maxCount && count > 0;

          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.option,
                isLeading && { borderColor: primaryColor, borderWidth: 1.5 },
                isSelected && { backgroundColor: rgba(0.08) },
                !canVote && !canReveal && { opacity: isClosed ? 0.7 : 1 },
              ]}
              onPress={() => (isCoach ? (canReveal && setRevealOptionId(opt.id)) : handleVote(opt.id))}
              activeOpacity={canVote || canReveal ? 0.75 : 1}
              disabled={isCoach ? !canReveal : !canVote}
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
              {isCoach && nonResponderCount !== undefined
                ? ` · ${nonResponderCount} haven't voted`
                : ''}
            </Text>
          ) : (
            <Text style={styles.footerText}>
              {poll.result_visibility === 'after_close' ? 'Results revealed when poll closes' : 'Vote to see results'}
            </Text>
          )}
          {isCoach && (
            <Text style={[styles.viewOnly, canRevealVoters && totalVoters > 0 && { color: primaryColor, fontStyle: 'normal', fontWeight: '600' }]}>
              {canRevealVoters && totalVoters > 0 ? 'Tap a result to see who voted' : 'View only'}
            </Text>
          )}
          {!hasVoted && !isClosed && !isRsvpBlocked && !isCoach && !familyConflict && (
            <Text style={[styles.tapHint, { color: primaryColor }]}>
              {poll.is_multiple_choice ? 'Select all that apply' : 'Tap to vote'}
            </Text>
          )}
        </View>

        {isCoach && !!nonResponderProfileIds?.length && (
          <TouchableOpacity style={styles.nudgeBtn} onPress={handleNudge} activeOpacity={0.7} disabled={nudging}>
            <Ionicons name="notifications-outline" size={13} color={PULSE_COLORS.ui.muted} />
            <Text style={styles.nudgeBtnText}>
              {nudging ? 'Sending…' : `Nudge ${nonResponderCount ?? nonResponderProfileIds.length} who haven't voted`}
            </Text>
          </TouchableOpacity>
        )}

      </View>

      {/* Who voted for this option — coach-only, never shown for an
          anonymous poll (see canRevealVoters). */}
      <Modal
        visible={!!revealOptionId}
        transparent
        animationType="fade"
        onRequestClose={() => setRevealOptionId(null)}
      >
        <View style={styles.revealOverlay}>
          <View style={styles.revealCard}>
            <Text style={styles.revealTitle}>
              {poll.options.find(o => o.id === revealOptionId)?.label ?? ''}
            </Text>
            <ScrollView style={styles.revealScroll}>
              {revealOptionId && namesForOption(revealOptionId).map((name, i) => (
                <Text key={i} style={styles.revealName}>{name}</Text>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.revealCloseBtn} onPress={() => setRevealOptionId(null)}>
              <Text style={styles.revealCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  nudgeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 9, marginTop: 10,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  nudgeBtnText: { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },

  revealOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  revealCard: {
    width: '100%', maxWidth: 340, maxHeight: '70%', backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 18,
  },
  revealTitle: { fontSize: 15, fontWeight: '800', color: PULSE_COLORS.ui.text, textAlign: 'center', marginBottom: 14 },
  revealScroll: { maxHeight: 260 },
  revealName: {
    fontSize: 14, color: PULSE_COLORS.ui.text, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  revealCloseBtn: {
    marginTop: 14, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  revealCloseBtnText: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
});
