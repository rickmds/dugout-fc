import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { PULSE_COLORS } from '../../constants/colors';

export const FACES: { rating: number; emoji: string; label: string; color: string }[] = [
  { rating: 1, emoji: '😞', label: 'Rough', color: '#EF4444' },
  { rating: 2, emoji: '😕', label: 'Off',   color: '#F59E0B' },
  { rating: 3, emoji: '😐', label: 'Okay',  color: '#EAB308' },
  { rating: 4, emoji: '🙂', label: 'Good',  color: '#84CC16' },
  { rating: 5, emoji: '😄', label: 'Great', color: PULSE_COLORS.brand.green },
];

type ExistingReflection = { rating: number; went_well: string | null; needs_improvement: string | null } | null;

// Post-game self-reflection — bottom sheet, deliberately lightweight (30
// seconds, not a form). The rating is the only required field since it's
// what drives the trend view; the two text boxes are optional. Skipping
// leaves no record — this is a self-reflection tool, not a compliance check.
export default function ReflectionSheet({
  visible, onClose, eventId, playerId, teamId, playerName, eventSubtitle, existing, onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  playerId: string;
  teamId: string;
  playerName: string;
  eventSubtitle: string;
  existing?: ExistingReflection;
  onSaved: (rating: number) => void;
}) {
  const { profile } = useAuth();
  const [rating, setRating] = useState<number | null>(null);
  const [wentWell, setWentWell] = useState('');
  const [needsImprovement, setNeedsImprovement] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setRating(existing?.rating ?? null);
      setWentWell(existing?.went_well ?? '');
      setNeedsImprovement(existing?.needs_improvement ?? '');
    }
  }, [visible, existing]);

  async function handleSave() {
    if (!rating || saving) return;
    setSaving(true);
    const { error } = await supabase.from('player_reflections').upsert(
      {
        event_id: eventId,
        player_id: playerId,
        team_id: teamId,
        submitted_by: profile?.id,
        rating,
        went_well: wentWell.trim() || null,
        needs_improvement: needsImprovement.trim() || null,
      },
      { onConflict: 'event_id,player_id' },
    );
    setSaving(false);
    if (!error) onSaved(rating);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetWrap}>
          <View style={st.sheet}>
            <View style={st.handle} />
            <Text style={st.title}>How did {playerName.split(' ')[0]} feel about the game?</Text>
            <Text style={st.subtitle}>{eventSubtitle}</Text>

            <View style={st.faces}>
              {FACES.map(f => {
                const sel = rating === f.rating;
                return (
                  <TouchableOpacity key={f.rating} style={st.faceBtn} onPress={() => setRating(f.rating)} activeOpacity={0.7}>
                    <Text style={[st.faceEmoji, !sel && st.faceEmojiDim, sel && { transform: [{ scale: 1.2 }] }]}>{f.emoji}</Text>
                    <Text style={[st.faceLabel, sel && { color: f.color }]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={st.fieldLabel}>What went well?</Text>
            <TextInput
              style={st.input}
              multiline
              numberOfLines={2}
              placeholder="First touch felt sharp, won a few duels…"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              value={wentWell}
              onChangeText={setWentWell}
            />

            <Text style={st.fieldLabel}>What could improve?</Text>
            <TextInput
              style={st.input}
              multiline
              numberOfLines={2}
              placeholder="Lost focus late in the second half…"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              value={needsImprovement}
              onChangeText={setNeedsImprovement}
            />

            <TouchableOpacity
              style={[st.saveBtn, rating != null && !saving && st.saveBtnReady]}
              disabled={!rating || saving}
              onPress={handleSave}
              activeOpacity={0.85}
            >
              <Text style={[st.saveBtnText, rating != null && !saving && st.saveBtnTextReady]}>
                {saving ? 'Saving…' : rating ? 'Save reflection' : 'Select a face to continue'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.skipBtn} onPress={onClose} disabled={saving}>
              <Text style={st.skipText}>Skip for now</Text>
            </TouchableOpacity>
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
  subtitle: { fontSize: 12, color: PULSE_COLORS.ui.muted, marginBottom: 18 },

  faces: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  faceBtn: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 6 },
  faceEmoji: { fontSize: 28 },
  faceEmojiDim: { opacity: 0.45 },
  faceLabel: { fontSize: 10, fontWeight: '700', color: '#5B5F68' },

  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, marginBottom: 7 },
  input: {
    backgroundColor: '#1A1B1E', borderWidth: 1.5, borderColor: '#2A2B30', borderRadius: 12,
    padding: 12, color: PULSE_COLORS.ui.text, fontSize: 13, minHeight: 52, textAlignVertical: 'top',
    marginBottom: 14,
  },

  saveBtn: { backgroundColor: '#2A2B30', borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  saveBtnReady: { backgroundColor: PULSE_COLORS.brand.green },
  saveBtnText: { fontSize: 14.5, fontWeight: '800', color: '#6B6F78', letterSpacing: -0.2 },
  saveBtnTextReady: { color: '#06210F' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 12.5, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
});
