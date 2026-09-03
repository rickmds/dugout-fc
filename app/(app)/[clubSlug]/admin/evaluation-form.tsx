import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';

const API_BASE = process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

// ─── Types ────────────────────────────────────────────────────────────────────

type IdpRow = {
  goal: string;
  measurables: string;
  action_items: [string, string, string];
};

type ReportData = {
  bio: {
    position: string;
    birth_year: string;
    school: string;
  };
  stats: {
    rsvp_pct: string;
    practice_pct: string;
    game_pct: string;
    games_played: string;
    minutes_played: string;
    goals: string;
    assists: string;
    yellow_cards: string;
    secondary_foot: string;
  };
  super_strengths:      [string, string, string];
  areas_of_development: [string, string, string];
  outcome_goals:        [string, string];
  performance_goals:    [string, string];
  idp: IdpRow[];
};

const EMPTY_REPORT: ReportData = {
  bio:   { position: '', birth_year: '', school: '' },
  stats: { rsvp_pct: '', practice_pct: '', game_pct: '', games_played: '', minutes_played: '', goals: '', assists: '', yellow_cards: '', secondary_foot: '' },
  super_strengths:      ['', '', ''],
  areas_of_development: ['', '', ''],
  outcome_goals:        ['', ''],
  performance_goals:    ['', ''],
  idp: [{ goal: '', measurables: '', action_items: ['', '', ''] }],
};

type FormState = {
  rating_technical: number;
  rating_tactical:  number;
  rating_physical:  number;
  rating_mental:    number;
  report_data: ReportData;
  ai_draft:    string;
  final_text:  string;
  status: 'draft' | 'submitted';
};

const RATING_LABELS: Record<number, string> = {
  1: 'Needs Work', 2: 'Developing', 3: 'Good', 4: 'Strong', 5: 'Excellent',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeReport(raw: Partial<ReportData> | null | undefined): ReportData {
  if (!raw) return { ...EMPTY_REPORT, idp: [{ ...EMPTY_REPORT.idp[0] }] };
  return {
    bio:   { ...EMPTY_REPORT.bio,   ...(raw.bio   ?? {}) },
    stats: { ...EMPTY_REPORT.stats, ...(raw.stats ?? {}) },
    super_strengths:      (raw.super_strengths?.length === 3      ? raw.super_strengths      : EMPTY_REPORT.super_strengths),
    areas_of_development: (raw.areas_of_development?.length === 3 ? raw.areas_of_development : EMPTY_REPORT.areas_of_development),
    outcome_goals:        (raw.outcome_goals?.length === 2        ? raw.outcome_goals        : EMPTY_REPORT.outcome_goals),
    performance_goals:    (raw.performance_goals?.length === 2    ? raw.performance_goals    : EMPTY_REPORT.performance_goals),
    idp: raw.idp?.length ? raw.idp : EMPTY_REPORT.idp,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, color, icon, note, children }: {
  title: string; color: string; icon: keyof typeof Ionicons.glyphMap;
  note?: string; children: React.ReactNode;
}) {
  return (
    <View style={[sc.card, { borderLeftColor: color }]}>
      <View style={sc.head}>
        <Ionicons name={icon} size={12} color={color} />
        <Text style={[sc.title, { color }]}>{title}</Text>
      </View>
      {note && <Text style={sc.note}>{note}</Text>}
      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  card:  { backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderLeftWidth: 4, padding: 16, gap: 12 },
  head:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  note:  { fontSize: 11, color: PULSE_COLORS.ui.textSecondary, marginTop: -4 },
});

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.text }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Ionicons name={n <= value ? 'star' : 'star-outline'} size={26} color={n <= value ? '#F59E0B' : PULSE_COLORS.ui.border} />
          </TouchableOpacity>
        ))}
      </View>
      {value > 0 && <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>{RATING_LABELS[value]}</Text>}
    </View>
  );
}

function NumberedInput({ index, value, onChange, color, placeholder }: {
  index: number; value: string; onChange: (v: string) => void; color: string; placeholder: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: '900', color }}>{index + 1}</Text>
      </View>
      <TextInput
        style={inp.base}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={PULSE_COLORS.ui.muted}
        multiline
      />
    </View>
  );
}

function GridInputs({ items, onChange }: {
  items: { k: string; label: string; value: string; placeholder: string }[];
  onChange: (key: string, value: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {items.map(it => (
        <View key={it.k} style={{ width: '47%' }}>
          <Text style={grid.label}>{it.label}</Text>
          <TextInput
            style={grid.input}
            value={it.value}
            onChangeText={v => onChange(it.k, v)}
            placeholder={it.placeholder}
            placeholderTextColor={PULSE_COLORS.ui.muted}
          />
        </View>
      ))}
    </View>
  );
}

const inp  = StyleSheet.create({ base: { flex: 1, backgroundColor: PULSE_COLORS.ui.background, borderRadius: 10, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: PULSE_COLORS.ui.text, minHeight: 44 } });
const grid = StyleSheet.create({
  label: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, marginBottom: 4, letterSpacing: 0.5 },
  input: { backgroundColor: PULSE_COLORS.ui.background, borderRadius: 10, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: PULSE_COLORS.ui.text },
});

// ─── Preview sub-components ──────────────────────────────────────────────────

const PREVIEW_CARD_W = Dimensions.get('window').width - 32;

function PvSectionHead({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: color, paddingLeft: 10, marginBottom: 12 }}>
      <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color }}>{label}</Text>
    </View>
  );
}

