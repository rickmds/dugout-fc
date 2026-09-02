import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../../lib/supabase';
import { PULSE_COLORS } from '../../../../../constants/colors';
import ClubHeader from '../../../../../components/ui/ClubHeader';
import { SHOUTOUT_TAGS } from '../../../../../components/shoutout/ShoutoutSheet';
import { useAuth } from '../../../../../hooks/useAuth';

type ShoutoutRow = {
  id: string;
  tag: string;
  note: string | null;
  created_at: string;
  events: { title: string | null; event_date: string } | null;
  profiles: { full_name: string | null } | null;
};

export default function PlayerShoutoutsScreen() {
  const { playerId } = useLocalSearchParams<{ clubSlug: string; playerId: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [rows, setRows] = useState<ShoutoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('player_shoutouts')
        .select('id,tag,note,created_at,events(title,event_date),profiles!player_shoutouts_coach_id_fkey(full_name)')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false });
      setRows((data as any) ?? []);
      setLoading(false);
    }
    // Same stuck-badge bug as messages/announcements/events — this screen
    // is the real destination for a player_shoutout push, but nothing
    // cleared that notification row unless the user separately opened the
    // Notification Centre and tapped it there.
    async function markShoutoutNotificationsRead() {
      if (!profile || !playerId) return;
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('profile_id', profile.id)
        .eq('read', false)
        .eq('type', 'player_shoutout')
        .filter('data->>player_id', 'eq', playerId);
    }
    if (playerId) { load(); markShoutoutNotificationsRead(); }
  }, [playerId, profile?.id]);

  return (
    <View style={st.screen}>
      <ClubHeader title="Shoutouts" onBack={() => router.back()} />

      {loading ? (
        <View style={st.center}><ActivityIndicator color={PULSE_COLORS.brand.green} /></View>
      ) : rows.length === 0 ? (
        <View style={st.center}>
          <View style={st.emptyIcon}><Ionicons name="star-outline" size={28} color={PULSE_COLORS.ui.muted} /></View>
          <Text style={st.emptyTitle}>No shoutouts yet</Text>
          <Text style={st.emptySub}>When a coach recognizes something great, it'll show up here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {rows.map(r => {
            const meta = SHOUTOUT_TAGS.find(t => t.tag === r.tag);
            return (
              <View key={r.id} style={st.card}>
                <View style={st.cardTop}>
                  <Text style={st.cardEmoji}>{meta?.emoji ?? '🌟'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={st.cardTag}>{meta?.label ?? 'Shoutout'}</Text>
                    <Text style={st.cardMeta}>
                      {r.profiles?.full_name ? `${r.profiles.full_name} · ` : ''}
                      {r.events?.event_date
                        ? new Date(r.events.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                </View>
                {r.note && <Text style={st.cardNote}>{r.note}</Text>}
              </View>
            );
          })}
          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  scroll: { padding: 16, gap: 12 },

  emptyIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: PULSE_COLORS.ui.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 6 },
  emptySub: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

  card: {
    backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', padding: 15, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardEmoji: { fontSize: 26 },
  cardTag: { fontSize: 14.5, fontWeight: '800', color: PULSE_COLORS.ui.text },
  cardMeta: { fontSize: 11.5, color: PULSE_COLORS.ui.muted, marginTop: 2 },
  cardNote: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, lineHeight: 19, fontStyle: 'italic' },
});
