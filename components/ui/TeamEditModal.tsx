import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { DUGOUT_COLORS } from '../../constants/colors';

type TeamSnap = { id: string; name: string; age_group: string | null; season: string | null };

export default function TeamEditModal({
  visible,
  team,
  primaryColor,
  onClose,
  onSaved,
}: {
  visible: boolean;
  team: TeamSnap | null;
  primaryColor: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]         = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [season, setSeason]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (visible && team) {
      setName(team.name);
      setAgeGroup(team.age_group ?? '');
      setSeason(team.season ?? '');
      setError('');
    }
  }, [visible, team?.id]);

  async function handleSave() {
    if (!team || !name.trim()) { setError('Team name is required.'); return; }
    setSaving(true);
    const { error: dbError } = await supabase
      .from('teams')
      .update({
        name: name.trim(),
        age_group: ageGroup.trim() || null,
        season: season.trim() || null,
      })
      .eq('id', team.id);
    if (dbError) { setSaving(false); setError(dbError.message); return; }

    // Keep the team_group conversation title in sync
    await supabase
      .from('conversations')
      .update({ title: name.trim() })
      .eq('team_id', team.id)
      .eq('type', 'team_group');

    setSaving(false);
    onSaved();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={st.root}>
        <View style={st.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={DUGOUT_COLORS.ui.text} />
          </TouchableOpacity>
          <Text style={st.title}>Edit Team</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !name.trim()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {saving
              ? <ActivityIndicator size="small" color={primaryColor} />
              : <Text style={[st.save, { color: primaryColor }, !name.trim() && { opacity: 0.4 }]}>Save</Text>}
          </TouchableOpacity>
        </View>

        {error ? <Text style={st.error}>{error}</Text> : null}

        <View style={st.form}>
          <Text style={st.label}>TEAM NAME</Text>
          <TextInput
            style={[st.input, { borderColor: primaryColor }]}
            value={name}
            onChangeText={(v) => { setName(v); setError(''); }}
            placeholder="e.g. MDS U14 Girls"
            placeholderTextColor={DUGOUT_COLORS.ui.muted}
            returnKeyType="next"
            autoFocus
          />

          <Text style={[st.label, { marginTop: 24 }]}>AGE GROUP</Text>
          <TextInput
            style={st.input}
            value={ageGroup}
            onChangeText={setAgeGroup}
            placeholder="e.g. U14"
            placeholderTextColor={DUGOUT_COLORS.ui.muted}
            returnKeyType="next"
          />

          <Text style={[st.label, { marginTop: 24 }]}>SEASON</Text>
          <TextInput
            style={st.input}
            value={season}
            onChangeText={setSeason}
            placeholder="e.g. Spring 2026"
            placeholderTextColor={DUGOUT_COLORS.ui.muted}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
  },
  title:  { fontSize: 17, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  save:   { fontSize: 16, fontWeight: '600' },
  error:  { color: DUGOUT_COLORS.status.error, fontSize: 13, marginHorizontal: 20, marginTop: 12 },
  form:   { padding: 20 },
  label:  { fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, letterSpacing: 1, marginBottom: 8 },
  input:  {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: DUGOUT_COLORS.ui.text,
  },
});