function PvBullet({ n, text, color }: { n: number; text: string; color: string }) {
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

function PvStatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 60 }}>
      <Text style={{ fontSize: 14, fontWeight: '900', color, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ fontSize: 8, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const PV_RC = 150, PV_RCY = 135, PV_MAX_R = 74;
const PV_AXES = [
  { label: 'TECHNICAL', color: '#3B82F6', angle: -Math.PI / 2, sx: PV_RC, sy: 45,  sA: 'middle' as const, lx: PV_RC, ly: 59,  lA: 'middle' as const },
  { label: 'PHYSICAL',  color: '#F59E0B', angle: 0,            sx: 228,   sy: 127, sA: 'start'  as const, lx: 228,   ly: 143, lA: 'start'  as const },
  { label: 'MENTAL',    color: '#22C55E', angle: Math.PI / 2,  sx: PV_RC, sy: 211, sA: 'middle' as const, lx: PV_RC, ly: 225, lA: 'middle' as const },
  { label: 'TACTICAL',  color: '#8B5CF6', angle: Math.PI,      sx: 72,    sy: 127, sA: 'end'    as const, lx: 72,    ly: 143, lA: 'end'    as const },
];
function pvGridPts(lvl: number) {
  return PV_AXES.map(ax => { const r = (lvl / 5) * PV_MAX_R; return `${PV_RC + r * Math.cos(ax.angle)},${PV_RCY + r * Math.sin(ax.angle)}`; }).join(' ');
}

function PvRadarChart({ values, color }: { values: number[]; color: string }) {
  const pts = PV_AXES.map((ax, i) => { const r = ((values[i] ?? 0) / 5) * PV_MAX_R; return { x: PV_RC + r * Math.cos(ax.angle), y: PV_RCY + r * Math.sin(ax.angle) }; });
  const dataPoly = pts.map(p => `${p.x},${p.y}`).join(' ');
  return (
    <Svg width="100%" height={270} viewBox="0 0 300 270">
      {[1,2,3,4,5].map(lvl => <Polygon key={lvl} points={pvGridPts(lvl)} fill="none" stroke={lvl === 5 ? 'rgba(0,0,0,0.13)' : 'rgba(0,0,0,0.06)'} strokeWidth={lvl === 5 ? 1.5 : 1} />)}
      {PV_AXES.map((ax, i) => <Line key={i} x1={PV_RC} y1={PV_RCY} x2={PV_RC + PV_MAX_R * Math.cos(ax.angle)} y2={PV_RCY + PV_MAX_R * Math.sin(ax.angle)} stroke="rgba(0,0,0,0.08)" strokeWidth={1} />)}
      <Polygon points={dataPoly} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={4} fill={PV_AXES[i].color} />)}
      {PV_AXES.map((ax, i) => (
        <G key={i}>
          <SvgText x={ax.sx} y={ax.sy} textAnchor={ax.sA} fontSize={16} fontWeight="900" fill={ax.color}>{values[i] ?? '—'}</SvgText>
          <SvgText x={ax.lx} y={ax.ly} textAnchor={ax.lA} fontSize={7} fontWeight="800" fill={ax.color} letterSpacing={1}>{ax.label}</SvgText>
        </G>
      ))}
    </Svg>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EvaluationFormScreen() {
  const { primaryColor, logoUrl: clubLogoUrl, clubName } = useClub();
  const { clubSlug, playerId, batchId, evalId } = useLocalSearchParams<{
    clubSlug: string; playerId: string; batchId: string; evalId: string;
  }>();
  const { team }    = useTeam();
  const router      = useRouter();
  const { profile } = useAuth();

  const primary = primaryColor ?? '#22C55E';
  const isEdit  = !!evalId;

  const [playerName,  setPlayerName]  = useState('');
  const [seasonLabel, setSeasonLabel] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [form, setForm] = useState<FormState>({
    rating_technical: 0, rating_tactical: 0, rating_physical: 0, rating_mental: 0,
    report_data: { ...EMPTY_REPORT, idp: [{ ...EMPTY_REPORT.idp[0] }] },
    ai_draft: '', final_text: '', status: 'draft',
  });
  const [loading,       setLoading]       = useState(true);
  const [generating,    setGenerating]    = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [jerseyNumber,  setJerseyNumber]  = useState<number | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => { load(); }, [playerId, batchId, evalId]);

  async function load() {
    setLoading(true);
    const [pRes, bRes] = await Promise.all([
      supabase.from('players').select('full_name,position,jersey_number').eq('id', playerId).single(),
      supabase.from('evaluation_batches').select('season_label,period_label,team_id').eq('id', batchId).single(),
    ]);

    let prefillPosition = '';
    let teamId = '';
    if (pRes.data) {
      setPlayerName(pRes.data.full_name);
      setJerseyNumber((pRes.data as any).jersey_number ?? null);
      prefillPosition = pRes.data.position ?? '';
    }
    if (bRes.data) {
      setSeasonLabel(bRes.data.season_label);
      setPeriodLabel(bRes.data.period_label);
      teamId = (bRes.data as any).team_id ?? '';
    }

    if (evalId) {
      const { data } = await supabase
        .from('player_evaluations')
        .select('rating_technical,rating_tactical,rating_physical,rating_mental,report_data,ai_draft,final_text,status')
        .eq('id', evalId)
        .single();
      if (data) {
        const merged = mergeReport(data.report_data as Partial<ReportData> | null);
        setForm({
          rating_technical: data.rating_technical ?? 0,
          rating_tactical:  data.rating_tactical  ?? 0,
          rating_physical:  data.rating_physical  ?? 0,
          rating_mental:    data.rating_mental    ?? 0,
          report_data:  merged,
          ai_draft:     data.ai_draft   ?? '',
          final_text:   data.final_text ?? '',
          status:       data.status as 'draft' | 'submitted',
        });
        setLoading(false);
        return;
      }
    }

    // New eval — auto-fetch season stats for this player
    const autoStats = await fetchSeasonStats(playerId, teamId);

    setForm(prev => ({
      ...prev,
      report_data: {
        ...prev.report_data,
        bio: {
          ...prev.report_data.bio,
          position: prefillPosition,
        },
        stats: {
          ...prev.report_data.stats,
          ...autoStats,
        },
      },
    }));
    setLoading(false);
  }

  async function fetchSeasonStats(pid: string, tid: string): Promise<Partial<ReportData['stats']>> {
    if (!pid || !tid) return {};
    try {
      const [eventsRes, statsRes] = await Promise.all([
        supabase.from('events').select('id,type').eq('team_id', tid),
        (supabase as any).from('event_player_stats')
          .select('goals,assists,yellow_cards,minutes_played')
          .eq('player_id', pid)
          .eq('team_id', tid),
      ]);

      const allEvents = (eventsRes.data ?? []) as { id: string; type: string }[];
      const gameEventIds = new Set(allEvents.filter(e => e.type === 'game').map(e => e.id));
      const trainEventIds = new Set(allEvents.filter(e => e.type === 'training').map(e => e.id));

      const eventIds = allEvents.map(e => e.id);
      const [rsvpRes, attRes] = await Promise.all([
        supabase.from('event_rsvps').select('event_id,status').eq('player_id', pid).in('event_id', eventIds),
        supabase.from('event_attendance').select('event_id,status').eq('player_id', pid).in('event_id', eventIds),
      ]);

      const rsvps = (rsvpRes.data ?? []) as { event_id: string; status: string }[];
      const attendanceRows = (attRes.data ?? []) as { event_id: string; status: string }[];
      const markedEventIds = new Set(attendanceRows.map(a => a.event_id));
      // Coach-marked attendance wins where it exists; RSVP only fills in
      // events the coach hasn't marked yet.
      const attended = new Set([
        ...attendanceRows.filter(a => a.status === 'present' || a.status === 'late').map(a => a.event_id),
        ...rsvps.filter(r => r.status === 'attending' && !markedEventIds.has(r.event_id)).map(r => r.event_id),
      ]);

      const totalEvents   = allEvents.length;
      const gameEvents    = gameEventIds.size;
      const trainEvents   = trainEventIds.size;
      const attendedTotal = attended.size;
      const attendedGames = [...attended].filter(id => gameEventIds.has(id)).length;
      const attendedTrain = [...attended].filter(id => trainEventIds.has(id)).length;

      const gameStat = (statsRes.data ?? []) as { goals: number; assists: number; yellow_cards: number; minutes_played: number | null }[];
      const totalGoals   = gameStat.reduce((s, r) => s + (r.goals ?? 0), 0);
      const totalAssists = gameStat.reduce((s, r) => s + (r.assists ?? 0), 0);
      const totalYellows = gameStat.reduce((s, r) => s + (r.yellow_cards ?? 0), 0);
      const totalMins    = gameStat.reduce((s, r) => s + (r.minutes_played ?? 0), 0);
      const gamesPlayed  = gameStat.length;

      const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : '';

      return {
        rsvp_pct:      pct(attendedTotal, totalEvents),
        practice_pct:  pct(attendedTrain, trainEvents),
        game_pct:      pct(attendedGames, gameEvents),
        games_played:  gamesPlayed > 0 ? String(gamesPlayed) : '',
        minutes_played:totalMins > 0 ? String(totalMins) : '',
        goals:         totalGoals > 0 ? String(totalGoals) : '',
        assists:       totalAssists > 0 ? String(totalAssists) : '',
        yellow_cards:  totalYellows > 0 ? String(totalYellows) : '',
      };
    } catch {
      return {};
    }
  }

  // ─── Updaters ─────────────────────────────────────────────────────────────

  function setRating(key: 'rating_technical' | 'rating_tactical' | 'rating_physical' | 'rating_mental', v: number) {
    setForm(prev => ({ ...prev, [key]: v }));
  }

  function setBio(key: keyof ReportData['bio'], v: string) {
    setForm(prev => ({ ...prev, report_data: { ...prev.report_data, bio: { ...prev.report_data.bio, [key]: v } } }));
  }

  function setStats(key: keyof ReportData['stats'], v: string) {
    setForm(prev => ({ ...prev, report_data: { ...prev.report_data, stats: { ...prev.report_data.stats, [key]: v } } }));
  }

  function setListItem(
    section: 'super_strengths' | 'areas_of_development' | 'outcome_goals' | 'performance_goals',
    idx: number, v: string,
  ) {
    setForm(prev => {
      const arr = [...prev.report_data[section]] as string[];
      arr[idx] = v;
      return { ...prev, report_data: { ...prev.report_data, [section]: arr } };
    });
  }

  function setIdpField(rowIdx: number, field: 'goal' | 'measurables', v: string) {
    setForm(prev => ({
      ...prev,
      report_data: {
        ...prev.report_data,
        idp: prev.report_data.idp.map((row, i) => i === rowIdx ? { ...row, [field]: v } : row),
      },
    }));
  }

  function setIdpAction(rowIdx: number, itemIdx: number, v: string) {
    setForm(prev => ({
      ...prev,
      report_data: {
        ...prev.report_data,
        idp: prev.report_data.idp.map((row, i) => {
          if (i !== rowIdx) return row;
          const action_items = [...row.action_items] as [string, string, string];
          action_items[itemIdx] = v;
          return { ...row, action_items };
        }),
      },
    }));
  }

  function addIdpRow() {
    setForm(prev => ({
      ...prev,
      report_data: {
        ...prev.report_data,
        idp: [...prev.report_data.idp, { goal: '', measurables: '', action_items: ['', '', ''] }],
      },
    }));
  }

  function removeIdpRow(idx: number) {
    setForm(prev => ({
      ...prev,
      report_data: { ...prev.report_data, idp: prev.report_data.idp.filter((_, i) => i !== idx) },
    }));
  }

  // ─── AI Summary ───────────────────────────────────────────────────────────

  async function generateAI() {
    const rd = form.report_data;
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');

      const res = await fetch(`${API_BASE}/api/ai/generate-evaluation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          player_name:          playerName,
          position:             rd.bio.position || '',
          school:               rd.bio.school || '',
          season_label:         seasonLabel,
          period_label:         periodLabel,
          rating_technical:     form.rating_technical,
          rating_tactical:      form.rating_tactical,
          rating_physical:      form.rating_physical,
          rating_mental:        form.rating_mental,
          super_strengths:      rd.super_strengths,
          areas_of_development: rd.areas_of_development,
          performance_goals:    rd.performance_goals,
        }),
      });
      const json = await res.json();
      const text: string = json.text ?? '';
      if (text) {
        setForm(prev => ({ ...prev, ai_draft: text, final_text: text }));
      } else {
        Alert.alert('Error', json.error ?? 'No response from AI. Try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not generate summary. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function save(submitNow = false) {
    if (!team || !profile) return;
    setSaving(true);

    const payload = {
      batch_id: batchId, club_id: team.club_id ?? profile.club_id, team_id: team.id,
      player_id: playerId, coach_id: profile.id,
      season_label: seasonLabel, period_label: periodLabel,
      rating_technical: form.rating_technical, rating_tactical: form.rating_tactical,
      rating_physical:  form.rating_physical,  rating_mental: form.rating_mental,
      report_data: form.report_data,
      ai_draft: form.ai_draft, final_text: form.final_text,
      status: (submitNow ? 'submitted' : 'draft') as 'submitted' | 'draft',
      ...(submitNow ? { submitted_at: new Date().toISOString() } : {}),
    };

    if (isEdit) {
      const { error } = await supabase.from('player_evaluations').update(payload).eq('id', evalId);
      if (error) { Alert.alert('Save failed', error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('player_evaluations').insert(payload);
      if (error) { Alert.alert('Save failed', error.message); setSaving(false); return; }
    }

    const { count } = await supabase
      .from('player_evaluations')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .neq('status', 'draft');
    await supabase.from('evaluation_batches').update({ completed_count: count ?? 0 }).eq('id', batchId);

    setSaving(false);
    router.back();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const rd = form.report_data;

  if (loading) {
    return (
      <View style={st.screen}>
        <ClubHeader title="Evaluation" onBack={() => router.back()} />
        <View style={st.center}><ActivityIndicator color={primary} /></View>
      </View>
    );
  }

  return (
    <View style={st.screen}>
      <ClubHeader title={playerName || 'Evaluation'} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <View style={st.periodBadge}>
            <Ionicons name="ribbon-outline" size={14} color="#A855F7" />
            <Text style={st.periodText}>{periodLabel} · {seasonLabel}</Text>
          </View>

          {/* ── PLAYER PROFILE ─────────────────────── */}
          <SectionCard title="PLAYER PROFILE" color={primary} icon="person-outline">
            <GridInputs
              items={[
                { k: 'position',   label: 'POSITION',   value: rd.bio.position,   placeholder: 'CM, ST, GK…' },
                { k: 'birth_year', label: 'BIRTH YEAR', value: rd.bio.birth_year, placeholder: '2009' },
                { k: 'school',     label: 'SCHOOL',     value: rd.bio.school,     placeholder: 'School name' },
              ]}
              onChange={(k, v) => setBio(k as keyof ReportData['bio'], v)}
            />
          </SectionCard>

          {/* ── SEASON STATISTICS ─────────────────── */}
          <SectionCard title="SEASON STATISTICS" color="#3B82F6" icon="stats-chart-outline" note="Auto-filled from season data · edit if needed · leave blank to hide from report">
            <GridInputs
              items={[
                { k: 'rsvp_pct',      label: 'RSVP %',          value: rd.stats.rsvp_pct,      placeholder: '92%' },
                { k: 'practice_pct',  label: 'PRACTICE ATTEND.', value: rd.stats.practice_pct,  placeholder: '88%' },
                { k: 'game_pct',      label: 'GAME ATTEND.',     value: rd.stats.game_pct,       placeholder: '100%' },
                { k: 'games_played',  label: 'GAMES PLAYED',     value: rd.stats.games_played,   placeholder: '13' },
                { k: 'minutes_played',label: 'MINUTES PLAYED',   value: rd.stats.minutes_played, placeholder: '870' },
                { k: 'goals',         label: 'GOALS',            value: rd.stats.goals,          placeholder: '7' },
                { k: 'assists',       label: 'ASSISTS',          value: rd.stats.assists,        placeholder: '4' },
                { k: 'yellow_cards',  label: 'YELLOW CARDS',     value: rd.stats.yellow_cards,   placeholder: '1' },
                { k: 'secondary_foot',label: 'SECONDARY FOOT',   value: rd.stats.secondary_foot, placeholder: '4/5' },
              ]}
              onChange={(k, v) => setStats(k as keyof ReportData['stats'], v)}
            />
          </SectionCard>

          {/* ── RATINGS ──────────────────────────────── */}
          <SectionCard title="PERFORMANCE RATINGS" color="#F59E0B" icon="star-outline">
            <View style={{ gap: 14 }}>
              <RatingRow label="Technical"         value={form.rating_technical} onChange={v => setRating('rating_technical', v)} />
              <RatingRow label="Tactical"           value={form.rating_tactical}  onChange={v => setRating('rating_tactical',  v)} />
              <RatingRow label="Physical"           value={form.rating_physical}  onChange={v => setRating('rating_physical',  v)} />
              <RatingRow label="Mental / Attitude"  value={form.rating_mental}    onChange={v => setRating('rating_mental',    v)} />
            </View>
          </SectionCard>

          {/* ── SUPER STRENGTHS ─────────────────────── */}
          <SectionCard title="SUPER STRENGTHS" color="#22C55E" icon="checkmark-circle-outline">
            <View style={{ gap: 10 }}>
              {rd.super_strengths.map((s, i) => (
                <NumberedInput key={i} index={i} value={s} color="#22C55E"
                  placeholder={['Creativity breaking lines', 'Work ethic', '1v1 attacking'][i]}
                  onChange={v => setListItem('super_strengths', i, v)}
                />
              ))}
            </View>
          </SectionCard>

          {/* ── AREAS OF DEVELOPMENT ────────────────── */}
          <SectionCard title="AREAS OF DEVELOPMENT" color="#F97316" icon="trending-up-outline">
            <View style={{ gap: 10 }}>
              {rd.areas_of_development.map((s, i) => (
                <NumberedInput key={i} index={i} value={s} color="#F97316"
                  placeholder={['Speed – max speed', 'Defending 1v1s', 'Playing between lines'][i]}
                  onChange={v => setListItem('areas_of_development', i, v)}
                />
              ))}
            </View>
          </SectionCard>

          {/* ── OUTCOME GOALS ───────────────────────── */}
          <SectionCard title="OUTCOME GOALS" color="#8B5CF6" icon="trophy-outline" note="Long-term aspirations">
            <View style={{ gap: 10 }}>
              {rd.outcome_goals.map((s, i) => (
                <NumberedInput key={i} index={i} value={s} color="#8B5CF6"
                  placeholder={['Get selected for a national team camp', 'Get recruited to a college program'][i]}
                  onChange={v => setListItem('outcome_goals', i, v)}
                />
              ))}
            </View>
          </SectionCard>

          {/* ── PERFORMANCE GOALS ───────────────────── */}
          <SectionCard title="PERFORMANCE GOALS" color="#3B82F6" icon="flag-outline" note="Measurable in-season targets">
            <View style={{ gap: 10 }}>
              {rd.performance_goals.map((s, i) => (
                <NumberedInput key={i} index={i} value={s} color="#3B82F6"
                  placeholder={['Reach 20 mph max speed in multiple games', 'Improve ground tackle win % to 80%'][i]}
                  onChange={v => setListItem('performance_goals', i, v)}
                />
              ))}
            </View>
          </SectionCard>

          {/* ── INDIVIDUAL DEVELOPMENT PLAN ─────────── */}
          <SectionCard title="INDIVIDUAL DEVELOPMENT PLAN" color="#A855F7" icon="clipboard-outline">
            <View style={{ gap: 14 }}>
              {rd.idp.map((row, rowIdx) => (
                <View key={rowIdx} style={idp.row}>
                  {rd.idp.length > 1 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#A855F7', letterSpacing: 0.5 }}>Plan {rowIdx + 1}</Text>
                      <TouchableOpacity onPress={() => removeIdpRow(rowIdx)}>
                        <Ionicons name="trash-outline" size={15} color={PULSE_COLORS.ui.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={idp.fieldLabel}>PERFORMANCE GOAL</Text>
                  <TextInput style={idp.area} multiline value={row.goal}
                    onChangeText={v => setIdpField(rowIdx, 'goal', v)}
                    placeholder="Improve my ability to defend a player 1v1"
                    placeholderTextColor={PULSE_COLORS.ui.muted}
                    textAlignVertical="top"
                  />

                  <Text style={idp.fieldLabel}>MEASURABLES</Text>
                  <TextInput style={idp.area} multiline value={row.measurables}
                    onChangeText={v => setIdpField(rowIdx, 'measurables', v)}
                    placeholder="Improve ground tackle win % to 80%"
                    placeholderTextColor={PULSE_COLORS.ui.muted}
                    textAlignVertical="top"
                  />

                  <Text style={idp.fieldLabel}>ACTION PLAN</Text>
                  <View style={{ gap: 8 }}>
                    {row.action_items.map((item, itemIdx) => (
                      <View key={itemIdx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={idp.bullet} />
                        <TextInput
                          style={[inp.base, { flex: 1 }]}
                          value={item}
                          onChangeText={v => setIdpAction(rowIdx, itemIdx, v)}
                          placeholder={[
                            'Defend 1v1s during IDP sessions',
                            'Work on not over-committing when pressing',
                            'Watch film to recognize technical breakdowns',
                          ][itemIdx]}
                          placeholderTextColor={PULSE_COLORS.ui.muted}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
            {rd.idp.length < 3 && (
              <TouchableOpacity style={idp.addBtn} onPress={addIdpRow} activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={16} color="#A855F7" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#A855F7' }}>Add another IDP goal</Text>
              </TouchableOpacity>
            )}
          </SectionCard>

          {/* ── AI GENERATE ──────────────────────────── */}
          <TouchableOpacity
            style={[st.generateBtn, { opacity: generating ? 0.6 : 1 }]}
            onPress={generateAI}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles-outline" size={16} color="#fff" />}
            <Text style={st.generateBtnText}>
              {generating ? 'Generating…' : form.ai_draft ? 'Regenerate Coach Summary' : 'Generate Coach Summary'}
            </Text>
          </TouchableOpacity>

          {/* ── COACH SUMMARY ────────────────────────── */}
          <SectionCard title="COACH'S SUMMARY" color="#EC4899" icon="create-outline">
            {form.ai_draft ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -4 }}>
                <Ionicons name="sparkles" size={10} color="#A855F7" />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#A855F7' }}>AI drafted · edit before submitting</Text>
              </View>
            ) : null}
            <TextInput
              style={[inp.base, { minHeight: 140 }]}
              multiline
              value={form.final_text}
              onChangeText={v => setForm(prev => ({ ...prev, final_text: v }))}
              placeholder="Write your summary, or use Generate Coach Summary above"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              textAlignVertical="top"
            />
          </SectionCard>

          {/* ── ACTIONS ──────────────────────────────── */}
          <View style={st.actions}>
            <TouchableOpacity
              style={[st.btn, { backgroundColor: PULSE_COLORS.ui.surface, borderColor: PULSE_COLORS.ui.border }]}
              onPress={() => save(false)} disabled={saving} activeOpacity={0.8}
            >
              {saving ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.text} /> : <Text style={st.btnText}>Save Draft</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.btn, { backgroundColor: primary, borderColor: 'transparent', flexDirection: 'row', gap: 6 }]}
              onPress={() => setPreviewVisible(true)} disabled={saving} activeOpacity={0.85}
            >
              <Ionicons name="eye-outline" size={16} color="#000" />
              <Text style={[st.btnText, { color: '#000' }]}>Preview & Submit</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── PREVIEW MODAL ─────────────────────────────────────────────────── */}
      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={{ flex: 1, backgroundColor: PULSE_COLORS.ui.background }}>

          {/* Header */}
          <View style={pvSt.header}>
            <TouchableOpacity onPress={() => setPreviewVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={24} color={PULSE_COLORS.ui.text} />
            </TouchableOpacity>
            <Text style={pvSt.headerTitle}>Report Preview</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Report card */}
          <ScrollView contentContainerStyle={pvSt.scroll} showsVerticalScrollIndicator={false}>
            {(() => {
              const rd = form.report_data;
              const lastName      = playerName.split(' ').slice(-1)[0]?.toUpperCase() ?? '';
              const hasStrengths  = rd?.super_strengths?.some(Boolean);
              const hasDev        = rd?.areas_of_development?.some(Boolean);
              const hasOutcome    = rd?.outcome_goals?.some(Boolean);
              const hasPerf       = rd?.performance_goals?.some(Boolean);
              const hasIDP        = rd?.idp?.some(r => r.goal?.trim());
              const hasBioStats   = rd?.bio?.birth_year || rd?.bio?.school;
              const hasAttendance = rd?.stats?.rsvp_pct || rd?.stats?.practice_pct || rd?.stats?.game_pct;
              const hasPerfStats  = rd?.stats?.games_played || rd?.stats?.minutes_played || rd?.stats?.secondary_foot
                || (rd?.stats?.goals        && rd.stats.goals        !== '0')
                || (rd?.stats?.assists      && rd.stats.assists      !== '0')
                || (rd?.stats?.yellow_cards && rd.stats.yellow_cards !== '0');
              return (
                <View style={pvSt.card}>
                  {/* Branded header band */}
                  <View style={[pvSt.headerBand, { backgroundColor: primary }]}>
                    <View style={pvSt.headerLeft}>
                      {clubLogoUrl ? <Image source={{ uri: clubLogoUrl }} style={pvSt.headerLogo} contentFit="contain" /> : null}
                      <View style={{ gap: 1 }}>
                        <Text style={pvSt.reportType}>PLAYER DEVELOPMENT REPORT</Text>
                        <Text style={pvSt.clubNameText}>{clubName}</Text>
                      </View>
                    </View>
                    <Text style={pvSt.previewBadge}>PREVIEW</Text>
                  </View>

                  {/* Player hero */}
                  <View style={{ overflow: 'hidden', paddingBottom: 4 }}>
                    {lastName ? <Text style={[pvSt.heroWatermark, { color: `${primary}28` }]} numberOfLines={1}>{lastName}</Text> : null}
                    <View style={pvSt.heroContent}>
                      <Text style={pvSt.playerName}>{playerName}</Text>
                      <View style={pvSt.pillRow}>
                        {rd?.bio?.position ? <View style={[pvSt.pill, { backgroundColor: `${primary}18`, borderColor: `${primary}30` }]}><Text style={[pvSt.pillText, { color: primary }]}>{rd.bio.position}</Text></View> : null}
                        {jerseyNumber != null ? <View style={pvSt.pillNeutral}><Text style={pvSt.pillTextNeutral}>#{jerseyNumber}</Text></View> : null}
                        <View style={pvSt.pillNeutral}><Text style={pvSt.pillTextNeutral}>{periodLabel} · {seasonLabel}</Text></View>
                      </View>
                    </View>
                  </View>

                  {/* Bio strip */}
                  {hasBioStats ? (
                    <View style={pvSt.statBlock}>
                      <Text style={pvSt.statBlockLabel}>PROFILE</Text>
                      <View style={pvSt.statRow}>
                        {rd!.bio.birth_year ? <PvStatChip label="BIRTH YEAR" value={rd!.bio.birth_year} color="#0f172a" /> : null}
                        {rd!.bio.school     ? <PvStatChip label="SCHOOL"     value={rd!.bio.school}     color="#0f172a" /> : null}
                      </View>
                    </View>
                  ) : null}

                  {/* Attendance strip */}
                  {hasAttendance ? (
                    <View style={pvSt.statBlock}>
                      <Text style={pvSt.statBlockLabel}>ATTENDANCE</Text>
                      <View style={pvSt.statRow}>
                        {rd!.stats.rsvp_pct     ? <PvStatChip label="RSVP"     value={rd!.stats.rsvp_pct}     color={primary} /> : null}
                        {rd!.stats.practice_pct ? <PvStatChip label="PRACTICE" value={rd!.stats.practice_pct} color={primary} /> : null}
                        {rd!.stats.game_pct     ? <PvStatChip label="GAMES"    value={rd!.stats.game_pct}     color={primary} /> : null}
                      </View>
                    </View>
                  ) : null}

                  {/* Season stats */}
                  {hasPerfStats ? (
                    <View style={pvSt.statBlock}>
                      <Text style={pvSt.statBlockLabel}>SEASON</Text>
                      <View style={pvSt.statRow}>
                        {rd!.stats.games_played                                     ? <PvStatChip label="PLAYED"  value={rd!.stats.games_played}   color={primary} /> : null}
                        {rd!.stats.goals    && rd!.stats.goals    !== '0'           ? <PvStatChip label="GOALS"   value={rd!.stats.goals}          color={primary} /> : null}
                        {rd!.stats.assists  && rd!.stats.assists  !== '0'           ? <PvStatChip label="ASSISTS" value={rd!.stats.assists}        color={primary} /> : null}
                      </View>
                      {(rd!.stats.minutes_played || (rd!.stats.yellow_cards && rd!.stats.yellow_cards !== '0') || rd!.stats.secondary_foot) ? (
                        <View style={[pvSt.statRow, { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 }]}>
                          {rd!.stats.minutes_played                                   ? <PvStatChip label="MINUTES"  value={rd!.stats.minutes_played} color="#0f172a" /> : null}
                          {rd!.stats.yellow_cards && rd!.stats.yellow_cards !== '0'  ? <PvStatChip label="YELLOWS"  value={rd!.stats.yellow_cards}   color="#D97706" /> : null}
                          {rd!.stats.secondary_foot                                   ? <PvStatChip label="2ND FOOT" value={rd!.stats.secondary_foot} color="#0f172a" /> : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Radar chart */}
                  <View style={{ borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                    <PvRadarChart
                      values={[form.rating_technical, form.rating_physical, form.rating_mental, form.rating_tactical]}
                      color={primary}
                    />
                  </View>

                  {/* Strengths + Development */}
                  {(hasStrengths || hasDev) ? (
                    <View style={pvSt.twoCol}>
                      {hasStrengths ? (
                        <View style={{ flex: 1 }}>
                          <PvSectionHead label="SUPER STRENGTHS" color={primary} />
                          {rd!.super_strengths.map((s, i) => <PvBullet key={i} n={i + 1} text={s} color={primary} />)}
                        </View>
                      ) : null}
                      {hasStrengths && hasDev ? <View style={pvSt.colDiv} /> : null}
                      {hasDev ? (
                        <View style={{ flex: 1 }}>
                          <PvSectionHead label="DEVELOPMENT" color={primary} />
                          {rd!.areas_of_development.map((s, i) => <PvBullet key={i} n={i + 1} text={s} color={primary} />)}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Goals */}
                  {(hasOutcome || hasPerf) ? (
                    <>
                      <View style={pvSt.sectionSep} />
                      <View style={pvSt.twoCol}>
                        {hasOutcome ? (
                          <View style={{ flex: 1 }}>
                            <PvSectionHead label="OUTCOME GOALS" color={primary} />
                            {rd!.outcome_goals.map((s, i) => <PvBullet key={i} n={i + 1} text={s} color={primary} />)}
                          </View>
                        ) : null}
                        {hasOutcome && hasPerf ? <View style={pvSt.colDiv} /> : null}
                        {hasPerf ? (
                          <View style={{ flex: 1 }}>
                            <PvSectionHead label="PERF. GOALS" color={primary} />
                            {rd!.performance_goals.map((s, i) => <PvBullet key={i} n={i + 1} text={s} color={primary} />)}
                          </View>
                        ) : null}
                      </View>
                    </>
                  ) : null}

                  {/* IDP */}
                  {hasIDP ? (
                    <>
                      <View style={pvSt.sectionSep} />
                      <View style={pvSt.idpWrap}>
                        <PvSectionHead label="INDIVIDUAL DEVELOPMENT PLAN" color={primary} />
                        <View style={[pvSt.idpHead, { backgroundColor: `${primary}0C` }]}>
                          <Text style={[pvSt.idpHeadCell, { flex: 3, color: primary }]}>PERFORMANCE GOAL</Text>
                          <Text style={[pvSt.idpHeadCell, { flex: 3, color: primary }]}>MEASURABLES</Text>
                          <Text style={[pvSt.idpHeadCell, { flex: 4, color: primary }]}>ACTION PLAN</Text>
                        </View>
                        {rd!.idp.filter(r => r.goal?.trim()).map((row, i) => (
                          <View key={i} style={[pvSt.idpRow, { backgroundColor: i % 2 === 0 ? `${primary}05` : '#ffffff' }]}>
                            <Text style={[pvSt.idpCell, { flex: 3 }]}>{row.goal}</Text>
                            <Text style={[pvSt.idpCell, { flex: 3 }]}>{row.measurables}</Text>
                            <View style={{ flex: 4, gap: 4 }}>
                              {row.action_items.filter(Boolean).map((item, j) => (
                                <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5 }}>
                                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: primary, marginTop: 5 }} />
                                  <Text style={[pvSt.idpCell, { flex: 1 }]}>{item}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : null}

                  {/* Coach summary */}
                  {form.final_text?.trim() ? (
                    <>
                      <View style={pvSt.sectionSep} />
                      <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 }}>
                        <PvSectionHead label="COACH'S SUMMARY" color={primary} />
                        <Text style={{ fontSize: 13.5, color: '#334155', lineHeight: 22, fontStyle: 'italic' }}>{form.final_text}</Text>
                      </View>
                    </>
                  ) : null}

                  {/* Footer */}
                  <View style={[pvSt.cardFooter, { borderTopColor: `${primary}20` }]}>
                    <Ionicons name="ribbon-outline" size={11} color={`${primary}70`} />
                    <Text style={[pvSt.cardFooterText, { color: `${primary}70` }]}>{clubName}  ·  {periodLabel}  ·  {seasonLabel}</Text>
                  </View>
                </View>
              );
            })()}
            <View style={{ height: 32 }} />
          </ScrollView>

          {/* Bottom actions */}
          <View style={pvSt.footer}>
            <TouchableOpacity style={pvSt.backBtn} onPress={() => setPreviewVisible(false)} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={16} color={PULSE_COLORS.ui.text} />
              <Text style={pvSt.backBtnText}>Back to Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pvSt.submitBtn, { backgroundColor: primary }]}
              onPress={() => { setPreviewVisible(false); save(true); }}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={16} color="#000" />
              <Text style={pvSt.submitBtnText}>Submit Report</Text>
            </TouchableOpacity>
          </View>

        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 14 },

  periodBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(168,85,247,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  periodText:  { fontSize: 12, fontWeight: '700', color: '#A855F7' },

  generateBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#A855F7', borderRadius: 14, paddingVertical: 15 },
  generateBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  actions: { flexDirection: 'row', gap: 10 },
  btn:     { flex: 1, padding: 15, borderRadius: 14, alignItems: 'center', borderWidth: 1, justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '800', color: PULSE_COLORS.ui.text },
});

const idp = StyleSheet.create({
  row:        { backgroundColor: 'rgba(168,85,247,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)', padding: 14, gap: 10 },
  fieldLabel: { fontSize: 9, fontWeight: '900', color: PULSE_COLORS.ui.textSecondary, letterSpacing: 1.5 },
  area:       { backgroundColor: PULSE_COLORS.ui.background, borderRadius: 10, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: PULSE_COLORS.ui.text, minHeight: 70 },
  bullet:     { width: 5, height: 5, borderRadius: 3, backgroundColor: '#A855F7', marginTop: 2 },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 10 },
});

const pvSt = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  headerTitle:   { fontSize: 17, fontWeight: '800', color: PULSE_COLORS.ui.text },
  scroll:        { padding: 16 },

  card:          { width: PREVIEW_CARD_W, backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 7 },

  headerBand:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerLogo:    { width: 40, height: 40 },
  reportType:    { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.8 },
  clubNameText:  { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.1 },
  previewBadge:  { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2 },

  heroWatermark: { position: 'absolute', fontSize: 96, fontWeight: '900', letterSpacing: -5, top: -8, left: 10, lineHeight: 96, zIndex: 0 },
  heroContent:   { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, zIndex: 1 },
  playerName:    { fontSize: 30, fontWeight: '900', color: '#0f172a', letterSpacing: -0.8, lineHeight: 32, marginBottom: 8 },
  pillRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pill:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  pillText:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  pillNeutral:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  pillTextNeutral: { fontSize: 11, fontWeight: '700', color: '#475569' },

  statBlock:     { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e2e8f0', paddingTop: 8, paddingBottom: 14, paddingHorizontal: 16, gap: 12 },
  statBlockLabel:{ fontSize: 8, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.5 },
  statRow:       { flexDirection: 'row', justifyContent: 'space-around' },

  twoCol:        { flexDirection: 'row', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  colDiv:        { width: 1, backgroundColor: '#f1f5f9', marginHorizontal: 14, marginVertical: 4 },
  sectionSep:    { height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 18 },

  idpWrap:       { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  idpHead:       { flexDirection: 'row', paddingVertical: 7, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  idpHeadCell:   { fontSize: 8, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 6 },
  idpRow:        { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  idpCell:       { fontSize: 11, color: '#334155', lineHeight: 16, paddingHorizontal: 6 },

  cardFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 13, marginHorizontal: 18, borderTopWidth: 1, marginTop: 10 },
  cardFooterText:{ fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },

  footer:        { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 32, borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border },
  backBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 15, borderRadius: 14, backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  backBtnText:   { fontSize: 15, fontWeight: '800', color: PULSE_COLORS.ui.text },
  submitBtn:     { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 15, borderRadius: 14 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#000' },
});
