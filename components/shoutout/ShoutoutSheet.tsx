import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { PULSE_COLORS } from '../../constants/colors';
import { sendProfilesPush } from '../../lib/push';

export const SHOUTOUT_TAGS: { tag: string; emoji: string; label: string }[] = [
  { tag: 'hustle',      emoji: '💪', label: 'Hustle' },
  { tag: 'teamwork',    emoji: '🤝', label: 'Great Teamwork' },
  { tag: 'improvement', emoji: '📈', label: 'Big Improvement' },
  { tag: 'attitude',    emoji: '😊', label: 'Great Attitude' },
  { tag: 'leadership',  emoji: '🧭', label: 'Leadership' },
];

type RosterPlayer = { id: string; full_name: string; profile_id: string | null };

// Coach-initiated, one player and one tag at a time — a quick, genuine
// moment of recognition, not an auto-prompt. Sent immediately (no cron):
// this isn't time-window-gated the way reflections are, since the coach
// is choosing the moment themselves.
export default function ShoutoutSheet({
  visible, onClose, eventId, teamId, eventTitle, players, clubSlug,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  teamId: string;
  eventTitle: string;
  players: RosterPlayer[];
  clubSlug: string;
}) {
  const { profile } = useAuth();
  const [step, setStep] = useState<'pick' | 'compose' | 'sent'>('pick');
  const [selected, setSelected] = useState<RosterPlayer | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  function reset() {
    setStep('pick'); setSelected(null); setTag(null); setNote('');
  }
  function handleClose() {
    reset();
    onClose();
  }

  function pickPlayer(p: RosterPlayer) {
    setSelected(p);
    setTag(null);
    setNote('');
    setStep('compose');
  }

  async function handleSend() {
    if (!selected || !tag || !profile || sending) return;
    setSending(true);

    await supabase.from('player_shoutouts').insert({
      event_id: eventId, player_id: selected.id, team_id: teamId,
      coach_id: profile.id, tag, note: note.trim() || null,
    });

    const { data: guardianRows } = await supabase
      .from('player_guardians').select('profile_id').eq('player_id', selected.id);
    const guardianIds = new Set<string>();
    if (selected.profile_id) guardianIds.add(selected.profile_id);
    for (const g of guardianRows ?? []) guardianIds.add(g.profile_id);

    const tagMeta = SHOUTOUT_TAGS.find(t => t.tag === tag)!;
    if (guardianIds.size > 0) {
      sendProfilesPush({
        profileIds: Array.from(guardianIds),
        title: '🌟 Coach gave a shoutout!',
        body: `${selected.full_name.split(' ')[0]} — ${tagMeta.emoji} ${tagMeta.label}`,
        data: { type: 'player_shoutout', player_id: selected.id, club_slug: clubSlug },
      }).catch(() => {});
    }

    setSending(false);
    setStep('sent');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={st.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetWrap}>
          <View style={st.sheet}>
            <View style={st.handle} />

            {step === 'pick' && (
              <>
                <Text style={st.title}>Give a shoutout</Text>
                <Text style={st.subtitle}>{eventTitle} · who stood out?</Text>
                <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                  {players.map(p => (
                    <TouchableOpacity key={p.id} style={st.playerRow} onPress={() => pickPlayer(p)} activeOpacity={0.7}>
                      <Text style={st.playerName}>{p.full_name}</Text>
                      <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
                    </TouchableOpacity>
                  ))}
                  {players.length === 0 && <Text style={st.emptyText}>No confirmed players for this event yet.</Text>}
                </ScrollView>
                <TouchableOpacity style={st.skipBtn} onPress={handleClose}>
                  <Text style={st.skipText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'compose' && selected && (
              <>
                <Text style={st.title}>Shoutout for {selected.full_name.split(' ')[0]}</Text>
                <Text style={st.subtitle}>What stood out?</Text>
                <View style={st.tagWrap}>
                  {SHOUTOUT_TAGS.map(t => {
                    const sel = tag === t.tag;
                    return (
                      <TouchableOpacity
                        key={t.tag}
                        style={[st.tagPill, sel && st.tagPillSel]}
                        onPress={() => setTag(t.tag)}
                        activeOpacity={0.75}
                      >
                        <Text style={st.tagEmoji}>{t.emoji}</Text>
                        <Text style={[st.tagLabel, sel && st.tagLabelSel]}>{t.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={st.fieldLabel}>Add a note <Text style={st.optional}>(optional)</Text></Text>
                <TextInput
                  style={st.input}
                  multiline
                  numberOfLines={2}
                  placeholder="She tracked back on defense all half…"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  value={note}
                  onChangeText={setNote}
                />

                <TouchableOpacity
                  style={[st.sendBtn, tag && !sending && st.sendBtnReady]}
                  disabled={!tag || sending}
                  onPress={handleSend}
                  activeOpacity={0.85}
                >
                  <Text style={[st.sendBtnText, tag && !sending && st.sendBtnTextReady]}>
                    {sending ? 'Sending…' : 'Send shoutout'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.skipBtn} onPress={() => setStep('pick')} disabled={sending}>
                  <Text style={st.skipText}>← Choose a different player</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'sent' && selected && tag && (
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <Text style={{ fontSize: 40, marginBottom: 10 }}>{SHOUTOUT_TAGS.find(t => t.tag === tag)?.emoji}</Text>
                <Text style={st.title}>Sent to {selected.full_name.split(' ')[0]}'s family</Text>
                <Text style={[st.subtitle, { textAlign: 'center', marginBottom: 20 }]}>They'll get a notification right away.</Text>
                <TouchableOpacity style={[st.sendBtn, st.sendBtnReady, { width: '100%' }]} onPress={reset} activeOpacity={0.85}>
                  <Text style={[st.sendBtnText, st.sendBtnTextReady]}>Give another</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.skipBtn} onPress={handleClose}>
                  <Text style={st.skipText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetWrap: { width: '100%' },
  sheet: {
    backgroundColor: '#131417',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 1, borderColor: '#26272B', borderBottomWidth: 0,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30,
  },
  handle: { width: 36, height: 4, borderRadius: 3, backgroundColor: '#3F4045', alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 3, letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: PULSE_COLORS.ui.muted, marginBottom: 16 },

  playerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1E1F22',
  },
  playerName: { fontSize: 14.5, fontWeight: '600', color: PULSE_COLORS.ui.text },
  emptyText: { fontSize: 13, color: PULSE_COLORS.ui.muted, textAlign: 'center', paddingVertical: 20 },

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  tagPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1A1B1E', borderWidth: 1.5, borderColor: '#2A2B30',
    borderRadius: 20, paddingVertical: 9, paddingHorizontal: 13,
  },
  tagPillSel: { backgroundColor: 'rgba(34,197,94,0.14)', borderColor: PULSE_COLORS.brand.green },
  tagEmoji: { fontSize: 15 },
  tagLabel: { fontSize: 12.5, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
  tagLabelSel: { color: PULSE_COLORS.brand.green },

  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, marginBottom: 7 },
  optional: { fontWeight: '400', color: PULSE_COLORS.ui.muted, textTransform: 'none' },
  input: {
    backgroundColor: '#1A1B1E', borderWidth: 1.5, borderColor: '#2A2B30', borderRadius: 12,
    padding: 12, color: PULSE_COLORS.ui.text, fontSize: 13, minHeight: 52, textAlignVertical: 'top',
    marginBottom: 16,
  },

  sendBtn: { backgroundColor: '#2A2B30', borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  sendBtnReady: { backgroundColor: PULSE_COLORS.brand.green },
  sendBtnText: { fontSize: 14.5, fontWeight: '800', color: '#6B6F78', letterSpacing: -0.2 },
  sendBtnTextReady: { color: '#06210F' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 12.5, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
});
