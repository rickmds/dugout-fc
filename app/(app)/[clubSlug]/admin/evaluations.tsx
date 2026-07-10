import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlayerRow = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  evalStatus: 'draft' | 'submitted' | 'approved' | 'published' | null;
  evalId: string | null;
};

type BatchRow = {
  id: string;
  status: 'in_progress' | 'submitted' | 'approved';
  season_label: string;
  period_label: string;
  total_players: number;
  completed_count: number;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EvaluationsScreen() {
  const { primaryColor } = useClub();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { team } = useTeam();
  const router = useRouter();
  const { profile } = useAuth();

  const [batch,     setBatch]     = useState<BatchRow | null>(null);
  const [players,   setPlayers]   = useState<PlayerRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showNew,   setShowNew]   = useState(false);
  const [season,    setSeason]    = useState('');
  const [period,    setPeriod]    = useState('');
  const [creating,  setCreating]  = useState(false);

  const slug = clubSlug as string;
  const primary = primaryColor ?? '#22C55E';

  useEffect(() => {
    if (profile && !['coach', 'org_admin', 'app_admin'].includes(profile.role ?? '')) {
      router.back();
    }
  }, [profile]);

  const load = useCallback(async () => {
    if (!team || !profile) return;
    setLoading(true);

    // Find active (in_progress) batch for this coach+team, or latest one
    const { data: bData } = await supabase
      .from('evaluation_batches')
      .select('*')
      .eq('team_id', team.id)
      .eq('coach_id', profile.id)
      .in('status', ['in_progress', 'submitted'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const activeBatch = bData as BatchRow | null;
    setBatch(activeBatch);

    // Load players with their eval status for this batch
    const { data: pData } = await supabase
      .from('players')
      .select('id, full_name, jersey_number, position')
      .eq('team_id', team.id)
      .order('full_name');

    const playerList = (pData ?? []) as Omit<PlayerRow, 'evalStatus' | 'evalId'>[];

    if (activeBatch && playerList.length > 0) {
      const { data: eData } = await supabase
        .from('player_evaluations')
        .select('id, player_id, status')
        .eq('batch_id', activeBatch.id);

      const evalMap = new Map((eData ?? []).map((e: any) => [e.player_id, { id: e.id, status: e.status }]));
      setPlayers(playerList.map(p => ({
        ...p,
        evalStatus: evalMap.get(p.id)?.status ?? null,
        evalId: evalMap.get(p.id)?.id ?? null,
      })));
    } else {
      setPlayers(playerList.map(p => ({ ...p, evalStatus: null, evalId: null })));
    }

    setLoading(false);
  }, [team?.id, profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function createBatch() {
    if (!team || !profile || !season.trim() || !period.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('evaluation_batches')
      .insert({
        club_id: team.club_id ?? profile.club_id,
        team_id: team.id,
        coach_id: profile.id,
        season_label: season.trim(),
        period_label: period.trim(),
        total_players: players.length,
        completed_count: 0,
      })
      .select()
      .single();

    setCreating(false);

    if (error || !data) {
      Alert.alert('Error', `Could not create batch: ${error?.message ?? 'unknown error'}`);
      return;
    }

    setShowNew(false);
    setSeason('');
    setPeriod('');
    // Set batch directly — players are already loaded, no need to re-run load()
    setBatch(data as BatchRow);
    // Reset all player eval statuses to null since this is a new batch
    setPlayers(prev => prev.map(p => ({ ...p, evalStatus: null, evalId: null })));
  }

  async function submitBatch() {
    if (!batch) return;
    await supabase
      .from('evaluation_batches')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', batch.id);
    load();
  }

  const completed = players.filter(p => p.evalStatus && p.evalStatus !== 'draft').length;
  const drafted   = players.filter(p => p.evalStatus === 'draft').length;
  const canSubmit = batch?.status === 'in_progress' && completed === players.length && players.length > 0;

  function statusColor(s: PlayerRow['evalStatus']): string {
    if (!s) return PULSE_COLORS.ui.border;
    if (s === 'draft') return '#F59E0B';
    return '#22C55E';
  }

  function statusLabel(s: PlayerRow['evalStatus']): string {
    if (!s) return 'Not started';
    if (s === 'draft') return 'Draft';
    if (s === 'submitted') return 'Submitted';
    if (s === 'approved' || s === 'published') return 'Done';
    return s;
  }

  return (
    <View style={st.screen}>
      <ClubHeader
        title="Player Evaluations"
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* Active batch header */}
          {batch ? (
            <View style={[st.batchCard, { borderColor: `${primary}30` }]}>
              <View style={st.batchTop}>
                <View>
                  <Text style={st.batchPeriod}>{batch.period_label}</Text>
                  <Text style={st.batchSeason}>{batch.season_label}</Text>
                </View>
                <View style={[st.batchStatusPill, { backgroundColor: batch.status === 'in_progress' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)' }]}>
                  <Text style={[st.batchStatusText, { color: batch.status === 'in_progress' ? '#F59E0B' : '#3B82F6' }]}>
                    {batch.status === 'in_progress' ? 'In Progress' : 'Submitted'}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={st.progressWrap}>
                <View style={st.progressTrack}>
                  <View style={[st.progressFill, { flex: players.length > 0 ? (completed / players.length) : 0, backgroundColor: primary }]} />
                  {players.length - completed > 0 && (
                    <View style={{ flex: (players.length - completed) / players.length }} />
                  )}
                </View>
                <Text style={st.progressLabel}>{completed}/{players.length} completed</Text>
              </View>

              {canSubmit && (
                <TouchableOpacity style={[st.submitBtn, { backgroundColor: primary }]} onPress={submitBatch} activeOpacity={0.85}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#000" />
                  <Text style={st.submitBtnText}>Submit Batch for Approval</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={[st.newBatchBtn, { borderColor: `${primary}40` }]} onPress={() => setShowNew(true)} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={20} color={primary} />
              <Text style={[st.newBatchText, { color: primary }]}>Start New Evaluation Batch</Text>
            </TouchableOpacity>
          )}

          {/* Player list */}
          {players.length > 0 && (
            <View style={st.playerList}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={st.sectionLabel}>PLAYERS</Text>
                {batch && (
                  <Text style={{ fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' }}>Tap to write evaluation</Text>
                )}
              </View>
              {players.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={[st.playerRow, i < players.length - 1 && st.playerRowDivider]}
                  onPress={() => {
                    if (!batch) return;
                    router.push({
                      pathname: `/(app)/${slug}/admin/evaluation-form` as any,
                      params: { playerId: p.id, batchId: batch.id, evalId: p.evalId ?? '' },
                    });
                  }}
                  activeOpacity={batch ? 0.75 : 1}
                >
                  <View style={[st.playerAvatar, { backgroundColor: `${primary}20` }]}>
                    <Text style={[st.playerAvatarText, { color: primary }]}>{p.full_name[0]}</Text>
                  </View>
                  <View style={st.playerMeta}>
                    <Text style={st.playerName}>{p.full_name}</Text>
                    <Text style={st.playerSub}>
                      {[p.jersey_number != null ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join(' · ') || 'No details'}
                    </Text>
                  </View>
                  <View style={[st.statusDot, { backgroundColor: statusColor(p.evalStatus) }]} />
                  <Text style={[st.statusText, { color: statusColor(p.evalStatus) }]}>{statusLabel(p.evalStatus)}</Text>
                  {batch && <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      )}

      {/* New batch modal */}
      <Modal visible={showNew} transparent animationType="slide" onRequestClose={() => setShowNew(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <View style={st.modalOverlay}>
          <View style={st.modalSheet}>
            <Text style={st.modalTitle}>New Evaluation Batch</Text>
            <Text style={st.modalSub}>Set the season and period for this batch of reports.</Text>

            <Text style={st.inputLabel}>Season</Text>
            <TextInput
              style={st.input}
              placeholder="e.g. Spring 2026"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              value={season}
              onChangeText={setSeason}
              autoFocus
            />
            <Text style={st.inputLabel}>Period</Text>
            <TextInput
              style={st.input}
              placeholder="e.g. Mid-Season or End of Season"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              value={period}
              onChangeText={setPeriod}
            />

            <View style={st.modalActions}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowNew(false)} activeOpacity={0.7}>
                <Text style={st.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.createBtn, { backgroundColor: primary, opacity: (!season.trim() || !period.trim() || creating) ? 0.5 : 1 }]}
                onPress={createBatch}
                disabled={!season.trim() || !period.trim() || creating}
                activeOpacity={0.85}
              >
                {creating ? <ActivityIndicator size="small" color="#000" /> : <Text style={st.createBtnText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:          { padding: 16, gap: 16 },

  batchCard:       { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1, padding: 18, gap: 14 },
  batchTop:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  batchPeriod:     { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.3 },
  batchSeason:     { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500', marginTop: 2 },
  batchStatusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  batchStatusText: { fontSize: 11, fontWeight: '700' },

  progressWrap:  { gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: PULSE_COLORS.ui.border, flexDirection: 'row', overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, fontWeight: '600' },

  submitBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#000' },

  newBatchBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', padding: 20 },
  newBatchText:  { fontSize: 15, fontWeight: '700' },

  sectionLabel:  { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1, marginBottom: 2 },
  playerList:    { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 16 },
  playerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  playerRowDivider: { borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  playerAvatar:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  playerAvatarText: { fontSize: 15, fontWeight: '800' },
  playerMeta:    { flex: 1 },
  playerName:    { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  playerSub:     { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 1 },
  statusDot:     { width: 7, height: 7, borderRadius: 3.5 },
  statusText:    { fontSize: 11, fontWeight: '700' },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:    { backgroundColor: PULSE_COLORS.ui.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 4, paddingBottom: 32 },
  modalTitle:    { fontSize: 20, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  modalSub:      { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, marginBottom: 12 },
  inputLabel:    { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, marginTop: 8, marginBottom: 4 },
  input:         { backgroundColor: PULSE_COLORS.ui.background, borderRadius: 12, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 14, fontSize: 15, color: PULSE_COLORS.ui.text },
  modalActions:  { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:     { flex: 1, padding: 14, borderRadius: 12, backgroundColor: PULSE_COLORS.ui.surfaceAlt, alignItems: 'center', borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  createBtn:     { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  createBtnText: { fontSize: 15, fontWeight: '800', color: '#000' },
});
