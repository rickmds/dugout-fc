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
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'processing' | 'review' | 'importing' | 'done';
type EventType = 'game' | 'training' | 'other';

type ParsedEvent = {
  _id: string;
  date: string | null;
  time: string | null;
  title: string;
  type: EventType;
  location: string | null;
  address: string | null;
  home_away: 'home' | 'away' | null;
  surface: 'turf' | 'grass' | null;
  uncertain: boolean;
  uncertainty_reason: string | null;
  duplicate: boolean;
  selected: boolean;
};

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
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return ` · ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtDuration(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? `${min % 60}m` : ''}` : `${min}m`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScheduleUploadScreen() {
  const { primaryColor, rgba } = useClub();
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
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
  const processingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (!asset.base64) { Alert.alert('Error', 'Could not read image.'); return; }
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    await parseSchedule(asset.base64, ext === 'png' ? 'image/png' : 'image/jpeg');
  }

  async function parseSchedule(file_base64: string, file_type: string) {
    setPhase('processing');

    const [invokeRes, existingRes] = await Promise.all([
      supabase.functions.invoke('parse-schedule', { body: { file_base64, file_type } }),
      team
        ? supabase.from('events').select('event_date, type').eq('team_id', team.id)
        : Promise.resolve({ data: [] as { event_date: string; type: string }[] }),
    ]);

    if (invokeRes.error || !invokeRes.data) {
      setPhase('idle');
      Alert.alert('Failed to parse', invokeRes.error?.message ?? 'Could not read schedule. Try a different file.');
      return;
    }

    // Build a set of existing date+type keys for duplicate detection
    const existingKeys = new Set(
      ((existingRes as any).data ?? []).map((e: { event_date: string; type: string }) => `${e.event_date}_${e.type}`)
    );

    const parsed: ParsedEvent[] = (invokeRes.data.events ?? []).map((e: any, i: number) => {
      const type = (['game', 'training', 'other'].includes(e.type) ? e.type : 'other') as EventType;
      const isDuplicate = !!e.date && existingKeys.has(`${e.date}_${type}`);
      return {
        _id: `evt-${i}`,
        date: e.date ?? null,
        time: e.time ?? null,
        title: e.title ?? 'Untitled',
        type,
        location: e.location ?? null,
        address: e.address ?? null,
        home_away: (['home', 'away'].includes(e.home_away) ? e.home_away : null) as 'home' | 'away' | null,
        surface: (['turf', 'grass'].includes(e.surface) ? e.surface : null) as 'turf' | 'grass' | null,
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
      const rsvpLockAt = bulk.rsvpLockHours != null && e.date && e.time
        ? (() => {
            const [h, m] = e.time!.split(':').map(Number);
            const dt = new Date(`${e.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
            dt.setHours(dt.getHours() - bulk.rsvpLockHours!);
            return dt.toISOString();
          })()
        : null;

      return {
        team_id: team.id,
        title: e.title,
        type: e.type,
        event_date: e.date ?? new Date().toISOString().split('T')[0],
        event_time: e.time ?? null,
        location: e.location ?? null,
        address: e.address ?? null,
        field_type: e.surface ?? null,
        uniform: e.home_away ?? null,
        duration_minutes: bulk.duration,
        arrival_buffer_minutes: bulk.arriveEarly,
        rsvp_lock_at: rsvpLockAt,
        created_by: profile.id,
      };
    });

    const { error } = await supabase.from('events').insert(rows as any);
    if (error) {
      setPhase('review');
      Alert.alert('Import failed', error.message);
      return;
    }
    setImported(toImport.length);
    setPhase('done');
  }

  // ─── Notify team ─────────────────────────────────────────────────────────────

  async function handleNotify() {
    if (!team || !profile) return;
    setNotifying(true);
    const body = `Your season schedule is live — ${imported} event${imported !== 1 ? 's' : ''} have been added. Open the Schedule tab to view dates, times, and venues.`;
    await supabase.from('announcements').insert({
      team_id: team.id,
      title: 'Schedule is live 📅',
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
    const summary = `${fmtDuration(bulk.duration)} · ${bulk.arriveEarly} min early · RSVP ${bulk.rsvpLockHours ? `${bulk.rsvpLockHours} hrs before` : 'off'}`;
    return (
      <View style={st.bulkCard}>
        <TouchableOpacity style={st.bulkHeader} onPress={() => setBulkOpen((o) => !o)} activeOpacity={0.7}>
          <View style={{ flex: 1 }}>
            <Text style={st.bulkCardTitle}>BULK SETTINGS</Text>
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
          </View>
        )}
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={st.container}>
      <ClubHeader title="AI Schedule Import" onBack={() => router.back()} />

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
      {editing && <EditEventModal event={editing} onSave={saveEdit} onClose={() => setEditing(null)} />}
    </View>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditEventModal({ event, onSave, onClose }: {
  event: ParsedEvent;
  onSave: (e: ParsedEvent) => void;
  onClose: () => void;
}) {
  const { primaryColor } = useClub();
  const [date, setDate]         = useState(event.date ?? '');
  const [time, setTime]         = useState(event.time ?? '');
  const [title, setTitle]       = useState(event.title);
  const [type, setType]         = useState<EventType>(event.type);
  const [location, setLocation] = useState(event.location ?? '');
  const [address, setAddress]   = useState(event.address ?? '');
  const [homeAway, setHomeAway] = useState<'home' | 'away' | null>(event.home_away);
  const [surface, setSurface]   = useState<'turf' | 'grass' | null>(event.surface);

  function save() {
    if (!title.trim()) { Alert.alert('Required', 'Title cannot be empty.'); return; }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('Invalid date', 'Use YYYY-MM-DD format.'); return; }
    if (time && !/^\d{2}:\d{2}$/.test(time)) { Alert.alert('Invalid time', 'Use HH:MM 24-hour format.'); return; }
    onSave({ ...event, date: date || null, time: time || null, title: title.trim(), type, location: location.trim() || null, address: address.trim() || null, home_away: homeAway, surface });
  }

  const homeAwayOpts: { value: 'home' | 'away' | null; label: string; color: string }[] = [
    { value: 'home', label: 'Home', color: primaryColor },
    { value: 'away', label: 'Away', color: '#8B5CF6' },
    { value: null,   label: 'N/A',  color: PULSE_COLORS.ui.muted },
  ];

  const surfaceOpts: { value: 'turf' | 'grass' | null; label: string; color: string }[] = [
    { value: 'turf',  label: 'Turf',    color: '#3B82F6' },
    { value: 'grass', label: 'Grass',   color: primaryColor },
    { value: null,    label: 'Unknown', color: PULSE_COLORS.ui.muted },
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

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>VENUE / FIELD <Text style={st.fieldHint}>optional</Text></Text>
            <TextInput style={st.fieldInput} value={location} onChangeText={setLocation} placeholder="Habernickel Park" placeholderTextColor={PULSE_COLORS.ui.muted} returnKeyType="done" />

            <Text style={[st.fieldLabel, { marginTop: 16 }]}>ADDRESS <Text style={st.fieldHint}>optional</Text></Text>
            <TextInput
              style={[st.fieldInput, { minHeight: 56 }]}
              value={address}
              onChangeText={setAddress}
              placeholder="1037 Hillcrest Road, Ridgewood, NJ 07450"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              multiline
            />

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
});
