import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
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
  bio:   { position: string; birth_year: string; school: string };
  stats: { rsvp_pct: string; practice_pct: string; game_pct: string; games_played: string; minutes_played: string; goals: string; assists: string; yellow_cards: string; secondary_foot: string };
  super_strengths:      [string, string, string];
  areas_of_development: [string, string, string];
  outcome_goals:        [string, string];
  performance_goals:    [string, string];
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
  text: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
});

// ─── Numbered bullet row ──────────────────────────────────────────────────────

function BulletRow({ n, text, color }: { n: number; text: string; color: string }) {
  if (!text?.trim()) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: `${color}1A`, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '900', color }}>{n}</Text>
      </View>
      <Text style={{ flex: 1, fontSize: 13.5, color: '#1e293b', lineHeight: 20, fontWeight: '500' }}>{text}</Text>
    </View>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 60 }}>
      <Text style={{ fontSize: 14, fontWeight: '900', color, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ fontSize: 8, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Radar chart ─────────────────────────────────────────────────────────────

const SVG_W = 300, SVG_H = 270, RC = 150, RCY = 135, MAX_R = 74;

const RADAR_AXES = [
  { label: 'TECHNICAL', color: '#3B82F6', angle: -Math.PI / 2, sx: RC,  sy: 45,  sA: 'middle' as const, lx: RC,  ly: 59,  lA: 'middle' as const },
  { label: 'PHYSICAL',  color: '#F59E0B', angle: 0,            sx: 228, sy: 127, sA: 'start'  as const, lx: 228, ly: 143, lA: 'start'  as const },
  { label: 'MENTAL',    color: '#22C55E', angle: Math.PI / 2,  sx: RC,  sy: 211, sA: 'middle' as const, lx: RC,  ly: 225, lA: 'middle' as const },
  { label: 'TACTICAL',  color: '#8B5CF6', angle: Math.PI,      sx: 72,  sy: 127, sA: 'end'    as const, lx: 72,  ly: 143, lA: 'end'    as const },
];

function gridPts(lvl: number) {
  return RADAR_AXES.map(ax => {
    const r = (lvl / 5) * MAX_R;
    return `${RC + r * Math.cos(ax.angle)},${RCY + r * Math.sin(ax.angle)}`;
  }).join(' ');
}

function RadarChart({ values, color }: { values: number[]; color: string }) {
  const pts = RADAR_AXES.map((ax, i) => {
    const r = ((values[i] ?? 0) / 5) * MAX_R;
    return { x: RC + r * Math.cos(ax.angle), y: RCY + r * Math.sin(ax.angle) };
  });
  const dataPoly = pts.map(p => `${p.x},${p.y}`).join(' ');
  return (
    <Svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
      {[1,2,3,4,5].map(lvl => (
        <Polygon key={lvl} points={gridPts(lvl)} fill="none"
          stroke={lvl === 5 ? 'rgba(0,0,0,0.13)' : 'rgba(0,0,0,0.06)'}
          strokeWidth={lvl === 5 ? 1.5 : 1}
        />
      ))}
      {RADAR_AXES.map((ax, i) => (
        <Line key={i} x1={RC} y1={RCY} x2={RC + MAX_R * Math.cos(ax.angle)} y2={RCY + MAX_R * Math.sin(ax.angle)}
          stroke="rgba(0,0,0,0.08)" strokeWidth={1}
        />
      ))}
      <Polygon points={dataPoly} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4} fill={RADAR_AXES[i].color} />
      ))}
      {RADAR_AXES.map((ax, i) => (
        <G key={i}>
          <SvgText x={ax.sx} y={ax.sy} textAnchor={ax.sA} fontSize={16} fontWeight="900" fill={ax.color}>
            {values[i] ?? '—'}
          </SvgText>
          <SvgText x={ax.lx} y={ax.ly} textAnchor={ax.lA} fontSize={7} fontWeight="800" fill={ax.color} letterSpacing={1}>
            {ax.label}
          </SvgText>
        </G>
      ))}
    </Svg>
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

  const publishDate = ev.published_at
    ? new Date(ev.published_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
    : null;

  const lastName      = ev.players?.full_name?.split(' ').slice(-1)[0]?.toUpperCase() ?? '';
  const hasStrengths  = rd?.super_strengths?.some(Boolean);
  const hasDev        = rd?.areas_of_development?.some(Boolean);
  const hasOutcome    = rd?.outcome_goals?.some(Boolean);
  const hasPerf       = rd?.performance_goals?.some(Boolean);
  const hasIDP        = rd?.idp?.some(r => r.goal?.trim());
  const hasBioStats   = rd?.bio?.birth_year || rd?.bio?.school;
  const hasAttendance = rd?.stats?.rsvp_pct || rd?.stats?.practice_pct || rd?.stats?.game_pct;
  const hasPerfStats  = rd?.stats?.games_played || rd?.stats?.minutes_played || rd?.stats?.secondary_foot
    || (rd?.stats?.goals         && rd.stats.goals        !== '0')
    || (rd?.stats?.assists       && rd.stats.assists      !== '0')
    || (rd?.stats?.yellow_cards  && rd.stats.yellow_cards !== '0');

  return (
    <View style={st.screen}>
      <ClubHeader title="Player Report" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        <View style={st.card}>

          {/* ── Club-branded header band ── */}
          <View style={[st.headerBand, { backgroundColor: primary }]}>
            <View style={st.headerLeft}>
              {club?.logo_url ? (
                <Image source={{ uri: club.logo_url }} style={st.headerLogo} />
              ) : (
                <View style={st.headerBadge}>
                  <Text style={st.headerBadgeText}>
                    {(club?.name ?? clubSlug).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </Text>
                </View>
              )}
              <View style={{ gap: 2 }}>
                <Text style={st.headerClubName}>{club?.name ?? ''}</Text>
                <Text style={st.headerReportType}>PLAYER DEVELOPMENT REPORT</Text>
              </View>
            </View>
            {publishDate && <Text style={st.headerDate}>{publishDate}</Text>}
          </View>

          {/* ── Player hero with last-name watermark ── */}
          <View style={{ overflow: 'hidden' }}>
            {lastName ? (
              <Text style={[st.heroWatermark, { color: `${primary}10` }]} numberOfLines={1}>
                {lastName}
              </Text>
            ) : null}
            <View style={st.heroSection}>
              <Text style={st.playerName}>{ev.players?.full_name ?? ''}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {rd?.bio?.position ? (
                  <View style={[st.pill, { backgroundColor: '#ffffff', borderColor: `${primary}50` }]}>
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
          </View>

          {/* ── Bio stats strip ── */}
          {hasBioStats && (
            <View style={st.statBlock}>
              <Text style={st.statBlockLabel}>PROFILE</Text>
              <View style={st.statRow}>
                {rd!.bio.birth_year ? <StatChip label="BIRTH YEAR" value={rd!.bio.birth_year} color="#0f172a" /> : null}
                {rd!.bio.school     ? <StatChip label="SCHOOL"     value={rd!.bio.school}     color="#0f172a" /> : null}
              </View>
            </View>
          )}

          {/* ── Attendance strip ── */}
          {hasAttendance && (
            <View style={st.statBlock}>
              <Text style={st.statBlockLabel}>ATTENDANCE</Text>
              <View style={st.statRow}>
                {rd!.stats.rsvp_pct     ? <StatChip label="RSVP"     value={rd!.stats.rsvp_pct}     color={primary} /> : null}
                {rd!.stats.practice_pct ? <StatChip label="PRACTICE"  value={rd!.stats.practice_pct} color={primary} /> : null}
                {rd!.stats.game_pct     ? <StatChip label="GAMES"     value={rd!.stats.game_pct}     color={primary} /> : null}
              </View>
            </View>
          )}

          {/* ── Season stats — explicit 2 rows of 3 ── */}
          {hasPerfStats && (
            <View style={st.statBlock}>
              <Text style={st.statBlockLabel}>SEASON</Text>
              <View style={st.statRow}>
                {rd!.stats.games_played                                     ? <StatChip label="PLAYED"  value={rd!.stats.games_played}   color={primary} /> : null}
                {rd!.stats.goals        && rd!.stats.goals    !== '0'       ? <StatChip label="GOALS"   value={rd!.stats.goals}          color={primary} /> : null}
                {rd!.stats.assists      && rd!.stats.assists  !== '0'       ? <StatChip label="ASSISTS" value={rd!.stats.assists}        color={primary} /> : null}
              </View>
              {(rd!.stats.minutes_played || (rd!.stats.yellow_cards && rd!.stats.yellow_cards !== '0') || rd!.stats.secondary_foot) ? (
                <View style={[st.statRow, { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 }]}>
                  {rd!.stats.minutes_played                                   ? <StatChip label="MINUTES"  value={rd!.stats.minutes_played} color="#0f172a" /> : null}
                  {rd!.stats.yellow_cards && rd!.stats.yellow_cards !== '0'  ? <StatChip label="YELLOWS"  value={rd!.stats.yellow_cards}   color="#D97706" /> : null}
                  {rd!.stats.secondary_foot                                   ? <StatChip label="2ND FOOT" value={rd!.stats.secondary_foot} color="#0f172a" /> : null}
                </View>
              ) : null}
            </View>
          )}

          {/* ── Radar chart ── */}
          <View style={st.radarWrap}>
            <RadarChart
              values={[
                ev.rating_technical ?? 0,
                ev.rating_physical  ?? 0,
                ev.rating_mental    ?? 0,
                ev.rating_tactical  ?? 0,
              ]}
              color={primary}
            />
          </View>

          {/* ── Strengths + Development areas — all primary color ── */}
          {(hasStrengths || hasDev) && (
            <View style={st.twoCol}>
              {hasStrengths && (
                <View style={{ flex: 1 }}>
                  <SectionHead label="SUPER STRENGTHS" color={primary} />
                  {rd!.super_strengths.map((s, i) => <BulletRow key={i} n={i + 1} text={s} color={primary} />)}
                </View>
              )}
              {hasStrengths && hasDev && <View style={st.colDivider} />}
              {hasDev && (
                <View style={{ flex: 1 }}>
                  <SectionHead label="DEVELOPMENT" color={primary} />
                  {rd!.areas_of_development.map((s, i) => <BulletRow key={i} n={i + 1} text={s} color={primary} />)}
                </View>
              )}
            </View>
          )}

          {/* ── Goals row — all primary color ── */}
          {(hasOutcome || hasPerf) && (
            <>
              <View style={st.sectionSep} />
              <View style={st.twoCol}>
                {hasOutcome && (
                  <View style={{ flex: 1 }}>
                    <SectionHead label="OUTCOME GOALS" color={primary} />
                    {rd!.outcome_goals.map((s, i) => <BulletRow key={i} n={i + 1} text={s} color={primary} />)}
                  </View>
                )}
                {hasOutcome && hasPerf && <View style={st.colDivider} />}
                {hasPerf && (
                  <View style={{ flex: 1 }}>
                    <SectionHead label="PERF. GOALS" color={primary} />
                    {rd!.performance_goals.map((s, i) => <BulletRow key={i} n={i + 1} text={s} color={primary} />)}
                  </View>
                )}
              </View>
            </>
          )}

          {/* ── Individual Development Plan ── */}
          {hasIDP && (
            <>
              <View style={st.sectionSep} />
              <View style={st.idpWrap}>
                <SectionHead label="INDIVIDUAL DEVELOPMENT PLAN" color={primary} />
                <View style={[st.idpTableHead, { backgroundColor: `${primary}0C` }]}>
                  <Text style={[st.idpHeadCell, { flex: 3, color: primary }]}>PERFORMANCE GOAL</Text>
                  <Text style={[st.idpHeadCell, { flex: 3, color: primary }]}>MEASURABLES</Text>
                  <Text style={[st.idpHeadCell, { flex: 4, color: primary }]}>ACTION PLAN</Text>
                </View>
                {rd!.idp.filter(r => r.goal?.trim()).map((row, i) => (
                  <View key={i} style={[st.idpRow, { backgroundColor: i % 2 === 0 ? `${primary}05` : '#ffffff' }]}>
                    <Text style={[st.idpCell, { flex: 3 }]}>{row.goal}</Text>
                    <Text style={[st.idpCell, { flex: 3 }]}>{row.measurables}</Text>
                    <View style={{ flex: 4, gap: 4 }}>
                      {row.action_items.filter(Boolean).map((item, j) => (
                        <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5 }}>
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: primary, marginTop: 5 }} />
                          <Text style={[st.idpCell, { flex: 1 }]}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── Coach's summary ── */}
          {ev.final_text?.trim() && (
            <>
              <View style={st.sectionSep} />
              <View style={st.summarySection}>
                <SectionHead label="COACH'S SUMMARY" color={primary} />
                <Text style={st.summaryText}>{ev.final_text}</Text>
              </View>
            </>
          )}

          {/* ── Footer ── */}
          <View style={[st.footer, { borderTopColor: `${primary}20` }]}>
            <Ionicons name="ribbon-outline" size={11} color={`${primary}70`} />
            <Text style={[st.footerText, { color: `${primary}70` }]}>
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

  card: {
    width: CARD_W, backgroundColor: '#ffffff',
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 18, elevation: 7,
  },

  // Branded header band
  headerBand:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 16 },
  headerLeft:       { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerLogo:       { width: 36, height: 36, borderRadius: 8, resizeMode: 'contain', backgroundColor: 'rgba(255,255,255,0.18)' },
  headerBadge:      { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  headerBadgeText:  { fontSize: 12, fontWeight: '900', color: '#fff' },
  headerClubName:   { fontSize: 14, fontWeight: '900', color: '#fff', letterSpacing: 0.2 },
  headerReportType: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5 },
  headerDate:       { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.5 },

  // Hero with watermark
  heroSection:   { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, zIndex: 1 },
  heroWatermark: { position: 'absolute', fontSize: 88, fontWeight: '900', letterSpacing: -4, top: -4, left: 12, lineHeight: 88 },
  playerName:    { fontSize: 27, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5, lineHeight: 30 },
  pill:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  pillText:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  // Stats strips
  statsStrip:     { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 11, paddingHorizontal: 16, justifyContent: 'space-around' },
  statBlock:      { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e2e8f0', paddingTop: 8, paddingBottom: 14, paddingHorizontal: 16, gap: 12 },
  statBlockLabel: { fontSize: 8, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.5 },
  statRow:        { flexDirection: 'row', justifyContent: 'space-around' },

  // Radar chart
  radarWrap: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },

  // Two-column content
  twoCol:     { flexDirection: 'row', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10, gap: 0 },
  colDivider: { width: 1, backgroundColor: '#f1f5f9', marginHorizontal: 14, marginVertical: 4 },
  sectionSep: { height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 18 },

  // IDP
  idpWrap:      { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  idpTableHead: { flexDirection: 'row', paddingHorizontal: 0, paddingVertical: 7, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  idpHeadCell:  { fontSize: 8, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 6 },
  idpRow:       { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  idpCell:      { fontSize: 11, color: '#334155', lineHeight: 16, paddingHorizontal: 6 },

  // Summary
  summarySection: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  summaryText:    { fontSize: 13.5, color: '#334155', lineHeight: 22, fontStyle: 'italic' },

  // Footer
  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 13, marginHorizontal: 18, borderTopWidth: 1, marginTop: 10 },
  footerText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
});
