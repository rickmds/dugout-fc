import { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Switch, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { PULSE_COLORS } from '../../constants/colors';

type ResultVisibility = 'always' | 'after_vote' | 'after_close';

type Props = {
  visible: boolean;
  teamId: string;
  profileId: string;
  primaryColor: string;
  rgba: (a: number) => string;
  linkedEventId?: string | null;
  linkedEventTitle?: string | null;
  onClose: () => void;
  onCreated: () => void;
};

const RESULT_OPTIONS: { key: ResultVisibility; label: string; desc: string }[] = [
  { key: 'always',     label: 'Always',          desc: 'Everyone sees results immediately' },
  { key: 'after_vote', label: 'After voting',     desc: 'Results reveal once you vote' },
  { key: 'after_close', label: 'After poll closes', desc: 'Results hidden until deadline' },
];

export default function CreatePollModal({ visible, teamId, profileId, primaryColor, rgba, linkedEventId, linkedEventTitle, onClose, onCreated }: Props) {
  const [question, setQuestion]           = useState('');
  const [options, setOptions]             = useState(['', '']);
  const [isAnonymous, setIsAnonymous]     = useState(false);
  const [isMultiple, setIsMultiple]       = useState(false);
  const [resultVis, setResultVis]         = useState<ResultVisibility>('always');
  const [rsvpGated, setRsvpGated]         = useState(false);
  const [hasDeadline, setHasDeadline]     = useState(false);
  const [closesAt, setClosesAt]           = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(20, 0, 0, 0); return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [posting, setPosting]             = useState(false);

  function reset() {
    setQuestion('');
    setOptions(['', '']);
    setIsAnonymous(false);
    setIsMultiple(false);
    setResultVis('always');
    setRsvpGated(false);
    setHasDeadline(false);
    setPosting(false);
  }

  function handleClose() { reset(); onClose(); }

  function updateOption(idx: number, val: string) {
    setOptions(prev => prev.map((o, i) => (i === idx ? val : o)));
  }

  function addOption() {
    if (options.length >= 5) return;
    setOptions(prev => [...prev, '']);
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, i) => i !== idx));
  }

  async function handlePost() {
    const q = question.trim();
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (!q) { Alert.alert('Question required'); return; }
    if (opts.length < 2) { Alert.alert('At least 2 options required'); return; }

    setPosting(true);
    const sb = supabase as any;

    const { data: poll, error: pollErr } = await sb
      .from('team_polls')
      .insert({
        team_id:            teamId,
        event_id:           linkedEventId ?? null,
        created_by:         profileId,
        question:           q,
        closes_at:          hasDeadline ? closesAt.toISOString() : null,
        is_anonymous:       isAnonymous,
        is_multiple_choice: isMultiple,
        result_visibility:  resultVis,
        rsvp_gated:         rsvpGated && !!linkedEventId,
      })
      .select('id')
      .single();

    if (pollErr || !poll) {
      Alert.alert('Error', 'Could not create poll. Please try again.');
      setPosting(false);
      return;
    }

    const { error: optErr } = await sb
      .from('team_poll_options')
      .insert(opts.map((label, i) => ({ poll_id: poll.id, label, sort_order: i })));

    if (optErr) {
      await sb.from('team_polls').delete().eq('id', poll.id);
      Alert.alert('Error', 'Could not save options. Please try again.');
      setPosting(false);
      return;
    }

    reset();
    onCreated();
  }

  const canPost = question.trim().length > 0
    && options.filter(o => o.trim()).length >= 2
    && !posting;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={PULSE_COLORS.ui.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>New Poll</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={!canPost}
            style={[styles.postBtn, { backgroundColor: primaryColor, opacity: canPost ? 1 : 0.4 }]}
          >
            <Text style={styles.postBtnText}>{posting ? 'Posting…' : 'Post'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Linked event banner */}
          {linkedEventTitle && (
            <View style={[styles.linkedBanner, { borderColor: `${primaryColor}40`, backgroundColor: rgba(0.06) }]}>
              <Ionicons name="link-outline" size={13} color={primaryColor} />
              <Text style={[styles.linkedText, { color: primaryColor }]}>Linked to: {linkedEventTitle}</Text>
            </View>
          )}

          {/* Question */}
          <Text style={styles.label}>Question</Text>
          <TextInput
            style={styles.questionInput}
            placeholder="Ask your team something…"
            placeholderTextColor={PULSE_COLORS.ui.muted}
            value={question}
            onChangeText={setQuestion}
            multiline
            maxLength={200}
          />

          {/* Options */}
          <Text style={styles.label}>Options</Text>
          {options.map((opt, i) => (
            <View key={i} style={styles.optionRow}>
              <TextInput
                style={styles.optionInput}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={PULSE_COLORS.ui.muted}
                value={opt}
                onChangeText={v => updateOption(i, v)}
                maxLength={80}
              />
              {options.length > 2 && (
                <TouchableOpacity onPress={() => removeOption(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {options.length < 5 && (
            <TouchableOpacity style={styles.addOptionBtn} onPress={addOption}>
              <Ionicons name="add" size={16} color={primaryColor} />
              <Text style={[styles.addOptionText, { color: primaryColor }]}>Add option</Text>
            </TouchableOpacity>
          )}

          {/* Toggles */}
          <Text style={[styles.label, { marginTop: 20 }]}>Settings</Text>
          <View style={styles.settingsCard}>

            <ToggleRow
              label="Anonymous"
              desc="Hide who voted"
              value={isAnonymous}
              onChange={setIsAnonymous}
              primaryColor={primaryColor}
            />

            <View style={styles.divider} />

            <ToggleRow
              label="Multi-select"
              desc="Allow multiple choices"
              value={isMultiple}
              onChange={setIsMultiple}
              primaryColor={primaryColor}
            />

            {linkedEventId && (
              <>
                <View style={styles.divider} />
                <ToggleRow
                  label="Attending only"
                  desc="Only players who RSVPed can vote"
                  value={rsvpGated}
                  onChange={setRsvpGated}
                  primaryColor={primaryColor}
                />
              </>
            )}

            <View style={styles.divider} />

            <ToggleRow
              label="Set deadline"
              desc={hasDeadline ? closesAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Poll stays open indefinitely'}
              value={hasDeadline}
              onChange={v => { setHasDeadline(v); if (v) setShowDatePicker(true); }}
              primaryColor={primaryColor}
            />

            {showDatePicker && hasDeadline && (
              <DateTimePicker
                value={closesAt}
                mode="datetime"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, d) => { if (d) setClosesAt(d); }}
                themeVariant="dark"
              />
            )}
          </View>

          {/* Result visibility */}
          <Text style={[styles.label, { marginTop: 20 }]}>Show results</Text>
          <View style={styles.settingsCard}>
            {RESULT_OPTIONS.map((opt, i) => (
              <View key={opt.key}>
                {i > 0 && <View style={styles.divider} />}
                <TouchableOpacity
                  style={styles.radioRow}
                  onPress={() => setResultVis(opt.key)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.radioLabel}>{opt.label}</Text>
                    <Text style={styles.radioDesc}>{opt.desc}</Text>
                  </View>
                  <View style={[styles.radioOuter, resultVis === opt.key && { borderColor: primaryColor }]}>
                    {resultVis === opt.key && <View style={[styles.radioInner, { backgroundColor: primaryColor }]} />}
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ToggleRow({ label, desc, value, onChange, primaryColor }: {
  label: string; desc: string; value: boolean;
  onChange: (v: boolean) => void; primaryColor: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: PULSE_COLORS.ui.border, true: primaryColor }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  title: { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text },
  postBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  postBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  scroll: { flex: 1 },
  content: { padding: 16, gap: 8 },

  linkedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 4,
  },
  linkedText: { fontSize: 13, fontWeight: '600' },

  label: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.6, marginBottom: 6, marginTop: 4 },

  questionInput: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12, padding: 14,
    fontSize: 15, color: PULSE_COLORS.ui.text,
    minHeight: 72, textAlignVertical: 'top',
  },

  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  optionInput: {
    flex: 1,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: PULSE_COLORS.ui.text,
  },
  addOptionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4,
  },
  addOptionText: { fontSize: 14, fontWeight: '600' },

  settingsCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: PULSE_COLORS.ui.border, marginHorizontal: 16 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text },
  toggleDesc: { fontSize: 12, color: PULSE_COLORS.ui.muted },

  radioRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  radioLabel: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text },
  radioDesc: { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 1 },
  radioOuter: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 8, height: 8, borderRadius: 4 },
});
