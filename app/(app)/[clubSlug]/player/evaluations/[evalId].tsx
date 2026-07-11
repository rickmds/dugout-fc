import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
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

type IdpRow = {
  goal: string;
  measurables: string;
  action_items: [string, string, string];
};

type ReportData = {
  bio: { position: string; birth_year: string; school: string; graduation_class: string; hometown: string };
  stats: { max_speed: string; total_distance: string; secondary_foot: string; games_played: string; minutes_played: string };
  super_strengths: [string, string, string];
  areas_of_development: [string, string, string];
  outcome_goals: [string, string];
  performance_goals: [string, string];
  idp: IdpRow[];
};

type EvalDetail = {
  id: string;
  season_label: string;
  period_label: string;
  rating_technical: number | null;
  rating_tactical:  number | null;
  rating_physical:  number | null;
  rating_mental:    number | null;
  report_data:  ReportData | null;
  final_text:   string | null;
  published_at: string | null;
  players: { full_name: string; jersey_number: number | null } | null;
};

type ClubInfo = { name: string; logo_url: string | null };

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = SCREEN_W - 32;

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ label, color }: { label: string; color: string }) {
  return (
    <View style={[sh.wrap, { borderLeftColor: color }]}>
      <Text style={[sh.text, { color }]}>{label}</Text>
    </View>
  );
}
const sh = StyleSheet.create({
  wrap: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 12 },
  text: { fontSize: 9, fontWeight: '900', letterSpacing: 2 },
});

// ─── Numbered list item ───────────────────────────────────────────────────────

