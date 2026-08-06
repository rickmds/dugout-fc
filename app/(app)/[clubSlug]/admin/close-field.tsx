import { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useClub } from '../../../../hooks/useClub';
import { PULSE_COLORS } from '../../../../constants/colors';
import ClubHeader from '../../../../components/ui/ClubHeader';

const APP_BASE = process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

type Field = { id: string; name: string; sub_zones?: string[] | null };

const REASONS = [
  { label: 'Rain / Wet conditions',  icon: '🌧️' },
  { label: 'Lightning in area',      icon: '⚡' },
  { label: 'Scheduled maintenance',  icon: '🔧' },
  { label: 'Frozen / Frost',         icon: '❄️' },
  { label: 'Tournament / Reserved',  icon: '🏆' },
  { label: 'Other',                  icon: '📋' },
];

const DURATIONS = [
  { value: 'rest_of_day',  label: 'Rest of today' },
  { value: 'hours',        label: 'Next few hours' },
  { value: 'date_range',   label: 'Specific dates' },
  { value: 'indefinite',   label: 'Until further notice' },
];

type Step = 'pick' | 'message' | 'preview';

export default function CloseFieldScreen() {
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const router = useRouter();
  const { user, club, session } = useAuth();
  const { primaryColor, rgba } = useClub();

  const [fields, setFields]               = useState<Field[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [reason, setReason]               = useState('');
  const [duration, setDuration]           = useState('rest_of_day');
  const [step, setStep]                   = useState<Step>('pick');
  const [situation, setSituation]         = useState('');
  const [message, setMessage]             = useState('');
  const [generating, setGenerating]       = useState(false);
  const [sending, setSending]             = useState(false);

  useEffect(() => {
    if (!club?.id) return;
    supabase.from('tryout_fields')
      .select('id, name, sub_zones')
      .eq('club_id', club.id)
      .order('sort_order')
      .order('name')
      .then(({ data }) => {
        setFields((data ?? []) as Field[]);
        setLoadingFields(false);
      });
  }, [club?.id]);

  function toggleField(name: string) {
    setSelectedFields(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  }

  async function generateMessage() {
    if (!reason) { Alert.alert('Select a reason first'); return; }
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const fieldList = selectedFields.length > 0 ? selectedFields.join(', ') : 'the field';
      const durationLabel = DURATIONS.find(d => d.value === duration)?.label ?? duration;
      const prompt = [
        `Write a concise, professional field closure notification for ${club?.name ?? 'the club'}.`,
        `Field(s) affected: ${fieldList}.`,
        `Reason: ${reason}.`,
        `Duration: ${durationLabel}.`,
        situation.trim() ? `Additional context: ${situation.trim()}` : '',
        'Write 2-3 sentences. Be direct and informative. Do not include a subject line or greeting. Output only the message body.',
      ].filter(Boolean).join(' ');

      const res = await fetch(`${APP_BASE}/api/ai/generate-closure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessage(json.result ?? '');
      setStep('preview');
    } catch (e: any) {
      Alert.alert('Could not generate message', e?.message ?? 'Check your connection and try again.');
    }
    setGenerating(false);
  }

  async function sendClosure() {
    if (!club?.id || !selectedFields.length || !message.trim()) return;
    setSending(true);
    try {
      const now = new Date().toISOString();
      let closedUntil: string | null = null;
      if (duration === 'rest_of_day') {
        const eod = new Date(); eod.setHours(23, 59, 59, 0);
        closedUntil = eod.toISOString();
      } else if (duration === 'hours') {
        const inFew = new Date(Date.now() + 4 * 3600000);
        closedUntil = inFew.toISOString();
      }

      const res = await fetch(`${APP_BASE}/api/fields/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          club_id: club.id,
          field_names: selectedFields,
          closed_from: now,
          closed_until: closedUntil,
          duration_label: duration,
          reason,
          notify_message: message.trim(),
          sent_by_profile_id: user?.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');

      const eventsLine = (json.events_affected ?? 0) > 0
        ? `\n${json.events_affected} scheduled session${json.events_affected !== 1 ? 's' : ''} cancelled — affected teams notified separately.`
        : '';
      Alert.alert(
        '✅ Field closed',
        `Push notifications sent. ${json.emails_sent ?? 0} email${json.emails_sent !== 1 ? 's' : ''} sent.${eventsLine}`,
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Failed to close field', e.message ?? 'Unknown error');
    }
    setSending(false);
  }

  const canProceed = selectedFields.length > 0 && !!reason;

  return (
    <View style={st.root}>
      <ClubHeader
        title="Close a Field"
        subtitle="Notify all affected parents & coaches"
        onBack={() => step === 'pick' ? router.back() : setStep('pick')}
      />

      {loadingFields ? (
        <View style={st.center}><ActivityIndicator color={primaryColor} /></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Step 1: Pick ── */}
          {step === 'pick' && (
            <>
              <Text style={st.sectionLabel}>WHICH FIELD(S)?</Text>
              {fields.length === 0 ? (
                <View style={st.emptyCard}>
                  <Text style={st.emptyText}>No fields set up yet. Add them from the web dashboard under Fields &amp; Venues.</Text>
                </View>
              ) : (
                <View style={st.card}>
                  {fields.map((f, i) => {
                    const selected = selectedFields.includes(f.name);
                    return (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => toggleField(f.name)}
                        style={[st.fieldRow, i > 0 && st.divider, selected && { backgroundColor: rgba(0.07) }]}
                        activeOpacity={0.7}
                      >
                        <View style={[st.checkbox, selected && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                          {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.fieldName, selected && { color: primaryColor }]}>{f.name}</Text>
                          {f.sub_zones?.length ? <Text style={st.fieldSub}>{f.sub_zones.join(', ')}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={[st.sectionLabel, { marginTop: 24 }]}>REASON</Text>
              <View style={st.card}>
                {REASONS.map((r, i) => (
                  <TouchableOpacity
                    key={r.label}
                    onPress={() => setReason(r.label)}
                    style={[st.fieldRow, i > 0 && st.divider, reason === r.label && { backgroundColor: rgba(0.07) }]}
                    activeOpacity={0.7}
                  >
                    <Text style={st.reasonIcon}>{r.icon}</Text>
                    <Text style={[st.fieldName, reason === r.label && { color: primaryColor, fontWeight: '700' }]}>{r.label}</Text>
                    {reason === r.label && <Ionicons name="checkmark-circle" size={18} color={primaryColor} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[st.sectionLabel, { marginTop: 24 }]}>HOW LONG?</Text>
              <View style={st.card}>
                {DURATIONS.map((d, i) => (
                  <TouchableOpacity
                    key={d.value}
                    onPress={() => setDuration(d.value)}
                    style={[st.fieldRow, i > 0 && st.divider, duration === d.value && { backgroundColor: rgba(0.07) }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.fieldName, duration === d.value && { color: primaryColor, fontWeight: '700' }]}>{d.label}</Text>
                    {duration === d.value && <Ionicons name="checkmark-circle" size={18} color={primaryColor} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[st.sectionLabel, { marginTop: 24 }]}>EXTRA DETAILS (OPTIONAL)</Text>
              <View style={st.card}>
                <TextInput
                  style={st.textArea}
                  placeholder="e.g. The field is waterlogged after last night's rain. Session will not be rescheduled."
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  multiline
                  numberOfLines={3}
                  value={situation}
                  onChangeText={setSituation}
                />
              </View>

              <TouchableOpacity
                style={[st.primaryBtn, { backgroundColor: canProceed ? primaryColor : PULSE_COLORS.ui.border }, { marginTop: 28 }]}
                onPress={() => setStep('message')}
                disabled={!canProceed}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={st.primaryBtnText}>Write notification with AI</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 2: Generating / Preview ── */}
          {step === 'message' && (
            <View style={st.center}>
              <Ionicons name="sparkles" size={40} color={primaryColor} style={{ marginBottom: 16 }} />
              <Text style={st.generatingTitle}>AI is writing your message…</Text>
              <Text style={st.generatingBody}>This takes a few seconds</Text>
              <ActivityIndicator color={primaryColor} style={{ marginTop: 20 }} />
            </View>
          )}

          {step === 'preview' && (
            <>
              <View style={[st.alertBanner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                <Ionicons name="warning" size={16} color="#DC2626" />
                <Text style={st.alertText}>
                  This will close <Text style={{ fontWeight: '700' }}>{selectedFields.join(', ')}</Text> and notify all parents and coaches immediately.
                </Text>
              </View>

              <Text style={st.sectionLabel}>NOTIFICATION MESSAGE</Text>
              <View style={st.card}>
                <TextInput
                  style={[st.textArea, { minHeight: 160 }]}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                />
              </View>
              <Text style={st.hint}>Edit the message before sending if needed</Text>

              <View style={st.summaryCard}>
                <View style={st.summaryRow}>
                  <Ionicons name="location-outline" size={14} color={PULSE_COLORS.ui.muted} />
                  <Text style={st.summaryLabel}>Field(s)</Text>
                  <Text style={st.summaryValue}>{selectedFields.join(', ')}</Text>
                </View>
                <View style={[st.summaryRow, { borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border }]}>
                  <Ionicons name="alert-circle-outline" size={14} color={PULSE_COLORS.ui.muted} />
                  <Text style={st.summaryLabel}>Reason</Text>
                  <Text style={st.summaryValue}>{reason}</Text>
                </View>
                <View style={[st.summaryRow, { borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border }]}>
                  <Ionicons name="time-outline" size={14} color={PULSE_COLORS.ui.muted} />
                  <Text style={st.summaryLabel}>Duration</Text>
                  <Text style={st.summaryValue}>{DURATIONS.find(d => d.value === duration)?.label}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[st.primaryBtn, { backgroundColor: sending ? PULSE_COLORS.ui.border : '#DC2626', marginTop: 28 }]}
                onPress={sendClosure}
                disabled={sending || !message.trim()}
                activeOpacity={0.85}
              >
                {sending
                  ? <><ActivityIndicator size="small" color="#fff" /><Text style={st.primaryBtnText}>Sending…</Text></>
                  : <><Ionicons name="notifications" size={16} color="#fff" /><Text style={st.primaryBtnText}>Close field &amp; notify everyone</Text></>
                }
              </TouchableOpacity>

              <TouchableOpacity style={st.ghostBtn} onPress={generateMessage} disabled={generating}>
                <Ionicons name="refresh" size={14} color={primaryColor} />
                <Text style={[st.ghostBtnText, { color: primaryColor }]}>{generating ? 'Regenerating…' : 'Regenerate message'}</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Auto-generate when entering message step */}
      <GenerateTrigger
        active={step === 'message'}
        onGenerate={generateMessage}
      />
    </View>
  );
}

function GenerateTrigger({ active, onGenerate }: { active: boolean; onGenerate: () => void }) {
  const [fired, setFired] = useState(false);
  useEffect(() => {
    if (active && !fired) { setFired(true); onGenerate(); }
    if (!active) setFired(false);
  }, [active]);
  return null;
}

const st = StyleSheet.create({
  root:             { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  scroll:           { padding: 16, paddingBottom: 40 },
  sectionLabel:     { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  card:             { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, overflow: 'hidden' },
  fieldRow:         { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  divider:          { borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border },
  checkbox:         { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border, alignItems: 'center', justifyContent: 'center' },
  fieldName:        { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text, flex: 1 },
  fieldSub:         { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 2 },
  reasonIcon:       { fontSize: 18, width: 28 },
  emptyCard:        { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 20 },
  emptyText:        { fontSize: 14, color: PULSE_COLORS.ui.muted, lineHeight: 20, textAlign: 'center' },
  textArea:         { fontSize: 14, color: PULSE_COLORS.ui.text, lineHeight: 22, padding: 14, minHeight: 80 },
  alertBanner:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  alertText:        { fontSize: 13, color: '#B91C1C', lineHeight: 19, flex: 1 },
  hint:             { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 6, marginBottom: 16, paddingHorizontal: 4 },
  summaryCard:      { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, overflow: 'hidden' },
  summaryRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  summaryLabel:     { fontSize: 12, color: PULSE_COLORS.ui.muted, width: 70 },
  summaryValue:     { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.text, flex: 1 },
  primaryBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
  primaryBtnText:   { fontSize: 15, fontWeight: '800', color: '#fff' },
  ghostBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, marginTop: 10 },
  ghostBtnText:     { fontSize: 14, fontWeight: '600' },
  generatingTitle:  { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text, textAlign: 'center' },
  generatingBody:   { fontSize: 14, color: PULSE_COLORS.ui.muted, marginTop: 6, textAlign: 'center' },
});
