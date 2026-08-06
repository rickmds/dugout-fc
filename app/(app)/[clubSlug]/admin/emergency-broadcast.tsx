import { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useClub } from '../../../../hooks/useClub';
import { PULSE_COLORS } from '../../../../constants/colors';
import ClubHeader from '../../../../components/ui/ClubHeader';

const APP_BASE = process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

type Step = 'compose' | 'generating' | 'preview';

export default function EmergencyBroadcastScreen() {
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const router = useRouter();
  const { club, session } = useAuth();
  const { primaryColor, rgba } = useClub();

  const [step, setStep]         = useState<Step>('compose');
  const [situation, setSituation] = useState('');
  const [subject, setSubject]   = useState('');
  const [message, setMessage]   = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending]   = useState(false);

  async function generateMessage() {
    if (!situation.trim()) { Alert.alert('Describe the situation first'); return; }
    setGenerating(true);
    setStep('generating');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const prompt = [
        `Write a concise, urgent emergency broadcast message for ${club?.name ?? 'the club'}.`,
        `Situation: ${situation.trim()}.`,
        'The message goes to all parents, coaches, and players.',
        'Be clear, direct, and professional. 2-4 sentences. Do not include a subject line, greeting, or signature.',
        'Also write a short subject line (max 10 words) for the email, prefixed with "SUBJECT: ".',
        'Output format: SUBJECT: <subject line>\n<message body>',
      ].join(' ');

      const res = await fetch(`${APP_BASE}/api/ai/generate-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const raw: string = json.result ?? '';

      const subjectMatch = raw.match(/^SUBJECT:\s*(.+?)(?:\n|$)/i);
      const extractedSubject = subjectMatch ? subjectMatch[1].trim() : `🚨 Urgent Message from ${club?.name ?? 'the club'}`;
      const bodyStart = raw.indexOf('\n');
      const extractedBody = bodyStart > -1 ? raw.slice(bodyStart + 1).trim() : raw.trim();

      setSubject(extractedSubject);
      setMessage(extractedBody);
      setStep('preview');
    } catch (e: any) {
      Alert.alert('Could not generate message', e?.message ?? 'Check your connection and try again.');
      setStep('compose');
    }
    setGenerating(false);
  }

  async function sendBroadcast() {
    if (!club?.id || !message.trim()) return;
    setSending(true);
    try {
      const { data: { session: freshSession } } = await supabase.auth.refreshSession();
      const res = await fetch(`${APP_BASE}/api/emergency-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${freshSession?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          club_id: club.id,
          subject: subject.trim() || `🚨 Urgent Message from ${club.name}`,
          message: message.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');

      Alert.alert(
        '🚨 Broadcast sent',
        `Push notifications: ${json.push_sent ?? 0}\nEmails sent: ${json.emails_sent ?? 0}`,
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Failed to send broadcast', e.message ?? 'Unknown error');
    }
    setSending(false);
  }

  return (
    <View style={st.root}>
      <ClubHeader
        title="Emergency Broadcast"
        subtitle="Send urgent message to entire club"
        onBack={() => step === 'preview' ? setStep('compose') : router.back()}
      />

      <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Warning banner ── */}
        <View style={st.warnBanner}>
          <Ionicons name="warning" size={16} color="#DC2626" />
          <Text style={st.warnText}>
            This sends an immediate push notification and email to <Text style={{ fontWeight: '800' }}>every member</Text> of {club?.name ?? 'your club'}. Use only for urgent, time-sensitive communications.
          </Text>
        </View>

        {/* ── Compose ── */}
        {step === 'compose' && (
          <>
            <Text style={st.sectionLabel}>DESCRIBE THE SITUATION</Text>
            <View style={st.card}>
              <TextInput
                style={[st.textArea, { minHeight: 120 }]}
                placeholder="e.g. Lightning has been spotted near the complex. All fields are closing immediately and everyone must evacuate to the main building."
                placeholderTextColor={PULSE_COLORS.ui.muted}
                multiline
                value={situation}
                onChangeText={setSituation}
                autoFocus
              />
            </View>
            <Text style={st.hint}>AI will turn this into a professional broadcast message</Text>

            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: situation.trim() ? primaryColor : PULSE_COLORS.ui.border, marginTop: 24 }]}
              onPress={generateMessage}
              disabled={!situation.trim()}
              activeOpacity={0.85}
            >
              <Ionicons name="sparkles" size={16} color="#fff" />
              <Text style={st.primaryBtnText}>Write broadcast with AI</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={st.ghostBtn}
              onPress={() => {
                setSubject('');
                setMessage('');
                setStep('preview');
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="create-outline" size={14} color={primaryColor} />
              <Text style={[st.ghostBtnText, { color: primaryColor }]}>Write message manually instead</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Generating ── */}
        {step === 'generating' && (
          <View style={st.center}>
            <Ionicons name="sparkles" size={40} color={primaryColor} style={{ marginBottom: 16 }} />
            <Text style={st.generatingTitle}>AI is writing your broadcast…</Text>
            <Text style={st.generatingBody}>A few seconds</Text>
            <ActivityIndicator color={primaryColor} style={{ marginTop: 20 }} />
          </View>
        )}

        {/* ── Preview + edit ── */}
        {step === 'preview' && (
          <>
            <Text style={st.sectionLabel}>EMAIL SUBJECT</Text>
            <View style={st.card}>
              <TextInput
                style={[st.textArea, { minHeight: 44 }]}
                value={subject}
                onChangeText={setSubject}
                placeholder={`🚨 Urgent Message from ${club?.name ?? 'Club'}`}
                placeholderTextColor={PULSE_COLORS.ui.muted}
              />
            </View>

            <Text style={[st.sectionLabel, { marginTop: 20 }]}>MESSAGE BODY</Text>
            <View style={st.card}>
              <TextInput
                style={[st.textArea, { minHeight: 180 }]}
                value={message}
                onChangeText={setMessage}
                multiline
                placeholderTextColor={PULSE_COLORS.ui.muted}
                placeholder="Your message to the club…"
              />
            </View>
            <Text style={st.hint}>Edit before sending. This goes to everyone immediately.</Text>

            <View style={[st.recipientBadge, { backgroundColor: rgba(0.08), borderColor: rgba(0.2) }]}>
              <Ionicons name="people" size={14} color={primaryColor} />
              <Text style={[st.recipientText, { color: primaryColor }]}>All coaches, parents and players in {club?.name}</Text>
            </View>

            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: sending ? PULSE_COLORS.ui.border : '#DC2626', marginTop: 24 }]}
              onPress={() => {
                Alert.alert(
                  '🚨 Confirm broadcast',
                  'This will immediately push notify and email every club member. Are you sure?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Send now', style: 'destructive', onPress: sendBroadcast },
                  ]
                );
              }}
              disabled={sending || !message.trim()}
              activeOpacity={0.85}
            >
              {sending
                ? <><ActivityIndicator size="small" color="#fff" /><Text style={st.primaryBtnText}>Sending…</Text></>
                : <><Ionicons name="megaphone" size={16} color="#fff" /><Text style={st.primaryBtnText}>Send emergency broadcast</Text></>
              }
            </TouchableOpacity>

            {situation.trim() && (
              <TouchableOpacity style={st.ghostBtn} onPress={generateMessage} disabled={generating}>
                <Ionicons name="refresh" size={14} color={primaryColor} />
                <Text style={[st.ghostBtnText, { color: primaryColor }]}>{generating ? 'Regenerating…' : 'Regenerate message'}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root:            { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  scroll:          { padding: 16, paddingBottom: 40 },
  center:          { alignItems: 'center', justifyContent: 'center', padding: 40 },
  warnBanner:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', marginBottom: 24 },
  warnText:        { fontSize: 13, color: '#B91C1C', lineHeight: 19, flex: 1 },
  sectionLabel:    { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  card:            { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, overflow: 'hidden' },
  textArea:        { fontSize: 14, color: PULSE_COLORS.ui.text, lineHeight: 22, padding: 14 },
  hint:            { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 6, marginBottom: 0, paddingHorizontal: 4 },
  primaryBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
  primaryBtnText:  { fontSize: 15, fontWeight: '800', color: '#fff' },
  ghostBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, marginTop: 10 },
  ghostBtnText:    { fontSize: 14, fontWeight: '600' },
  generatingTitle: { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text, textAlign: 'center' },
  generatingBody:  { fontSize: 14, color: PULSE_COLORS.ui.muted, marginTop: 6, textAlign: 'center' },
  recipientBadge:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 16 },
  recipientText:   { fontSize: 13, fontWeight: '600', flex: 1 },
});