function BulletRow({ n, text, color }: { n: number; text: string; color: string }) {
  if (!text?.trim()) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: `${color}20`, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '900', color }}>{n}</Text>
      </View>
      <Text style={{ flex: 1, fontSize: 13.5, color: '#1e293b', lineHeight: 20, fontWeight: '500' }}>{text}</Text>
    </View>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 64 }}>
      <Text style={{ fontSize: 16, fontWeight: '900', color, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ fontSize: 9, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Rating box ───────────────────────────────────────────────────────────────

function RatingBox({ label, value, color, anim }: {
  label: string; value: number | null; color: string; anim: Animated.Value;
}) {
  return (
    <Animated.View style={{ flex: 1, alignItems: 'center', opacity: anim }}>
      <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color, lineHeight: 32 }}>{value ?? '—'}</Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5, marginTop: 1 }}>/5</Text>
      </View>
      <View style={{ width: '80%', height: 2, backgroundColor: `${color}30`, borderRadius: 1 }}>
        <View style={{ width: `${((value ?? 0) / 5) * 100}%`, height: '100%', backgroundColor: color, borderRadius: 1 }} />
      </View>
      <Text style={{ fontSize: 9, fontWeight: '800', color: '#64748b', letterSpacing: 0.8, marginTop: 6 }}>{label.toUpperCase()}</Text>
    </Animated.View>
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
        const { data: cData } = await supabase.from('clubs').select('name,logo_url').eq('slug', clubSlug).single();
        setClub(cData as ClubInfo | null);
        Animated.stagger(70, anims.map(a =>
          Animated.timing(a, { toValue: 1, duration: 400, useNativeDriver: true })
        )).start();
      }
      setLoading(false);
    }
    load();
  }, [evalId]);

  if (loading) {
    return (
      <View style={st.screen}>
        <ClubHeader title="Player Report" onBack={() => router.back()} />
        <View style={st.center}><ActivityIndicator color={primary} /></View>
      </View>
    );
  }

  if (!ev) {
    return (
      <View style={st.screen}>
        <ClubHeader title="Player Report" onBack={() => router.back()} />
        <View style={st.center}><Text style={{ color: PULSE_COLORS.ui.textSecondary }}>Report not found.</Text></View>
      </View>
    );
  }

  const rd = ev.report_data;
  const RATINGS = [
    { label: 'Technical', value: ev.rating_technical, color: '#3B82F6' },
    { label: 'Tactical',  value: ev.rating_tactical,  color: '#8B5CF6' },
    { label: 'Physical',  value: ev.rating_physical,  color: '#F59E0B' },
    { label: 'Mental',    value: ev.rating_mental,    color: '#22C55E' },
  ];

  const publishDate = ev.published_at
    ? new Date(ev.published_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const hasStrengths  = rd?.super_strengths?.some(Boolean);
  const hasDev        = rd?.areas_of_development?.some(Boolean);
  const hasOutcome    = rd?.outcome_goals?.some(Boolean);
  const hasPerf       = rd?.performance_goals?.some(Boolean);
  const hasIDP        = rd?.idp?.some(r => r.goal?.trim());
  const hasBioStats   = rd?.bio?.position || rd?.bio?.birth_year || rd?.bio?.school;
  const hasPerfStats  = rd?.stats?.max_speed || rd?.stats?.total_distance || rd?.stats?.games_played;

  return (
    <View style={st.screen}>
      <ClubHeader title="Player Report" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* ── REPORT CARD (light background) ──────── */}
        <View style={st.card}>

          {/* ─ Document header ─ */}
          <View style={st.docHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              {club?.logo_url ? (
                <Image source={{ uri: club.logo_url }} style={st.clubLogo} />
              ) : (
                <View style={[st.clubLogoBadge, { backgroundColor: primary }]}>
                  <Text style={st.clubLogoText}>
                    {(club?.name ?? clubSlug).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </Text>
                </View>
              )}
              <Text style={st.clubNameText}>{club?.name ?? ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {publishDate && <Text style={st.dateText}>{publishDate.toUpperCase()}</Text>}
              <Text style={[st.reportTypeText, { color: primary }]}>PLAYER PROFILE</Text>
            </View>
          </View>

          {/* ─ Divider ─ */}
          <View style={[st.divider, { backgroundColor: primary }]} />

          {/* ─ Player hero ─ */}
          <View style={st.heroSection}>
            <Text style={st.playerName}>{ev.players?.full_name ?? ''}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {rd?.bio?.position ? (
                <View style={[st.pill, { backgroundColor: `${primary}18`, borderColor: `${primary}40` }]}>
                  <Text style={[st.pillText, { color: primary }]}>{rd.bio.position}</Text>
                </View>
              ) : null}
              {ev.players?.jersey_number != null && (
                <View style={[st.pill, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
                  <Text style={[st.pillText, { color: '#475569' }]}>#{ev.players.jersey_number}</Text>
                </View>
              )}
              <View style={[st.pill, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
                <Text style={[st.pillText, { color: '#475569' }]}>{ev.period_label} · {ev.season_label}</Text>
              </View>
            </View>
          </View>

          {/* ─ Bio stats strip ─ */}
          {hasBioStats && (
            <View style={[st.statsStrip, { borderColor: '#e2e8f0' }]}>
              {rd!.bio.birth_year    ? <StatChip label="BIRTH YEAR"  value={rd!.bio.birth_year}        color="#1e293b" /> : null}
              {rd!.bio.school        ? <StatChip label="SCHOOL"       value={rd!.bio.school}             color="#1e293b" /> : null}
              {rd!.bio.graduation_class ? <StatChip label="CLASS"    value={`'${rd!.bio.graduation_class.slice(-2)}`} color="#1e293b" /> : null}
              {rd!.bio.hometown      ? <StatChip label="HOMETOWN"     value={rd!.bio.hometown}           color="#1e293b" /> : null}
            </View>
          )}

          {/* ─ Performance stats strip ─ */}
          {hasPerfStats && (
            <View style={[st.statsStrip, { borderColor: '#e2e8f0' }]}>
              {rd!.stats.max_speed      ? <StatChip label="MAX SPEED"    value={rd!.stats.max_speed}      color={primary} /> : null}
              {rd!.stats.total_distance ? <StatChip label="DISTANCE"     value={rd!.stats.total_distance} color={primary} /> : null}
              {rd!.stats.secondary_foot ? <StatChip label="2ND FOOT"     value={rd!.stats.secondary_foot} color={primary} /> : null}
              {rd!.stats.games_played   ? <StatChip label="GAMES"        value={rd!.stats.games_played}   color={primary} /> : null}
            </View>
          )}

          {/* ─ Ratings grid ─ */}
          <View style={st.ratingsRow}>
            {RATINGS.map((r, i) => (
              <RatingBox key={r.label} label={r.label} value={r.value} color={r.color} anim={anims[i]} />
            ))}
          </View>

          {/* ─ Strengths & Development side by side ─ */}
          {(hasStrengths || hasDev) && (
            <View style={st.twoCol}>
              {hasStrengths && (
                <View style={{ flex: 1 }}>
                  <SectionHead label="SUPER STRENGTHS" color="#22C55E" />
                  {rd!.super_strengths.map((s, i) => <BulletRow key={i} n={i + 1} text={s} color="#22C55E" />)}
                </View>
              )}
              {hasStrengths && hasDev && <View style={st.colDivider} />}
              {hasDev && (
                <View style={{ flex: 1 }}>
                  <SectionHead label="AREAS OF DEVELOPMENT" color="#F97316" />
                  {rd!.areas_of_development.map((s, i) => <BulletRow key={i} n={i + 1} text={s} color="#F97316" />)}
                </View>
              )}
            </View>
          )}

          {/* ─ Goals side by side ─ */}
          {(hasOutcome || hasPerf) && (
            <>
              <View style={st.sectionSep} />
              <View style={st.twoCol}>
                {hasOutcome && (
                  <View style={{ flex: 1 }}>
                    <SectionHead label="OUTCOME GOALS" color="#8B5CF6" />
                    {rd!.outcome_goals.map((s, i) => <BulletRow key={i} n={i + 1} text={s} color="#8B5CF6" />)}
                  </View>
                )}
                {hasOutcome && hasPerf && <View style={st.colDivider} />}
                {hasPerf && (
                  <View style={{ flex: 1 }}>
                    <SectionHead label="PERFORMANCE GOALS" color="#3B82F6" />
                    {rd!.performance_goals.map((s, i) => <BulletRow key={i} n={i + 1} text={s} color="#3B82F6" />)}
                  </View>
                )}
              </View>
            </>
          )}

          {/* ─ Individual Development Plan ─ */}
          {hasIDP && (
            <>
              <View style={st.sectionSep} />
              <SectionHead label="INDIVIDUAL DEVELOPMENT PLAN" color="#A855F7" />
              {/* Table header */}
              <View style={st.idpTableHead}>
                <Text style={[st.idpHeadCell, { flex: 3 }]}>PERFORMANCE GOAL</Text>
                <Text style={[st.idpHeadCell, { flex: 3 }]}>MEASURABLES</Text>
                <Text style={[st.idpHeadCell, { flex: 4 }]}>ACTION PLAN</Text>
              </View>
              {rd!.idp.filter(r => r.goal?.trim()).map((row, i) => (
                <View key={i} style={[st.idpRow, { backgroundColor: i % 2 === 0 ? '#f8faff' : '#ffffff' }]}>
                  <Text style={[st.idpCell, { flex: 3 }]}>{row.goal}</Text>
                  <Text style={[st.idpCell, { flex: 3 }]}>{row.measurables}</Text>
                  <View style={{ flex: 4, gap: 4 }}>
                    {row.action_items.filter(Boolean).map((item, j) => (
                      <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#A855F7', marginTop: 5 }} />
                        <Text style={[st.idpCell, { flex: 1 }]}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}

          {/* ─ Coach's summary ─ */}
          {ev.final_text?.trim() && (
            <>
              <View style={st.sectionSep} />
              <SectionHead label="COACH'S SUMMARY" color="#EC4899" />
              <Text style={st.summaryText}>{ev.final_text}</Text>
            </>
          )}

          {/* ─ Footer ─ */}
          <View style={[st.footer, { borderTopColor: `${primary}20` }]}>
            <Ionicons name="ribbon-outline" size={12} color={`${primary}80`} />
            <Text style={[st.footerText, { color: `${primary}80` }]}>
              {club?.name ?? ''}  ·  {ev.period_label}  ·  {ev.season_label}
            </Text>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },

  // White report card
  card: {
    width: CARD_W, backgroundColor: '#ffffff',
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 6,
  },

  // Document header
  docHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  clubLogo:      { width: 24, height: 24, borderRadius: 5, resizeMode: 'contain' },
  clubLogoBadge: { width: 24, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  clubLogoText:  { fontSize: 9, fontWeight: '900', color: '#fff' },
  clubNameText:  { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.3 },
  dateText:      { fontSize: 9, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5 },
  reportTypeText:{ fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginTop: 1 },

  divider: { height: 2, marginHorizontal: 20 },

  // Player hero
  heroSection: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  playerName:  { fontSize: 28, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5, lineHeight: 32 },
  pill:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  pillText:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  // Stats strips
  statsStrip: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: 20, gap: 4, justifyContent: 'space-around' },

  // Ratings row
  ratingsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },

  // Two-column content
  twoCol:     { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 0 },
  colDivider: { width: 1, backgroundColor: '#f1f5f9', marginHorizontal: 16, marginVertical: 4 },
  sectionSep: { height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 20 },

  // IDP table
  idpTableHead: { flexDirection: 'row', backgroundColor: '#f8f9fb', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  idpHeadCell:  { fontSize: 8, fontWeight: '900', color: '#64748b', letterSpacing: 1 },
  idpRow:       { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 8 },
  idpCell:      { fontSize: 11.5, color: '#334155', lineHeight: 16 },

  // Coach summary
  summaryText: { fontSize: 13.5, color: '#334155', lineHeight: 22, fontStyle: 'italic', paddingHorizontal: 20, paddingBottom: 8 },

  // Footer
  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginHorizontal: 20, borderTopWidth: 1, marginTop: 12 },
  footerText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
});
