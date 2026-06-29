import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { useClub } from '../../../hooks/useClub';
import { DUGOUT_COLORS } from '../../../constants/colors';

const TOPICS = [
  'Bug report',
  'Feature request',
  'Account issue',
  'Billing question',
  'Other',
] as const;

type Topic = typeof TOPICS[number];

export default function SupportScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const { primaryColor } = useClub();

  const [topic, setTopic]     = useState<Topic>('Bug report');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  async function handleSend() {
    if (!message.trim()) { Alert.alert('Please describe your issue'); return; }
    setSending(true);

    const body = `From: ${profile?.full_name ?? 'Unknown'} (${user?.email ?? 'no email'})\nRole: ${profile?.role ?? 'unknown'}\nTopic: ${topic}\n\n${message.trim()}`;

    const { error } = await supabase.functions.invoke('send-team-email', {
      body: {
        to: [{ email: 'support@dugoutfc.app', name: 'Dugout FC Support' }],
        cc: [],
        subject: `[Support] ${topic}`,
        body,
        from_name: profile?.full_name ?? 'App User',
        team_name: 'Dugout FC',
        from_email: 'support@dugoutfc.app',
        reply_to: user?.email ?? null,
        attachments: [],
      },
    });

    setSending(false);
    if (error) {
      Alert.alert('Could not send', 'Please email support@dugoutfc.app directly.');
      return;
    }
    setSent(true);
  }

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="chevron-back" size={24} color={DUGOUT_COLORS.ui.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Contact Support</Text>
        <View style={{ width: 40 }} />
      </View>

      {sent ? (
        <View style={st.sentWrap}>
          <View style={[st.sentIcon, { backgroundColor: `${primaryColor}18` }]}>
            <Ionicons name="checkmark-circle" size={40} color={primaryColor} />
          </View>
          <Text style={st.sentTitle}>Message sent</Text>
          <Text style={st.sentSub}>We&apos;ll get back to you at {user?.email} usually within 24 hours.</Text>
          <TouchableOpacity style={[st.doneBtn, { backgroundColor: primaryColor }]} onPress={() => router.back()}>
            <Text style={st.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <Text style={st.intro}>Got an issue or idea? We reply personally, usually the same day.</Text>

          {/* Topic picker */}
          <Text style={st.label}>Topic</Text>
          <View style={st.topicGrid}>
            {TOPICS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[st.topicChip, topic === t && [st.topicChipActive, { backgroundColor: primaryColor }]]}
                onPress={() => setTopic(t)}
              >
                <Text style={[st.topicChipText, topic === t && st.topicChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Message */}
          <Text style={st.label}>Message</Text>
          <TextInput
            style={st.textArea}
            value={message}
            onChangeText={setMessage}
            placeholder="Describe what's happening…"
            placeholderTextColor={DUGOUT_COLORS.ui.muted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <Text style={st.replyNote}>
            We&apos;ll reply to <Text style={{ color: DUGOUT_COLORS.ui.text }}>{user?.email}</Text>
          </Text>

          <TouchableOpacity
            style={[st.sendBtn, { backgroundColor: primaryColor }, (!message.trim() || sending) && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={!message.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#000" size="small" />
              : <>
                  <Ionicons name="send-outline" size={16} color="#000" />
                  <Text style={st.sendBtnText}>Send message</Text>
                </>
            }
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  content: { padding: 20, paddingBottom: 48 },
  intro: { fontSize: 14, color: DUGOUT_COLORS.ui.textSecondary, marginBottom: 24, lineHeight: 20 },

  label: { fontSize: 12, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, letterSpacing: 0.5, marginBottom: 10 },

  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  topicChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.surface,
  },
  topicChipActive: { borderColor: 'transparent' },
  topicChipText: { fontSize: 13, fontWeight: '600', color: DUGOUT_COLORS.ui.textSecondary },
  topicChipTextActive: { color: '#000' },

  textArea: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 14, padding: 14,
    color: DUGOUT_COLORS.ui.text, fontSize: 15,
    minHeight: 140, marginBottom: 12,
  },
  replyNote: { fontSize: 12, color: DUGOUT_COLORS.ui.muted, marginBottom: 24 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },

  sentWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  sentIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  sentTitle: { fontSize: 24, fontWeight: '800', color: DUGOUT_COLORS.ui.text, marginBottom: 10 },
  sentSub: { fontSize: 14, color: DUGOUT_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  doneBtn: { borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },
});
