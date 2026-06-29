import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '../../../lib/supabase';
import { useTeam } from '../../../hooks/useTeam';
import { useAuth } from '../../../hooks/useAuth';
import { sendTeamPush } from '../../../lib/push';
import { DUGOUT_COLORS } from '../../../constants/colors';
import { useClub } from '../../../hooks/useClub';
import { DateTimeSheet } from '../../../components/ui/DateTimeSheet';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';
if (!PLACES_KEY && __DEV__) {
  console.warn('[create-event] EXPO_PUBLIC_GOOGLE_PLACES_KEY is not set — location autocomplete will not work.');
}

type EventType = 'game' | 'training' | 'other';
type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';
type MonthlyMode = 'date' | 'weekday';
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

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ─── Utilities ────────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

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

function ordinalWeekdayLabel(d: Date): string {
  const nth = Math.ceil(d.getDate() / 7);
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${ordinals[nth - 1] ?? nth + 'th'} ${days[d.getDay()]}`;
}

function generateRecurringDates(
  start: Date,
  recurrence: RecurrenceType,
  weekDays: number[],
  monthlyMode: MonthlyMode,
  endMode: 'never' | 'date',
  endDate: Date,
): string[] {
  if (recurrence === 'none') return [];

  const limit = endMode === 'never'
    ? new Date(start.getFullYear(), start.getMonth() + 6, start.getDate())
    : endDate;

  const dates: string[] = [];
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1); // skip start date (already the first event)

  if (recurrence === 'daily') {
    while (cursor <= limit && dates.length < 365) {
      dates.push(toDbDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (recurrence === 'weekly') {
    const days = weekDays.length > 0 ? weekDays : [start.getDay()];
    while (cursor <= limit && dates.length < 365) {
      if (days.includes(cursor.getDay())) dates.push(toDbDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (recurrence === 'monthly') {
    if (monthlyMode === 'date') {
      const dayNum = start.getDate();
      cursor.setDate(1);
      cursor.setMonth(cursor.getMonth() + 1);
      while (dates.length < 12) {
        const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), dayNum);
        if (candidate > limit) break;
        if (candidate.getMonth() === cursor.getMonth()) dates.push(toDbDate(candidate));
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      const nth = Math.ceil(start.getDate() / 7);
      const weekday = start.getDay();
      cursor.setDate(1);
      cursor.setMonth(cursor.getMonth() + 1);
      while (dates.length < 12) {
        const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const firstDay = firstOfMonth.getDay();
        const offset = (weekday - firstDay + 7) % 7 + (nth - 1) * 7;
        const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), 1 + offset);
        if (candidate > limit) break;
        if (candidate.getMonth() === cursor.getMonth()) dates.push(toDbDate(candidate));
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  }

  return dates;
}

// ─── PickerSheet ─────────────────────────────────────────────────────────────

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
}: {
  onResult: (r: { name: string; address?: string; lat?: number; lng?: number }) => void;
}) {
  const { primaryColor } = useClub();
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [fetching, setFetching] = useState(false);
  const [pinned, setPinned] = useState(false);
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
    if (!PLACES_KEY) { setSuggestions([]); return; }
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

export default function CreateEventScreen() {
  const { primaryColor, rgba } = useClub();
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { team } = useTeam();
  const { profile } = useAuth();

  // Event basics
  const [eventType, setEventType] = useState<EventType>('training');
  const [title, setTitle] = useState('');
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home');

  // Date & time
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hasTime, setHasTime] = useState(true);
  const [startTime, setStartTime] = useState(() => {
    const d = new Date(); d.setHours(10, 0, 0, 0); return d;
  });
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

  // Recurrence
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none');
  const [weekDays, setWeekDays] = useState<number[]>(() => [new Date().getDay()]);
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>('date');
  const [endMode, setEndMode] = useState<'never' | 'date'>('never');
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 3); return d;
  });
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const [saving, setSaving] = useState(false);

  function toggleWeekDay(day: number) {
    setWeekDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSave() {
    if (!title.trim() || !team) return;
    setSaving(true);

    const eventDate = toDbDate(date);
    const eventTime = hasTime ? toDbTime(startTime) : null;

    function computeLockAt(dateStr: string): string | null {
      if (!requireRsvp || !eventTime) return null;
      const dt = new Date(`${dateStr}T${eventTime}:00`);
      dt.setHours(dt.getHours() - rsvpLockHours); // 0 = lock at event start
      return dt.toISOString();
    }

    const savedTitle = eventType === 'game'
      ? `${homeAway === 'home' ? 'vs' : '@'} ${title.trim()}`
      : title.trim();

    const base = {
      team_id: team.id,
      title: savedTitle,
      type: eventType,
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
      created_by: profile?.id,
    };

    let newEventId: string | undefined;

    if (recurrence === 'none') {
      const { data: created } = await supabase.from('events').insert({
        ...base,
        event_date: eventDate,
        rsvp_lock_at: computeLockAt(eventDate),
      }).select('id').single();
      newEventId = created?.id;
    } else {
      const recurDates = generateRecurringDates(date, recurrence, weekDays, monthlyMode, endMode, endDate);
      const allDates = [eventDate, ...recurDates];
      const recurrenceId = uuid();

      const rows = allDates.map((d) => ({
        ...base,
        event_date: d,
        recurrence_id: recurrenceId,
        rsvp_lock_at: computeLockAt(d),
      }));

      for (let i = 0; i < rows.length; i += 50) {
        const { data: created } = await supabase.from('events').insert(rows.slice(i, i + 50)).select('id');
        if (i === 0 && created?.[0]) newEventId = created[0].id;
      }
    }

    sendTeamPush({
      teamId: team.id,
      title: '📅 New event added',
      body: `${savedTitle} — ${fmtDate(date)}`,
      excludeProfileId: profile?.id,
      data: { type: 'new_event', event_id: newEventId },
    });

    setSaving(false);
    router.back();
  }

  const canSave = title.trim().length > 0 && !saving;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={DUGOUT_COLORS.ui.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Event</Text>
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
        keyboardVerticalOffset={0}
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
                autoFocus
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
            {/* Venue name */}
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
            {/* Address autocomplete */}
            <View style={styles.locationInputRow}>
              <SmartLocationInput
                onResult={(r) => {
                  if (!locationName) setLocationName(r.name);
                  setAddress(r.address ?? '');
                  setLat(r.lat ?? null);
                  setLng(r.lng ?? null);
                }}
              />
            </View>
            <RowDivider />
            {/* Field notes */}
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

          {/* ── Recurrence ──────────────────────────────── */}
          <SectionHeader title="Repeat" />
          <Card>
            <View style={styles.typeRow}>
              {(['none', 'daily', 'weekly', 'monthly'] as RecurrenceType[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.typeChip, recurrence === r && [styles.typeChipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                  onPress={() => setRecurrence(r)}
                >
                  <Text style={[styles.typeChipText, recurrence === r && [styles.typeChipTextActive, { color: primaryColor }]]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {recurrence === 'weekly' && (
              <>
                <RowDivider />
                <View style={styles.daysRow}>
                  {DAYS.map((d, i) => {
                    const active = weekDays.includes(i);
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[styles.dayChip, active && [styles.dayChipActive, { backgroundColor: primaryColor, borderColor: primaryColor }]]}
                        onPress={() => toggleWeekDay(i)}
                      >
                        <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {recurrence === 'monthly' && (
              <>
                <RowDivider />
                <View style={{ padding: 16, gap: 12 }}>
                  {([
                    { mode: 'date' as MonthlyMode, label: `On the ${date.getDate()}th of each month` },
                    { mode: 'weekday' as MonthlyMode, label: `On the ${ordinalWeekdayLabel(date)} of each month` },
                  ]).map(({ mode, label }) => (
                    <TouchableOpacity
                      key={mode}
                      style={styles.radioRow}
                      onPress={() => setMonthlyMode(mode)}
                    >
                      <View style={[styles.radioOuter, monthlyMode === mode && [styles.radioOuterActive, { borderColor: primaryColor }]]}>
                        {monthlyMode === mode && <View style={[styles.radioInner, { backgroundColor: primaryColor }]} />}
                      </View>
                      <Text style={styles.radioLabel}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {recurrence !== 'none' && (
              <>
                <RowDivider />
                <FieldRow icon="flag-outline" label="Ends">
                  <View style={styles.chipRow}>
                    {([
                      { key: 'never', label: 'Never' },
                      { key: 'date', label: 'On date' },
                    ] as const).map(({ key, label }) => (
                      <TouchableOpacity
                        key={key}
                        style={[styles.chip, endMode === key && [styles.chipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                        onPress={() => setEndMode(key)}
                      >
                        <Text style={[styles.chipText, endMode === key && [styles.chipTextActive, { color: primaryColor }]]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </FieldRow>

                {endMode === 'date' && (
                  <>
                    <RowDivider />
                    <FieldRow
                      icon="calendar-outline"
                      label="End date"
                      onPress={() => setShowEndDatePicker(true)}
                    >
                      <ValueText v={fmtDate(endDate)} color={primaryColor} />
                    </FieldRow>
                  </>
                )}
              </>
            )}
          </Card>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date / time sheets */}
      <DateTimeSheet
        visible={showDatePicker}
        mode="date"
        value={date}
        minimumDate={new Date()}
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
      <DateTimeSheet
        visible={showEndDatePicker}
        mode="date"
        value={endDate}
        minimumDate={date}
        title="Select end date"
        onConfirm={setEndDate}
        onClose={() => setShowEndDatePicker(false)}
      />

      {/* List picker sheets */}
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
  typeChipActive: { borderColor: DUGOUT_COLORS.brand.green, backgroundColor: 'rgba(34,197,94,0.12)' },
  typeChipText: { fontSize: 13, fontWeight: '600', color: DUGOUT_COLORS.ui.textSecondary },
  typeChipTextActive: { color: DUGOUT_COLORS.brand.green },

  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 },
  titlePrefix: {
    fontSize: 18, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, marginRight: 6,
  },
  titleInput: {
    flex: 1, fontSize: 18, fontWeight: '700', color: DUGOUT_COLORS.ui.text,
    paddingVertical: 12,
  },

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
  locationInputRow: {
    paddingHorizontal: 16, paddingVertical: 12,
  },
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
  suggestionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12,
  },
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

  notesRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  notesInput: {
    color: DUGOUT_COLORS.ui.text, fontSize: 14, marginTop: 6,
    minHeight: 70, textAlignVertical: 'top',
  },
  coachOnlyTag: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, fontStyle: 'italic' },

  daysRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 12, gap: 6,
  },
  dayChip: {
    flex: 1, aspectRatio: 1, borderRadius: 8,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dayChipActive: { backgroundColor: DUGOUT_COLORS.brand.green, borderColor: DUGOUT_COLORS.brand.green },
  dayChipText: { fontSize: 12, fontWeight: '700', color: DUGOUT_COLORS.ui.muted },
  dayChipTextActive: { color: '#000' },

  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: DUGOUT_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: DUGOUT_COLORS.brand.green },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: DUGOUT_COLORS.brand.green },
  radioLabel: { flex: 1, fontSize: 14, color: DUGOUT_COLORS.ui.text },

  homeAwayRow: {
    flexDirection: 'row', gap: 10, padding: 12,
  },
  homeAwayTile: {
    flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 12,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
  },
  homeAwayTileActive: {
    borderColor: DUGOUT_COLORS.brand.green,
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  homeAwayLabel: {
    fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.muted,
  },
  homeAwayLabelActive: { color: DUGOUT_COLORS.brand.green },

});
