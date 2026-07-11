import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../../lib/supabase';
import { PULSE_COLORS } from '../../../../../constants/colors';
import { useClub } from '../../../../../hooks/useClub';
import ClubHeader from '../../../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type EvalDetail = {
  id: string;
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

type ClubInfo = { name: string; logo_url: string | null };

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = SCREEN_W - 32;

// ─── Rating circle ────────────────────────────────────────────────────────────

function RatingCircle({
  label, value, color,
}: { label: string; value: number | null; color: string; anim: Animated.Value }) {
  const size = (CARD_W - 64) / 4;

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      {/* Animated ring using border trick */}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 3, borderColor: `${color}25`,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: `${color}10`,
      }}>
        <Text style={{ fontSize: size * 0.32, fontWeight: '900', color, letterSpacing: -0.5 }}>
          {value ?? '—'}
        </Text>
        <Text style={{ fontSize: size * 0.16, fontWeight: '700', color: `${color}80`, marginTop: -2 }}>
          /5
        </Text>
      </View>
      <Text style={{ fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', letterSpacing: 0.3 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Corner bracket ───────────────────────────────────────────────────────────

function CornerBracket({ position, color }: {
  position: 'tl' | 'tr' | 'bl' | 'br';
  color: string;
}) {
  const size = 24;
  const thickness = 2;
  const tl = position === 'tl';
  const tr = position === 'tr';
  const bl = position === 'bl';
  const br = position === 'br';

  return (
    <View style={{
      position: 'absolute',
      top:    (tl || tr) ? 16 : undefined,
      bottom: (bl || br) ? 16 : undefined,
      left:   (tl || bl) ? 16 : undefined,
      right:  (tr || br) ? 16 : undefined,
      width: size, height: size,
      borderTopWidth:    (tl || tr) ? thickness : 0,
      borderBottomWidth: (bl || br) ? thickness : 0,
      borderLeftWidth:   (tl || bl) ? thickness : 0,
      borderRightWidth:  (tr || br) ? thickness : 0,
      borderColor: `${color}60`,
      borderTopLeftRadius:     tl ? 4 : 0,
      borderTopRightRadius:    tr ? 4 : 0,
      borderBottomLeftRadius:  bl ? 4 : 0,
      borderBottomRightRadius: br ? 4 : 0,
    }} />
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EvalDetailScreen() {
  const { primaryColor } = useClub();
  const { clubSlug, evalId } = useLocalSearchParams<{ clubSlug: string; evalId: string }>();
  const router = useRouter();
  const primary = primaryColor ?? '#22C55E';

  const [ev,      setEv]      = useState<EvalDetail | null>(null);
  const [club,    setClub]    = useState<ClubInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Animated values for rating circles
  const anims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('player_evaluations')
        .select('*, players(full_name,jersey_number)')
        .eq('id', evalId)
        .single();
      if (data) {
        setEv(data as EvalDetail);
        // Load club info
        const { data: cData } = await supabase
          .from('clubs')
          .select('name,logo_url')
          .eq('slug', clubSlug)
          .single();
        setClub(cData as ClubInfo | null);
        // Animate rating circles in
        Animated.stagger(80, anims.map(a =>
          Animated.timing(a, { toValue: 1, duration: 500, useNativeDriver: true })
        )).start();
      }
      setLoading(false);
    }
    load();
  }, [evalId]);

  const RATINGS = [
    { key: 'rating_technical' as const, label: 'Technical', color: '#3B82F6' },
    { key: 'rating_tactical'  as const, label: 'Tactical',  color: '#8B5CF6' },
    { key: 'rating_physical'  as const, label: 'Physical',  color: '#F59E0B' },
    { key: 'rating_mental'    as const, label: 'Mental',    color: '#22C55E' },
  ];

  const avg = ev
    ? RATINGS.reduce((s, r) => s + (ev[r.key] ?? 0), 0) / RATINGS.filter(r => ev[r.key] != null).length
    : 0;

  const publishDate = ev?.published_at
    ? new Date(ev.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <View style={st.screen}>
      <ClubHeader title="Player Report" onBack={() => router.back()} />

      {loading ? (
        <View style={st.center}><ActivityIndicator color={primary} /></View>
      ) : !ev ? (
        <View style={st.center}><Text style={st.emptyText}>Report not found.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Certificate card ── */}
          <View style={[st.cert, { borderColor: `${primary}30` }]}>

            {/* Corner brackets */}
            <CornerBracket position="tl" color={primary} />
            <CornerBracket position="tr" color={primary} />
            <CornerBracket position="bl" color={primary} />
            <CornerBracket position="br" color={primary} />

            {/* Header gradient band */}
            <LinearGradient
              colors={[`${primary}22`, `${primary}06`] as [string, string]}
              style={st.certHeader}
            >
              {/* Club logo + name */}
              <View style={st.clubRow}>
                {club?.logo_url ? (
                  <Image source={{ uri: club.logo_url }} style={st.clubLogo} />
                ) : (
                  <View style={[st.clubLogoFallback, { backgroundColor: primary }]}>
                    <Text style={st.clubLogoInitials}>
                      {(club?.name ?? clubSlug).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                )}
                <Text style={st.clubName}>{club?.name ?? ''}</Text>
              </View>

              {/* Title */}
              <Text style={[st.certTitle, { color: primary }]}>PLAYER EVALUATION</Text>

              {/* Divider with diamond */}
              <View style={st.dividerRow}>
                <View style={[st.dividerLine, { backgroundColor: `${primary}30` }]} />
                <View style={[st.diamond, { backgroundColor: primary }]} />
                <View style={[st.dividerLine, { backgroundColor: `${primary}30` }]} />
              </View>

              {/* Player name */}
              <Text style={st.playerName}>{ev.players?.full_name ?? ''}</Text>
              {ev.players?.jersey_number != null && (
                <Text style={[st.jerseyNum, { color: `${primary}90` }]}>#{ev.players.jersey_number}</Text>
              )}

              {/* Period + season */}
              <View style={st.periodRow}>
                <View style={[st.periodChip, { borderColor: `${primary}40`, backgroundColor: `${primary}10` }]}>
                  <Text style={[st.periodChipText, { color: primary }]}>
                    {ev.period_label}  ·  {ev.season_label}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            {/* ── Rating grid ── */}
            <View style={st.ratingsSection}>
              <Text style={[st.sectionEyebrow, { color: `${primary}80` }]}>PERFORMANCE RATINGS</Text>
              <View style={st.ratingGrid}>
                {RATINGS.map((r, i) => (
                  <Animated.View key={r.key} style={{ opacity: anims[i], transform: [{ translateY: Animated.multiply(Animated.subtract(1, anims[i]), 8) }] }}>
                    <RatingCircle label={r.label} value={ev[r.key]} color={r.color} anim={anims[i]} />
                  </Animated.View>
                ))}
              </View>

              {/* Average score bar */}
              <View style={st.avgRow}>
                <Text style={st.avgLabel}>Overall</Text>
                <View style={st.avgTrack}>
                  <View style={[st.avgFill, { width: `${(avg / 5) * 100}%` as any, backgroundColor: primary }]} />
                </View>
                <Text style={[st.avgNum, { color: primary }]}>{avg.toFixed(1)}</Text>
              </View>
            </View>

            {/* ── Inner divider ── */}
            <View style={[st.innerDivider, { backgroundColor: `${primary}15` }]} />

            {/* ── Coach's report ── */}
            {ev.final_text && (
              <View style={st.reportSection}>
                <Text style={[st.sectionEyebrow, { color: `${primary}80` }]}>COACH'S REPORT</Text>
                <Text style={st.reportQuote}>"</Text>
                <Text style={st.reportText}>{ev.final_text}</Text>
                <Text style={[st.reportQuoteClose, { color: `${primary}30` }]}>"</Text>
              </View>
            )}

            {/* ── Footer ── */}
            <View style={[st.certFooter, { borderTopColor: `${primary}15` }]}>
              <Ionicons name="ribbon-outline" size={13} color={`${primary}60`} />
              <Text style={[st.footerText, { color: `${primary}70` }]}>
                {publishDate ? `Issued ${publishDate}` : 'Official Player Report'}
              </Text>
            </View>
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:  { padding: 16 },
  emptyText: { fontSize: 15, color: PULSE_COLORS.ui.textSecondary },

  // Certificate container
  cert: {
    width: CARD_W, backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 20, borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
  },

  // Header gradient section
  certHeader: { alignItems: 'center', paddingTop: 32, paddingBottom: 28, paddingHorizontal: 24 },

  // Club branding
  clubRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  clubLogo:         { width: 28, height: 28, borderRadius: 6, resizeMode: 'contain' },
  clubLogoFallback: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  clubLogoInitials: { fontSize: 10, fontWeight: '900', color: '#fff' },
  clubName:         { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, letterSpacing: 0.5 },

  // Certificate title
  certTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 3, marginBottom: 16 },

  // Diamond divider
  dividerRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', marginBottom: 20 },
  dividerLine:  { flex: 1, height: 1 },
  diamond:      { width: 6, height: 6, transform: [{ rotate: '45deg' }] },

  // Player name
  playerName: { fontSize: 30, fontWeight: '900', color: PULSE_COLORS.ui.text, textAlign: 'center', letterSpacing: -0.5, lineHeight: 34 },
  jerseyNum:  { fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 4, letterSpacing: 1 },

  // Period chip
  periodRow:     { marginTop: 16 },
  periodChip:    { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  periodChipText:{ fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  // Ratings section
  ratingsSection: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 },
  sectionEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 16 },
  ratingGrid:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },

  // Average bar
  avgRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  avgLabel: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, width: 44 },
  avgTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: PULSE_COLORS.ui.border, overflow: 'hidden' },
  avgFill:  { height: '100%', borderRadius: 3 },
  avgNum:   { fontSize: 13, fontWeight: '900', width: 28, textAlign: 'right' },

  // Divider
  innerDivider: { height: 1, marginHorizontal: 24, marginVertical: 4 },

  // Report section
  reportSection: { paddingHorizontal: 28, paddingTop: 20, paddingBottom: 8 },
  reportQuote:   { fontSize: 48, color: PULSE_COLORS.ui.border, lineHeight: 40, fontWeight: '900', marginBottom: -8 },
  reportText:    { fontSize: 14.5, color: PULSE_COLORS.ui.text, lineHeight: 24, fontStyle: 'italic', textAlign: 'left' },
  reportQuoteClose: { fontSize: 48, fontWeight: '900', lineHeight: 40, textAlign: 'right', marginTop: -8 },

  // Footer
  certFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 16, marginTop: 16,
    borderTopWidth: 1, marginHorizontal: 24,
  },
  footerText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
});
