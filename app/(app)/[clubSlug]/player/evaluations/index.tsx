import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../../lib/supabase';
import { PULSE_COLORS } from '../../../../../constants/colors';
import { useClub } from '../../../../../hooks/useClub';
import ClubHeader from '../../../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type EvalSummary = {
  id: string;
  season_label: string;
  period_label: string;
  rating_technical: number | null;
  rating_tactical: number | null;
  rating_physical: number | null;
  rating_mental: number | null;
  published_at: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avgRating(e: EvalSummary): number {
  const vals = [e.rating_technical, e.rating_tactical, e.rating_physical, e.rating_mental].filter(v => v != null) as number[];
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function StarBar({ value, max = 5, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(1, value / max);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
      <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: PULSE_COLORS.ui.border }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: '700', color, minWidth: 20, textAlign: 'right' }}>
        {value.toFixed(1)}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PlayerEvaluationsScreen() {
  const { primaryColor } = useClub();
  const { clubSlug, playerId } = useLocalSearchParams<{ clubSlug: string; playerId: string }>();
  const router = useRouter();
  const primary = primaryColor ?? '#22C55E';

  const [evals, setEvals] = useState<EvalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [pRes, eRes] = await Promise.all([
        supabase.from('players').select('full_name').eq('id', playerId).single(),
        supabase
          .from('player_evaluations')
          .select('id,season_label,period_label,rating_technical,rating_tactical,rating_physical,rating_mental,published_at')
          .eq('player_id', playerId)
          .eq('status', 'published')
          .order('published_at', { ascending: false }),
      ]);
      if (pRes.data) setPlayerName(pRes.data.full_name);
      setEvals((eRes.data ?? []) as EvalSummary[]);
      setLoading(false);
    }
    load();
  }, [playerId]);

  const AREAS: { key: keyof EvalSummary; label: string; color: string }[] = [
    { key: 'rating_technical', label: 'Technical', color: '#3B82F6' },
    { key: 'rating_tactical',  label: 'Tactical',  color: '#8B5CF6' },
    { key: 'rating_physical',  label: 'Physical',  color: '#F59E0B' },
    { key: 'rating_mental',    label: 'Mental',    color: '#22C55E' },
  ];

  return (
    <View style={st.screen}>
      <ClubHeader title="Evaluations" onBack={() => router.back()} />

      {loading ? (
        <View style={st.center}><ActivityIndicator color={primary} /></View>
      ) : evals.length === 0 ? (
        <View style={st.center}>
          <View style={st.emptyIcon}><Ionicons name="ribbon-outline" size={28} color={PULSE_COLORS.ui.muted} /></View>
          <Text style={st.emptyTitle}>No reports yet</Text>
          <Text style={st.emptySub}>Your coach will share player evaluations here after each review period.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {evals.map(ev => {
            const avg = avgRating(ev);
            return (
              <TouchableOpacity
                key={ev.id}
                style={st.card}
                onPress={() => router.push({ pathname: `/(app)/${clubSlug}/player/evaluations/${ev.id}` as any, params: { playerId } })}
                activeOpacity={0.8}
              >
                <View style={st.cardTop}>
                  <View>
                    <Text style={st.cardPeriod}>{ev.period_label}</Text>
                    <Text style={st.cardSeason}>{ev.season_label}</Text>
                  </View>
                  <View style={st.avgBadge}>
                    <Text style={[st.avgNum, { color: primary }]}>{avg.toFixed(1)}</Text>
                    <Text style={st.avgOf}>/5</Text>
                  </View>
                </View>

                <View style={st.ratingRows}>
                  {AREAS.map(area => {
                    const val = ev[area.key] as number | null;
                    return (
                      <View key={area.key} style={st.areaRow}>
                        <Text style={st.areaLabel}>{area.label}</Text>
                        <StarBar value={val ?? 0} color={area.color} />
                      </View>
                    );
                  })}
                </View>

                <View style={st.cardFooter}>
                  {ev.published_at && (
                    <Text style={st.publishedDate}>
                      {new Date(ev.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} />
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  scroll:       { padding: 16, gap: 12 },

  emptyIcon:    { width: 56, height: 56, borderRadius: 16, backgroundColor: PULSE_COLORS.ui.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle:   { fontSize: 17, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 6 },
  emptySub:     { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 19 },

  card:         { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 18, gap: 14 },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardPeriod:   { fontSize: 17, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.2 },
  cardSeason:   { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, marginTop: 2, fontWeight: '500' },

  avgBadge:     { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  avgNum:       { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  avgOf:        { fontSize: 13, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  ratingRows:   { gap: 8 },
  areaRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  areaLabel:    { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary, width: 68 },

  cardFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  publishedDate: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
});
