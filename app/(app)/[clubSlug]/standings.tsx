import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useTeam } from '../../../hooks/useTeam';
import { useClub } from '../../../hooks/useClub';
import { useTheme } from '../../../hooks/useTheme';
import { PULSE_COLORS, ThemeColors } from '../../../constants/colors';
import ClubHeader from '../../../components/ui/ClubHeader';

type StandingsRow = {
  rank: number; team_raw_name: string; is_self: boolean;
  games_played: number; wins: number; losses: number; draws: number;
  points: number; goals_for: number; goals_against: number;
};

type NcsaTeam = { ncsaTeamId: string; rawName: string };

type ResultGame = {
  date: string; time: string | null; field: string; opponent: string; homeAway: 'home' | 'away';
  ourScore: number | null; oppScore: number | null; played: boolean;
};

// "Club-Division-Coach" — only the club name is worth showing; the division
// is already implied by the screen (everyone on this table plays in it) and
// the coach name is NCSA's own disambiguator, not ours.
function clubName(rawName: string): string {
  return rawName.split('-')[0] || rawName;
}

function formatResultDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function StandingsScreen() {
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { team } = useTeam();
  const { primaryColor, rgba } = useClub();
  const { colors } = useTheme();
  const st = useMemo(() => getSt(colors), [colors]);

  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [division, setDivision] = useState('');
  const [loading, setLoading] = useState(true);

  // Resolved lazily (not until a team is actually tapped) since it's a full
  // ~1000-team fetch — no reason to pay for it just to view the table.
  const [teamIdMap, setTeamIdMap] = useState<Record<string, string> | null>(null);
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [resultsGames, setResultsGames] = useState<ResultGame[] | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  useEffect(() => {
    if (!team?.id) return;
    supabase
      .from('ncsa_standings')
      .select('division, rank, team_raw_name, is_self, games_played, wins, losses, draws, points, goals_for, goals_against')
      .eq('team_id', team.id)
      .order('rank')
      .then(({ data }) => {
        const r = (data ?? []) as (StandingsRow & { division: string })[];
        setRows(r);
        setDivision(r[0]?.division ?? '');
        setLoading(false);
      });
  }, [team?.id]);

  async function openResults(row: StandingsRow) {
    if (resultsFor === row.team_raw_name) {
      closeResults();
      return;
    }
    setResultsFor(row.team_raw_name);
    setResultsGames(null);
    setResultsLoading(true);

    let map = teamIdMap;
    if (!map) {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('ncsa-team-lookup', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (error || !data?.teams) {
        setResultsLoading(false);
        setResultsFor(null);
        Alert.alert('Could not load results', 'Check your connection and try again.');
        return;
      }
      map = {};
      for (const t of data.teams as NcsaTeam[]) map[t.rawName] = t.ncsaTeamId;
      setTeamIdMap(map);
    }

    const ncsaTeamId = map[row.team_raw_name];
    if (!ncsaTeamId) {
      setResultsLoading(false);
      setResultsFor(null);
      Alert.alert('Not available', "Couldn't find this team's schedule on NCSA.");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('ncsa-team-preview', {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: { ncsa_team_id: ncsaTeamId, ncsa_raw_name: row.team_raw_name },
    });
    setResultsLoading(false);
    if (error || !data?.games) {
      setResultsFor(null);
      Alert.alert('Could not load results', 'Check your connection and try again.');
      return;
    }
    setResultsGames(data.games as ResultGame[]);
  }

  function closeResults() {
    setResultsFor(null);
    setResultsGames(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ClubHeader title="Standings" subtitle={division ? `Division ${division}` : team?.name} onBack={() => router.back()} />
      {loading ? (
        <View style={st.center}><ActivityIndicator color={primaryColor} /></View>
      ) : rows.length === 0 ? (
        <View style={st.center}>
          <Text style={st.emptyTitle}>No standings yet</Text>
          <Text style={st.emptySub}>They'll show up here once your team's division has played its first games.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.body}>
          <View style={st.tableCard}>
            <View style={[st.row, st.headerRow]}>
              <Text style={[st.cell, st.rankCell, st.headerText]}>#</Text>
              <Text style={[st.cell, st.teamCell, st.headerText]}>Team</Text>
              <Text style={[st.cell, st.numCell, st.headerText]}>GP</Text>
              <Text style={[st.cell, st.numCell, st.headerText]}>W</Text>
              <Text style={[st.cell, st.numCell, st.headerText]}>L</Text>
              <Text style={[st.cell, st.numCell, st.headerText]}>D</Text>
              <Text style={[st.cell, st.ptsCell, st.headerText]}>PTS</Text>
            </View>
            {rows.map((r, i) => (
              <TouchableOpacity
                key={r.team_raw_name}
                activeOpacity={0.6}
                onPress={() => openResults(r)}
                style={[
                  st.row,
                  i > 0 && st.rowBorder,
                  r.is_self && [st.selfRow, { backgroundColor: rgba(0.08) }],
                  resultsFor === r.team_raw_name && [st.selfRow, { backgroundColor: rgba(0.14) }],
                ]}
              >
                <Text style={[st.cell, st.rankCell, r.is_self && { color: primaryColor }]}>{r.rank}</Text>
                <View style={st.teamCellWrap}>
                  {r.is_self && <View style={[st.dot, { backgroundColor: primaryColor }]} />}
                  <Text style={[st.teamText, r.is_self && { fontWeight: '800' }]} numberOfLines={1}>
                    {clubName(r.team_raw_name)}
                  </Text>
                </View>
                <Text style={[st.cell, st.numCell]}>{r.games_played}</Text>
                <Text style={[st.cell, st.numCell]}>{r.wins}</Text>
                <Text style={[st.cell, st.numCell]}>{r.losses}</Text>
                <Text style={[st.cell, st.numCell]}>{r.draws}</Text>
                <Text style={[st.cell, st.ptsCell, { fontWeight: '800' }]}>{r.points}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {resultsFor && (
            <View style={st.resultsSection}>
              <View style={st.resultsSectionHeader}>
                <Text style={st.sectionLabel}>{clubName(resultsFor).toUpperCase()} RESULTS</Text>
                <TouchableOpacity onPress={closeResults} hitSlop={8}>
                  <Text style={[st.resultsClose, { color: primaryColor }]}>Close</Text>
                </TouchableOpacity>
              </View>
              {resultsLoading ? (
                <ActivityIndicator color={primaryColor} style={{ marginTop: 16 }} />
              ) : resultsGames && resultsGames.length > 0 ? (
                <View style={st.tableCard}>
                  {resultsGames.map((g, i) => (
                    <View key={i}>
                      {i > 0 && <View style={st.divider} />}
                      <View style={st.resultRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={st.resultOpp}>{g.homeAway === 'home' ? 'vs' : '@'} {g.opponent}</Text>
                          <Text style={st.resultMeta}>{formatResultDate(g.date)} · {g.field}</Text>
                        </View>
                        {g.played ? (
                          <View style={st.resultScoreWrap}>
                            <Text style={[
                              st.resultBadge,
                              g.ourScore! > g.oppScore! && { color: '#22c55e' },
                              g.ourScore! < g.oppScore! && { color: '#ef4444' },
                              g.ourScore === g.oppScore && { color: colors.muted },
                            ]}>
                              {g.ourScore! > g.oppScore! ? 'W' : g.ourScore! < g.oppScore! ? 'L' : 'D'}
                            </Text>
                            <Text style={st.resultScore}>{g.ourScore}-{g.oppScore}</Text>
                          </View>
                        ) : (
                          <Text style={st.resultUpcoming}>Upcoming</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={st.emptySub}>This team doesn't have any games on NCSA yet.</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function getSt(colors: ThemeColors) {
  return StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  body: { padding: 16, paddingBottom: 40 },
  tableCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  headerRow: { paddingVertical: 8, backgroundColor: colors.surfaceAlt },
  headerText: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  selfRow: {},
  cell: { fontSize: 12.5, color: colors.text, textAlign: 'center' },
  rankCell: { width: 22, fontWeight: '700', color: colors.muted },
  teamCell: { flex: 1, textAlign: 'left', paddingRight: 6 },
  teamCellWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  teamText: { fontSize: 13, fontWeight: '600', color: colors.text },
  numCell: { width: 26 },
  ptsCell: { width: 32 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  resultsSection: { marginTop: 24 },
  resultsSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.4 },
  resultsClose: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  resultOpp: { fontSize: 14, fontWeight: '700', color: colors.text },
  resultMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  resultScoreWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  resultBadge: { fontSize: 13, fontWeight: '800' },
  resultScore: { fontSize: 14, fontWeight: '700', color: colors.text },
  resultUpcoming: { fontSize: 12, fontWeight: '600', color: colors.muted },
  });
}
