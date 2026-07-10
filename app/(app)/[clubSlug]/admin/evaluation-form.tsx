import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type EvalData = {
  rating_technical: number;
  rating_tactical: number;
  rating_physical: number;
  rating_mental: number;
  q1_improvement: string;
  q2_focus: string;
  q3_message: string;
  ai_draft: string;
  final_text: string;
  status: 'draft' | 'submitted';
};

const RATING_LABELS: Record<number, string> = {
  1: 'Needs Work', 2: 'Developing', 3: 'Good', 4: 'Strong', 5: 'Excellent',
};

// ─── Rating Row ───────────────────────────────────────────────────────────────

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={rSt.row}>
      <Text style={rSt.label}>{label}</Text>
      <View style={rSt.stars}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Ionicons
              name={n <= value ? 'star' : 'star-outline'}
              size={28}
              color={n <= value ? '#F59E0B' : PULSE_COLORS.ui.border}
            />
          </TouchableOpacity>
        ))}
      </View>
      {value > 0 && <Text style={rSt.valueLabel}>{RATING_LABELS[value]}</Text>}
    </View>
  );
}
const rSt = StyleSheet.create({
  row:        { gap: 8, marginBottom: 20 },
  label:      { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.text },
  stars:      { flexDirection: 'row', gap: 4 },
  valueLabel: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EvaluationFormScreen() {
  const { primaryColor } = useClub();
  const { clubSlug, playerId, batchId, evalId } = useLocalSearchParams<{
    clubSlug: string; playerId: string; batchId: string; evalId: string;
  }>();
  const { team } = useTeam();
  const router = useRouter();
  const { profile } = useAuth();

  const primary = primaryColor ?? '#22C55E';
  const isEdit  = !!evalId;

  const [playerName, setPlayerName] = useState('');
  const [seasonLabel, setSeasonLabel] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [form, setForm] = useState<EvalData>({
    rating_technical: 0, rating_tactical: 0, rating_physical: 0, rating_mental: 0,
    q1_improvement: '', q2_focus: '', q3_message: '',
    ai_draft: '', final_text: '', status: 'draft',
  });
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    load();
  }, [playerId, batchId, evalId]);

  async function load() {
    setLoading(true);
    const [pRes, bRes] = await Promise.all([
      supabase.from('players').select('full_name').eq('id', playerId).single(),
      supabase.from('evaluation_batches').select('season_label,period_label').eq('id', batchId).single(),
    ]);
    if (pRes.data) setPlayerName(pRes.data.full_name);
    if (bRes.data) { setSeasonLabel(bRes.data.season_label); setPeriodLabel(bRes.data.period_label); }

    if (evalId) {
      const { data } = await supabase
        .from('player_evaluations')
        .select('rating_technical,rating_tactical,rating_physical,rating_mental,q1_improvement,q2_focus,q3_message,ai_draft,final_text,status')
        .eq('id', evalId)
        .single();
      if (data) setForm(data as EvalData);
    }
    setLoading(false);
  }

  function set<K extends keyof EvalData>(key: K, value: EvalData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const ratingsComplete = form.rating_technical > 0 && form.rating_tactical > 0 &&
                          form.rating_physical > 0 && form.rating_mental > 0;
  const questionsComplete = form.q1_improvement.trim() && form.q2_focus.trim() && form.q3_message.trim();
  const canGenerate = ratingsComplete && questionsComplete;

  async function generateAI() {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: playerName,
          season_label: seasonLabel,
          period_label: periodLabel,
          rating_technical: form.rating_technical,
          rating_tactical: form.rating_tactical,
          rating_physical: form.rating_physical,
          rating_mental: form.rating_mental,
          q1_improvement: form.q1_improvement,
          q2_focus: form.q2_focus,
          q3_message: form.q3_message,
        }),
      });
      const json = await res.json();
      if (json.text) {
        set('ai_draft', json.text);
        set('final_text', json.text);
      }
    } catch {
      Alert.alert('Error', 'Could not generate report. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function save(submitNow = false) {
    if (!team || !profile) return;
    setSaving(true);

    const payload = {
      batch_id:          batchId,
      club_id:           team.club_id,
      team_id:           team.id,
      player_id:         playerId,
      coach_id:          profile.id,
      season_label:      seasonLabel,
      period_label:      periodLabel,
      rating_technical:  form.rating_technical,
      rating_tactical:   form.rating_tactical,
      rating_physical:   form.rating_physical,
      rating_mental:     form.rating_mental,
      q1_improvement:    form.q1_improvement,
      q2_focus:          form.q2_focus,
      q3_message:        form.q3_message,
      ai_draft:          form.ai_draft,
      final_text:        form.final_text,
      status:            (submitNow ? 'submitted' : 'draft') as 'submitted' | 'draft',
      ...(submitNow ? { submitted_at: new Date().toISOString() } : {}),
    };

    if (isEdit) {
      await supabase.from('player_evaluations').update(payload).eq('id', evalId);
    } else {
      await supabase.from('player_evaluations').insert(payload);
    }

    // Update batch completed_count directly
    const { count } = await supabase
      .from('player_evaluations')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .neq('status', 'draft');
    await supabase.from('evaluation_batches').update({ completed_count: count ?? 0 }).eq('id', batchId);

    setSaving(false);
    router.back();
  }

  if (loading) {
    return (
      <View style={st.screen}>
        <ClubHeader title="Evaluation" onBack={() => router.back()} />
        <View style={st.center}><ActivityIndicator color={primary} /></View>
      </View>
    );
  }

  return (
    <View style={st.screen}>
      <ClubHeader title={playerName || 'Evaluation'} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Period badge */}
          <View style={st.periodBadge}>
            <Ionicons name="ribbon-outline" size={14} color="#A855F7" />
            <Text style={st.periodText}>{periodLabel} · {seasonLabel}</Text>
          </View>

          {/* Ratings */}
          <View style={st.card}>
            <Text style={st.cardTitle}>Ratings</Text>
            <Text style={st.cardSub}>Rate {playerName.split(' ')[0]} in each area (1–5)</Text>
            <View style={{ marginTop: 16 }}>
              <RatingRow label="Technical" value={form.rating_technical} onChange={v => set('rating_technical', v)} />
              <RatingRow label="Tactical"  value={form.rating_tactical}  onChange={v => set('rating_tactical', v)} />
              <RatingRow label="Physical"  value={form.rating_physical}  onChange={v => set('rating_physical', v)} />
              <RatingRow label="Mental / Attitude" value={form.rating_mental} onChange={v => set('rating_mental', v)} />
            </View>
          </View>

          {/* Coach questions */}
          <View style={st.card}>
            <Text style={st.cardTitle}>Your Notes</Text>
            <Text style={st.cardSub}>Answer in 1–2 bullet points. The AI will turn these into a polished report.</Text>

            <Text style={st.qLabel}>Biggest improvement this period</Text>
            <TextInput
              style={st.textarea}
              multiline numberOfLines={3}
              placeholder="e.g. First touch has improved significantly under pressure"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              value={form.q1_improvement}
              onChangeText={v => set('q1_improvement', v)}
              textAlignVertical="top"
            />

            <Text style={st.qLabel}>Main area to focus on next</Text>
            <TextInput
              style={st.textarea}
              multiline numberOfLines={3}
              placeholder="e.g. Decision-making in the final third"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              value={form.q2_focus}
              onChangeText={v => set('q2_focus', v)}
              textAlignVertical="top"
            />

            <Text style={st.qLabel}>Personal message to player and family</Text>
            <TextInput
              style={st.textarea}
              multiline numberOfLines={3}
              placeholder="e.g. Jack's attitude is outstanding and he leads by example every session"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              value={form.q3_message}
              onChangeText={v => set('q3_message', v)}
              textAlignVertical="top"
            />
          </View>

          {/* AI generate */}
          <TouchableOpacity
            style={[st.generateBtn, { opacity: canGenerate && !generating ? 1 : 0.4 }]}
            onPress={generateAI}
            disabled={!canGenerate || generating}
            activeOpacity={0.85}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="sparkles-outline" size={16} color="#fff" />
            )}
            <Text style={st.generateBtnText}>
              {generating ? 'Generating…' : form.ai_draft ? 'Regenerate Report' : 'Generate AI Report'}
            </Text>
          </TouchableOpacity>

          {/* Final text editor */}
          {form.final_text ? (
            <View style={st.card}>
              <View style={st.reportHeader}>
                <Text style={st.cardTitle}>Report</Text>
                <View style={st.aiChip}>
                  <Ionicons name="sparkles" size={10} color="#A855F7" />
                  <Text style={st.aiChipText}>AI drafted</Text>
                </View>
              </View>
              <Text style={st.cardSub}>Edit the text before submitting.</Text>
              <TextInput
                style={[st.textarea, st.reportInput]}
                multiline
                value={form.final_text}
                onChangeText={v => set('final_text', v)}
                textAlignVertical="top"
              />
            </View>
          ) : null}

          {/* Actions */}
          <View style={st.actions}>
            <TouchableOpacity
              style={[st.saveBtn, { backgroundColor: PULSE_COLORS.ui.surface, borderColor: PULSE_COLORS.ui.border }]}
              onPress={() => save(false)}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.text} /> : <Text style={st.saveBtnText}>Save Draft</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.saveBtn, { backgroundColor: primary, borderColor: 'transparent', opacity: form.final_text ? 1 : 0.4 }]}
              onPress={() => save(true)}
              disabled={saving || !form.final_text}
              activeOpacity={0.85}
            >
              <Text style={[st.saveBtnText, { color: '#000' }]}>Submit</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:        { padding: 16, gap: 14 },

  periodBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(168,85,247,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  periodText:    { fontSize: 12, fontWeight: '700', color: '#A855F7' },

  card:          { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 18 },
  cardTitle:     { fontSize: 16, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  cardSub:       { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, marginBottom: 4 },

  qLabel:        { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, marginTop: 14, marginBottom: 6 },
  textarea:      { backgroundColor: PULSE_COLORS.ui.background, borderRadius: 12, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 12, fontSize: 14, color: PULSE_COLORS.ui.text, minHeight: 80 },
  reportInput:   { minHeight: 140 },

  generateBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#A855F7', borderRadius: 14, paddingVertical: 15 },
  generateBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  reportHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  aiChip:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(168,85,247,0.12)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  aiChipText:    { fontSize: 10, fontWeight: '700', color: '#A855F7' },

  actions:       { flexDirection: 'row', gap: 10 },
  saveBtn:       { flex: 1, padding: 15, borderRadius: 14, alignItems: 'center', borderWidth: 1, justifyContent: 'center' },
  saveBtnText:   { fontSize: 15, fontWeight: '800', color: PULSE_COLORS.ui.text },
});
