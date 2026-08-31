import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { todayLocalStr } from '../../../../lib/localDate';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import ClubHeader, { headerBtnStyle } from '../../../../components/ui/ClubHeader';
import { getGameResult, RESULT_COLORS, formatTournamentDateRange } from '../../../../lib/tournaments';
import { sendTeamPush } from '../../../../lib/push';
import { useTournamentCoords } from '../../../../hooks/useTournamentCoords';
import { useMapApp } from '../../../../hooks/useMapApp';
import { MapPickerModal } from '../../../../components/ui/MapPickerModal';
import SatelliteMapThumb from '../../../../components/ui/SatelliteMapThumb';

type EventType = 'game' | 'training' | 'other';
type RsvpStatus = 'attending' | 'not_attending';

type Game = {
  id: string;
  title: string;
  type: EventType;
  event_date: string;
  event_time: string | null;
  location: string | null;
  round_label: string | null;
  score_home: number | null;
  score_away: number | null;
  cancelled_at: string | null;
};

type Tournament = {
  id: string; name: string; location: string | null; lat: number | null; lng: number | null; team_id: string;
  start_date: string | null; end_date: string | null; entry_rsvp_lock_at: string | null;
  cancelled_at: string | null; cancellation_reason: string | null;
};

type RosterPlayer = { id: string; full_name: string };
type TournamentRsvp = { player_id: string; status: RsvpStatus };

function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isUpcomingDate(dateStr: string): boolean {
  return dateStr >= todayLocalStr();
}

