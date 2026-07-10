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
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlayerStat = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  seconds_played: number;
  games_played: number;
  pct: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMins(secs: number): string {
  const m = Math.floor(secs / 60);
  return m < 1 ? '<1m' : `${m}m`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SeasonStatsScreen() {
  const { primaryColor } = useClub();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { team } = useTeam();
  const router = useRouter();
  const { profile } = useAuth();

  useEffect(() => {
    if (profile && !['coach', 'org_admin', 'app_admin'].includes(profile.role ?? '')) {
      router.back();
    }
  }, [profile]);

  const [stats, setStats]               = useState<PlayerStat[]>([]);
  const [totalGames, setTotalGames]     = useState(0);
  const [totalAvailSecs, setTotalAvailSecs] = useState(0);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (team) load();
  }, [team?.id]);

  async function load() {
    if (!team) return;

    const [playersRes, sessionsRes] = await Promise.all([
      supabase
        .from('players')
        .select('id, full_name, jersey_number, position')
        .eq('team_id', team.id)
        .order('jersey_number'),
      supabase
        .from('game_sessions')
        .select('id, half1_started_at, half1_ended_at, half2_started_at, half2_ended_at, half_length_seconds')
        .eq('team_id', team.id)
        .eq('status', 'full_time'),
    ]);

    const players  = (playersRes.data  ?? []) as {
      id: string; full_name: string; jersey_number: number | null; position: string | null;
    }[];
    const sessions = (sessionsRes.data ?? []) as {
      id: string;
      half1_started_at: string | null; half1_ended_at: string | null;
      half2_started_at: string | null; half2_ended_at: string | null;
      half_length_seconds: number;
    }[];

    setTotalGames(sessions.length);

    if (!sessions.length || !players.length) {
      setStats([]);
      setLoading(false);
      return;
    }

    // Compute actual game length per session in seconds
    const sessionSecs = new Map<string, number>();
    for (const s of sessions) {
      let secs = s.half_length_seconds * 2;
      if (s.half1_started_at && s.half1_ended_at && s.half2_started_at && s.half2_ended_at) {
        secs = Math.round(
          (new Date(s.half1_ended_at).getTime() - new Date(s.half1_started_at).getTime() +
           new Date(s.half2_ended_at).getTime() - new Date(s.half2_started_at).getTime()) / 1000,
        );
      }
      sessionSecs.set(s.id, Math.max(secs, 1));
    }
    const totalSecs = [...sessionSecs.values()].reduce((a, b) => a + b, 0);
    setTotalAvailSecs(totalSecs);

    // Fetch all periods for these sessions
    const { data: periodsData } = await supabase
      .from('player_match_periods')
      .select('player_id, game_session_id, on_at, off_at')
      .in('game_session_id', [...sessionSecs.keys()]);

    // Aggregate per player
    const secsMap  = new Map<string, number>();
    const gamesMap = new Map<string, Set<string>>();

    for (const p of periodsData ?? []) {
      if (!p.off_at) continue;
      const secs = Math.max(0, (new Date(p.off_at).getTime() - new Date(p.on_at).getTime()) / 1000);
      secsMap.set(p.player_id,  (secsMap.get(p.player_id) ?? 0) + secs);
      if (!gamesMap.has(p.player_id)) gamesMap.set(p.player_id, new Set());
      gamesMap.get(p.player_id)!.add(p.game_session_id);
    }

    const playerStats: PlayerStat[] = players
      .map((p) => ({
        ...p,
        seconds_played: secsMap.get(p.id)  ?? 0,
        games_played:   gamesMap.get(p.id)?.size ?? 0,
        pct: totalSecs > 0
          ? Math.round(((secsMap.get(p.id) ?? 0) / totalSecs) * 100)
          : 0,
      }))
      .sort((a, b) => b.pct - a.pct || b.games_played - a.games_played);

    setStats(playerStats);
    setLoading(false);
  }

  // Normalise bars against the top player so relative gaps are visible
  const maxPct = stats.length > 0 ? Math.max(...stats.map((s) => s.pct), 1) : 1;

  return (
    <View style={st.root}>

      <ClubHeader title="Season Stats" subtitle={team?.name ?? undefined} onBack={() => router.back()} />

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={primaryColor} size="large" />
        </View>

      ) : stats.length === 0 ? (
        <View style={st.center}>
          <View style={st.emptyIcon}>
            <Ionicons name="bar-chart-outline" size={30} color={PULSE_COLORS.ui.muted} />
          </View>
          <Text style={st.emptyTitle}>No game data yet</Text>
          <Text style={st.emptySub}>
            Stats appear here once you track a completed game using Match Tracker.
          </Text>
        </View>

      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>

          {/* Summary strip */}
          <View style={st.summaryRow}>
            <View style={st.summaryCell}>
              <Text style={[st.summaryNum, { color: primaryColor }]}>{totalGames}</Text>
              <Text style={st.summaryLabel}>Games tracked</Text>
            </View>
            <View style={st.summaryDivider} />
            <View style={st.summaryCell}>
              <Text style={[st.summaryNum, { color: primaryColor }]}>{stats.length}</Text>
              <Text style={st.summaryLabel}>Players</Text>
            </View>
            <View style={st.summaryDivider} />
            <View style={st.summaryCell}>
              <Text style={[st.summaryNum, { color: primaryColor }]}>{fmtMins(totalAvailSecs)}</Text>
              <Text style={st.summaryLabel}>Game mins</Text>
            </View>
          </View>

          {/* Ranked list */}
          <Text style={st.sectionLabel}>PLAYING TIME RANKING</Text>

          <View style={st.tableCard}>
            {stats.map((p, i) => {
              const barPct = Math.round((p.pct / maxPct) * 100);
              const label  = p.seconds_played < 60 ? (p.seconds_played > 0 ? '<1m' : '0m') : fmtMins(p.seconds_played);
              return (
                <View key={p.id}>
                  {i > 0 && <View style={st.rowDivider} />}
                  <View style={st.playerRow}>

                    {/* Rank */}
                    <Text style={[st.rank, i < 3 && { color: primaryColor }]}>
                      #{i + 1}
                    </Text>

                    {/* Jersey badge */}
                    <View style={st.jersey}>
                      <Text style={st.jerseyNum}>{p.jersey_number ?? '—'}</Text>
                    </View>

                    {/* Name + bar + meta */}
                    <View style={st.info}>
                      <View style={st.nameRow}>
                        <Text style={st.name} numberOfLines={1}>{p.full_name}</Text>
                        <Text style={[st.pctText, { color: p.pct > 0 ? PULSE_COLORS.ui.text : PULSE_COLORS.ui.muted }]}>
                          {p.pct}%
                        </Text>
                      </View>
                      <View style={st.barTrack}>
                        {barPct > 0 && (
                          <View style={[st.barFill, {
                            width: `${barPct}%`,
                            backgroundColor: primaryColor,
                            opacity: 0.85 + (i === 0 ? 0.15 : 0),
                          }]} />
                        )}
                      </View>
                      <Text style={st.meta}>
                        {p.games_played} {p.games_played === 1 ? 'game' : 'games'}
                        {'  ·  '}{label}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={st.footnote}>
            % = player's tracked minutes ÷ total available minutes across all completed games
          </Text>

          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  backBtn:      { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.3 },
  headerSub:    { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 1 },

  scroll: { padding: 20 },

  summaryRow: {
    flexDirection: 'row',
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden', marginBottom: 28,
  },
  summaryCell:    { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 3 },
  summaryDivider: { width: 1, backgroundColor: PULSE_COLORS.ui.border, alignSelf: 'stretch' },
  summaryNum:     { fontSize: 22, fontWeight: '800' },
  summaryLabel:   { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12,
  },

  tableCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },
  rowDivider: { height: 1, backgroundColor: PULSE_COLORS.ui.border },

  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 10,
  },
  rank: { width: 26, fontSize: 12, fontWeight: '800', color: PULSE_COLORS.ui.muted, textAlign: 'center' },

  jersey: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  jerseyNum: { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.muted },

  info:    { flex: 1, gap: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name:    { flex: 1, fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text, marginRight: 6 },
  pctText: { fontSize: 15, fontWeight: '800', minWidth: 38, textAlign: 'right' },

  barTrack: { height: 5, backgroundColor: PULSE_COLORS.ui.border, borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 3 },

  meta: { fontSize: 11, color: PULSE_COLORS.ui.muted },

  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: PULSE_COLORS.ui.muted, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

  footnote: {
    fontSize: 11, color: PULSE_COLORS.ui.muted,
    textAlign: 'center', marginTop: 16, lineHeight: 17,
  },
});
