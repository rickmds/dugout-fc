import { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../../../lib/supabase';
import { todayLocalStr } from '../../../../lib/localDate';
import { withTimeout, TIMEOUT } from '../../../../lib/withTimeout';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { zonedTimeToUtc } from '../../../../lib/timezone';
import { parseFlexibleTime, toTimeString } from '../../../../lib/eventTime';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';
import SmartLocationInput from '../../../../components/ui/SmartLocationInput';
import PickerSheet from '../../../../components/ui/PickerSheet';
import { DURATION_OPTIONS, ARRIVAL_OPTIONS } from '../../../../constants/eventTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'processing' | 'review' | 'importing' | 'done';
type EventType = 'game' | 'training' | 'other';

type SavedField = { id: string; name: string; address: string | null; lat: number | null; lng: number | null; surface_type: string | null };

type ParsedEvent = {
  _id: string;
  date: string | null;
  time: string | null;
  title: string;
  type: EventType;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  field_id: string | null;
  home_away: 'home' | 'away' | null;
  surface: 'turf' | 'grass' | 'indoor' | null;
  uniform: 'home' | 'away' | 'training' | null;
  field_notes: string;
  player_notes: string;
  coach_notes: string;
  video_url: string;
  duration: number | null;        // per-event override; null = use bulk default
  arrival: number | null;         // per-event override; null = use bulk default
  requireRsvp: boolean | null;    // per-event override; null = derive from bulk
  rsvpLockHours: number | null;   // per-event override; only read when requireRsvp is true
  round_label: string | null;
  uncertain: boolean;
  uncertainty_reason: string | null;
  duplicate: boolean;
  selected: boolean;
};

type BulkSettings = { duration: number; arriveEarly: number; rsvpLockHours: number | null };

// Matches AI-extracted venue text (e.g. "Williams Field") against the club's
// saved fields so the real address auto-fills instead of just a bare name.
// Normalizes case/punctuation, then tries exact match before falling back to
// substring containment either direction — good enough for real venue names
// ("Williams Field" vs "Williams Fields Complex") without over-matching on
// short/common words.
function matchSavedField(locationText: string | null, fields: SavedField[]): SavedField | null {
  if (!locationText || fields.length === 0) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const loc = norm(locationText);
  if (!loc) return null;

  const exact = fields.find((f) => norm(f.name) === loc);
  if (exact) return exact;

  const contains = fields
    .filter((f) => {
      const name = norm(f.name);
      return name.length > 2 && (loc.includes(name) || name.includes(loc));
    })
    .sort((a, b) => norm(b.name).length - norm(a.name).length); // prefer the longest/most specific match
  return contains[0] ?? null;
}

// tryout_fields.surface_type is free text driven by a web <select> with
// options like "Natural Grass" / "Artificial Turf" / "Hybrid" / "Indoor" /
// "Other" — only maps the ones that map cleanly onto events.field_type's
// turf/grass/indoor constraint; "Hybrid"/"Other" fall through to null rather
// than guess wrong.
function mapSurfaceType(surfaceType: string | null | undefined): 'turf' | 'grass' | 'indoor' | null {
  if (!surfaceType) return null;
  const s = surfaceType.toLowerCase();
  if (s.includes('grass')) return 'grass';
  if (s.includes('turf')) return 'turf';
  if (s.includes('indoor')) return 'indoor';
  return null;
}

const BULK_DURATION_OPTIONS = [45, 60, 75, 90, 105, 120];
const BULK_ARRIVE_OPTIONS   = [5, 10, 15, 20, 30, 45, 60];
// "None" (null) means no RSVP deadline is ever enforced — not "closes
// immediately" — so a coach who actually wants the deadline to be the
// event's own start time needs a real, distinct option for that (the same
// choice create-event.tsx/edit-event.tsx already offer individually).
// Missing this made "None" the closest-sounding option to that intent,
// silently leaving every imported event's rsvp_lock_at null instead.
const BULK_RSVP_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'At start', value: 0 },
  { label: 'None',     value: null },
  { label: '12 hrs',   value: 12 },
  { label: '24 hrs',   value: 24 },
  { label: '48 hrs',   value: 48 },
];

const TYPE_CFG: Record<EventType, { label: string; color: string }> = {
  game:     { label: 'Game',     color: '#F59E0B' },
  training: { label: 'Training', color: '#3B82F6' },
  other:    { label: 'Other',    color: '#9CA3AF' },
};

const PROCESSING_MESSAGES = [
  'Reading your file…',
  'Identifying events…',
  'Extracting dates and times…',
  'Mapping locations and addresses…',
  'Detecting home and away games…',
  'Almost done…',
];

