import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { useTheme } from '../../../../hooks/useTheme';
import { PULSE_COLORS, ThemeColors } from '../../../../constants/colors';
import ClubHeader from '../../../../components/ui/ClubHeader';

type Competition = 'league' | 'cup' | 'ref_only';

type NcsaTeam = {
  ncsaTeamId: string;
  rawName: string;
  club: string;
  gender: string;
  ageGroup: string;
  flight: string;
  coach: string;
  competition: Competition;
};

type PreviewGame = {
  date: string; time: string | null; field: string; opponent: string; homeAway: 'home' | 'away';
};

type LinkRow = {
  id: string;
  ncsa_team_id: string;
  ncsa_raw_name: string;
  competition: Competition;
  sync_games: boolean;
  last_synced_at: string | null;
};

const COMPETITION_LABEL: Record<Competition, string> = {
  league: 'League',
  cup: 'NCSA Cup',
  ref_only: 'EDP (ref only)',
};
const COMPETITION_COLOR: Record<Competition, string> = {
  league: '#3B82F6',
  cup: '#A855F7',
  ref_only: '#9CA3AF',
};

export default function NcsaLinkScreen() {
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const router = useRouter();
  const { team } = useTeam();
  const { primaryColor, rgba, ncsaPartner } = useClub();
  const { colors } = useTheme();
  const st = useMemo(() => getSt(colors), [colors]);

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [allTeams, setAllTeams] = useState<NcsaTeam[] | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [previewCandidate, setPreviewCandidate] = useState<NcsaTeam | null>(null);
  const [previewGames, setPreviewGames] = useState<PreviewGame[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!team?.id) return;
    loadLinks();
  }, [team?.id]);

  async function loadLinks() {
    setLoadingLinks(true);
    const { data } = await supabase
      .from('team_ncsa_links')
      .select('id, ncsa_team_id, ncsa_raw_name, competition, sync_games, last_synced_at')
      .eq('team_id', team!.id)
      .order('created_at');
    setLinks((data ?? []) as LinkRow[]);
    setLoadingLinks(false);
  }

  async function loadNcsaTeams() {
    setLoadingTeams(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('ncsa-team-lookup', {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    });
    setLoadingTeams(false);
    if (error || !data?.teams) {
      Alert.alert('Could not load NCSA teams', 'Check your connection and try again.');
      return;
    }
    setAllTeams(data.teams as NcsaTeam[]);
  }

  const linkedIds = useMemo(() => new Set(links.map((l) => l.ncsa_team_id)), [links]);

  const searchResults = useMemo(() => {
    if (!allTeams || search.trim().length < 2) return [];
    const q = search.trim().toLowerCase();
    return allTeams
      .filter((t) => !linkedIds.has(t.ncsaTeamId) && t.rawName.toLowerCase().includes(q))
      .slice(0, 20);
  }, [allTeams, search, linkedIds]);

  // Same gender + age group + coach last name, opposite league/cup type —
  // NCSA Cup is always the "X"-flagged entry for what is otherwise the same
  // roster (confirmed), so once one side is linked the other is very
  // likely the same team, not a guess worth silently auto-linking without
  // showing the coach what matched.
  function findCounterpart(linked: NcsaTeam): NcsaTeam | null {
    if (!allTeams || linked.competition === 'ref_only') return null;
    const wantCompetition: Competition = linked.competition === 'league' ? 'cup' : 'league';
    const candidates = allTeams.filter((t) =>
      !linkedIds.has(t.ncsaTeamId) &&
      t.ncsaTeamId !== linked.ncsaTeamId &&
      t.gender === linked.gender &&
      t.ageGroup === linked.ageGroup &&
      t.coach === linked.coach &&
      t.competition === wantCompetition
    );
    return candidates.length === 1 ? candidates[0] : null;
  }

  // EDP-listed ("ref_only") entries have no meaningful schedule to preview
  // — NCSA only lists some of their home games for referee assignment, and
  // showing those as if they were a real schedule would be misleading, not
  // reassuring. Explains what's actually true and confirms in one step
  // instead of a games preview.
  function openPreview(t: NcsaTeam) {
    if (t.competition === 'ref_only') {
      Alert.alert(
        'Add this EDP team?',
        `${t.rawName} plays in EDP, not NCSA — NCSA only lists some of its home games for referee assignment, not the real schedule. It'll be added to your roster, but you'll add its games manually the same way you always have.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Team', onPress: () => commitLink(t) },
        ]
      );
      return;
    }
    setPreviewCandidate(t);
    setPreviewGames(null);
    setPreviewLoading(true);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const { data, error } = await supabase.functions.invoke('ncsa-team-preview', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: { ncsa_team_id: t.ncsaTeamId, ncsa_raw_name: t.rawName },
      });
      setPreviewLoading(false);
      if (error || !data?.games) {
        Alert.alert('Could not load preview', 'Check your connection and try again.');
        setPreviewCandidate(null);
        return;
      }
      setPreviewGames(data.games as PreviewGame[]);
    });
  }

  function closePreview() {
    setPreviewCandidate(null);
    setPreviewGames(null);
  }

  function confirmPreview() {
    if (!previewCandidate) return;
    const t = previewCandidate;
    closePreview();
    commitLink(t);
  }

  async function commitLink(t: NcsaTeam) {
    if (!team?.id) return;
    setSaving(t.ncsaTeamId);
    const { error } = await supabase.from('team_ncsa_links').insert({
      team_id: team.id,
      ncsa_team_id: t.ncsaTeamId,
      ncsa_raw_name: t.rawName,
      competition: t.competition,
      // EDP teams' NCSA listing only carries some home games (for referee
      // assignment) — not a real schedule, so this never gets synced.
      sync_games: t.competition !== 'ref_only',
    });
    setSaving(null);
    if (error) {
      Alert.alert('Could not link team', error.message);
      return;
    }
    setSearch('');
    await loadLinks();

    if (t.competition === 'ref_only') return;

    const counterpart = findCounterpart(t);
    if (counterpart) {
      Alert.alert(
        `Link the ${COMPETITION_LABEL[counterpart.competition]} team too?`,
        `Found ${counterpart.rawName} — looks like the same roster's ${counterpart.competition} entry. You'll see its games before it's linked, same as this one.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Review it', onPress: () => openPreview(counterpart) },
        ]
      );
    }
  }

  async function removeLink(link: LinkRow) {
    Alert.alert('Remove this link?', `${link.ncsa_raw_name} will stop syncing. Games already imported stay on the schedule.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await supabase.from('team_ncsa_links').delete().eq('id', link.id);
          loadLinks();
        },
      },
    ]);
  }

  async function syncNow() {
    if (!team?.id) return;
    setSyncing(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('sync-ncsa-schedule', {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: { team_id: team.id },
    });
    setSyncing(false);
    if (error) {
      Alert.alert('Sync failed', 'Check your connection and try again.');
      return;
    }
    Alert.alert('Synced', `Checked ${data?.synced ?? 0} linked NCSA ${data?.synced === 1 ? 'entry' : 'entries'}.`);
    loadLinks();
  }

  if (!team) return null;

  // Reached only via a direct deep-link when ungated — league-link.tsx
  // already hides the NCSA card entirely for a non-partner club, but this
  // screen must independently refuse to search/link against NCSA's
  // ~1000-team directory too, since a link created here would have
  // sync-ncsa-schedule genuinely overwrite this team's real schedule.
  if (!ncsaPartner) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ClubHeader title="Link to NCSA" subtitle={team.name} onBack={() => router.back()} />
        <View style={st.body}>
          <Text style={st.hint}>This club isn't set up as an NCSA partner, so NCSA linking isn't available.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ClubHeader title="Link to NCSA" subtitle={team.name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={st.body}>
        <Text style={st.hint}>
          Link this team to its NCSA entry to pull in real games automatically — including
          reschedules — instead of entering them by hand. A cup-bracket entry (NCSA Cup) can be
          linked alongside the league entry; both feed into this one team's schedule.
        </Text>

        {loadingLinks ? (
          <ActivityIndicator color={primaryColor} style={{ marginTop: 24 }} />
        ) : (
          <>
            {links.length > 0 && (
              <View style={st.card}>
                {links.map((l, i) => (
                  <View key={l.id}>
                    {i > 0 && <View style={st.divider} />}
                    <View style={st.linkRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.linkName}>{l.ncsa_raw_name}</Text>
                        <View style={st.linkMetaRow}>
                          <View style={[st.badge, { backgroundColor: `${COMPETITION_COLOR[l.competition]}22`, borderColor: `${COMPETITION_COLOR[l.competition]}55` }]}>
                            <Text style={[st.badgeText, { color: COMPETITION_COLOR[l.competition] }]}>{COMPETITION_LABEL[l.competition]}</Text>
                          </View>
                          <Text style={st.linkMeta}>
                            {l.sync_games
                              ? (l.last_synced_at ? `Synced ${new Date(l.last_synced_at).toLocaleDateString()}` : 'Not synced yet')
                              : 'Not synced (manual entry)'}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => removeLink(l)} hitSlop={8}>
                        <Ionicons name="close-circle-outline" size={20} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {links.some((l) => l.sync_games) && (
              <TouchableOpacity
                style={[st.syncBtn, { borderColor: primaryColor }]}
                onPress={syncNow}
                disabled={syncing}
                activeOpacity={0.8}
              >
                {syncing ? <ActivityIndicator size="small" color={primaryColor} /> : (
                  <>
                    <Ionicons name="sync" size={16} color={primaryColor} />
                    <Text style={[st.syncBtnText, { color: primaryColor }]}>Sync Now</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <Text style={st.sectionLabel}>ADD AN NCSA TEAM</Text>
            {!allTeams ? (
              <TouchableOpacity
                style={[st.loadBtn, { borderColor: primaryColor }]}
                onPress={loadNcsaTeams}
                disabled={loadingTeams}
                activeOpacity={0.8}
              >
                {loadingTeams ? <ActivityIndicator size="small" color={primaryColor} /> : (
                  <Text style={[st.loadBtnText, { color: primaryColor }]}>Search NCSA Teams</Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  style={st.searchInput}
                  placeholder="e.g. Riverside-B09A-Smith"
                  placeholderTextColor={colors.muted}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                />
                {searchResults.map((t) => (
                  <TouchableOpacity
                    key={t.ncsaTeamId}
                    style={st.resultRow}
                    onPress={() => openPreview(t)}
                    disabled={saving === t.ncsaTeamId}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={st.resultName}>{t.rawName}</Text>
                      <View style={[st.badge, { backgroundColor: `${COMPETITION_COLOR[t.competition]}22`, borderColor: `${COMPETITION_COLOR[t.competition]}55`, marginTop: 4 }]}>
                        <Text style={[st.badgeText, { color: COMPETITION_COLOR[t.competition] }]}>{COMPETITION_LABEL[t.competition]}</Text>
                      </View>
                    </View>
                    {saving === t.ncsaTeamId
                      ? <ActivityIndicator size="small" color={primaryColor} />
                      : <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Preview-before-confirm — nothing is linked until the coach has
          actually seen real games and recognizes them as their team's. */}
      <Modal
        visible={!!previewCandidate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePreview}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ClubHeader title="Confirm your team" subtitle={previewCandidate?.rawName} onBack={closePreview} />
          <ScrollView contentContainerStyle={st.body}>
            {previewCandidate && (
              <View style={[st.badge, { alignSelf: 'flex-start', backgroundColor: `${COMPETITION_COLOR[previewCandidate.competition]}22`, borderColor: `${COMPETITION_COLOR[previewCandidate.competition]}55`, marginBottom: 14 }]}>
                <Text style={[st.badgeText, { color: COMPETITION_COLOR[previewCandidate.competition] }]}>{COMPETITION_LABEL[previewCandidate.competition]}</Text>
              </View>
            )}
            {previewLoading ? (
              <ActivityIndicator color={primaryColor} style={{ marginTop: 24 }} />
            ) : previewGames && previewGames.length > 0 ? (
              <>
                <Text style={st.sectionLabel}>DOES THIS LOOK RIGHT?</Text>
                <View style={st.card}>
                  {previewGames.slice(0, 6).map((g, i) => (
                    <View key={i}>
                      {i > 0 && <View style={st.divider} />}
                      <View style={st.previewGameRow}>
                        <Text style={st.previewGameOpp}>
                          {g.homeAway === 'home' ? 'vs' : '@'} {g.opponent}
                        </Text>
                        <Text style={st.previewGameMeta}>
                          {formatPreviewDate(g.date)}{g.time ? ` · ${formatPreviewTime(g.time)}` : ''} · {g.field}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
                {previewGames.length > 6 && (
                  <Text style={st.previewMore}>+ {previewGames.length - 6} more game{previewGames.length - 6 === 1 ? '' : 's'} this season</Text>
                )}
              </>
            ) : (
              <View style={st.center}>
                <Text style={st.emptyTitle}>No games listed yet</Text>
                <Text style={st.emptySub}>
                  This team doesn't have any games on NCSA yet — that can be normal early in the season.
                  Only link it if the name above is definitely your team.
                </Text>
              </View>
            )}
          </ScrollView>
          {!previewLoading && (
            <View style={st.previewActions}>
              <TouchableOpacity style={st.previewCancelBtn} onPress={closePreview} activeOpacity={0.7}>
                <Text style={st.previewCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.previewConfirmBtn, { backgroundColor: primaryColor }]}
                onPress={confirmPreview}
                activeOpacity={0.85}
              >
                <Text style={st.previewConfirmText}>Yes, this is my team</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

function formatPreviewDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatPreviewTime(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

function getSt(colors: ThemeColors) {
  return StyleSheet.create({
  body: { padding: 16, paddingBottom: 48 },
  hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 18 },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, overflow: 'hidden', marginBottom: 14,
  },
  divider: { height: 1, backgroundColor: colors.border },
  linkRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  linkName: { fontSize: 14, fontWeight: '700', color: colors.text },
  linkMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  linkMeta: { fontSize: 12, color: colors.muted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 24,
  },
  syncBtnText: { fontSize: 14, fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, marginBottom: 10 },
  loadBtn: { paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  loadBtnText: { fontSize: 14, fontWeight: '700' },
  searchInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    color: colors.text, marginBottom: 10,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 12, marginBottom: 8,
  },
  resultName: { fontSize: 13, fontWeight: '600', color: colors.text },
  center: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  previewGameRow: { paddingVertical: 12, paddingHorizontal: 14 },
  previewGameOpp: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 3 },
  previewGameMeta: { fontSize: 12, color: colors.textSecondary },
  previewMore: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 10 },
  previewActions: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  previewCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  previewCancelText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  previewConfirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  previewConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
}
