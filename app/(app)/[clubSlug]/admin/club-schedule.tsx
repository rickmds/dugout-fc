import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';
import { PULSE_COLORS } from '../../../../constants/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'game' | 'training' | 'other';
type Phase = 'idle' | 'parsing' | 'review' | 'importing' | 'done';

type ClubTeam = { id: string; name: string };

type ClubEvent = {
  _id: string;
  teamId: string | null;
  teamName: string | null;
  teamUncertain: boolean;
  date: string | null;
  time: string | null;
  title: string;
  type: EventType;
  location: string | null;
  address: string | null;
  homeAway: 'home' | 'away' | null;
  surface: 'turf' | 'grass' | null;
  uncertain: boolean;
  uncertaintyReason: string | null;
  selected: boolean;
};

type ImportedTeamStat = { teamId: string; name: string; count: number };
type BulkSettings = { duration: number; arriveEarly: number; rsvpLockHours: number | null };

const BULK_DURATION_OPTIONS = [45, 60, 75, 90, 105, 120];
const BULK_ARRIVE_OPTIONS   = [5, 10, 15, 20, 30, 45, 60];
const BULK_RSVP_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'None',   value: null },
  { label: '12 hrs', value: 12 },
  { label: '24 hrs', value: 24 },
  { label: '48 hrs', value: 48 },
];

const TYPE_CFG: Record<EventType, { label: string; color: string }> = {
  game:     { label: 'Game',     color: '#F59E0B' },
  training: { label: 'Training', color: '#3B82F6' },
  other:    { label: 'Other',    color: '#9CA3AF' },
};

const PARSE_MESSAGES = [
  'Reading schedule…',
  'Identifying teams…',
  'Extracting dates and times…',
  'Matching teams to your club…',
  'Flagging uncertain assignments…',
  'Almost done…',
];

