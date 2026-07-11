import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EvaluationFormScreen() {
  const { primaryColor } = useClub();
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
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving,     setSaving]     = useState(false);

  useEffect(() => { load(); }, [playerId, batchId, evalId]);

  async function load() {
    setLoading(true);
    const [pRes, bRes] = await Promise.all([
      supabase.from('players').select('full_name,position').eq('id', playerId).single(),
      supabase.from('evaluation_batches').select('season_label,period_label,team_id').eq('id', batchId).single(),
    ]);

    let prefillPosition = '';
    let teamId = '';
    if (pRes.data) {
      setPlayerName(pRes.data.full_name);
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

      const rsvpRes = await supabase
        .from('event_rsvps')
        .select('event_id,status')
        .eq('player_id', pid)
        .in('event_id', allEvents.map(e => e.id));

      const rsvps = (rsvpRes.data ?? []) as { event_id: string; status: string }[];
      const attended = new Set(rsvps.filter(r => r.status === 'attending').map(r => r.event_id));

      const totalEvents   = allEvents.length;
      const gameEvents    = gameEventIds.size;
      const trainEvents   = trainEventIds.size;
      const attendedTotal = rsvps.filter(r => r.status === 'attending').length;
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
    if (!ANTHROPIC_KEY) {
      Alert.alert('Setup needed', 'Add EXPO_PUBLIC_ANTHROPIC_API_KEY to your .env and rebuild.');
      return;
    }
    const rd = form.report_data;
    const strengthsText = rd.super_strengths.filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n') || 'Not specified';
    const devText       = rd.areas_of_development.filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n') || 'Not specified';
    const goalsText     = rd.performance_goals.filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n') || 'Not specified';

    setGenerating(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          system: `You are a youth soccer coach writing a personal summary paragraph for a player development report.
Write in a warm, direct, encouraging tone — specific to this player, never generic.
Output ONLY the paragraph. No headers, no bullet points, no markdown. 120–160 words maximum.
Reference specific strengths, the main development priority, and close with genuine encouragement.`,
          messages: [{
            role: 'user',
            content: `Player: ${playerName}
Position: ${rd.bio.position || 'Not listed'}
School: ${rd.bio.school || 'Not listed'}
Season/Period: ${periodLabel} — ${seasonLabel}

Ratings — Technical: ${form.rating_technical}/5, Tactical: ${form.rating_tactical}/5, Physical: ${form.rating_physical}/5, Mental: ${form.rating_mental}/5

Super Strengths:
${strengthsText}

Areas of Development:
${devText}

Performance Goals this season:
${goalsText}

Write the coach summary now.`,
          }],
        }),
      });
      const json = await res.json();
      const text: string = json.content?.[0]?.text ?? '';
      if (text) {
        setForm(prev => ({ ...prev, ai_draft: text, final_text: text }));
      } else {
        Alert.alert('Error', json.error?.message ?? 'No response from AI. Try again.');
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
          {form.final_text ? (
            <SectionCard title="COACH'S SUMMARY" color="#EC4899" icon="create-outline">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -4 }}>
                <Ionicons name="sparkles" size={10} color="#A855F7" />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#A855F7' }}>AI drafted · edit before submitting</Text>
              </View>
              <TextInput
                style={[inp.base, { minHeight: 140 }]}
                multiline
                value={form.final_text}
                onChangeText={v => setForm(prev => ({ ...prev, final_text: v }))}
                textAlignVertical="top"
              />
            </SectionCard>
          ) : null}

          {/* ── ACTIONS ──────────────────────────────── */}
          <View style={st.actions}>
            <TouchableOpacity
              style={[st.btn, { backgroundColor: PULSE_COLORS.ui.surface, borderColor: PULSE_COLORS.ui.border }]}
              onPress={() => save(false)} disabled={saving} activeOpacity={0.8}
            >
              {saving ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.text} /> : <Text style={st.btnText}>Save Draft</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.btn, { backgroundColor: primary, borderColor: 'transparent' }]}
              onPress={() => save(true)} disabled={saving} activeOpacity={0.85}
            >
              <Text style={[st.btnText, { color: '#000' }]}>Submit</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