function fmtDate(iso: string | null): string {
  if (!iso) return 'Unknown date';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t: string | null): string {
  const parsed = parseFlexibleTime(t);
  if (!parsed) return '';
  const { h, m } = parsed;
  return ` · ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtDuration(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? `${min % 60}m` : ''}` : `${min}m`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScheduleUploadScreen() {
  const { primaryColor, rgba, timezone } = useClub();
  const router = useRouter();
  const { clubSlug, tournamentId } = useLocalSearchParams<{ clubSlug: string; tournamentId?: string }>();
  const { team } = useTeam();
  const { profile } = useAuth();

  const [phase, setPhase]         = useState<Phase>('idle');
  const [events, setEvents]       = useState<ParsedEvent[]>([]);
  const [warnings, setWarnings]   = useState<string[]>([]);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [imported, setImported]   = useState(0);
  const [editing, setEditing]     = useState<ParsedEvent | null>(null);
  const [bulk, setBulk]           = useState<BulkSettings>({ duration: 90, arriveEarly: 20, rsvpLockHours: 24 });
  const [bulkOpen, setBulkOpen]   = useState(false);
  const [processingMsg, setProcessingMsg] = useState(0);
  const [notified, setNotified]   = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [savedFields, setSavedFields] = useState<SavedField[]>([]);
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  // Only set for a DATED (weekend/round-robin) tournament — its games
  // centralize RSVP at the tournament level, so the per-event RSVP lock
  // settings below no longer apply. Undated (knockout) imports are unaffected.
  const [tournamentStartDate, setTournamentStartDate] = useState<string | null>(null);
  const processingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const clubId = team?.club?.id;
    if (!clubId) return;
    supabase
      .from('tryout_fields')
      .select('id,name,address,lat,lng,surface_type')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setSavedFields((data ?? []) as SavedField[]));
  }, [team?.club?.id]);

  // Fetched once at load, not inside handleNotify itself, to avoid a
  // network round-trip at button-press time.
  useEffect(() => {
    if (!tournamentId) return;
    supabase.from('tournaments').select('name,start_date').eq('id', tournamentId).single()
      .then(({ data }) => { setTournamentName(data?.name ?? null); setTournamentStartDate(data?.start_date ?? null); });
  }, [tournamentId]);

  const isDatedTournamentImport = !!tournamentId && !!tournamentStartDate;

  const selectedCount  = events.filter((e) => e.selected).length;
  const uncertainCount = events.filter((e) => e.uncertain && e.selected).length;
  const dupCount       = events.filter((e) => e.duplicate).length;

  useEffect(() => {
    if (phase === 'processing') {
      processingRef.current = setInterval(() => {
        setProcessingMsg((i) => (i + 1) % PROCESSING_MESSAGES.length);
      }, 1800);
    } else {
      if (processingRef.current) clearInterval(processingRef.current);
      setProcessingMsg(0);
    }
    return () => { if (processingRef.current) clearInterval(processingRef.current); };
  }, [phase]);

  // ─── Upload helpers ──────────────────────────────────────────────────────────

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/csv', 'text/plain', 'application/vnd.ms-excel',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];

    const isXlsx = file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || (file.name ?? '').toLowerCase().endsWith('.xlsx');
    const isXls = file.mimeType === 'application/vnd.ms-excel'
      || (file.name ?? '').toLowerCase().endsWith('.xls');
    if (isXlsx || isXls) {
      Alert.alert('Export as CSV first', 'Excel files can\'t be read directly.\n\n• Excel: File → Save As → CSV\n• Google Sheets: File → Download → CSV (.csv)');
      return;
    }

    if ((file.size ?? 0) > 20 * 1024 * 1024) { Alert.alert('File too large', 'Maximum 20 MB.'); return; }
    const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
    await parseSchedule(base64, file.mimeType ?? 'text/plain');
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, base64: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Error', "Couldn't read that photo — try picking it again or use a different one."); return; }
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    await parseSchedule(asset.base64, ext === 'png' ? 'image/png' : 'image/jpeg');
  }

  async function parseSchedule(file_base64: string, file_type: string) {
    setPhase('processing');

    // 40s timeout on the AI parse — without one, a slow/flaky connection
    // just rotates the "Analysing your schedule…" status messages forever
    // with no fallback or way to cancel.
    const AI_PARSE_TIMEOUT_MS = 40_000;
    const [invokeResult, existingRes] = await Promise.all([
      withTimeout(
        supabase.functions.invoke('parse-schedule', { body: { file_base64, file_type, context: tournamentId ? 'tournament' : undefined } }),
        AI_PARSE_TIMEOUT_MS
      ),
      // Scoped to the same context being imported into — a tournament game
      // on the same date as an unrelated team event (or a second same-day
      // pool-play game) must not false-positive as a duplicate of it.
      team
        ? (tournamentId
            ? supabase.from('events').select('event_date, type').eq('team_id', team.id).eq('tournament_id', tournamentId)
            : supabase.from('events').select('event_date, type').eq('team_id', team.id).is('tournament_id', null))
        : Promise.resolve({ data: [] as { event_date: string; type: string }[] }),
    ]);

    if (invokeResult === TIMEOUT) {
      setPhase('idle');
      Alert.alert('This is taking longer than expected', 'Check your connection and try again.');
      return;
    }
    const invokeRes = invokeResult;

    if (invokeRes.error || !invokeRes.data) {
      setPhase('idle');
      // supabase.functions.invoke's own error on a non-2xx response is
      // literally "Edge Function returned a non-2xx status code" — not
      // useful to a coach, so treat any failed invoke as one generic,
      // friendly message rather than surfacing that raw client-library text.
      Alert.alert('Failed to parse', "We couldn't read that file right now. Check your connection and try again, or try a different file.");
      return;
    }

    // Build a set of existing date+type keys for duplicate detection
    const existingKeys = new Set(
      ((existingRes as any).data ?? []).map((e: { event_date: string; type: string }) => `${e.event_date}_${e.type}`)
    );

    // Fetched fresh here (rather than trusting state set by the mount-time
    // effect) so a fast upload right after screen load still has the real
    // list to match against, not an empty one from a query still in flight.
    const clubId = team?.club?.id;
    const fieldsRes = clubId
      ? await supabase.from('tryout_fields').select('id,name,address,lat,lng,surface_type').eq('club_id', clubId).eq('is_active', true)
      : { data: [] as SavedField[] };
    const fields = (fieldsRes.data ?? []) as SavedField[];
    if (fields.length) setSavedFields(fields);

    const parsed: ParsedEvent[] = (invokeRes.data.events ?? []).map((e: any, i: number) => {
      const type = (['game', 'training', 'other'].includes(e.type) ? e.type : 'other') as EventType;
      const key = e.date ? `${e.date}_${type}` : null;
      const isDuplicate = !!key && existingKeys.has(key);
      // Only checked against the DB before, so two rows the AI parsed
      // twice from the same upload (same date+type) both came back
      // "not duplicate" and both got selected for import. Mark this key
      // seen now so a later row in this same batch is caught too.
      if (key && !isDuplicate) existingKeys.add(key);

      const rawLocation = e.location ?? null;
      // The AI often only reads a venue name off the source document
      // ("Williams Field") with no street address — if that name matches
      // a field the club already saved (with a real address), use it.
      const matched = matchSavedField(rawLocation, fields);
      const homeAway = (['home', 'away'].includes(e.home_away) ? e.home_away : null) as 'home' | 'away' | null;

      return {
        _id: `evt-${i}`,
        date: e.date ?? null,
        time: e.time ?? null,
        title: e.title ?? 'Untitled',
        type,
        location: rawLocation,
        address: matched?.address ?? e.address ?? null,
        lat: matched?.lat ?? null,
        lng: matched?.lng ?? null,
        field_id: matched?.id ?? null,
        home_away: homeAway,
        // The club's own saved field data is ground truth and wins over the
        // AI's guess from the document (which usually doesn't state surface
        // at all) — only falls back to the AI's value when there's no match
        // or the field's surface_type doesn't map to a known value.
        surface: mapSurfaceType(matched?.surface_type)
          ?? ((['turf', 'grass', 'indoor'].includes(e.surface) ? e.surface : null) as 'turf' | 'grass' | 'indoor' | null),
        uniform: homeAway,
        field_notes: '',
        player_notes: '',
        coach_notes: '',
        video_url: '',
        duration: null,
        arrival: null,
        requireRsvp: null,
        rsvpLockHours: null,
        round_label: e.round_label ?? null,
        uncertain: !!e.uncertain,
        uncertainty_reason: e.uncertainty_reason ?? null,
        duplicate: isDuplicate,
        selected: !isDuplicate,
      };
    });

    setEvents(parsed);
    setWarnings(invokeRes.data.warnings ?? []);
    setPhase('review');
  }

  // ─── Import ──────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!team || !profile) return;
    const toImport = events.filter((e) => e.selected);
    if (toImport.length === 0) return;

    if (uncertainCount > 0) {
      Alert.alert(
        `${uncertainCount} unreviewed event${uncertainCount > 1 ? 's' : ''}`,
        'Some events were flagged as uncertain. Import anyway?',
        [
          { text: 'Review first', style: 'cancel' },
          { text: 'Import anyway', onPress: doImport },
        ]
      );
    } else {
      doImport();
    }
  }

  async function doImport() {
    if (!team || !profile) return;
    const toImport = events.filter((e) => e.selected);
    setPhase('importing');

    const rows = toImport.map((e) => {
      // The AI parser is told to return 24-hour time but isn't guaranteed
      // to (a source PDF/image showing "6:00 PM" can come back verbatim) —
      // parseFlexibleTime handles both, and normalizedTime is what actually
      // gets saved, not the AI's raw (possibly 12-hour) string.
      const parsedTime = e.time ? parseFlexibleTime(e.time) : null;
      const normalizedTime = parsedTime ? toTimeString(parsedTime) : null;

      // Per-event overrides win over the bulk defaults — this is what
      // actually determines RSVP behaviour on the saved row; previously
      // require_rsvp was never set here at all, so it silently fell back to
      // the DB's `true` default regardless of what the bulk RSVP chip said.
      const effectiveRequireRsvp = e.requireRsvp ?? (bulk.rsvpLockHours != null);
      const effectiveLockHours = e.rsvpLockHours ?? bulk.rsvpLockHours;

      let rsvpLockAt: string | null = null;
      if (!isDatedTournamentImport && effectiveRequireRsvp && effectiveLockHours != null && e.date && normalizedTime) {
        try {
          // Anchored to the club's own timezone, not this device's — see
          // create-event.tsx's computeLockAt for the full reasoning.
          const dt = zonedTimeToUtc(e.date, `${normalizedTime}:00`, timezone);
          dt.setHours(dt.getHours() - effectiveLockHours);
          rsvpLockAt = dt.toISOString();
        } catch (err) {
          // One row's unparseable date/time shouldn't take down the whole
          // batch — that event still imports below, just without an RSVP
          // lock time (a coach can set one manually afterward).
          console.warn('[schedule-upload] could not compute rsvp_lock_at for', e.title, err);
        }
      }

      return {
        team_id: team.id,
        title: e.title,
        type: e.type,
        event_date: e.date ?? todayLocalStr(),
        event_time: normalizedTime,
        location: e.location ?? null,
        address: e.address ?? null,
        lat: e.lat ?? null,
        lng: e.lng ?? null,
        field_id: e.field_id ?? null,
        field_type: e.surface ?? null,
        field_notes: e.field_notes.trim() || null,
        home_away: e.home_away ?? null,
        uniform: e.uniform ?? null,
        notes: e.player_notes.trim() || null,
        coach_notes: e.coach_notes.trim() || null,
        video_url: e.video_url.trim() || null,
        tournament_id: tournamentId || null,
        round_label: e.round_label?.trim() || null,
        duration_minutes: e.duration ?? bulk.duration,
        arrival_buffer_minutes: e.arrival ?? bulk.arriveEarly,
        require_rsvp: effectiveRequireRsvp,
        rsvp_lock_at: rsvpLockAt,
        created_by: profile.id,
      };
    });

    const { error } = await supabase.from('events').insert(rows as any);
    if (error) {
      setPhase('review');
      console.error('[schedule-upload] import failed', error);
      Alert.alert('Import failed', "Some of these events couldn't be saved — try a smaller batch or check the dates.");
      return;
    }
    setImported(toImport.length);
    setPhase('done');
  }

  // ─── Notify team ─────────────────────────────────────────────────────────────

  async function handleNotify() {
    if (!team || !profile) return;
    setNotifying(true);
    const body = tournamentName
      ? `Your ${tournamentName} schedule is live — ${imported} game${imported !== 1 ? 's' : ''} have been added. Open the Schedule tab to view dates, times, and venues.`
      : `Your season schedule is live — ${imported} event${imported !== 1 ? 's' : ''} have been added. Open the Schedule tab to view dates, times, and venues.`;
    await supabase.from('announcements').insert({
      team_id: team.id,
      title: tournamentName ? `${tournamentName} is live 🏆` : 'Schedule is live 📅',
      body,
      pinned: false,
      created_by: profile.id,
    });
    setNotified(true);
    setNotifying(false);
  }

  // ─── Edit ─────────────────────────────────────────────────────────────────────

  function saveEdit(updated: ParsedEvent) {
    setEvents((prev) => prev.map((e) => e._id === updated._id ? { ...updated, uncertain: false } : e));
    setEditing(null);
  }

  // ─── Bulk card (header for FlatList) ─────────────────────────────────────────

  function renderBulkCard() {
    const rsvpSummary = bulk.rsvpLockHours == null ? 'off' : bulk.rsvpLockHours === 0 ? 'at start' : `${bulk.rsvpLockHours} hrs before`;
    const summary = `${fmtDuration(bulk.duration)} · ${bulk.arriveEarly} min early` + (
      isDatedTournamentImport ? ' · RSVP via tournament' : ` · RSVP ${rsvpSummary}`
    );
    return (
      <View style={st.bulkCard}>
        <TouchableOpacity style={st.bulkHeader} onPress={() => setBulkOpen((o) => !o)} activeOpacity={0.7}>
          <View style={{ flex: 1 }}>
            <Text style={st.bulkCardTitle}>DEFAULT SETTINGS <Text style={st.fieldHint}>· edit any event to override</Text></Text>
            {!bulkOpen && <Text style={st.bulkSummary}>{summary}</Text>}
          </View>
          <Ionicons name={bulkOpen ? 'chevron-up' : 'chevron-down'} size={16} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>

        {bulkOpen && (
          <View style={{ marginTop: 12 }}>
            <Text style={st.bulkFieldLabel}>DURATION</Text>
            <View style={st.bulkChipRow}>
              {BULK_DURATION_OPTIONS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[st.bulkChip, bulk.duration === v && [st.bulkChipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                  onPress={() => setBulk((p) => ({ ...p, duration: v }))}
                >
                  <Text style={[st.bulkChipText, bulk.duration === v && [st.bulkChipTextActive, { color: primaryColor }]]}>
                    {fmtDuration(v)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[st.bulkFieldLabel, { marginTop: 12 }]}>ARRIVE EARLY</Text>
            <View style={st.bulkChipRow}>
              {BULK_ARRIVE_OPTIONS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[st.bulkChip, bulk.arriveEarly === v && [st.bulkChipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                  onPress={() => setBulk((p) => ({ ...p, arriveEarly: v }))}
                >
                  <Text style={[st.bulkChipText, bulk.arriveEarly === v && [st.bulkChipTextActive, { color: primaryColor }]]}>
                    {v} min before
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!isDatedTournamentImport && (
              <>
                <Text style={[st.bulkFieldLabel, { marginTop: 12 }]}>RSVP DEADLINE</Text>
                <View style={st.bulkChipRow}>
                  {BULK_RSVP_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={String(opt.value)}
                      style={[st.bulkChip, bulk.rsvpLockHours === opt.value && [st.bulkChipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                      onPress={() => setBulk((p) => ({ ...p, rsvpLockHours: opt.value }))}
                    >
                      <Text style={[st.bulkChipText, bulk.rsvpLockHours === opt.value && [st.bulkChipTextActive, { color: primaryColor }]]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        )}
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={st.container}>
      <ClubHeader title={tournamentId ? 'Import Tournament Games' : 'AI Schedule Import'} onBack={() => router.back()} />

      {/* ── Idle ── */}
      {phase === 'idle' && (
        <ScrollView contentContainerStyle={st.idleScroll}>
          <View style={st.uploadBox}>
            <View style={[st.uploadIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
              <Ionicons name="sparkles-outline" size={36} color={primaryColor} />
            </View>
            <Text style={st.uploadTitle}>Import your schedule</Text>
            <Text style={st.uploadSub}>
              Upload your season schedule and Claude will extract all events automatically — dates, times, venues, addresses, and home/away.
            </Text>
            <TouchableOpacity style={[st.uploadBtn, { backgroundColor: primaryColor }]} onPress={pickFile}>
              <Ionicons name="document-attach-outline" size={18} color="#000" />
              <Text style={st.uploadBtnText}>Choose PDF, CSV or spreadsheet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.uploadBtn, st.uploadBtnAlt, { borderColor: primaryColor }]} onPress={pickImage}>
              <Ionicons name="camera-outline" size={18} color={primaryColor} />
              <Text style={[st.uploadBtnText, { color: primaryColor }]}>Take photo or pick image</Text>
            </TouchableOpacity>
          </View>

          <View style={st.tipsCard}>
            <Text style={st.tipsTitle}>WHAT GETS EXTRACTED</Text>
            {[
              { icon: 'calendar-outline',  text: 'Date, time and duration' },
              { icon: 'location-outline',  text: 'Venue name and full address' },
              { icon: 'football-outline',  text: 'Home / Away and surface type' },
              { icon: 'people-outline',    text: 'Opponent name (cleaned up)' },
              { icon: 'warning-outline',   text: 'Uncertain rows flagged for review' },
            ].map((tip, i) => (
              <View key={i} style={st.tipRow}>
                <Ionicons name={tip.icon as any} size={16} color={primaryColor} />
                <Text style={st.tipText}>{tip.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Processing ── */}
      {phase === 'processing' && (
        <View style={st.centerFill}>
          <View style={[st.processingIcon, { backgroundColor: rgba(0.1) }]}>
            <Ionicons name="sparkles-outline" size={36} color={primaryColor} />
          </View>
          <Text style={st.processingTitle}>Analysing your schedule</Text>
          <Text style={st.processingSub}>{PROCESSING_MESSAGES[processingMsg]}</Text>
          <ActivityIndicator color={primaryColor} style={{ marginTop: 24 }} size="large" />
        </View>
      )}

      {/* ── Review ── */}
      {phase === 'review' && (
        <View style={{ flex: 1 }}>
          {/* Summary bar */}
          <View style={st.summaryBar}>
            <View style={{ flex: 1 }}>
              <Text style={st.summaryTitle}>
                {selectedCount === events.length
                  ? `${events.length} event${events.length !== 1 ? 's' : ''} found`
                  : `${selectedCount} of ${events.length} selected`}
              </Text>
              {uncertainCount > 0 && (
                <Text style={st.summaryWarn}>⚠ {uncertainCount} need{uncertainCount === 1 ? 's' : ''} review — tap to edit</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setEvents((prev) => {
                const allOn = prev.every((e) => e.selected);
                return prev.map((e) => ({ ...e, selected: !allOn }));
              })}
            >
              <Text style={[st.selectAllBtn, { color: primaryColor }]}>{events.every((e) => e.selected) ? 'Deselect all' : 'Select all'}</Text>
            </TouchableOpacity>
          </View>

          {warnings.length > 0 && (
            <TouchableOpacity
              style={st.warningsBar}
              onPress={() => setWarningsOpen((o) => !o)}
              activeOpacity={0.8}
            >
              <View style={st.warningsBannerRow}>
                <Ionicons name="information-circle-outline" size={15} color="#F59E0B" />
                <Text style={st.warningsTitle}>
                  {warnings.length} AI note{warnings.length !== 1 ? 's' : ''} — tap to {warningsOpen ? 'hide' : 'review'}
                </Text>
                <Ionicons name={warningsOpen ? 'chevron-up' : 'chevron-down'} size={13} color="#F59E0B" />
              </View>
              {warningsOpen && warnings.map((w, i) => (
                <View key={i} style={st.warningsItem}>
                  <Text style={st.warningsDot}>·</Text>
                  <Text style={st.warningsText}>{w}</Text>
                </View>
              ))}
            </TouchableOpacity>
          )}

          {dupCount > 0 && (
            <View style={st.dupBar}>
              <Ionicons name="copy-outline" size={15} color="#60A5FA" />
              <Text style={st.dupBarText}>
                {dupCount} event{dupCount !== 1 ? 's' : ''} already exist on these dates — deselected by default.
              </Text>
            </View>
          )}

          <FlatList
            data={events}
            keyExtractor={(e) => e._id}
            contentContainerStyle={{ paddingBottom: 110 }}
            ListHeaderComponent={renderBulkCard}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[st.eventRow, item.uncertain && st.eventRowUncertain, !item.selected && st.eventRowOff]}
                onPress={() => setEditing(item)}
                activeOpacity={0.8}
              >
                <TouchableOpacity
                  style={st.eventCheckArea}
                  onPress={() => setEvents((prev) => prev.map((e) => e._id === item._id ? { ...e, selected: !e.selected } : e))}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={[st.checkBox, item.selected && [st.checkBoxOn, { backgroundColor: primaryColor, borderColor: primaryColor }]]}>
                    {item.selected && <Ionicons name="checkmark" size={13} color="#000" />}
                  </View>
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <View style={st.eventRowTop}>
                    <Text style={[st.eventTitle, !item.selected && { opacity: 0.4 }]} numberOfLines={1}>{item.title}</Text>
                    <View style={st.inlineBadges}>
                      <View style={[st.typePill, { backgroundColor: TYPE_CFG[item.type].color + '22', borderColor: TYPE_CFG[item.type].color + '55' }]}>
                        <Text style={[st.typePillText, { color: TYPE_CFG[item.type].color }]}>{TYPE_CFG[item.type].label}</Text>
                      </View>
                      {item.home_away && (
                        <View style={[st.typePill, { backgroundColor: item.home_away === 'home' ? rgba(0.12) : 'rgba(139,92,246,0.12)', borderColor: item.home_away === 'home' ? rgba(0.3) : 'rgba(139,92,246,0.3)' }]}>
                          <Text style={[st.typePillText, { color: item.home_away === 'home' ? primaryColor : '#8B5CF6' }]}>{item.home_away === 'home' ? 'Home' : 'Away'}</Text>
                        </View>
                      )}
                      {item.duplicate && (
                        <View style={[st.typePill, { backgroundColor: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.3)' }]}>
                          <Text style={[st.typePillText, { color: '#60A5FA' }]}>Duplicate</Text>
                        </View>
                      )}
                      {item.uncertain && <Ionicons name="warning" size={12} color="#F59E0B" />}
                    </View>
                  </View>
                  <Text style={[st.eventMeta, !item.selected && { opacity: 0.4 }]}>
                    {fmtDate(item.date)}{fmtTime(item.time)}
                    {item.location ? ` · ${item.location}` : ''}
                  </Text>
                  {item.address && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      {item.field_id && <Ionicons name="checkmark-circle" size={10} color={primaryColor} />}
                      <Text style={[st.eventAddress, !item.selected && { opacity: 0.4 }]} numberOfLines={1}>{item.address}</Text>
                    </View>
                  )}
                  {item.uncertain && item.uncertainty_reason && (
                    <View style={st.uncertainRow}>
                      <Text style={st.uncertainText}>{item.uncertainty_reason}</Text>
                    </View>
                  )}
                </View>

                <View style={st.editHint}>
                  <Ionicons name="pencil-outline" size={14} color={PULSE_COLORS.ui.muted} />
                </View>
              </TouchableOpacity>
            )}
          />

          {/* Import button */}
          <View style={st.importFooter}>
            <TouchableOpacity
              style={[st.importBtn, { backgroundColor: primaryColor }, selectedCount === 0 && st.importBtnOff]}
              onPress={handleImport}
              disabled={selectedCount === 0}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#000" />
              <Text style={st.importBtnText}>Import {selectedCount} event{selectedCount !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Importing ── */}
      {phase === 'importing' && (
        <View style={st.centerFill}>
          <ActivityIndicator color={primaryColor} size="large" />
          <Text style={[st.processingTitle, { marginTop: 20 }]}>Creating events…</Text>
          <Text style={st.processingSub}>Adding {events.filter((e) => e.selected).length} events to your schedule</Text>
        </View>
      )}

      {/* ── Done ── */}
      {phase === 'done' && (
        <View style={st.centerFill}>
          <View style={[st.processingIcon, { backgroundColor: rgba(0.12), marginBottom: 20 }]}>
            <Ionicons name="checkmark-circle" size={44} color={primaryColor} />
          </View>
          <Text style={st.processingTitle}>{imported} event{imported !== 1 ? 's' : ''} added</Text>
          <Text style={st.processingSub}>Your schedule is live and ready for your team.</Text>

          {/* Notify team */}
          {notified ? (
            <View style={st.notifiedRow}>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
              <Text style={st.notifiedText}>Team notified via announcement</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[st.importBtn, { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, marginTop: 24, paddingHorizontal: 32 }]}
              onPress={handleNotify}
              disabled={notifying}
              activeOpacity={0.8}
            >
              {notifying
                ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.text} />
                : <>
                    <Ionicons name="megaphone-outline" size={16} color={PULSE_COLORS.ui.text} />
                    <Text style={[st.importBtnText, { color: PULSE_COLORS.ui.text }]}>Notify team</Text>
                  </>
              }
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[st.importBtn, { backgroundColor: primaryColor, marginTop: 10, paddingHorizontal: 32 }]}
            onPress={() => router.replace(`/(app)/${clubSlug}/(tabs)/schedule` as any)}
          >
            <Ionicons name="calendar-outline" size={16} color="#000" />
            <Text style={st.importBtnText}>View Schedule</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 14, color: PULSE_COLORS.ui.muted }}>Back to admin</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <EditEventModal
          event={editing}
          bulk={bulk}
          savedFields={savedFields}
          tournamentId={tournamentId}
          isDatedTournamentImport={isDatedTournamentImport}
          onSave={saveEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

const RSVP_LOCK_CHOICES = [0, 12, 24, 48];

function EditEventModal({ event, bulk, savedFields, tournamentId, isDatedTournamentImport, onSave, onClose }: {
  event: ParsedEvent;
  bulk: BulkSettings;
  savedFields: SavedField[];
  tournamentId?: string;
  isDatedTournamentImport?: boolean;
  onSave: (e: ParsedEvent) => void;
  onClose: () => void;
}) {
  const { primaryColor, rgba } = useClub();
  const [date, setDate]         = useState(event.date ?? '');
  const [time, setTime]         = useState(event.time ?? '');
  const [title, setTitle]       = useState(event.title);
  const [type, setType]         = useState<EventType>(event.type);
  const [roundLabel, setRoundLabel] = useState(event.round_label ?? '');
  const [homeAway, setHomeAway] = useState<'home' | 'away' | null>(event.home_away);
  const [surface, setSurface]   = useState<'turf' | 'grass' | 'indoor' | null>(event.surface);
  const [uniform, setUniform]   = useState<'home' | 'away' | 'training' | null>(event.uniform ?? event.home_away);

  // Location — mirrors create-event.tsx's pattern: a fieldId links this
  // event to a saved club field; any manual edit to name/address clears it
  // since it may no longer match.
  const [locationName, setLocationName] = useState(event.location ?? '');
  const [address, setAddress]   = useState(event.address ?? '');
  const [lat, setLat]           = useState<number | null>(event.lat);
  const [lng, setLng]           = useState<number | null>(event.lng);
  const [fieldId, setFieldId]   = useState<string | null>(event.field_id);
  const [fieldNotes, setFieldNotes] = useState(event.field_notes);

  const [playerNotes, setPlayerNotes] = useState(event.player_notes);
  const [coachNotes, setCoachNotes]   = useState(event.coach_notes);
  const [videoUrl, setVideoUrl]       = useState(event.video_url);

  // Duration/arrival stay nullable exactly like create-event.tsx's own
  // fields — null means "not set for this event," which doImport() already
  // treats as "use the bulk default." The picker's clear (X) button is what
  // resets a row back to null/default.
  const [duration, setDuration]   = useState<number | null>(event.duration);
  const [arrival, setArrival]     = useState<number | null>(event.arrival);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showArrivalPicker, setShowArrivalPicker]   = useState(false);
  const [requireRsvp, setRequireRsvp] = useState(event.requireRsvp ?? (bulk.rsvpLockHours != null));
  const [rsvpLockHours, setRsvpLockHours] = useState(event.rsvpLockHours ?? bulk.rsvpLockHours ?? 24);

  function save() {
    if (!title.trim()) { Alert.alert('Required', 'Title cannot be empty.'); return; }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('Invalid date', 'Use YYYY-MM-DD format.'); return; }
    if (time && !/^\d{2}:\d{2}$/.test(time)) { Alert.alert('Invalid time', 'Use HH:MM 24-hour format.'); return; }
    onSave({
      ...event,
      date: date || null,
      time: time || null,
      title: title.trim(),
      type,
      location: locationName.trim() || null,
      address: address.trim() || null,
      lat, lng, field_id: fieldId,
      home_away: homeAway,
      surface,
      uniform,
      field_notes: fieldNotes,
      player_notes: playerNotes,
      coach_notes: coachNotes,
      video_url: videoUrl,
      duration, arrival,
      requireRsvp, rsvpLockHours,
      round_label: roundLabel.trim() || null,
    });
  }

  const homeAwayOpts: { value: 'home' | 'away' | null; label: string; color: string }[] = [
    { value: 'home', label: 'Home', color: primaryColor },
    { value: 'away', label: 'Away', color: '#8B5CF6' },
    { value: null,   label: 'N/A',  color: PULSE_COLORS.ui.muted },
  ];

  const surfaceOpts: { value: 'turf' | 'grass' | 'indoor' | null; label: string; color: string }[] = [
    { value: 'turf',   label: 'Turf',    color: '#3B82F6' },
    { value: 'grass',  label: 'Grass',   color: primaryColor },
    { value: 'indoor', label: 'Indoor',  color: '#8B5CF6' },
    { value: null,     label: 'Unknown', color: PULSE_COLORS.ui.muted },
  ];

  const uniformOpts: { value: 'home' | 'away' | 'training' | null; label: string }[] = [
    { value: 'home', label: 'Home' },
    { value: 'away', label: 'Away' },
    { value: 'training', label: 'Training' },
    { value: null, label: 'N/A' },
  ];

  return (
    <Modal visible animationType="slide" transparent presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.sheet}>
          <View style={st.sheetHandle} />
          <View style={st.sheetHeader}>
            <TouchableOpacity onPress={onClose}><Text style={st.sheetCancel}>Cancel</Text></TouchableOpacity>
            <Text style={st.sheetTitle}>Edit Event</Text>
            <TouchableOpacity onPress={save}><Text style={[st.sheetSave, { color: primaryColor }]}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">

            <Text style={st.fieldLabel}>TITLE</Text>
            <TextInput style={st.fieldInput} value={title} onChangeText={setTitle} autoFocus returnKeyType="done" />

            {!!tournamentId && (
              <>
                <Text style={[st.fieldLabel, { marginTop: 16 }]}>ROUND <Text style={st.fieldHint}>optional</Text></Text>
                <TextInput
                  style={st.fieldInput}
                  value={roundLabel}
                  onChangeText={setRoundLabel}
                  placeholder="Quarterfinal, Pool Play…"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  returnKeyType="done"
                />
              </>
            )}

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>TYPE</Text>
            <View style={st.typeRow}>
              {(['game', 'training', 'other'] as EventType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[st.typeBtn, type === t && { backgroundColor: TYPE_CFG[t].color + '22', borderColor: TYPE_CFG[t].color }]}
                  onPress={() => setType(t)}
                >
                  <Text style={[st.typeBtnText, type === t && { color: TYPE_CFG[t].color }]}>{TYPE_CFG[t].label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {type === 'game' && (
              <>
                <Text style={[st.fieldLabel, { marginTop: 16 }]}>HOME / AWAY</Text>
                <View style={st.typeRow}>
                  {homeAwayOpts.map((opt) => (
                    <TouchableOpacity
                      key={String(opt.value)}
                      style={[st.typeBtn, homeAway === opt.value && { backgroundColor: opt.color + '22', borderColor: opt.color }]}
                      onPress={() => setHomeAway(opt.value)}
                    >
                      <Text style={[st.typeBtnText, homeAway === opt.value && { color: opt.color }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Free-text date/time entry rather than the DateTimeSheet picker
                used elsewhere (create-event.tsx): DateTimeSheet always
                returns a concrete Date and has no "clear" affordance, but
                an uncertain row here can legitimately need date and/or time
                left blank (e.g. an all-day event, or a date the AI genuinely
                couldn't determine) — supporting that would mean adding
                optional/nullable semantics to the shared picker itself, a
                bigger change than fits this pass. Left as-is; a real fix
                should extend DateTimeSheet with an optional "Clear" action
                rather than fork it here. */}
            <Text style={[st.fieldLabel, { marginTop: 16 }]}>DATE <Text style={st.fieldHint}>YYYY-MM-DD</Text></Text>
            <TextInput
              style={st.fieldInput}
              value={date}
              onChangeText={setDate}
              placeholder="2026-08-15"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
            />

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>TIME <Text style={st.fieldHint}>HH:MM · 24-hour</Text></Text>
            <TextInput
              style={st.fieldInput}
              value={time}
              onChangeText={setTime}
              placeholder="14:30"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
            />

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>DURATION</Text>
            <TouchableOpacity style={st.pickerRow} onPress={() => setShowDurationPicker(true)}>
              <Text style={duration !== null ? [st.fieldValue, { color: primaryColor }] : st.fieldValueMuted}>
                {duration !== null ? fmtDuration(duration) : `Default (${fmtDuration(bulk.duration)})`}
              </Text>
              {duration !== null ? (
                <TouchableOpacity onPress={() => setDuration(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
              )}
            </TouchableOpacity>

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>ARRIVE EARLY</Text>
            <TouchableOpacity style={st.pickerRow} onPress={() => setShowArrivalPicker(true)}>
              <Text style={arrival !== null ? [st.fieldValue, { color: primaryColor }] : st.fieldValueMuted}>
                {arrival !== null ? `${arrival} min before` : `Default (${bulk.arriveEarly} min before)`}
              </Text>
              {arrival !== null ? (
                <TouchableOpacity onPress={() => setArrival(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
              )}
            </TouchableOpacity>

            <PickerSheet
              visible={showDurationPicker}
              title="Duration"
              options={DURATION_OPTIONS}
              value={duration ?? bulk.duration}
              onChange={setDuration}
              onClose={() => setShowDurationPicker(false)}
            />
            <PickerSheet
              visible={showArrivalPicker}
              title="Arrive how early?"
              options={ARRIVAL_OPTIONS}
              value={arrival ?? bulk.arriveEarly}
              onChange={setArrival}
              onClose={() => setShowArrivalPicker(false)}
            />

            {/* ── Location ── */}
            <Text style={[st.fieldLabel, { marginTop: 16 }]}>VENUE / FIELD <Text style={st.fieldHint}>optional</Text></Text>

            {savedFields.length > 0 && (
              <View style={[st.typeRow, st.wrapRow, { marginBottom: 10 }]}>
                {savedFields.map((f) => {
                  const active = fieldId === f.id;
                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[st.typeBtn, st.chipBtn, active && { backgroundColor: rgba(0.12), borderColor: primaryColor }]}
                      onPress={() => {
                        setFieldId(f.id);
                        setLocationName(f.name);
                        setAddress(f.address ?? '');
                        setLat(f.lat); setLng(f.lng);
                        const mapped = mapSurfaceType(f.surface_type);
                        if (mapped) setSurface(mapped);
                      }}
                    >
                      <Text style={[st.typeBtnText, active && { color: primaryColor }]}>{f.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {fieldId ? (
              <View style={st.selectedFieldBox}>
                <Ionicons name="checkmark-circle" size={18} color={primaryColor} />
                <View style={{ flex: 1 }}>
                  <Text style={st.selectedFieldName}>{locationName}</Text>
                  <Text style={st.selectedFieldAddress}>{address || 'No address on file for this field'}</Text>
                </View>
                <TouchableOpacity onPress={() => setFieldId(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={[st.changeLink, { color: primaryColor }]}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={st.fieldInput}
                  value={locationName}
                  onChangeText={(v) => { setLocationName(v); setFieldId(null); }}
                  placeholder="Habernickel Park"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  returnKeyType="done"
                />
                <Text style={[st.fieldLabel, { marginTop: 12 }]}>ADDRESS <Text style={st.fieldHint}>optional</Text></Text>
                <SmartLocationInput
                  initialValue={address}
                  onResult={(r) => {
                    setFieldId(null);
                    if (!locationName) setLocationName(r.name);
                    setAddress(r.address ?? '');
                    setLat(r.lat ?? null);
                    setLng(r.lng ?? null);
                  }}
                />
              </>
            )}

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>FIELD DETAILS <Text style={st.fieldHint}>optional</Text></Text>
            <TextInput
              style={st.fieldInput}
              value={fieldNotes}
              onChangeText={setFieldNotes}
              placeholder="Field 1, Pitch B…"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              returnKeyType="done"
            />

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>SURFACE</Text>
            <View style={st.typeRow}>
              {surfaceOpts.map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[st.typeBtn, surface === opt.value && { backgroundColor: opt.color + '22', borderColor: opt.color }]}
                  onPress={() => setSurface(opt.value)}
                >
                  <Text style={[st.typeBtnText, surface === opt.value && { color: opt.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>UNIFORM</Text>
            <View style={st.typeRow}>
              {uniformOpts.map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[st.typeBtn, uniform === opt.value && { backgroundColor: rgba(0.12), borderColor: primaryColor }]}
                  onPress={() => setUniform(opt.value)}
                >
                  <Text style={[st.typeBtnText, uniform === opt.value && { color: primaryColor }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Details ── */}
            <Text style={[st.fieldLabel, { marginTop: 16 }]}>TEAM MESSAGE <Text style={st.fieldHint}>visible to players &amp; parents</Text></Text>
            <TextInput
              style={[st.fieldInput, st.notesInput]}
              value={playerNotes}
              onChangeText={setPlayerNotes}
              placeholder="Visible to all players and parents…"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              multiline
            />

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>COACH NOTES <Text style={st.fieldHint}>coach only</Text></Text>
            <TextInput
              style={[st.fieldInput, st.notesInput]}
              value={coachNotes}
              onChangeText={setCoachNotes}
              placeholder="Notes for coaching staff…"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              multiline
            />

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>VIDEO LINK <Text style={st.fieldHint}>optional</Text></Text>
            <TextInput
              style={st.fieldInput}
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="Veo, YouTube, Hudl URL…"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              autoCapitalize="none"
              keyboardType="url"
              returnKeyType="done"
            />

            {/* ── RSVP — hidden for a dated tournament import, since RSVP
                 lives at the tournament level for those games ── */}
            {!isDatedTournamentImport && (
              <>
                <View style={[st.switchRow, { marginTop: 20 }]}>
                  <Text style={st.fieldLabel}>REQUIRE RSVP</Text>
                  <Switch
                    value={requireRsvp}
                    onValueChange={setRequireRsvp}
                    trackColor={{ false: PULSE_COLORS.ui.border, true: primaryColor }}
                    thumbColor="#fff"
                  />
                </View>

                {requireRsvp && (
                  <>
                    <Text style={[st.fieldLabel, { marginTop: 12 }]}>RSVP CLOSES</Text>
                    <View style={[st.typeRow, st.wrapRow]}>
                      {RSVP_LOCK_CHOICES.map((v) => (
                        <TouchableOpacity
                          key={v}
                          style={[st.typeBtn, st.chipBtn, rsvpLockHours === v && { backgroundColor: rgba(0.12), borderColor: primaryColor }]}
                          onPress={() => setRsvpLockHours(v)}
                        >
                          <Text style={[st.typeBtnText, rsvpLockHours === v && { color: primaryColor }]}>{v === 0 ? 'At start' : `${v} hrs before`}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            <View style={{ height: 48 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container:  { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text },

  // Idle
  idleScroll: { padding: 20, paddingBottom: 60 },
  uploadBox: { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 20 },
  uploadIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  uploadTitle: { fontSize: 22, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 8, textAlign: 'center' },
  uploadSub: { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: PULSE_COLORS.brand.green, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14, marginBottom: 10, width: '100%', justifyContent: 'center' },
  uploadBtnAlt: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: PULSE_COLORS.brand.green },
  uploadBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },

  tipsCard: { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 16, padding: 18 },
  tipsTitle: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.6, marginBottom: 14 },
  tipRow: { flexDirection: 'row', gap: 12, marginBottom: 10, alignItems: 'center' },
  tipText: { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, lineHeight: 20, flex: 1 },

  // Processing / Done
  processingIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(34,197,94,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  processingTitle: { fontSize: 22, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 8, textAlign: 'center' },
  processingSub: { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Review
  summaryBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  summaryWarn: { fontSize: 12, color: '#F59E0B', marginTop: 2 },
  selectAllBtn: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.brand.green },

  warningsBar:       { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(245,158,11,0.08)', borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.15)' },
  warningsBannerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningsTitle:     { fontSize: 12, fontWeight: '700', color: '#F59E0B', flex: 1 },
  warningsItem:      { flexDirection: 'row', gap: 6, marginTop: 8 },
  warningsDot:       { fontSize: 12, color: '#F59E0B' },
  warningsText:      { fontSize: 12, color: '#F59E0B', flex: 1, lineHeight: 17 },
  dupBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(96,165,250,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(96,165,250,0.15)' },
  dupBarText: { fontSize: 13, color: '#60A5FA', flex: 1 },
  notifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  notifiedText: { fontSize: 14, color: '#22C55E', fontWeight: '600' },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  eventRowUncertain: { backgroundColor: 'rgba(245,158,11,0.04)' },
  eventRowOff: { opacity: 0.4 },
  eventCheckArea: { padding: 4 },
  checkBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: PULSE_COLORS.ui.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: PULSE_COLORS.brand.green, borderColor: PULSE_COLORS.brand.green },
  eventRowTop:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  eventTitle:    { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text, flex: 1 },
  inlineBadges:  { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  badgeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 4 },
  eventMeta:     { fontSize: 12, color: PULSE_COLORS.ui.textSecondary },
  eventAddress:  { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 2 },
  editHint: { width: 28, height: 28, borderRadius: 8, backgroundColor: PULSE_COLORS.ui.surface, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },

  // Bulk card
  bulkCard: { margin: 12, backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 14, padding: 14 },
  bulkHeader: { flexDirection: 'row', alignItems: 'center' },
  bulkCardTitle: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.5, marginBottom: 2 },
  bulkSummary: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.text },
  bulkFieldLabel: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.4, marginBottom: 6 },
  bulkChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bulkChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.background },
  bulkChipActive: { borderColor: PULSE_COLORS.brand.green, backgroundColor: 'rgba(34,197,94,0.12)' },
  bulkChipText: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500' },
  bulkChipTextActive: { color: PULSE_COLORS.brand.green, fontWeight: '700' },

  typePill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  typePillText: { fontSize: 11, fontWeight: '700' },
  uncertainRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  uncertainText: { fontSize: 11, color: '#F59E0B', fontStyle: 'italic' },

  importFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: PULSE_COLORS.ui.background, borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PULSE_COLORS.brand.green, borderRadius: 16, paddingVertical: 16 },
  importBtnOff: { opacity: 0.35 },
  importBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },

  // Edit modal
  sheet: { flex: 1, marginTop: 60, backgroundColor: PULSE_COLORS.ui.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: PULSE_COLORS.ui.border, alignSelf: 'center', marginTop: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text },
  sheetCancel: { fontSize: 15, color: PULSE_COLORS.ui.muted, minWidth: 60 },
  sheetSave: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.brand.green, minWidth: 60, textAlign: 'right' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.8, marginBottom: 8 },
  fieldHint: { fontWeight: '400', letterSpacing: 0, textTransform: 'none', fontSize: 11 },
  fieldInput: { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: PULSE_COLORS.ui.text },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },

  // Wrapping chip rows (variable item counts: saved fields, duration,
  // arrive-early, RSVP lock hours) — typeBtn's flex:1 only makes sense for
  // fixed 2-3 item rows, so these override it to a natural width per chip.
  wrapRow: { flexWrap: 'wrap' },
  chipBtn: { flex: 0, paddingHorizontal: 14 },

  notesInput: { minHeight: 64, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
  },
  fieldValue: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },
  fieldValueMuted: { fontSize: 15, fontWeight: '400', color: PULSE_COLORS.ui.muted },

  selectedFieldBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  selectedFieldName: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  selectedFieldAddress: { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 2 },
  changeLink: { fontSize: 13, fontWeight: '700' },
});
