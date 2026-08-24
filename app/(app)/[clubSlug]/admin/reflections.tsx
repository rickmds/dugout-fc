import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { PULSE_COLORS } from '../../../../constants/colors';
import ClubHeader from '../../../../components/ui/ClubHeader';
import { FACES } from '../../../../components/reflection/ReflectionSheet';

// Coach-facing view. Deliberately trend-only — get_team_reflection_trends()
// never returns the free-text fields, so there is no code path here that
// could accidentally surface a player's raw written reflection to a coach.
type TrendRow = {
  player_id: string;
  player_name: string;
  reflection_count: number;
  avg_rating: number | null;
  recent_avg_rating: number | null;
  trend: 'up' | 'down' | 'flat' | 'new';
  last_rating: number | null;
  last_reflected_at: string | null;
};

const TREND_META: Record<TrendRow['trend'], { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  down: { icon: 'trending-down', color: '#EF4444', label: 'Trending down' },
  up:   { icon: 'trending-up',   color: '#22C55E', label: 'Trending up' },
  flat: { icon: 'remove',        color: PULSE_COLORS.ui.muted, label: 'Steady' },
  new:  { icon: 'sparkles',      color: PULSE_COLORS.ui.muted, label: 'New' },
};

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TeamReflectionsScreen() {
  const { team } = useTeam();
  const router = useRouter();

  const [rows, setRows] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (team) load();
  }, [team?.id]);

  async function load() {
    if (!team) return;
    setLoading(true);
    const { data } = await (supabase as any).rpc('get_team_reflection_trends', { p_team_id: team.id });
    setRows((data as TrendRow[]) ?? []);
    setLoading(false);
  }

  // Whoever needs a look surfaces first: down-trending, then lowest recent
  // average, then everyone else in whatever order the RPC returned them.
  const sorted = [...rows].sort((a, b) => {
    if (a.trend === 'down' && b.trend !== 'down') return -1;
    if (b.trend === 'down' && a.trend !== 'down') return 1;
    return (a.recent_avg_rating ?? 99) - (b.recent_avg_rating ?? 99);
  });

  return (
    <View style={st.screen}>
      <ClubHeader title="Team Pulse" onBack={() => router.back()} />
      <Text style={st.intro}>
        How players have felt after recent games — trends only. Individual reflections are private to each family.
      </Text>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={PULSE_COLORS.brand.green} /></View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {sorted.map(r => {
            const meta = TREND_META[r.trend];
            const face = r.last_rating ? FACES.find(f => f.rating === r.last_rating) : null;
            return (
              <View key={r.player_id} style={st.card}>
                <Text style={st.emoji}>{face?.emoji ?? '—'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.name}>{r.player_name}</Text>
                  {r.reflection_count > 0 ? (
                    <Text style={st.sub}>
                      Avg {r.avg_rating?.toFixed(1)}/5 · {r.reflection_count} reflection{r.reflection_count === 1 ? '' : 's'} · {relativeDay(r.last_reflected_at!)}
                    </Text>
                  ) : (
                    <Text style={st.subMuted}>No reflections yet</Text>
                  )}
                </View>
                <View style={[st.trendBadge, { backgroundColor: `${meta.color}18` }]}>
                  <Ionicons name={meta.icon} size={12} color={meta.color} />
                  <Text style={[st.trendText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
            );
          })}
          {sorted.length === 0 && (
            <View style={st.center}>
              <Text style={st.subMuted}>No roster players yet</Text>
            </View>
          )}
          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  intro: { fontSize: 12.5, color: PULSE_COLORS.ui.textSecondary, lineHeight: 18, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  scroll: { padding: 16, gap: 10 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 14,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 13,
  },
  emoji: { fontSize: 24, width: 30, textAlign: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  sub: { fontSize: 11.5, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },
  subMuted: { fontSize: 12, color: PULSE_COLORS.ui.muted },

  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  trendText: { fontSize: 10.5, fontWeight: '800' },
});
