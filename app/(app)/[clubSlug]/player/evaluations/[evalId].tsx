import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { PULSE_COLORS } from '../../../../../constants/colors';
import { useClub } from '../../../../../hooks/useClub';
import ClubHeader from '../../../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type EvalDetail = {
  id: string;
  player_id: string;
  season_label: string;
  period_label: string;
  rating_technical: number | null;
  rating_tactical: number | null;
  rating_physical: number | null;
  rating_mental: number | null;
  final_text: string | null;
  published_at: string | null;
  players: { full_name: string; jersey_number: number | null } | null;
};

// ─── Simple spider chart using Views ─────────────────────────────────────────

const AREAS = ['Technical', 'Tactical', 'Physical', 'Mental'];
const AREA_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#22C55E'];
const MAX = 5;

function SpiderChart({ values, primary }: { values: number[]; primary: string }) {
  const size = Math.min(Dimensions.get('window').width - 80, 280);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.36;

  // Convert polar (angle in degrees, radius) to {x, y} relative to center
  function toXY(angleDeg: number, r: number) {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const n = values.length;
  const angles = values.map((_, i) => (360 / n) * i);

  // Build 5 concentric ring lines (as dotted outline using a thin square View)
  // We'll use a simple 4-corner polygon approximation per ring
  // For labels we position a View absolutely
  const labelPositions = angles.map(a => toXY(a, maxR * 1.28));

  return (
    <View style={{ width: size, height: size }}>
      {/* Rings — draw each edge as a rotated View, offset by half-width to anchor left-end at pt */}
      {[1, 2, 3, 4, 5].map(level => {
        const r = (level / MAX) * maxR;
        const corners = angles.map(a => toXY(a, r));
        return corners.map((pt, i) => {
          const next = corners[(i + 1) % corners.length];
          const dx = next.x - pt.x;
          const dy = next.y - pt.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          // Anchor the left edge at pt: position at (pt.x, pt.y - 0.5) and rotate around the left end
          // Use translateX trick: move right by len/2, rotate, move back
          const midX = pt.x + dx / 2;
          const midY = pt.y + dy / 2;
          return (
            <View
              key={`ring-${level}-${i}`}
              style={{
                position: 'absolute',
                left: midX - len / 2,
                top: midY - 0.5,
                width: len,
                height: 1,
                backgroundColor: level === 5 ? PULSE_COLORS.ui.border : `${PULSE_COLORS.ui.border}70`,
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        });
      })}

      {/* Axis lines from center to outermost corner */}
      {angles.map((a, i) => {
        const end = toXY(a, maxR);
        const dx = end.x - cx;
        const dy = end.y - cy;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const midX = cx + dx / 2;
        const midY = cy + dy / 2;
        return (
          <View
            key={`axis-${i}`}
            style={{
              position: 'absolute',
              left: midX - len / 2,
              top: midY - 0.5,
              width: len,
              height: 1,
              backgroundColor: PULSE_COLORS.ui.border,
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}

      {/* Data polygon sides */}
      {values.map((v, i) => {
        const r = (v / MAX) * maxR;
        const next = values[(i + 1) % values.length];
        const nextR = (next / MAX) * maxR;
        const pt = toXY(angles[i], r);
        const nextPt = toXY(angles[(i + 1) % angles.length], nextR);
        const dx = nextPt.x - pt.x;
        const dy = nextPt.y - pt.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const midX = pt.x + dx / 2;
        const midY = pt.y + dy / 2;
        return (
          <View
            key={`data-side-${i}`}
            style={{
              position: 'absolute',
              left: midX - len / 2,
              top: midY - 1,
              width: len,
              height: 2,
              backgroundColor: primary,
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}

      {/* Data dots */}
      {values.map((v, i) => {
        const r = (v / MAX) * maxR;
        const pt = toXY(angles[i], r);
        return (
          <View
            key={`dot-${i}`}
            style={{
              position: 'absolute',
              left: pt.x - 5,
              top: pt.y - 5,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: AREA_COLORS[i],
            }}
          />
        );
      })}

      {/* Labels */}
      {labelPositions.map((pos, i) => (
        <View
          key={`label-${i}`}
          style={{
            position: 'absolute',
            left: pos.x - 36,
            top: pos.y - 10,
            width: 72,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: AREA_COLORS[i], textAlign: 'center' }}>
            {AREAS[i]}
          </Text>
          <Text style={{ fontSize: 10, fontWeight: '800', color: PULSE_COLORS.ui.text, textAlign: 'center' }}>
            {values[i]}/5
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Rating bar ───────────────────────────────────────────────────────────────

function RatingBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (value == null) return;
    Animated.timing(anim, { toValue: value / MAX, duration: 600, delay: 100, useNativeDriver: false }).start();
  }, [value]);

  return (
    <View style={rb.row}>
      <Text style={rb.label}>{label}</Text>
      <View style={rb.track}>
        <Animated.View style={[rb.fill, { flex: anim, backgroundColor: color }]} />
        <Animated.View style={{ flex: Animated.subtract(1, anim) }} />
      </View>
      <Text style={[rb.value, { color }]}>{value ?? '—'}<Text style={rb.max}>/5</Text></Text>
    </View>
  );
}
const rb = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  label: { width: 72, fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: PULSE_COLORS.ui.border, flexDirection: 'row', overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 4 },
  value: { width: 28, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  max:   { fontSize: 10, fontWeight: '500', color: PULSE_COLORS.ui.muted },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EvalDetailScreen() {
  const { primaryColor } = useClub();
  const { clubSlug, evalId } = useLocalSearchParams<{ clubSlug: string; evalId: string }>();
  const router = useRouter();
  const primary = primaryColor ?? '#22C55E';

  const [ev, setEv] = useState<EvalDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('player_evaluations')
        .select('*, players(full_name,jersey_number)')
        .eq('id', evalId)
        .single();
      setEv(data as EvalDetail | null);
      setLoading(false);
    }
    load();
  }, [evalId]);

  const radarValues = ev
    ? [ev.rating_technical ?? 0, ev.rating_tactical ?? 0, ev.rating_physical ?? 0, ev.rating_mental ?? 0]
    : [0, 0, 0, 0];

  const AREA_CFG = [
    { key: 'rating_technical' as const, label: 'Technical', color: '#3B82F6' },
    { key: 'rating_tactical'  as const, label: 'Tactical',  color: '#8B5CF6' },
    { key: 'rating_physical'  as const, label: 'Physical',  color: '#F59E0B' },
    { key: 'rating_mental'    as const, label: 'Mental',    color: '#22C55E' },
  ];

  return (
    <View style={st.screen}>
      <ClubHeader
        title={ev?.players?.full_name ?? 'Evaluation'}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={st.center}><ActivityIndicator color={primary} /></View>
      ) : !ev ? (
        <View style={st.center}><Text style={st.emptyText}>Report not found.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={st.hero}>
            <View style={st.heroMeta}>
              <Text style={st.heroPeriod}>{ev.period_label}</Text>
              <Text style={st.heroSeason}>{ev.season_label}</Text>
            </View>
            {ev.published_at && (
              <Text style={st.heroDate}>
                {new Date(ev.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            )}
          </View>

          {/* Radar chart */}
          <View style={st.radarCard}>
            <Text style={st.sectionLabel}>OVERVIEW</Text>
            <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
              <SpiderChart values={radarValues} primary={primary} />
            </View>
          </View>

          {/* Rating bars */}
          <View style={st.card}>
            <Text style={st.sectionLabel}>RATINGS</Text>
            <View style={{ marginTop: 12 }}>
              {AREA_CFG.map(area => (
                <RatingBar key={area.key} label={area.label} value={ev[area.key]} color={area.color} />
              ))}
            </View>
          </View>

          {/* Coach report */}
          {ev.final_text && (
            <View style={st.card}>
              <Text style={st.sectionLabel}>COACH'S REPORT</Text>
              <Text style={st.reportText}>{ev.final_text}</Text>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:      { padding: 16, gap: 14 },
  emptyText:   { fontSize: 15, color: PULSE_COLORS.ui.textSecondary },

  hero:        { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 18, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroMeta:    { gap: 2 },
  heroPeriod:  { fontSize: 20, fontWeight: '900', color: PULSE_COLORS.ui.text, letterSpacing: -0.4 },
  heroSeason:  { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500' },
  heroDate:    { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '500', marginTop: 4 },

  radarCard:   { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 18 },
  card:        { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, padding: 18 },
  sectionLabel:{ fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1, textTransform: 'uppercase' },

  reportText:  { fontSize: 15, color: PULSE_COLORS.ui.text, lineHeight: 24, marginTop: 12 },
});
