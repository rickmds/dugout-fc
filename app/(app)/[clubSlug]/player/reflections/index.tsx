import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../../lib/supabase';
import { PULSE_COLORS } from '../../../../../constants/colors';
import ClubHeader from '../../../../../components/ui/ClubHeader';
import { FACES } from '../../../../../components/reflection/ReflectionSheet';

type ReflectionRow = {
  id: string;
  rating: number;
  went_well: string | null;
  needs_improvement: string | null;
  created_at: string;
  events: { title: string | null; event_date: string; type: string } | null;
};

function faceFor(rating: number) {
  return FACES.find(f => f.rating === rating) ?? FACES[2];
}

export default function PlayerReflectionsScreen() {
  const { clubSlug, playerId } = useLocalSearchParams<{ clubSlug: string; playerId: string }>();
  const router = useRouter();

  const [rows, setRows] = useState<ReflectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('player_reflections')
        .select('id,rating,went_well,needs_improvement,created_at,events(title,event_date,type)')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false });
      setRows((data as any) ?? []);
      setLoading(false);
    }
    if (playerId) load();
  }, [playerId]);

  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;
  // Oldest-to-newest for the trend strip, most recent 10 — reads left-to-right like a timeline.
  const trend = [...rows].reverse().slice(-10);

  return (
    <View style={st.screen}>
      <ClubHeader title="My Reflections" onBack={() => router.back()} />

      {loading ? (
        <View style={st.center}><ActivityIndicator color={PULSE_COLORS.brand.green} /></View>
      ) : rows.length === 0 ? (
        <View style={st.center}>
          <View style={st.emptyIcon}><Ionicons name="happy-outline" size={28} color={PULSE_COLORS.ui.muted} /></View>
          <Text style={st.emptyTitle}>No reflections yet</Text>
          <Text style={st.emptySub}>After each game, you'll get a quick prompt to share how it felt. They'll show up here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <View style={st.summaryCard}>
            <View style={st.summaryTop}>
              <View>
                <Text style={st.summaryAvgLabel}>Average feeling</Text>
                <Text style={st.summaryAvg}>{avg.toFixed(1)} <Text style={st.summaryAvgOf}>/ 5</Text></Text>
              </View>
              <Text style={st.summaryEmoji}>{faceFor(Math.round(avg)).emoji}</Text>
            </View>
            <View style={st.trendRow}>
              {trend.map(r => {
                const f = faceFor(r.rating);
                return (
                  <View key={r.id} style={st.trendBarWrap}>
                    <View style={[st.trendBar, { height: 8 + r.rating * 7, backgroundColor: f.color }]} />
                  </View>
                );
              })}
            </View>
            <Text style={st.trendCaption}>Last {trend.length} game{trend.length === 1 ? '' : 's'}</Text>
          </View>

          {rows.map(r => {
            const f = faceFor(r.rating);
            return (
              <View key={r.id} style={st.card}>
                <View style={st.cardTop}>
                  <Text style={st.cardEmoji}>{f.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={st.cardTitle}>{r.events?.title || 'Game'}</Text>
                    <Text style={st.cardDate}>
                      {r.events?.event_date
                        ? new Date(r.events.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <Text style={[st.cardFeeling, { color: f.color }]}>{f.label}</Text>
                </View>
                {r.went_well && (
                  <View style={st.cardNote}>
                    <Text style={st.cardNoteLabel}>Went well</Text>
                    <Text style={st.cardNoteText}>{r.went_well}</Text>
                  </View>
                )}
                {r.needs_improvement && (
                  <View style={st.cardNote}>
                    <Text style={st.cardNoteLabel}>Could improve</Text>
                    <Text style={st.cardNoteText}>{r.needs_improvement}</Text>
                  </View>
                )}
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

  summaryCard: { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 18, marginBottom: 4 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  summaryAvgLabel: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryAvg: { fontSize: 30, fontWeight: '900', color: PULSE_COLORS.ui.text, letterSpacing: -1, marginTop: 3 },
  summaryAvgOf: { fontSize: 14, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
  summaryEmoji: { fontSize: 34 },
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 50 },
  trendBarWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  trendBar: { width: '100%', borderRadius: 4 },
  trendCaption: { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 8, fontWeight: '500' },

  card: { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 15, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardEmoji: { fontSize: 24 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  cardDate: { fontSize: 11.5, color: PULSE_COLORS.ui.muted, marginTop: 1 },
  cardFeeling: { fontSize: 12, fontWeight: '800' },
  cardNote: { backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderRadius: 10, padding: 10 },
  cardNoteLabel: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  cardNoteText: { fontSize: 12.5, color: PULSE_COLORS.ui.textSecondary, lineHeight: 18 },
});
