import { useEffect, useRef, useState } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { DUGOUT_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import { sendTeamPush } from '../../../../lib/push';
import { DateTimeSheet } from '../../../../components/ui/DateTimeSheet';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

type EventType = 'game' | 'training' | 'other';
type UniformOption = 'home' | 'away' | 'training';
type FieldOption = 'turf' | 'grass';

const TYPE_CONFIG: Record<EventType, { label: string; color: string; bg: string }> = {
  game:     { label: 'Game',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  training: { label: 'Training', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  other:    { label: 'Other',    color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
};

const DURATION_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const mins = (i + 1) * 5;
  const h = Math.floor(mins / 60), m = mins % 60;
  return {
    label: h > 0 && m > 0 ? `${h}h ${m}min` : h > 0 ? `${h}h` : `${m}min`,
    value: mins,
  };
});

const ARRIVAL_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  label: `${(i + 1) * 5} min before`,
  value: (i + 1) * 5,
}));

const RSVP_LOCK_OPTIONS = [
  { label: 'At event start', value: 0 },
  { label: '12 hrs before', value: 12 },
  { label: '24 hrs before', value: 24 },
  { label: '48 hrs before', value: 48 },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function toDbDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDbTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 && m > 0 ? `${h}h ${m}min` : h > 0 ? `${h}h` : `${m}min`;
}

function parseGameTitle(title: string): { homeAway: 'home' | 'away'; opponent: string } {
  if (title.startsWith('vs ')) return { homeAway: 'home', opponent: title.slice(3) };
  if (title.startsWith('@ '))  return { homeAway: 'away', opponent: title.slice(2) };
  return { homeAway: 'home', opponent: title };
}

function computeLockHours(rsvpLockAt: string | null, eventDate: string, eventTime: string | null): number {
  if (!rsvpLockAt || !eventTime) return 24;
  const lockAt = new Date(rsvpLockAt);
  const eventAt = new Date(`${eventDate}T${eventTime}:00`);
  const diffHours = Math.round((eventAt.getTime() - lockAt.getTime()) / 3600000);
  if (diffHours <= 0)  return 0;
  if (diffHours <= 12) return 12;
  if (diffHours <= 24) return 24;
  return 48;
}

// ─── PickerSheet ──────────────────────────────────────────────────────────────