export default function TournamentDetailScreen() {
  const { primaryColor, rgba } = useClub();
  const router = useRouter();
  const { clubSlug, tournamentId } = useLocalSearchParams<{ clubSlug: string; tournamentId: string }>();
  const { team, allTeams, selectTeam } = useTeam();
  const { profile } = useAuth();
  const mapApp = useMapApp();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [myPlayerIds, setMyPlayerIds] = useState<string[]>([]);
  const [entryRsvps, setEntryRsvps] = useState<TournamentRsvp[]>([]);
  const [rsvpSavingId, setRsvpSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const coords = useTournamentCoords(
    tournamentId ?? '',
    tournament?.location ?? null,
    tournament?.lat ?? null,
    tournament?.lng ?? null,
  );

  const load = useCallback(async () => {
    if (!tournamentId) return;
    const { data: tRow } = await supabase
      .from('tournaments')
      .select('id, name, location, lat, lng, team_id, start_date, end_date, entry_rsvp_lock_at, cancelled_at, cancellation_reason')
      .eq('id', tournamentId)
      .single();
    if (!tRow) { setLoading(false); setRefreshing(false); return; }
    setTournament(tRow as Tournament);

    // A notification tap or deep link can land here without ever switching
    // the globally-selected team — realign it to the tournament's own team
    // before running the roster/RSVP queries below, same fix already
    // applied to event/[eventId].tsx for the identical class of bug.
    if (tRow.team_id !== team?.id && allTeams.some((t) => t.id === tRow.team_id)) {
      await selectTeam(tRow.team_id);
      return;
    }

    const [gRes, rosterRes, myPlayersRes, entryRsvpRes] = await Promise.all([
      supabase.from('events')
        .select('id, title, type, event_date, event_time, location, round_label, score_home, score_away, cancelled_at')
        .eq('tournament_id', tournamentId)
        .order('event_date').order('event_time'),
      supabase.from('players').select('id, full_name').eq('team_id', tRow.team_id),
      (supabase as any).rpc('get_my_guarded_players').select('id').eq('team_id', tRow.team_id),
      supabase.from('tournament_rsvps').select('player_id, status').eq('tournament_id', tournamentId),
    ]);
    setGames((gRes.data as Game[]) ?? []);
    setRoster((rosterRes.data as RosterPlayer[]) ?? []);
    setMyPlayerIds(((myPlayersRes as any).data ?? []).map((p: { id: string }) => p.id));
    setEntryRsvps((entryRsvpRes.data as TournamentRsvp[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tournamentId, team?.id, allTeams]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleEntryRsvp(playerId: string, status: RsvpStatus) {
    if (!tournamentId) return;
    setRsvpSavingId(playerId);
    try {
      const current = entryRsvps.find((r) => r.player_id === playerId)?.status ?? null;
      if (current === status) {
        const { error } = await supabase.from('tournament_rsvps').delete()
          .eq('tournament_id', tournamentId).eq('player_id', playerId);
        if (error) { Alert.alert('Could not save your RSVP', 'Check your connection and try again.'); return; }
        setEntryRsvps((prev) => prev.filter((r) => r.player_id !== playerId));
      } else {
        const { error } = await supabase.from('tournament_rsvps').upsert(
          { tournament_id: tournamentId, player_id: playerId, responded_by: profile?.id, status },
          { onConflict: 'tournament_id,player_id' }
        );
        if (error) { Alert.alert('Could not save your RSVP', 'Check your connection and try again.'); return; }
        setEntryRsvps((prev) => [...prev.filter((r) => r.player_id !== playerId), { player_id: playerId, status }]);
      }
    } finally {
      setRsvpSavingId(null);
    }
  }

  function confirmCancel() {
    if (!tournament) return;
    const cascadeCount = games.filter((g) => !g.cancelled_at && g.score_home == null && g.score_away == null).length;
    Alert.prompt(
      'Cancel Tournament',
      cascadeCount > 0
        ? `This will also cancel ${cascadeCount} upcoming/unplayed game${cascadeCount === 1 ? '' : 's'} in this tournament. Add a reason for parents (optional):`
        : 'Add a reason for parents (optional):',
      [
        { text: 'Keep Tournament', style: 'cancel' },
        { text: 'Cancel Tournament', style: 'destructive', onPress: (reason?: string) => handleCancelTournament(reason ?? '') },
      ],
      'plain-text',
      '',
    );
  }

  async function handleCancelTournament(reason: string) {
    if (!tournament || !tournamentId) return;
    setCancelling(true);
    const now = new Date().toISOString();
    const trimmed = reason.trim();

    const { error } = await supabase.from('tournaments')
      .update({ cancelled_at: now, cancellation_reason: trimmed || null })
      .eq('id', tournamentId);
    if (error) {
      setCancelling(false);
      Alert.alert('Error', 'Could not cancel the tournament. Please try again.');
      return;
    }

    await supabase.from('events')
      .update({ cancelled_at: now, cancellation_reason: trimmed ? `Tournament cancelled: ${trimmed}` : 'Tournament cancelled' })
      .eq('tournament_id', tournamentId)
      .is('cancelled_at', null)
      .is('score_home', null)
      .is('score_away', null);

    sendTeamPush({
      teamId: tournament.team_id,
      title: 'Tournament cancelled',
      body: trimmed ? `${tournament.name} cancelled: ${trimmed}` : `${tournament.name} has been cancelled`,
      excludeProfileId: profile?.id,
      data: { type: 'tournament_cancelled', tournament_id: tournamentId, team_id: tournament.team_id },
    });

    setCancelling(false);
    Alert.alert('Tournament cancelled', 'Parents have been notified by push notification.');
    load();
  }

  function confirmRestore() {
    handleUncancelTournament();
  }

  async function handleUncancelTournament() {
    if (!tournamentId) return;
    setCancelling(true);
    const { error } = await supabase.from('tournaments')
      .update({ cancelled_at: null, cancellation_reason: null })
      .eq('id', tournamentId);
    if (error) {
      setCancelling(false);
      Alert.alert('Error', 'Could not restore the tournament. Please try again.');
      return;
    }

    // Only reinstates games the cascade-cancel itself touched (matched by its
    // own reason prefix) — a game cancelled for its own unrelated reason
    // never gets that prefix, so it's never picked up here.
    await supabase.from('events')
      .update({ cancelled_at: null, cancellation_reason: null })
      .eq('tournament_id', tournamentId)
      .like('cancellation_reason', 'Tournament cancelled%');

    setCancelling(false);
    Alert.alert('Tournament restored', 'This tournament is back on.');
    load();
  }

  function confirmDelete() {
    if (!tournament) return;
    const buttons: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] = [
      { text: 'Cancel', style: 'cancel' },
    ];
    if (games.length > 0) {
      buttons.push(
        { text: 'Keep Games', onPress: () => handleDeleteTournament(false) },
        { text: `Delete Games Too (${games.length})`, style: 'destructive', onPress: () => handleDeleteTournament(true) },
      );
    } else {
      buttons.push({ text: 'Delete', style: 'destructive', onPress: () => handleDeleteTournament(false) });
    }
    Alert.alert(
      'Delete Tournament',
      games.length > 0
        ? `Delete "${tournament.name}"? Choose whether to also delete its ${games.length} game${games.length === 1 ? '' : 's'}, or keep them on the schedule ungrouped. This cannot be undone.`
        : `Delete "${tournament.name}"? This cannot be undone.`,
      buttons,
    );
  }

  async function handleDeleteTournament(alsoDeleteGames: boolean) {
    if (!tournamentId) return;
    setDeleting(true);
    if (alsoDeleteGames) {
      const { error: gamesError } = await supabase.from('events').delete().eq('tournament_id', tournamentId);
      if (gamesError) {
        setDeleting(false);
        Alert.alert('Error', 'Could not delete the tournament\'s games. Please try again.');
        return;
      }
    }
    const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId);
    if (error) {
      setDeleting(false);
      Alert.alert('Error', 'Could not delete the tournament. Please try again.');
      return;
    }
    router.back();
  }

  let wins = 0, losses = 0, draws = 0;
  for (const g of games) {
    const r = getGameResult(g);
    if (!r) continue;
    if (r.label === 'W') wins++; else if (r.label === 'L') losses++; else draws++;
  }
  const hasRecord = wins + losses + draws > 0;
  const dateRange = games.length > 0
    ? formatTournamentDateRange(games.map((g) => g.event_date))
    : formatTournamentDateRange([tournament?.start_date ?? null, tournament?.end_date ?? null]);

  const isCoach = team?.myRole === 'coach' || team?.myRole === 'org_admin';
  const entryRsvpClosed = tournament?.entry_rsvp_lock_at
    ? new Date(tournament.entry_rsvp_lock_at) <= new Date() : false;
  const entryMap = new Map(entryRsvps.map((r) => [r.player_id, r.status]));
  const entryAttending = roster.filter((p) => entryMap.get(p.id) === 'attending');
  const entryNotAttending = roster.filter((p) => entryMap.get(p.id) === 'not_attending');
  const entryNoResponse = roster.filter((p) => !entryMap.has(p.id));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ClubHeader
        title="Tournament"
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            style={[headerBtnStyle as object, { backgroundColor: PULSE_COLORS.ui.surfaceAlt }]}
            onPress={() => router.push(`/(app)/${clubSlug}/create-tournament?tournamentId=${tournamentId}` as any)}
          >
            <Ionicons name="pencil" size={13} color={PULSE_COLORS.ui.textSecondary} />
            <Text style={{ color: PULSE_COLORS.ui.textSecondary, fontWeight: '700', fontSize: 12 }}>Edit</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={primaryColor} />}
      >
        <View style={styles.hero}>
          <View style={styles.badgeRow}>
            <View style={styles.icon}><Text style={{ fontSize: 22 }}>🏆</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{tournament?.name ?? 'Tournament'}</Text>
              <Text style={styles.loc}>{dateRange}{tournament?.location ? ` · ${tournament.location}` : ''}</Text>
            </View>
          </View>

          {tournament?.location && (
            <View style={{ marginTop: 12 }}>
              <SatelliteMapThumb
                lat={coords?.lat ?? null}
                lng={coords?.lng ?? null}
                address={tournament.location}
                onPress={() => mapApp.open({ query: tournament.location ?? '', lat: tournament.lat, lng: tournament.lng })}
                height={160}
              />
            </View>
          )}

          {hasRecord && (
            <View style={styles.recordRow}>
              <View style={[styles.recordChip, { borderColor: 'rgba(34,197,94,0.25)' }]}>
                <Text style={[styles.recordNum, { color: RESULT_COLORS.W }]}>{wins}</Text>
                <Text style={styles.recordLabel}>WINS</Text>
              </View>
              <View style={[styles.recordChip, { borderColor: 'rgba(156,163,175,0.25)' }]}>
                <Text style={[styles.recordNum, { color: RESULT_COLORS.D }]}>{draws}</Text>
                <Text style={styles.recordLabel}>DRAWS</Text>
              </View>
              <View style={[styles.recordChip, { borderColor: 'rgba(239,68,68,0.25)' }]}>
                <Text style={[styles.recordNum, { color: RESULT_COLORS.L }]}>{losses}</Text>
                <Text style={styles.recordLabel}>LOSSES</Text>
              </View>
            </View>
          )}
        </View>

        {!!tournament?.cancelled_at && (
          <View style={styles.cancelledBanner}>
            <Ionicons name="close-circle" size={16} color="#ef4444" />
            <Text style={styles.cancelledBannerText}>
              Cancelled{tournament.cancellation_reason ? `: ${tournament.cancellation_reason}` : ''}
            </Text>
          </View>
        )}

        {!!tournament?.start_date && (
          <View style={styles.rsvpCard}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>ENTRY RSVP</Text>
              {entryRsvpClosed && <Text style={styles.rsvpClosedTag}>Closed</Text>}
            </View>

            {myPlayerIds.length > 0 && (
              <View style={{ gap: 10 }}>
                {myPlayerIds.map((pid) => {
                  const status = entryMap.get(pid) ?? null;
                  const firstName = roster.find((p) => p.id === pid)?.full_name.split(' ')[0] ?? 'Player';
                  const saving = rsvpSavingId === pid;
                  return (
                    <View key={pid}>
                      <Text style={styles.rsvpPlayerName}>
                        {status === 'attending' ? `${firstName} is in`
                          : status === 'not_attending' ? `${firstName} can't make it`
                          : `${firstName} — are you in?`}
                      </Text>
                      {!entryRsvpClosed && !tournament?.cancelled_at && (
                        <View style={[styles.rsvpInlineRow, { marginTop: 6 }]}>
                          <TouchableOpacity
                            style={[styles.rsvpInlineBtn, status === 'attending' && { backgroundColor: PULSE_COLORS.rsvp.attending, borderColor: PULSE_COLORS.rsvp.attending }]}
                            onPress={() => handleEntryRsvp(pid, 'attending')}
                            disabled={saving}
                          >
                            {saving && status !== 'attending'
                              ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />
                              : <><Ionicons name="checkmark" size={14} color={status === 'attending' ? '#000' : PULSE_COLORS.ui.muted} />
                                 <Text style={[styles.rsvpInlineBtnText, status === 'attending' && { color: '#000' }]}>We're in</Text></>}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.rsvpInlineBtn, status === 'not_attending' && { backgroundColor: PULSE_COLORS.rsvp.not_attending, borderColor: PULSE_COLORS.rsvp.not_attending }]}
                            onPress={() => handleEntryRsvp(pid, 'not_attending')}
                            disabled={saving}
                          >
                            {saving && status !== 'not_attending'
                              ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />
                              : <><Ionicons name="close" size={14} color={status === 'not_attending' ? '#fff' : PULSE_COLORS.ui.muted} />
                                 <Text style={[styles.rsvpInlineBtnText, status === 'not_attending' && { color: '#fff' }]}>Can't make it</Text></>}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {isCoach && (
              <View style={[styles.rsvpCountRow, myPlayerIds.length > 0 && { marginTop: 14 }]}>
                <View style={styles.rsvpCountStat}>
                  <Text style={[styles.rsvpCountNum, { color: PULSE_COLORS.rsvp.attending }]}>{entryAttending.length}</Text>
                  <Text style={styles.rsvpCountLabel}>IN</Text>
                </View>
                <View style={styles.rsvpCountStat}>
                  <Text style={[styles.rsvpCountNum, { color: PULSE_COLORS.rsvp.not_attending }]}>{entryNotAttending.length}</Text>
                  <Text style={styles.rsvpCountLabel}>OUT</Text>
                </View>
                <View style={styles.rsvpCountStat}>
                  <Text style={[styles.rsvpCountNum, { color: PULSE_COLORS.ui.muted }]}>{entryNoResponse.length}</Text>
                  <Text style={styles.rsvpCountLabel}>PENDING</Text>
                </View>
              </View>
            )}

            <Text style={styles.rsvpCaption}>
              Carries over to each game once the schedule's in — still changeable per game.
            </Text>
          </View>
        )}

        {!tournament?.cancelled_at && (
          <TouchableOpacity
            style={styles.aiBtn}
            onPress={() => router.push(`/(app)/${clubSlug}/admin/schedule-upload?tournamentId=${tournamentId}` as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={15} color="#fff" />
            <Text style={styles.aiBtnText}>Import Schedule with AI</Text>
          </TouchableOpacity>
        )}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>GAMES · {games.length}</Text>
          {!tournament?.cancelled_at && (
            <TouchableOpacity onPress={() => router.push(`/(app)/${clubSlug}/create-event?tournamentId=${tournamentId}` as any)}>
              <Text style={[styles.addLink, { color: primaryColor }]}>+ Add Game</Text>
            </TouchableOpacity>
          )}
        </View>

        {games.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={22} color={PULSE_COLORS.ui.muted} />
            <Text style={styles.emptyText}>No games yet — import a schedule or add the first one.</Text>
          </View>
        ) : (
          <View style={styles.gamesCard}>
            {games.map((g, i) => {
              const result = !isUpcomingDate(g.event_date) ? getGameResult(g) : null;
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.gameRow, i < games.length - 1 && styles.gameRowBorder]}
                  onPress={() => router.push(`/(app)/${clubSlug}/event/${g.id}` as any)}
                  activeOpacity={0.75}
                >
                  {g.round_label ? (
                    <View style={styles.stagePill}>
                      <Text style={styles.stagePillText} numberOfLines={1}>{g.round_label.toUpperCase()}</Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gameTitle} numberOfLines={1}>{g.title}</Text>
                    <Text style={styles.gameMeta}>
                      {fmtDate(g.event_date)}{g.event_time ? ` · ${fmtTime(g.event_time)}` : ''}{g.location ? ` · ${g.location}` : ''}
                    </Text>
                  </View>
                  {g.cancelled_at ? (
                    <View style={[styles.resultBadge, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                      <Text style={[styles.resultBadgeText, { color: '#ef4444' }]}>Cancelled</Text>
                    </View>
                  ) : result ? (
                    <View style={[styles.resultBadge, { backgroundColor: `${RESULT_COLORS[result.label]}22` }]}>
                      <Text style={[styles.resultBadgeText, { color: RESULT_COLORS[result.label] }]}>
                        {result.label} {result.ourScore}–{result.oppScore}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.resultBadge, { backgroundColor: rgba(0.12) }]}>
                      <Text style={[styles.resultBadgeText, { color: primaryColor }]}>Upcoming</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {isCoach && (
          <View style={{ marginTop: 22 }}>
            {tournament?.cancelled_at ? (
              <TouchableOpacity style={styles.uncancelBtn} onPress={confirmRestore} disabled={cancelling}>
                {cancelling
                  ? <ActivityIndicator size="small" color="#22c55e" />
                  : <>
                      <Ionicons name="refresh-circle-outline" size={16} color="#22c55e" />
                      <Text style={styles.uncancelBtnText}>Restore Tournament</Text>
                    </>
                }
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.cancelBtn} onPress={confirmCancel} disabled={cancelling}>
                {cancelling
                  ? <ActivityIndicator size="small" color="#F59E0B" />
                  : <>
                      <Ionicons name="close-circle-outline" size={16} color="#F59E0B" />
                      <Text style={styles.cancelBtnText}>Cancel Tournament</Text>
                    </>
                }
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} disabled={deleting}>
              {deleting
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    <Text style={styles.deleteBtnText}>Delete Tournament</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <MapPickerModal
        visible={mapApp.showPicker}
        onConfirm={mapApp.confirm}
        onDismiss={mapApp.dismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PULSE_COLORS.ui.background },

  hero: {
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 16, marginBottom: 14,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(234,179,8,0.14)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.3)',
  },
  name: { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text },
  loc: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, marginTop: 3 },

  recordRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  recordChip: { flex: 1, backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderWidth: 1, borderRadius: 11, paddingVertical: 8, alignItems: 'center' },
  recordNum: { fontSize: 18, fontWeight: '800' },
  recordLabel: { fontSize: 9, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.5, marginTop: 1 },

  rsvpCard: {
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 14, marginBottom: 18,
  },
  rsvpClosedTag: { fontSize: 10, fontWeight: '700', color: '#ef4444', letterSpacing: 0.4 },
  rsvpPlayerName: { fontSize: 13.5, fontWeight: '600', color: PULSE_COLORS.ui.text },
  rsvpInlineRow: { flexDirection: 'row', gap: 8 },
  rsvpInlineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border,
  },
  rsvpInlineBtnText: { fontSize: 12.5, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
  rsvpCountRow: { flexDirection: 'row', gap: 8 },
  rsvpCountStat: { flex: 1, backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderRadius: 11, paddingVertical: 8, alignItems: 'center' },
  rsvpCountNum: { fontSize: 17, fontWeight: '800' },
  rsvpCountLabel: { fontSize: 9, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.5, marginTop: 1 },
  rsvpCaption: { fontSize: 10.5, color: PULSE_COLORS.ui.muted, marginTop: 12, lineHeight: 14 },

  aiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 13, marginBottom: 22,
  },
  aiBtnText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.6 },
  addLink: { fontSize: 13, fontWeight: '700' },

  emptyCard: {
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 24, alignItems: 'center', gap: 8,
  },
  emptyText: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center' },

  gamesCard: {
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, overflow: 'hidden',
  },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  gameRowBorder: { borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  stagePill: {
    backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, maxWidth: 84,
  },
  stagePillText: { fontSize: 9, fontWeight: '800', color: '#EAB308', letterSpacing: 0.3 },
  gameTitle: { fontSize: 13.5, fontWeight: '700', color: PULSE_COLORS.ui.text },
  gameMeta: { fontSize: 11.5, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  resultBadgeText: { fontSize: 11.5, fontWeight: '800' },

  cancelledBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
  },
  cancelledBannerText: { color: '#ef4444', fontWeight: '700', fontSize: 13, flex: 1 },

  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  cancelBtnText: { color: '#F59E0B', fontWeight: '700', fontSize: 15 },
  uncancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  uncancelBtnText: { color: '#22c55e', fontWeight: '700', fontSize: 15 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  deleteBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
});
