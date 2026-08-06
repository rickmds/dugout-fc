import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useTeam } from '../../hooks/useTeam';
import { useClub } from '../../hooks/useClub';
import { PULSE_COLORS } from '../../constants/colors';

type Preview = { id: string; storage_path: string };

function thumbUrl(path: string): string {
  return supabase.storage.from('photos').getPublicUrl(path, {
    transform: { width: 300, height: 300, resize: 'cover' },
  }).data.publicUrl;
}

export default function GalleryCard({ onPress }: { onPress: () => void }) {
  const { team } = useTeam();
  const { primaryColor, rgba } = useClub();
  const [previews, setPreviews] = useState<Preview[]>([]);

  useEffect(() => {
    if (!team) return;
    (supabase as any)
      .from('team_photos')
      .select('id, storage_path')
      .eq('team_id', team.id)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }: { data: Preview[] | null }) => setPreviews(data ?? []));
  }, [team?.id]);

  if (!previews.length) return null;

  return (
    <>
      <View style={st.labelRow}>
        <View style={[st.dot, { backgroundColor: primaryColor }]} />
        <Text style={st.label}>TEAM GALLERY</Text>
      </View>

      <TouchableOpacity
        style={[st.card, { borderColor: rgba(0.15) }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={st.thumbRow}>
          {previews.map((p, i) => (
            <Image
              key={p.id}
              source={{ uri: thumbUrl(p.storage_path) }}
              style={[st.thumb, i > 0 && { marginLeft: 4 }]}
              contentFit="cover"
              recyclingKey={p.id}
              transition={200}
            />
          ))}
          {/* Placeholder slots if < 3 photos */}
          {previews.length < 3 &&
            Array.from({ length: 3 - previews.length }).map((_, i) => (
              <View key={`ph-${i}`} style={[st.thumb, st.thumbPlaceholder, { marginLeft: 4 }]} />
            ))}
        </View>

        <View style={st.footer}>
          <Text style={st.footerText}>View all photos</Text>
          <Ionicons name="chevron-forward" size={15} color={PULSE_COLORS.ui.muted} />
        </View>
      </TouchableOpacity>
    </>
  );
}

const THUMB = 88;

const st = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dot:      { width: 6, height: 6, borderRadius: 3 },
  label:    { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.textSecondary, letterSpacing: 1.5 },

  card: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 14, borderWidth: 1,
    overflow: 'hidden', marginBottom: 24,
  },
  thumbRow: { flexDirection: 'row', padding: 10 },
  thumb: {
    flex: 1, height: THUMB, borderRadius: 8,
  },
  thumbPlaceholder: { backgroundColor: PULSE_COLORS.ui.surfaceAlt },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border,
  },
  footerText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.text },
});