function PickerSheet({
  visible, title, options, value, onChange, onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: number }[];
  value: number;
  onChange: (v: number) => void;
  onClose: () => void;
}) {
  const { primaryColor, rgba } = useClub();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ps.overlay} activeOpacity={1} onPress={onClose} />
      <View style={ps.sheet}>
        <View style={ps.handle} />
        <Text style={ps.title}>{title}</Text>
        <FlatList
          data={options}
          keyExtractor={(o) => String(o.value)}
          style={{ maxHeight: 320 }}
          initialScrollIndex={Math.max(0, options.findIndex((o) => o.value === value))}
          getItemLayout={(_, i) => ({ length: 52, offset: 52 * i, index: i })}
          renderItem={({ item }) => {
            const sel = item.value === value;
            return (
              <TouchableOpacity
                style={[ps.row, sel && [ps.rowSelected, { backgroundColor: rgba(0.08) }]]}
                onPress={() => { onChange(item.value); onClose(); }}
              >
                <Text style={[ps.rowText, sel && [ps.rowTextSelected, { color: primaryColor }]]}>{item.label}</Text>
                {sel && <Ionicons name="checkmark" size={18} color={primaryColor} />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const ps = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, backgroundColor: DUGOUT_COLORS.ui.border,
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  title: {
    fontSize: 16, fontWeight: '700', color: DUGOUT_COLORS.ui.text,
    padding: 16, borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, height: 52,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
  },
  rowSelected: { backgroundColor: 'rgba(34,197,94,0.08)' },
  rowText: { fontSize: 15, color: DUGOUT_COLORS.ui.text },
  rowTextSelected: { color: DUGOUT_COLORS.brand.green, fontWeight: '700' },
});

// ─── Smart Location Input ─────────────────────────────────────────────────────

type PlaceSuggestion = { place_id: string; description: string };

function SmartLocationInput({
  onResult,
  initialValue = '',
}: {
  onResult: (r: { name: string; address?: string; lat?: number; lng?: number }) => void;
  initialValue?: string;
}) {
  const { primaryColor } = useClub();
  const [text, setText] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [fetching, setFetching] = useState(false);
  const [pinned, setPinned] = useState(!!initialValue);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleChange(val: string) {
    setText(val);
    setPinned(false);
    onResult({ name: val });
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 3) { setSuggestions([]); return; }
    timer.current = setTimeout(() => search(val), 350);
  }

  async function search(val: string) {
    setFetching(true);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(val)}&key=${PLACES_KEY}&types=geocode`
      );
      const json = await res.json();
      setSuggestions((json.predictions ?? []).slice(0, 5));
    } catch { setSuggestions([]); }
    setFetching(false);
  }

  async function pick(s: PlaceSuggestion) {
    setText(s.description);
    setPinned(true);
    setSuggestions([]);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${s.place_id}&fields=geometry&key=${PLACES_KEY}`
      );
      const json = await res.json();
      const loc = json.result?.geometry?.location;
      onResult({ name: s.description, address: s.description, lat: loc?.lat, lng: loc?.lng });
    } catch {
      onResult({ name: s.description, address: s.description });
    }
  }

  function clear() {
    setText(''); setSuggestions([]); setPinned(false);
    onResult({ name: '' });
  }

  return (
    <View style={{ zIndex: 20 }}>
      <View style={styles.inputRow}>
        <Ionicons
          name={pinned ? 'location' : 'location-outline'}
          size={16}
          color={pinned ? primaryColor : DUGOUT_COLORS.ui.muted}
        />
        <TextInput
          style={styles.inlineInput}
          value={text}
          onChangeText={handleChange}
          placeholder="Location name or address…"
          placeholderTextColor={DUGOUT_COLORS.ui.muted}
          returnKeyType="search"
        />
        {fetching && <ActivityIndicator size="small" color={DUGOUT_COLORS.ui.muted} />}
        {text.length > 0 && !fetching && (
          <TouchableOpacity onPress={clear}>
            <Ionicons name="close-circle" size={16} color={DUGOUT_COLORS.ui.muted} />
          </TouchableOpacity>
        )}
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={s.place_id}
              style={[styles.suggestionRow, i < suggestions.length - 1 && styles.suggestionBorder]}
              onPress={() => pick(s)}
            >
              <Ionicons name="location-outline" size={14} color={DUGOUT_COLORS.ui.muted} />
              <Text style={styles.suggestionText} numberOfLines={2}>{s.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Section helpers ──────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title.toUpperCase()}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

function FieldRow({
  icon, label, onPress, children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const inner = (
    <View style={styles.fieldRow}>
      <View style={styles.fieldRowLeft}>
        <Ionicons name={icon} size={17} color={DUGOUT_COLORS.ui.muted} style={styles.fieldIcon} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <View style={styles.fieldRowRight}>{children}</View>
    </View>
  );
  if (onPress) return <TouchableOpacity activeOpacity={0.7} onPress={onPress}>{inner}</TouchableOpacity>;
  return inner;
}

function ValueText({ v, color }: { v: string; color?: string }) {
  return <Text style={[styles.fieldValue, color ? { color } : undefined]}>{v}</Text>;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function EditEventScreen() {
  const { primaryColor, rgba } = useClub();
  const router = useRouter();
  const { clubSlug, eventId } = useLocalSearchParams<{ clubSlug: string; eventId: string }>();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [eventTeamId, setEventTeamId] = useState<string | null>(null);

  // Event basics
  const [eventType, setEventType] = useState<EventType>('training');
  const [title, setTitle] = useState('');
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home');

  // Date & time
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hasTime, setHasTime] = useState(false);
  const [startTime, setStartTime] = useState(() => { const d = new Date(); d.setHours(10, 0, 0, 0); return d; });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [arrival, setArrival] = useState<number | null>(null);
  const [showArrivalPicker, setShowArrivalPicker] = useState(false);

  // Location
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [fieldType, setFieldType] = useState<FieldOption | null>(null);
  const [fieldNotes, setFieldNotes] = useState('');

  // Details
  const [uniform, setUniform] = useState<UniformOption | null>(null);
  const [playerNotes, setPlayerNotes] = useState('');
  const [coachNotes, setCoachNotes] = useState('');
  const [requireRsvp, setRequireRsvp] = useState(true);
  const [rsvpLockHours, setRsvpLockHours] = useState(24);

  // For SmartLocationInput remount when data loads
  const [locationKey, setLocationKey] = useState(0);

  useEffect(() => {
    if (eventId) loadEvent();
  }, [eventId]);

  async function loadEvent() {
    const { data } = await supabase
      .from('events')
      .select('id,title,type,event_date,event_time,location,address,lat,lng,duration_minutes,arrival_buffer_minutes,field_type,field_notes,uniform,notes,coach_notes,require_rsvp,rsvp_lock_at,team_id')
      .eq('id', eventId)
      .single();
    if (data) setEventTeamId((data as any).team_id ?? null);

    if (!data) { setLoading(false); return; }

    setEventType(data.type as EventType);

    if (data.type === 'game') {
      const { homeAway: ha, opponent } = parseGameTitle(data.title);
      setHomeAway(ha);
      setTitle(opponent);
    } else {
      setTitle(data.title);
    }

    const d = new Date(data.event_date + 'T00:00:00');
    setDate(d);

    if (data.event_time) {
      const [h, m] = data.event_time.split(':').map(Number);
      const t = new Date(); t.setHours(h, m, 0, 0);
      setStartTime(t);
      setHasTime(true);
    }

    setDuration(data.duration_minutes ?? null);
    setArrival(data.arrival_buffer_minutes ?? null);
    setLocationName(data.location ?? '');
    setAddress(data.address ?? '');
    setLat(data.lat ?? null);
    setLng(data.lng ?? null);
    setFieldType((data.field_type as FieldOption) ?? null);
    setFieldNotes(data.field_notes ?? '');
    setUniform((data.uniform as UniformOption) ?? null);
    setPlayerNotes(data.notes ?? '');
    setCoachNotes(data.coach_notes ?? '');
    setRequireRsvp(data.require_rsvp ?? true);
    setRsvpLockHours(computeLockHours(data.rsvp_lock_at, data.event_date, data.event_time));

    setLocationKey(k => k + 1);
    setLoading(false);
  }

  async function handleSave() {
    if (!title.trim() || !eventId) return;
    setSaving(true);

    const eventDate = toDbDate(date);
    const eventTime = hasTime ? toDbTime(startTime) : null;

    function computeLockAt(): string | null {
      if (!requireRsvp || !eventTime) return null;
      const dt = new Date(`${eventDate}T${eventTime}:00`);
      dt.setHours(dt.getHours() - rsvpLockHours);
      return dt.toISOString();
    }

    const savedTitle = eventType === 'game'
      ? `${homeAway === 'home' ? 'vs' : '@'} ${title.trim()}`
      : title.trim();

    await supabase.from('events').update({
      title: savedTitle,
      type: eventType,
      event_date: eventDate,
      event_time: eventTime,
      duration_minutes: duration ?? null,
      arrival_buffer_minutes: arrival ?? null,
      location: locationName.trim() || null,
      address: address || null,
      lat: lat ?? null,
      lng: lng ?? null,
      field_type: fieldType ?? null,
      field_notes: fieldNotes.trim() || null,
      uniform: uniform ?? null,
      notes: playerNotes.trim() || null,
      coach_notes: coachNotes.trim() || null,
      require_rsvp: requireRsvp,
      rsvp_lock_at: computeLockAt(),
    }).eq('id', eventId);

    if (eventTeamId) {
      sendTeamPush({
        teamId: eventTeamId,
        title: 'Schedule updated',
        body: `${savedTitle} has been updated`,
        excludeProfileId: profile?.id,
        data: { type: 'schedule_change', event_id: eventId },
      });
    }
    setSaving(false);
    router.back();
  }

  function confirmDelete() {
    Alert.alert('Delete Event', 'Delete this event? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: handleDelete },
    ]);
  }

  async function handleDelete() {
    setDeleting(true);
    await supabase.from('events').delete().eq('id', eventId);
    router.back();
    router.back(); // pop both edit and detail
  }

  const canSave = title.trim().length > 0 && !saving;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={DUGOUT_COLORS.ui.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Event</Text>
        <TouchableOpacity
          style={[styles.headerSaveBtn, { backgroundColor: primaryColor }, !canSave && { opacity: 0.4 }]}
          onPress={handleSave}
          disabled={!canSave}
        >
          {saving
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={styles.headerSaveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Event Info ──────────────────────────────── */}
          <SectionHeader title="Event" />
          <Card>
            <View style={styles.typeRow}>
              {(['game', 'training', 'other'] as EventType[]).map((t) => {
                const cfg = TYPE_CONFIG[t];
                const active = eventType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, active && { borderColor: cfg.color, backgroundColor: cfg.bg }]}
                    onPress={() => setEventType(t)}
                  >
                    <Text style={[styles.typeChipText, active && { color: cfg.color }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {eventType === 'game' && (
              <>
                <RowDivider />
                <View style={styles.homeAwayRow}>
                  <TouchableOpacity
                    style={[styles.homeAwayTile, homeAway === 'home' && [styles.homeAwayTileActive, { borderColor: primaryColor, backgroundColor: rgba(0.1) }]]}
                    onPress={() => setHomeAway('home')}
                  >
                    <Text style={[styles.homeAwayLabel, homeAway === 'home' && [styles.homeAwayLabelActive, { color: primaryColor }]]}>Home</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.homeAwayTile, homeAway === 'away' && [styles.homeAwayTileActive, { borderColor: primaryColor, backgroundColor: rgba(0.1) }]]}
                    onPress={() => setHomeAway('away')}
                  >
                    <Text style={[styles.homeAwayLabel, homeAway === 'away' && [styles.homeAwayLabelActive, { color: primaryColor }]]}>Away</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <RowDivider />
            <View style={styles.titleRow}>
              {eventType === 'game' && (
                <Text style={styles.titlePrefix}>{homeAway === 'home' ? 'vs' : '@'}</Text>
              )}
              <TextInput
                style={styles.titleInput}
                value={title}
                onChangeText={setTitle}
                placeholder={eventType === 'game' ? 'Opponent…' : 'Event title…'}
                placeholderTextColor={DUGOUT_COLORS.ui.muted}
                returnKeyType="done"
              />
            </View>
          </Card>

          {/* ── Date & Time ─────────────────────────────── */}
          <SectionHeader title="Date & Time" />
          <Card>
            <FieldRow icon="calendar-outline" label="Date" onPress={() => setShowDatePicker(true)}>
              <ValueText v={fmtDate(date)} color={primaryColor} />
            </FieldRow>

            <RowDivider />
            <FieldRow
              icon="time-outline"
              label="Start time"
              onPress={() => { setHasTime(true); setShowTimePicker(true); }}
            >
              <View style={styles.fieldRowActions}>
                <ValueText v={hasTime ? fmtTime(startTime) : 'No time'} color={primaryColor} />
                {hasTime && (
                  <TouchableOpacity onPress={() => setHasTime(false)} style={{ marginLeft: 8 }}>
                    <Ionicons name="close-circle" size={16} color={DUGOUT_COLORS.ui.muted} />
                  </TouchableOpacity>
                )}
              </View>
            </FieldRow>

            <RowDivider />
            <FieldRow icon="hourglass-outline" label="Duration" onPress={() => setShowDurationPicker(true)}>
              <View style={styles.fieldRowActions}>
                <Text style={duration !== null ? [styles.fieldValue, { color: primaryColor }] : styles.fieldValueMuted}>
                  {duration !== null ? fmtDuration(duration) : '—'}
                </Text>
                {duration !== null && (
                  <TouchableOpacity onPress={() => setDuration(null)} style={{ marginLeft: 8 }}>
                    <Ionicons name="close-circle" size={16} color={DUGOUT_COLORS.ui.muted} />
                  </TouchableOpacity>
                )}
              </View>
            </FieldRow>

            <RowDivider />
            <FieldRow icon="walk-outline" label="Arrive" onPress={() => setShowArrivalPicker(true)}>
              <View style={styles.fieldRowActions}>
                <Text style={arrival !== null ? [styles.fieldValue, { color: primaryColor }] : styles.fieldValueMuted}>
                  {arrival !== null ? `${arrival} min before` : '—'}
                </Text>
                {arrival !== null && (
                  <TouchableOpacity onPress={() => setArrival(null)} style={{ marginLeft: 8 }}>
                    <Ionicons name="close-circle" size={16} color={DUGOUT_COLORS.ui.muted} />
                  </TouchableOpacity>
                )}
              </View>
            </FieldRow>
          </Card>

          {/* ── Location ────────────────────────────────── */}
          <SectionHeader title="Location" />
          <Card>
            <View style={styles.locationNameRow}>
              <Ionicons name="business-outline" size={17} color={DUGOUT_COLORS.ui.muted} style={styles.fieldIcon} />
              <TextInput
                style={styles.inlineInput}
                value={locationName}
                onChangeText={setLocationName}
                placeholder="Venue name (e.g. City Park)"
                placeholderTextColor={DUGOUT_COLORS.ui.muted}
                returnKeyType="next"
              />
            </View>
            <RowDivider />
            <View style={styles.locationInputRow}>
              <SmartLocationInput
                key={locationKey}
                initialValue={address}
                onResult={(r) => {
                  if (!locationName) setLocationName(r.name);
                  setAddress(r.address ?? '');
                  setLat(r.lat ?? null);
                  setLng(r.lng ?? null);
                }}
              />
            </View>
            <RowDivider />
            <View style={styles.locationNameRow}>
              <Ionicons name="create-outline" size={17} color={DUGOUT_COLORS.ui.muted} style={styles.fieldIcon} />
              <TextInput
                style={styles.inlineInput}
                value={fieldNotes}
                onChangeText={setFieldNotes}
                placeholder="Field details (e.g. Field 1, Pitch B)"
                placeholderTextColor={DUGOUT_COLORS.ui.muted}
                returnKeyType="next"
              />
            </View>
            <RowDivider />
            <FieldRow icon="layers-outline" label="Surface">
              <View style={styles.chipRow}>
                {(['turf', 'grass'] as FieldOption[]).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.chip, fieldType === f && [styles.chipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                    onPress={() => setFieldType(fieldType === f ? null : f)}
                  >
                    <Text style={[styles.chipText, fieldType === f && [styles.chipTextActive, { color: primaryColor }]]}>
                      {f === 'turf' ? 'Turf' : 'Grass'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FieldRow>
          </Card>

          {/* ── Details ─────────────────────────────────── */}
          <SectionHeader title="Details" />
          <Card>
            <FieldRow icon="shirt-outline" label="Uniform">
              <View style={styles.chipRow}>
                {(['home', 'away', 'training'] as UniformOption[]).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.chip, uniform === u && [styles.chipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                    onPress={() => setUniform(uniform === u ? null : u)}
                  >
                    <Text style={[styles.chipText, uniform === u && [styles.chipTextActive, { color: primaryColor }]]}>
                      {u.charAt(0).toUpperCase() + u.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FieldRow>

            <RowDivider />
            <View style={styles.notesRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={17} color={DUGOUT_COLORS.ui.muted} style={styles.fieldIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Team message</Text>
                <TextInput
                  style={styles.notesInput}
                  value={playerNotes}
                  onChangeText={setPlayerNotes}
                  placeholder="Visible to all players and parents…"
                  placeholderTextColor={DUGOUT_COLORS.ui.muted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            <RowDivider />
            <View style={styles.notesRow}>
              <Ionicons name="lock-closed-outline" size={17} color={DUGOUT_COLORS.ui.muted} style={styles.fieldIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Coach notes <Text style={styles.coachOnlyTag}>(coach only)</Text></Text>
                <TextInput
                  style={styles.notesInput}
                  value={coachNotes}
                  onChangeText={setCoachNotes}
                  placeholder="Notes for coaching staff…"
                  placeholderTextColor={DUGOUT_COLORS.ui.muted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            <RowDivider />
            <FieldRow icon="checkmark-circle-outline" label="Require RSVP">
              <Switch
                value={requireRsvp}
                onValueChange={setRequireRsvp}
                trackColor={{ false: DUGOUT_COLORS.ui.border, true: primaryColor }}
                thumbColor="#fff"
              />
            </FieldRow>

            {requireRsvp && (
              <>
                <RowDivider />
                <FieldRow icon="timer-outline" label="RSVP closes">
                  <View style={styles.chipRow}>
                    {RSVP_LOCK_OPTIONS.map((o) => (
                      <TouchableOpacity
                        key={o.value}
                        style={[styles.chip, rsvpLockHours === o.value && [styles.chipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                        onPress={() => setRsvpLockHours(o.value)}
                      >
                        <Text style={[styles.chipText, rsvpLockHours === o.value && [styles.chipTextActive, { color: primaryColor }]]}>
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </FieldRow>
              </>
            )}
          </Card>

          {/* ── Delete ──────────────────────────────────── */}
          <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} disabled={deleting}>
            {deleting
              ? <ActivityIndicator size="small" color="#EF4444" />
              : <>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={styles.deleteBtnText}>Delete Event</Text>
                </>
            }
          </TouchableOpacity>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date / time sheets */}
      <DateTimeSheet
        visible={showDatePicker}
        mode="date"
        value={date}
        title="Select date"
        onConfirm={setDate}
        onClose={() => setShowDatePicker(false)}
      />
      <DateTimeSheet
        visible={showTimePicker}
        mode="time"
        value={startTime}
        minuteInterval={5}
        title="Select start time"
        onConfirm={setStartTime}
        onClose={() => setShowTimePicker(false)}
      />

      <PickerSheet
        visible={showDurationPicker}
        title="Duration"
        options={DURATION_OPTIONS}
        value={duration ?? 90}
        onChange={setDuration}
        onClose={() => setShowDurationPicker(false)}
      />
      <PickerSheet
        visible={showArrivalPicker}
        title="Arrive how early?"
        options={ARRIVAL_OPTIONS}
        value={arrival ?? 15}
        onChange={setArrival}
        onClose={() => setShowArrivalPicker(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DUGOUT_COLORS.ui.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.background,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  headerSaveBtn: {
    backgroundColor: DUGOUT_COLORS.brand.green,
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
  },
  headerSaveBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },

  scroll: { paddingHorizontal: 16, paddingTop: 20 },

  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.ui.muted,
    letterSpacing: 1, marginBottom: 8, marginTop: 4,
  },

  card: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16, marginBottom: 20, overflow: 'hidden',
  },

  rowDivider: { height: 1, backgroundColor: DUGOUT_COLORS.ui.border },

  typeRow: { flexDirection: 'row', padding: 12, gap: 8, flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
  },
  typeChipText: { fontSize: 13, fontWeight: '600', color: DUGOUT_COLORS.ui.textSecondary },

  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 },
  titlePrefix: { fontSize: 18, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, marginRight: 6 },
  titleInput: {
    flex: 1, fontSize: 18, fontWeight: '700', color: DUGOUT_COLORS.ui.text,
    paddingVertical: 12,
  },

  homeAwayRow: { flexDirection: 'row', gap: 10, padding: 12 },
  homeAwayTile: {
    flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 12,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
  },
  homeAwayTileActive: { borderColor: DUGOUT_COLORS.brand.green, backgroundColor: 'rgba(34,197,94,0.1)' },
  homeAwayLabel: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.muted },
  homeAwayLabelActive: { color: DUGOUT_COLORS.brand.green },

  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 52, gap: 20,
  },
  fieldRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldRowRight: { flex: 1, alignItems: 'flex-end' },
  fieldRowActions: { flexDirection: 'row', alignItems: 'center' },
  fieldIcon: { width: 24 },
  fieldLabel: { fontSize: 14, color: DUGOUT_COLORS.ui.text, fontWeight: '500' },
  fieldValue: { fontSize: 14, color: DUGOUT_COLORS.brand.green, fontWeight: '600' },
  fieldValueMuted: { fontSize: 14, color: DUGOUT_COLORS.ui.muted, fontWeight: '400' },

  locationNameRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  locationInputRow: { paddingHorizontal: 16, paddingVertical: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
  },
  inlineInput: { flex: 1, color: DUGOUT_COLORS.ui.text, fontSize: 14 },
  suggestionBox: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 10, marginTop: 4, overflow: 'hidden',
  },
  suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12 },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border },
  suggestionText: { flex: 1, fontSize: 13, color: DUGOUT_COLORS.ui.text, lineHeight: 18 },

  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
  },
  chipActive: { borderColor: DUGOUT_COLORS.brand.green, backgroundColor: 'rgba(34,197,94,0.12)' },
  chipText: { fontSize: 12, fontWeight: '600', color: DUGOUT_COLORS.ui.textSecondary },
  chipTextActive: { color: DUGOUT_COLORS.brand.green },

  notesRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  notesInput: {
    color: DUGOUT_COLORS.ui.text, fontSize: 14, marginTop: 6,
    minHeight: 70, textAlignVertical: 'top',
  },
  coachOnlyTag: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, fontStyle: 'italic' },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  deleteBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
});
