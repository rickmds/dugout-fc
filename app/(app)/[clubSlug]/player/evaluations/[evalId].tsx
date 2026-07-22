import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as FileSystem from 'expo-file-system/legacy';
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
  const { primaryColor, logoUrl: clubLogoUrl, clubName } = useClub();
  const { evalId } = useLocalSearchParams<{ clubSlug: string; evalId: string }>();
  const router = useRouter();
  const primary = primaryColor ?? '#22C55E';

  const [ev,      setEv]      = useState<EvalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const logoBase64Ref = useRef<string | null>(null);

  // Pre-fetch logo as base64 so share is instant
  useEffect(() => {
    if (!clubLogoUrl) return;
    (async () => {
      try {
        const tmp = FileSystem.cacheDirectory! + 'report-logo-cached.png';
        await FileSystem.downloadAsync(clubLogoUrl, tmp);
        const b64 = await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.Base64 });
        logoBase64Ref.current = `data:image/png;base64,${b64}`;
      } catch { /* logo optional */ }
    })();
  }, [clubLogoUrl]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('player_evaluations')
        .select('*, players(full_name,jersey_number)')
        .eq('id', evalId)
        .single();
      if (data) setEv(data as EvalDetail);
      setLoading(false);
    }
    load();
  }, [evalId]);

  const handleShare = useCallback(async () => {
    if (!ev) return;
    setSharing(true);
    try {
      const rd         = ev.report_data;
      const playerName = ev.players?.full_name ?? '';
      const lastName   = playerName.split(' ').slice(-1)[0]?.toUpperCase() ?? '';
      const jerseyNum  = ev.players?.jersey_number;
      const pubDate    = ev.published_at
        ? new Date(ev.published_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : '';

      const logoDataUri = logoBase64Ref.current ?? '';

      // Radar SVG
      const axes  = [
        { label: 'Technical', val: ev.rating_technical ?? 0, angle: -Math.PI / 2, color: '#3B82F6' },
        { label: 'Physical',  val: ev.rating_physical  ?? 0, angle: 0,            color: '#F59E0B' },
        { label: 'Mental',    val: ev.rating_mental    ?? 0, angle: Math.PI / 2,  color: '#22C55E' },
        { label: 'Tactical',  val: ev.rating_tactical  ?? 0, angle: Math.PI,      color: '#8B5CF6' },
      ];
      const CX = 160, CY = 140, MR = 90;
      function rPt(val: number, angle: number) {
        const r = (val / 5) * MR;
        return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
      }
      function gridPoly(lvl: number) {
        return axes.map(a => { const r = (lvl/5)*MR; return `${CX+r*Math.cos(a.angle)},${CY+r*Math.sin(a.angle)}`; }).join(' ');
      }
      const dataPts  = axes.map(a => rPt(a.val, a.angle));
      const dataPoly = dataPts.map(p => `${p.x},${p.y}`).join(' ');
      const radarSvg = `
        <svg width="320" height="280" viewBox="0 0 320 280" xmlns="http://www.w3.org/2000/svg">
          ${[1,2,3,4,5].map(l => `<polygon points="${gridPoly(l)}" fill="none" stroke="${l===5?'rgba(0,0,0,0.15)':'rgba(0,0,0,0.07)'}" stroke-width="${l===5?1.5:1}"/>`).join('')}
          ${axes.map(a => `<line x1="${CX}" y1="${CY}" x2="${CX+MR*Math.cos(a.angle)}" y2="${CY+MR*Math.sin(a.angle)}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`).join('')}
          <polygon points="${dataPoly}" fill="${primary}" fill-opacity="0.15" stroke="${primary}" stroke-width="2.5" stroke-linejoin="round"/>
          ${dataPts.map((p,i) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${axes[i].color}"/>`).join('')}
          ${axes.map((a,i) => {
            const lx = CX + (MR+22)*Math.cos(a.angle);
            const ly = CY + (MR+22)*Math.sin(a.angle);
            const ta = Math.abs(a.angle) < 0.1 ? 'start' : Math.abs(Math.abs(a.angle)-Math.PI) < 0.1 ? 'end' : 'middle';
            return `<text x="${lx}" y="${ly-8}" text-anchor="${ta}" font-size="18" font-weight="900" fill="${axes[i].color}">${a.val}</text>
                    <text x="${lx}" y="${ly+6}" text-anchor="${ta}" font-size="8" font-weight="800" fill="${axes[i].color}" letter-spacing="1">${a.label.toUpperCase()}</text>`;
          }).join('')}
        </svg>`;

      function bullets(items: string[], color: string) {
        return items.filter(Boolean).map((t, i) =>
          `<div style="display:flex;gap:10px;margin-bottom:6px;align-items:flex-start">
            <div style="min-width:20px;height:20px;border-radius:10px;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:${color}">${i+1}</div>
            <p style="margin:0;font-size:13px;color:#1e293b;line-height:1.5;font-weight:500">${t}</p>
           </div>`
        ).join('');
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; }
          body { background: #f1f5f9; padding: 24px; }
          .card { background: #fff; border-radius: 16px; overflow: hidden; max-width: 680px; margin: 0 auto; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
          .band { background: ${primary}; padding: 16px 22px; display: flex; justify-content: space-between; align-items: center; }
          .band-left { display: flex; align-items: center; gap: 14px; }
          .band img { width: 44px; height: 44px; object-fit: contain; }
          .report-type { font-size: 8px; font-weight: 700; color: rgba(255,255,255,0.6); letter-spacing: 2px; margin-bottom: 2px; }
          .club-name { font-size: 15px; font-weight: 900; color: #fff; }
          .band-date { font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.6); letter-spacing: 0.5px; }
          .hero { padding: 22px 22px 16px; border-bottom: 1px solid #f1f5f9; position: relative; overflow: hidden; }
          .hero-wm { position: absolute; font-size: 96px; font-weight: 900; letter-spacing: -5px; top: -10px; left: 12px; color: ${primary}28; line-height: 1; pointer-events: none; }
          .player-name { font-size: 30px; font-weight: 900; color: #0f172a; letter-spacing: -0.8px; margin-bottom: 10px; position: relative; }
          .pills { display: flex; gap: 6px; flex-wrap: wrap; position: relative; }
          .pill { padding: 4px 10px; border-radius: 20px; border: 1px solid; font-size: 11px; font-weight: 700; }
          .pill-primary { background: ${primary}22; border-color: ${primary}44; color: ${primary}; }
          .pill-neutral { background: #f1f5f9; border-color: #e2e8f0; color: #475569; }
          .stat-block { padding: 10px 22px 14px; border-top: 1px solid #e2e8f0; }
          .stat-label { font-size: 8px; font-weight: 800; color: #94a3b8; letter-spacing: 1.5px; margin-bottom: 10px; }
          .stat-row { display: flex; justify-content: space-around; }
          .stat-chip { text-align: center; min-width: 60px; }
          .stat-val { font-size: 15px; font-weight: 900; }
          .stat-sub { font-size: 8px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; margin-top: 2px; }
          .radar-wrap { display: flex; justify-content: center; border-top: 1px solid #f1f5f9; padding: 8px 0; }
          .two-col { display: flex; gap: 0; padding: 18px 22px 12px; border-top: 1px solid #f1f5f9; }
          .col { flex: 1; }
          .col-div { width: 1px; background: #f1f5f9; margin: 0 14px; }
          .section-head { border-left: 3px solid ${primary}; padding-left: 10px; margin-bottom: 12px; font-size: 9px; font-weight: 900; color: ${primary}; letter-spacing: 1.2px; }
          .summary { padding: 0 22px 18px; }
          .summary-text { font-size: 13.5px; color: #334155; line-height: 1.65; }
          .footer { border-top: 1px solid ${primary}22; padding: 10px 22px; font-size: 9px; color: ${primary}88; font-weight: 600; letter-spacing: 0.3px; }
        </style></head><body>
        <div class="card">
          <div class="band">
            <div class="band-left">
              ${logoDataUri ? `<img src="${logoDataUri}" />` : ''}
              <div>
                <div class="report-type">PLAYER DEVELOPMENT REPORT</div>
                <div class="club-name">${clubName}</div>
              </div>
            </div>
            <div class="band-date">${pubDate}</div>
          </div>
          <div class="hero">
            <div class="hero-wm">${playerName.split(' ').slice(-1)[0]?.toUpperCase() ?? ''}</div>
            <div class="player-name">${playerName}</div>
            <div class="pills">
              ${rd?.bio?.position ? `<span class="pill pill-primary">${rd.bio.position}</span>` : ''}
              ${jerseyNum != null ? `<span class="pill pill-neutral">#${jerseyNum}</span>` : ''}
              <span class="pill pill-neutral">${ev.period_label} · ${ev.season_label}</span>
            </div>
          </div>
          ${rd?.bio?.birth_year || rd?.bio?.school ? `
          <div class="stat-block">
            <div class="stat-label">PROFILE</div>
            <div class="stat-row">
              ${rd.bio.birth_year ? `<div class="stat-chip"><div class="stat-val" style="color:#0f172a">${rd.bio.birth_year}</div><div class="stat-sub">BIRTH YEAR</div></div>` : ''}
              ${rd.bio.school     ? `<div class="stat-chip"><div class="stat-val" style="color:#0f172a;font-size:12px">${rd.bio.school}</div><div class="stat-sub">SCHOOL</div></div>` : ''}
            </div>
          </div>` : ''}
          ${rd?.stats?.rsvp_pct || rd?.stats?.practice_pct || rd?.stats?.game_pct ? `
          <div class="stat-block">
            <div class="stat-label">ATTENDANCE</div>
            <div class="stat-row">
              ${rd.stats.rsvp_pct     ? `<div class="stat-chip"><div class="stat-val" style="color:${primary}">${rd.stats.rsvp_pct}</div><div class="stat-sub">RSVP</div></div>` : ''}
              ${rd.stats.practice_pct ? `<div class="stat-chip"><div class="stat-val" style="color:${primary}">${rd.stats.practice_pct}</div><div class="stat-sub">PRACTICE</div></div>` : ''}
              ${rd.stats.game_pct     ? `<div class="stat-chip"><div class="stat-val" style="color:${primary}">${rd.stats.game_pct}</div><div class="stat-sub">GAMES</div></div>` : ''}
            </div>
          </div>` : ''}
          ${rd?.stats?.games_played ? `
          <div class="stat-block">
            <div class="stat-label">SEASON</div>
            <div class="stat-row">
              ${rd.stats.games_played                               ? `<div class="stat-chip"><div class="stat-val" style="color:${primary}">${rd.stats.games_played}</div><div class="stat-sub">PLAYED</div></div>` : ''}
              ${rd.stats.goals    && rd.stats.goals    !== '0'     ? `<div class="stat-chip"><div class="stat-val" style="color:${primary}">${rd.stats.goals}</div><div class="stat-sub">GOALS</div></div>` : ''}
              ${rd.stats.assists  && rd.stats.assists  !== '0'     ? `<div class="stat-chip"><div class="stat-val" style="color:${primary}">${rd.stats.assists}</div><div class="stat-sub">ASSISTS</div></div>` : ''}
              ${rd.stats.minutes_played                             ? `<div class="stat-chip"><div class="stat-val" style="color:#0f172a">${rd.stats.minutes_played}</div><div class="stat-sub">MINUTES</div></div>` : ''}
              ${rd.stats.secondary_foot                             ? `<div class="stat-chip"><div class="stat-val" style="color:#0f172a">${rd.stats.secondary_foot}</div><div class="stat-sub">2ND FOOT</div></div>` : ''}
            </div>
          </div>` : ''}
          <div class="radar-wrap">${radarSvg}</div>
          ${(rd?.super_strengths?.some(Boolean) || rd?.areas_of_development?.some(Boolean)) ? `
          <div class="two-col">
            ${rd?.super_strengths?.some(Boolean) ? `<div class="col"><div class="section-head">SUPER STRENGTHS</div>${bullets(rd.super_strengths, primary)}</div>` : ''}
            ${rd?.super_strengths?.some(Boolean) && rd?.areas_of_development?.some(Boolean) ? '<div class="col-div"></div>' : ''}
            ${rd?.areas_of_development?.some(Boolean) ? `<div class="col"><div class="section-head">DEVELOPMENT</div>${bullets(rd.areas_of_development, primary)}</div>` : ''}
          </div>` : ''}
          ${(rd?.outcome_goals?.some(Boolean) || rd?.performance_goals?.some(Boolean)) ? `
          <div class="two-col" style="border-top:1px solid #f1f5f9">
            ${rd?.outcome_goals?.some(Boolean) ? `<div class="col"><div class="section-head">OUTCOME GOALS</div>${bullets(rd.outcome_goals, primary)}</div>` : ''}
            ${rd?.outcome_goals?.some(Boolean) && rd?.performance_goals?.some(Boolean) ? '<div class="col-div"></div>' : ''}
            ${rd?.performance_goals?.some(Boolean) ? `<div class="col"><div class="section-head">PERF. GOALS</div>${bullets(rd.performance_goals, primary)}</div>` : ''}
          </div>` : ''}
          ${ev.final_text?.trim() ? `
          <div class="summary" style="border-top:1px solid #f1f5f9;padding-top:18px">
            <div class="section-head">COACH'S SUMMARY</div>
            <p class="summary-text">${ev.final_text}</p>
          </div>` : ''}
          <div class="footer">🎖 ${clubName} · ${ev.period_label} · ${ev.season_label}</div>
        </div></body></html>`;

      const Print = await import('expo-print');
      const Sharing = await import('expo-sharing');
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `${playerName} – Player Report`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e) {
      Alert.alert('Could not export report', String(e));
    } finally {
      setSharing(false);
    }
  }, [ev, primary, clubName]);

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
      <ClubHeader
        title="Player Report"
        onBack={() => router.back()}
        right={
          <TouchableOpacity onPress={handleShare} disabled={sharing} style={st.shareBtn}>
            {sharing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="share-outline" size={22} color="#fff" />}
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        <View style={st.card}>

          {/* ── Club-branded header band ── */}
          <View style={[st.headerBand, { backgroundColor: primary }]}>
            <View style={st.headerLeft}>
              {clubLogoUrl ? (
                <Image source={{ uri: clubLogoUrl }} style={st.headerLogo} />
              ) : null}
              <View style={{ gap: 1 }}>
                <Text style={st.headerReportType}>PLAYER DEVELOPMENT REPORT</Text>
                <Text style={st.headerClubName}>{clubName}</Text>
              </View>
            </View>
            {publishDate && <Text style={st.headerDate}>{publishDate}</Text>}
          </View>

          {/* ── Player hero ── */}
          <View style={st.heroSection}>
            {lastName ? (
              <Text style={[st.heroWatermark, { color: `${primary}28` }]} numberOfLines={1} adjustsFontSizeToFit={false}>
                {lastName}
              </Text>
            ) : null}
            <View style={st.heroContent}>
              <Text style={st.playerName}>{ev.players?.full_name ?? ''}</Text>
              <View style={[st.pillRow, { zIndex: 2 }]}>
                {rd?.bio?.position ? (
                  <View style={[st.pill, { backgroundColor: `${primary}18`, borderColor: `${primary}30` }]}>
                    <Text style={[st.pillText, { color: primary }]}>{rd.bio.position}</Text>
                  </View>
                ) : null}
                {ev.players?.jersey_number != null && (
                  <View style={[st.pill, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
                    <Text style={[st.pillText, { color: '#475569' }]}>#{ev.players.jersey_number}</Text>
                  </View>
                )}
                <View style={[st.pill, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
                  <Text style={[st.pillText, { color: '#64748b' }]}>{ev.period_label} · {ev.season_label}</Text>
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
              {clubName}  ·  {ev.period_label}  ·  {ev.season_label}
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
  screen:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  shareBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },

  card: {
    width: CARD_W, backgroundColor: '#ffffff',
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 18, elevation: 7,
  },

  // Branded header band
  headerBand:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  headerLeft:       { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerLogo:       { width: 40, height: 40, resizeMode: 'contain' },
  headerClubName:   { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.1 },
  headerReportType: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.8 },
  headerDate:       { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 },

  // Hero
  heroSection:   { overflow: 'hidden', paddingBottom: 4 },
  heroWatermark: { position: 'absolute', fontSize: 96, fontWeight: '900', letterSpacing: -5, top: -8, left: 10, lineHeight: 96, zIndex: 0 },
  heroContent:   { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, zIndex: 1 },
  playerName:    { fontSize: 30, fontWeight: '900', color: '#0f172a', letterSpacing: -0.8, lineHeight: 32, marginBottom: 8 },
  pillRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
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