function fmtDuration(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? `${min % 60}m` : ''}` : `${min}m`;
}

function fmtDate(iso: string | null) {
  if (!iso) return 'Unknown date';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return ` · ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClubScheduleScreen() {
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile, club } = useAuth();
  const { primaryColor, rgba } = useClub();

  const [phase, setPhase]         = useState<Phase>('idle');
  const [teams, setTeams]         = useState<ClubTeam[]>([]);
  const [events, setEvents]       = useState<ClubEvent[]>([]);
  const [warnings, setWarnings]   = useState<string[]>([]);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [parseMsg, setParseMsg]   = useState(PARSE_MESSAGES[0]);
  const [pickerTarget, setPickerTarget] = useState<string | null>(null);
  const [progress, setProgress]   = useState({ current: 0, total: 0, label: '' });
  const [importedStats, setImportedStats] = useState<ImportedTeamStat[]>([]);
  const [notifyState, setNotifyState] = useState<'idle' | 'notifying' | 'done'>('idle');
  const [bulk, setBulk]     = useState<BulkSettings>({ duration: 90, arriveEarly: 20, rsvpLockHours: 24 });
  const [bulkOpen, setBulkOpen] = useState(false);
  const msgTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const importedRef = useRef<Set<string>>(new Set());

  const slug = clubSlug ?? club?.slug ?? '';

  // ── Derived ────────────────────────────────────────────────────────────────

  const teamGroups = useMemo(() => {
    const map = new Map<string, { team: ClubTeam; events: ClubEvent[] }>();
    for (const ev of events) {
      if (!ev.teamId) continue;
      if (!map.has(ev.teamId)) {
        const team = teams.find((t) => t.id === ev.teamId);
        if (team) map.set(ev.teamId, { team, events: [] });
      }
      map.get(ev.teamId)?.events.push(ev);
    }
    return Array.from(map.values());
  }, [events, teams]);

  const unmatched   = useMemo(() => events.filter((e) => !e.teamId), [events]);
  const totalEvents = events.filter((e) => e.selected && e.teamId).length;
  const uncertainAssignments = events.filter((e) => e.teamId && e.teamUncertain).length;

  // ── File pick ──────────────────────────────────────────────────────────────

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/csv', 'text/plain',
             'application/vnd.ms-excel',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];

    const isXlsx = file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || (file.name ?? '').toLowerCase().endsWith('.xlsx');
    const isXls  = file.mimeType === 'application/vnd.ms-excel'
      || (file.name ?? '').toLowerCase().endsWith('.xls');
    if (isXlsx || isXls) {
      Alert.alert('Export as CSV first', 'Excel files can\'t be read directly.\n\n• Excel: File → Save As → CSV\n• Google Sheets: File → Download → CSV (.csv)');
      return;
    }

    if ((file.size ?? 0) > 20 * 1024 * 1024) { Alert.alert('File too large', 'Maximum 20 MB.'); return; }
    const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
    await doParse(base64, file.mimeType ?? 'text/plain');
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, base64: true });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const ext = result.assets[0].uri.split('.').pop() ?? 'jpg';
    await doParse(result.assets[0].base64, ext === 'png' ? 'image/png' : 'image/jpeg');
  }

  // ── Parse ──────────────────────────────────────────────────────────────────

  async function doParse(base64: string, mimeType: string) {
    setPhase('parsing');
    let msgIdx = 0;
    msgTimer.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % PARSE_MESSAGES.length;
      setParseMsg(PARSE_MESSAGES[msgIdx]);
    }, 1800);

    try {
      const [invokeRes, teamsRes] = await Promise.all([
        supabase.functions.invoke('parse-club-schedule', {
          body: {
            file_base64: base64,
            file_type: mimeType,
            existing_teams: await getClubTeams(),
          },
        }),
        profile?.club_id
          ? supabase.from('teams').select('id, name').eq('club_id', profile.club_id).order('name')
          : Promise.resolve({ data: [] as ClubTeam[] }),
      ]);

      if (msgTimer.current) clearInterval(msgTimer.current);
      if (invokeRes.error) throw new Error(invokeRes.error.message);

      const fetchedTeams: ClubTeam[] = (teamsRes as any).data ?? [];
      setTeams(fetchedTeams);

      const teamByName = new Map(fetchedTeams.map((t) => [t.name.toLowerCase().trim(), t]));
      const parsed: ClubEvent[] = [];
      let idx = 0;

      for (const tg of (invokeRes.data.team_events ?? [])) {
        const matched = teamByName.get((tg.team_name ?? '').toLowerCase().trim());
        for (const e of (tg.events ?? [])) {
          const type = (['game', 'training', 'other'].includes(e.type) ? e.type : 'other') as EventType;
          parsed.push({
            _id: `e-${idx++}`,
            teamId:   matched?.id   ?? null,
            teamName: matched?.name ?? tg.team_name ?? null,
            teamUncertain: !!tg.uncertain,
            date: e.date ?? null,
            time: e.time ?? null,
            title: e.title ?? 'Untitled',
            type,
            location: e.location ?? null,
            address: e.address ?? null,
            homeAway: (['home', 'away'].includes(e.home_away) ? e.home_away : null) as 'home' | 'away' | null,
            surface: (['turf', 'grass'].includes(e.surface) ? e.surface : null) as 'turf' | 'grass' | null,
            uncertain: !!e.uncertain,
            uncertaintyReason: e.uncertainty_reason ?? null,
            selected: !!matched,
          });
        }
      }

      for (const e of (invokeRes.data.unmatched_events ?? [])) {
        const type = (['game', 'training', 'other'].includes(e.type) ? e.type : 'other') as EventType;
        parsed.push({
          _id: `e-${idx++}`,
          teamId: null,
          teamName: e.raw_team_name ?? null,
          teamUncertain: true,
          date: e.date ?? null,
          time: e.time ?? null,
          title: e.title ?? 'Untitled',
          type,
          location: e.location ?? null,
          address: e.address ?? null,
          homeAway: null,
          surface: null,
          uncertain: true,
          uncertaintyReason: e.uncertainty_reason ?? 'Team not found in club',
          selected: false,
        });
      }

      if (!parsed.length) {
        Alert.alert('Nothing found', 'No events were detected. Check the file format and try again.');
        setPhase('idle');
        return;
      }

      setEvents(parsed);
      setWarnings(invokeRes.data.warnings ?? []);
      setWarningsOpen(false);
      setExpandedTeams(new Set(parsed.map((e: ClubEvent) => e.teamId).filter(Boolean) as string[]));
      importedRef.current = new Set();
      setPhase('review');
    } catch (err) {
      if (msgTimer.current) clearInterval(msgTimer.current);
      Alert.alert('Parse failed', err instanceof Error ? err.message : 'Could not read the file.');
      setPhase('idle');
    }
  }

  async function getClubTeams(): Promise<ClubTeam[]> {
    if (!profile?.club_id) return [];
    const { data } = await supabase.from('teams').select('id, name').eq('club_id', profile.club_id);
    return (data ?? []) as ClubTeam[];
  }

  // ── Team reassignment ──────────────────────────────────────────────────────

  function assignTeam(eventId: string, team: ClubTeam) {
    setEvents((prev) => prev.map((e) =>
      e._id === eventId
        ? { ...e, teamId: team.id, teamName: team.name, teamUncertain: false, selected: true }
        : e
    ));
    setPickerTarget(null);
  }

  function removeEvent(eventId: string) {
    setEvents((prev) => prev.filter((e) => e._id !== eventId));
    setPickerTarget(null);
  }

  function toggleEvent(eventId: string) {
    setEvents((prev) => prev.map((e) => e._id === eventId ? { ...e, selected: !e.selected } : e));
  }

  function removeTeamEvents(teamId: string) {
    setEvents((prev) => prev.filter((e) => e.teamId !== teamId));
    setExpandedTeams((prev) => { const s = new Set(prev); s.delete(teamId); return s; });
  }

  function toggleTeamExpanded(teamId: string) {
    setExpandedTeams((prev) => {
      const s = new Set(prev);
      if (s.has(teamId)) s.delete(teamId); else s.add(teamId);
      return s;
    });
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!profile) return;
    const toImport = events.filter((e) => e.selected && e.teamId);
    if (!toImport.length) return;

    const grouped = new Map<string, { name: string; events: ClubEvent[] }>();
    for (const ev of toImport) {
      if (!ev.teamId) continue;
      if (!grouped.has(ev.teamId)) grouped.set(ev.teamId, { name: ev.teamName ?? '', events: [] });
      grouped.get(ev.teamId)!.events.push(ev);
    }

    setPhase('importing');
    const stats: ImportedTeamStat[] = [];
    const groupArr = Array.from(grouped.entries());

    for (let i = 0; i < groupArr.length; i++) {
      const [teamId, { name, events: teamEvents }] = groupArr[i];
      setProgress({ current: i + 1, total: groupArr.length, label: `Adding ${name}…` });

      const rows = teamEvents.map((e) => {
        const rsvpLockAt = bulk.rsvpLockHours != null && e.date && e.time
          ? (() => {
              const [h, m] = e.time!.split(':').map(Number);
              const dt = new Date(`${e.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
              dt.setHours(dt.getHours() - bulk.rsvpLockHours!);
              return dt.toISOString();
            })()
          : null;
        return {
          team_id:    teamId,
          title:      e.title,
          type:       e.type,
          event_date: e.date ?? new Date().toISOString().split('T')[0],
          event_time: e.time ?? null,
          location:   e.location ?? null,
          address:    e.address ?? null,
          field_type: e.surface ?? null,
          uniform:    e.homeAway === 'home' ? 'home' : e.homeAway === 'away' ? 'away' : null,
          duration_minutes:       bulk.duration,
          arrival_buffer_minutes: bulk.arriveEarly,
          rsvp_lock_at:           rsvpLockAt,
          created_by: profile.id,
        };
      });

      const { error } = await supabase.from('events').insert(rows as any);
      if (error) {
        const done = importedRef.current;
        setEvents((prev) => prev.filter((e) => !done.has(e.teamId ?? '')));
        Alert.alert(
          'Import failed',
          `Error on "${name}": ${error.message}\n\n${stats.length} of ${groupArr.length} teams completed before this error. Tap Import to retry the remaining.`,
        );
        setPhase('review');
        return;
      }

      importedRef.current.add(teamId);
      stats.push({ teamId, name, count: teamEvents.length });
    }

    setImportedStats(stats);
    setPhase('done');
  }

  // ── Notify all teams ───────────────────────────────────────────────────────

  async function handleNotifyAll() {
    if (!profile || !importedStats.length) return;
    setNotifyState('notifying');
    for (const stat of importedStats) {
      await supabase.from('announcements').insert({
        team_id: stat.teamId,
        title: 'Season schedule is live 📅',
        body: `Your season schedule is ready — ${stat.count} event${stat.count !== 1 ? 's' : ''} have been added. Open the Schedule tab to see dates, times, and venues.`,
        pinned: false,
        created_by: profile.id,
      });
    }
    setNotifyState('done');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={st.root}>
      <ClubHeader title="Club Schedule Import" onBack={() => router.back()} />

      {/* ── Idle ── */}
      {phase === 'idle' && (
        <ScrollView contentContainerStyle={st.center} showsVerticalScrollIndicator={false}>
          <View style={[st.heroIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
            <Ionicons name="sparkles-outline" size={36} color={primaryColor} />
          </View>
          <Text style={st.heroTitle}>Club-wide schedule</Text>
          <Text style={st.heroSub}>
            Upload the league schedule for the whole club — AI assigns every game to the right team automatically. Review before importing.
          </Text>

          <View style={st.formatBox}>
            <Text style={st.formatTitle}>WHAT AI HANDLES</Text>
            {[
              ['football-outline',  'Games assigned to each team'],
              ['calendar-outline',  'Dates, times and venues extracted'],
              ['location-outline',  'Addresses mapped per event'],
              ['shuffle-outline',   'Fuzzy team name matching'],
              ['warning-outline',   'Uncertain assignments flagged for you to fix'],
            ].map(([icon, label]) => (
              <View key={label} style={st.formatRow}>
                <Ionicons name={icon as any} size={15} color={primaryColor} />
                <Text style={st.formatLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={[st.btn, { backgroundColor: primaryColor }]} onPress={pickFile} activeOpacity={0.85}>
            <Ionicons name="document-attach-outline" size={18} color="#000" />
            <Text style={st.btnText}>Choose PDF or CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btn, st.btnOutline, { borderColor: primaryColor }]} onPress={pickImage} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={18} color={primaryColor} />
            <Text style={[st.btnText, { color: primaryColor }]}>Take photo or pick image</Text>
          </TouchableOpacity>
          <Text style={st.hint}>Supports CSV, Excel (.xlsx), and PDF · Max 10 MB</Text>
        </ScrollView>
      )}

      {/* ── Parsing ── */}
      {phase === 'parsing' && (
        <View style={st.center}>
          <View style={[st.heroIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
            <ActivityIndicator color={primaryColor} size="large" />
          </View>
          <Text style={st.heroTitle}>Reading schedule…</Text>
          <Text style={[st.heroSub, { minHeight: 22 }]}>{parseMsg}</Text>
        </View>
      )}

      {/* ── Review ── */}
      {phase === 'review' && (
        <>
          <ScrollView contentContainerStyle={st.reviewContent} showsVerticalScrollIndicator={false}>
            {/* Summary */}
            <View style={st.summaryBar}>
              <SummaryChip icon="football-outline" value={teamGroups.length}                             label="Teams"    color={primaryColor} />
              <SummaryChip icon="calendar-outline" value={totalEvents}                                   label="Events"   color="#22C55E" />
              <SummaryChip icon="warning-outline"  value={unmatched.length + uncertainAssignments}       label="Review"   color="#F59E0B" />
            </View>

            {/* Bulk settings */}
            <BulkCard bulk={bulk} bulkOpen={bulkOpen} setBulk={setBulk} setBulkOpen={setBulkOpen} primaryColor={primaryColor} rgba={rgba} />

            {warnings.length > 0 && (
              <TouchableOpacity
                style={st.warningBanner}
                onPress={() => setWarningsOpen((o) => !o)}
                activeOpacity={0.8}
              >
                <View style={st.warningBannerRow}>
                  <Ionicons name="information-circle-outline" size={15} color="#F59E0B" />
                  <Text style={st.warningBannerTitle}>
                    {warnings.length} AI note{warnings.length !== 1 ? 's' : ''} — tap to {warningsOpen ? 'hide' : 'review'}
                  </Text>
                  <Ionicons name={warningsOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#F59E0B" />
                </View>
                {warningsOpen && warnings.map((w, i) => (
                  <View key={i} style={st.warningItem}>
                    <Text style={st.warningDot}>·</Text>
                    <Text style={st.warningText}>{w}</Text>
                  </View>
                ))}
              </TouchableOpacity>
            )}

            {/* Matched teams */}
            {teamGroups.map(({ team, events: tevs }) => {
              const isExpanded = expandedTeams.has(team.id);
              const selectedCount = tevs.filter((e) => e.selected).length;
              return (
                <View key={team.id} style={st.teamSection}>
                  <TouchableOpacity
                    style={[st.teamHeader, isExpanded && st.teamHeaderExpanded]}
                    onPress={() => toggleTeamExpanded(team.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[st.teamDot, { backgroundColor: primaryColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={st.teamName}>{team.name}</Text>
                      <Text style={st.teamMeta}>
                        {selectedCount} of {tevs.length} selected
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeTeamEvents(team.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ marginRight: 10 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={PULSE_COLORS.ui.muted} />
                    </TouchableOpacity>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={PULSE_COLORS.ui.muted}
                    />
                  </TouchableOpacity>

                  {isExpanded && tevs.map((ev) => (
                    <EventRow
                      key={ev._id}
                      ev={ev}
                      onToggle={() => toggleEvent(ev._id)}
                      onReassign={() => setPickerTarget(ev._id)}
                    />
                  ))}
                </View>
              );
            })}

            {/* Unmatched events */}
            {unmatched.length > 0 && (
              <View style={st.teamSection}>
                <View style={[st.teamHeader, st.teamHeaderExpanded, { borderBottomColor: 'rgba(245,158,11,0.2)' }]}>
                  <View style={[st.teamDot, { backgroundColor: '#F59E0B' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.teamName}>Needs team assigned ({unmatched.length})</Text>
                    <Text style={st.teamMeta}>Tap "Assign" to place these in the right team</Text>
                  </View>
                </View>
                {unmatched.map((ev) => (
                  <EventRow
                    key={ev._id}
                    ev={ev}
                    onToggle={() => toggleEvent(ev._id)}
                    onReassign={() => setPickerTarget(ev._id)}
                    showAssignBtn
                  />
                ))}
              </View>
            )}

            <View style={{ height: 120 }} />
          </ScrollView>

          {/* Footer */}
          <View style={st.footer}>
            <TouchableOpacity style={st.cancelBtn} onPress={() => setPhase('idle')} activeOpacity={0.75}>
              <Text style={st.cancelBtnText}>Start over</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.importBtn, { backgroundColor: primaryColor }, totalEvents === 0 && { opacity: 0.4 }]}
              onPress={handleImport}
              disabled={totalEvents === 0}
              activeOpacity={0.85}
            >
              <Text style={st.importBtnText}>Import {totalEvents} event{totalEvents !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>
          </View>

          {/* Team picker modal */}
          <TeamPickerModal
            visible={pickerTarget !== null}
            teams={teams}
            onSelect={(team) => pickerTarget && assignTeam(pickerTarget, team)}
            onRemove={() => pickerTarget && removeEvent(pickerTarget)}
            onClose={() => setPickerTarget(null)}
          />
        </>
      )}

      {/* ── Importing ── */}
      {phase === 'importing' && (
        <View style={st.center}>
          <View style={[st.heroIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
            <ActivityIndicator color={primaryColor} size="large" />
          </View>
          <Text style={st.heroTitle}>Importing…</Text>
          <Text style={st.heroSub}>{progress.label}</Text>
          <View style={st.progressTrack}>
            <View style={[st.progressFill, { backgroundColor: primaryColor, width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` as any }]} />
          </View>
          <Text style={st.progressLabel}>{progress.current} of {progress.total} teams</Text>
        </View>
      )}

      {/* ── Done ── */}
      {phase === 'done' && (
        <ScrollView contentContainerStyle={st.center} showsVerticalScrollIndicator={false}>
          <View style={[st.heroIcon, { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.25)' }]}>
            <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
          </View>
          <Text style={st.heroTitle}>Schedule imported!</Text>
          <Text style={st.heroSub}>Events are live across all teams.</Text>

          <View style={st.doneList}>
            {importedStats.map((s) => (
              <View key={s.teamId} style={st.doneRow}>
                <View style={[st.doneDot, { backgroundColor: primaryColor }]} />
                <Text style={st.doneText}>
                  <Text style={st.doneBold}>{s.name}</Text>  —  {s.count} event{s.count !== 1 ? 's' : ''}
                </Text>
              </View>
            ))}
          </View>

          {notifyState === 'done' ? (
            <View style={st.notifiedRow}>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
              <Text style={st.notifiedText}>All teams notified via announcements</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[st.btn, { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, marginTop: 20 }]}
              onPress={handleNotifyAll}
              disabled={notifyState === 'notifying'}
              activeOpacity={0.8}
            >
              {notifyState === 'notifying'
                ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.text} />
                : <>
                    <Ionicons name="megaphone-outline" size={16} color={PULSE_COLORS.ui.text} />
                    <Text style={[st.btnText, { color: PULSE_COLORS.ui.text }]}>Notify all teams</Text>
                  </>
              }
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[st.btn, { backgroundColor: primaryColor, marginTop: 10 }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={st.btnText}>Back to Admin</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Bulk settings card ───────────────────────────────────────────────────────

function BulkCard({ bulk, bulkOpen, setBulk, setBulkOpen, primaryColor, rgba }: {
  bulk: BulkSettings;
  bulkOpen: boolean;
  setBulk: React.Dispatch<React.SetStateAction<BulkSettings>>;
  setBulkOpen: React.Dispatch<React.SetStateAction<boolean>>;
  primaryColor: string;
  rgba: (a: number) => string;
}) {
  const summary = `${fmtDuration(bulk.duration)} · ${bulk.arriveEarly} min early · RSVP ${bulk.rsvpLockHours ? `${bulk.rsvpLockHours} hrs before` : 'off'}`;
  return (
    <View style={bk.card}>
      <TouchableOpacity style={bk.header} onPress={() => setBulkOpen((o) => !o)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={bk.cardTitle}>BULK SETTINGS — applied to all events</Text>
          {!bulkOpen && <Text style={bk.summary}>{summary}</Text>}
        </View>
        <Ionicons name={bulkOpen ? 'chevron-up' : 'chevron-down'} size={16} color={PULSE_COLORS.ui.muted} />
      </TouchableOpacity>

      {bulkOpen && (
        <View style={{ marginTop: 12 }}>
          <Text style={bk.fieldLabel}>DURATION</Text>
          <View style={bk.chipRow}>
            {BULK_DURATION_OPTIONS.map((v) => (
              <TouchableOpacity
                key={v}
                style={[bk.chip, bulk.duration === v && [bk.chipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                onPress={() => setBulk((p) => ({ ...p, duration: v }))}
              >
                <Text style={[bk.chipText, bulk.duration === v && { color: primaryColor, fontWeight: '700' }]}>
                  {fmtDuration(v)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[bk.fieldLabel, { marginTop: 12 }]}>ARRIVE EARLY</Text>
          <View style={bk.chipRow}>
            {BULK_ARRIVE_OPTIONS.map((v) => (
              <TouchableOpacity
                key={v}
                style={[bk.chip, bulk.arriveEarly === v && [bk.chipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                onPress={() => setBulk((p) => ({ ...p, arriveEarly: v }))}
              >
                <Text style={[bk.chipText, bulk.arriveEarly === v && { color: primaryColor, fontWeight: '700' }]}>
                  {v} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[bk.fieldLabel, { marginTop: 12 }]}>RSVP DEADLINE</Text>
          <View style={bk.chipRow}>
            {BULK_RSVP_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={String(opt.value)}
                style={[bk.chip, bulk.rsvpLockHours === opt.value && [bk.chipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                onPress={() => setBulk((p) => ({ ...p, rsvpLockHours: opt.value }))}
              >
                <Text style={[bk.chipText, bulk.rsvpLockHours === opt.value && { color: primaryColor, fontWeight: '700' }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const bk = StyleSheet.create({
  card:      { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 14, padding: 14, marginBottom: 12 },
  header:    { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.5, marginBottom: 2 },
  summary:   { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.text },
  fieldLabel:{ fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.4, marginBottom: 6 },
  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:      { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.background },
  chipActive:{ borderColor: PULSE_COLORS.brand.green, backgroundColor: 'rgba(34,197,94,0.12)' },
  chipText:  { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500' },
});

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ ev, onToggle, onReassign, showAssignBtn }: {
  ev: ClubEvent; onToggle: () => void; onReassign: () => void; showAssignBtn?: boolean;
}) {
  const { primaryColor, rgba } = useClub();
  return (
    <View style={[erSt.row, ev.uncertain && erSt.rowUncertain, !ev.selected && erSt.rowOff]}>
      <TouchableOpacity
        onPress={onToggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={erSt.checkWrap}
      >
        <View style={[erSt.check, ev.selected && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
          {ev.selected && <Ionicons name="checkmark" size={12} color="#000" />}
        </View>
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <View style={erSt.titleRow}>
          <Text style={erSt.title} numberOfLines={1}>{ev.title}</Text>
          <View style={erSt.badges}>
            <View style={[erSt.pill, { backgroundColor: TYPE_CFG[ev.type].color + '22', borderColor: TYPE_CFG[ev.type].color + '55' }]}>
              <Text style={[erSt.pillText, { color: TYPE_CFG[ev.type].color }]}>{TYPE_CFG[ev.type].label}</Text>
            </View>
            {ev.homeAway && (
              <View style={[erSt.pill, { backgroundColor: ev.homeAway === 'home' ? rgba(0.12) : 'rgba(139,92,246,0.12)', borderColor: ev.homeAway === 'home' ? rgba(0.3) : 'rgba(139,92,246,0.3)' }]}>
                <Text style={[erSt.pillText, { color: ev.homeAway === 'home' ? primaryColor : '#8B5CF6' }]}>{ev.homeAway === 'home' ? 'Home' : 'Away'}</Text>
              </View>
            )}
            {ev.uncertain && <Ionicons name="warning" size={12} color="#F59E0B" />}
          </View>
        </View>
        <Text style={erSt.meta}>{fmtDate(ev.date)}{fmtTime(ev.time)}{ev.location ? ` · ${ev.location}` : ''}</Text>
        {ev.uncertaintyReason && <Text style={erSt.reason}>{ev.uncertaintyReason}</Text>}
      </View>

      {showAssignBtn ? (
        <TouchableOpacity style={erSt.assignBtn} onPress={onReassign} activeOpacity={0.75}>
          <Text style={erSt.assignBtnText}>Assign</Text>
          <Ionicons name="chevron-down" size={12} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onReassign} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="swap-horizontal-outline" size={16} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const erSt = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  rowUncertain: { backgroundColor: 'rgba(245,158,11,0.04)' },
  rowOff:     { opacity: 0.4 },
  checkWrap:  { paddingTop: 1 },
  check:      { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border, alignItems: 'center', justifyContent: 'center' },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  title:      { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.text, flex: 1 },
  badges:     { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  pill:       { borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  pillText:   { fontSize: 10, fontWeight: '700' },
  meta:       { fontSize: 11, color: PULSE_COLORS.ui.muted },
  reason:     { fontSize: 11, color: '#F59E0B', marginTop: 2, fontStyle: 'italic' },
  assignBtn:  { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  assignBtnText: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.text },
});

// ─── Team picker modal ────────────────────────────────────────────────────────

function TeamPickerModal({ visible, teams, onSelect, onRemove, onClose }: {
  visible: boolean; teams: ClubTeam[];
  onSelect: (team: ClubTeam) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pm.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={pm.sheet}>
          <View style={pm.handle} />
          <Text style={pm.title}>Assign to team</Text>
          <FlatList
            data={teams}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={pm.teamRow} onPress={() => onSelect(item)} activeOpacity={0.75}>
                <Ionicons name="football-outline" size={16} color={PULSE_COLORS.ui.muted} />
                <Text style={pm.teamName}>{item.name}</Text>
                <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} />
              </TouchableOpacity>
            )}
            style={{ maxHeight: 320 }}
          />
          <TouchableOpacity style={pm.removeBtn} onPress={onRemove} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={15} color="#EF4444" />
            <Text style={pm.removeBtnText}>Remove this event</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: PULSE_COLORS.ui.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, paddingBottom: 40 },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: PULSE_COLORS.ui.border, alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  title:      { fontSize: 16, fontWeight: '800', color: PULSE_COLORS.ui.text, paddingHorizontal: 20, marginBottom: 8 },
  teamRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  teamName:   { flex: 1, fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },
  removeBtn:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 16, marginTop: 4 },
  removeBtnText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
});

// ─── Summary chip ─────────────────────────────────────────────────────────────

function SummaryChip({ icon, value, label, color }: { icon: any; value: number; label: string; color: string }) {
  return (
    <View style={[sc.root, { backgroundColor: `${color}12`, borderColor: `${color}25` }]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  root:  { flex: 1, alignItems: 'center', gap: 2, padding: 10, borderRadius: 12, borderWidth: 1 },
  value: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text },

  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, paddingBottom: 48 },
  heroIcon: { width: 80, height: 80, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  heroTitle:{ fontSize: 24, fontWeight: '800', color: PULSE_COLORS.ui.text, textAlign: 'center', marginBottom: 10, letterSpacing: -0.4 },
  heroSub:  { fontSize: 15, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },

  formatBox:   { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 16, padding: 16, width: '100%', gap: 10, marginBottom: 20 },
  formatTitle: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1, marginBottom: 4 },
  formatRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formatLabel: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary },
  hint:        { fontSize: 12, color: PULSE_COLORS.ui.muted, textAlign: 'center', marginTop: 8, lineHeight: 17 },

  btn:        { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 22, width: '100%', marginBottom: 10 },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  btnText:    { fontSize: 15, fontWeight: '800', color: '#000' },

  reviewContent: { padding: 16, paddingBottom: 40 },
  summaryBar:    { flexDirection: 'row', gap: 10, marginBottom: 12 },

  warningBanner:     { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 12, padding: 12, marginBottom: 12 },
  warningBannerRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningBannerTitle:{ fontSize: 12, fontWeight: '700', color: '#F59E0B', flex: 1 },
  warningItem:       { flexDirection: 'row', gap: 6, marginTop: 8 },
  warningDot:        { fontSize: 12, color: '#F59E0B' },
  warningText:       { fontSize: 12, color: '#F59E0B', flex: 1, lineHeight: 17 },

  teamSection:        { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
  teamHeader:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  teamHeaderExpanded: { borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  teamDot:        { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  teamName:       { fontSize: 15, fontWeight: '800', color: PULSE_COLORS.ui.text },
  teamMeta:       { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 2 },

  footer:        { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 36, borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.background },
  cancelBtn:     { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  importBtn:     { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14 },
  importBtnText: { fontSize: 15, fontWeight: '800', color: '#000' },

  progressTrack: { width: '100%', height: 6, backgroundColor: PULSE_COLORS.ui.border, borderRadius: 3, overflow: 'hidden', marginTop: 24, marginBottom: 10 },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 13, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  doneList:    { width: '100%', gap: 10, marginBottom: 8 },
  doneRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneDot:     { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  doneText:    { fontSize: 14, color: PULSE_COLORS.ui.textSecondary },
  doneBold:    { fontWeight: '700', color: PULSE_COLORS.ui.text },
  notifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  notifiedText:{ fontSize: 14, color: '#22C55E', fontWeight: '600' },
});
