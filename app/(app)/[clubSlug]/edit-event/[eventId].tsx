import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import { zonedTimeToUtc } from '../../../../lib/timezone';
import ClubHeader, { headerBtnStyle } from '../../../../components/ui/ClubHeader';
import { sendTeamPush } from '../../../../lib/push';
import { sendTeamEmail } from '../../../../lib/emailTeam';
import { DateTimeSheet } from '../../../../components/ui/DateTimeSheet';
import SmartLocationInput from '../../../../components/ui/SmartLocationInput';
import PickerSheet from '../../../../components/ui/PickerSheet';
import { DURATION_OPTIONS, ARRIVAL_OPTIONS } from '../../../../constants/eventTypes';

// ─── Constants ────────────────────────────────────────────────────────────────

type EventType = 'game' | 'training' | 'other';
type UniformOption = 'home' | 'away' | 'training';
type FieldOption = 'turf' | 'grass' | 'indoor';
// 'future' always starts at this occurrence's own original date and never
// reaches backward — past events are never touched by any bulk action.
type RecurringScope = 'this' | 'future';

const TYPE_CONFIG: Record<EventType, { label: string; color: string; bg: string }> = {
  game:     { label: 'Game',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  training: { label: 'Training', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  other:    { label: 'Other',    color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
};

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

function computeLockHours(rsvpLockAt: string | null, eventDate: string, eventTime: string | null, timezone: string): number {
  if (!rsvpLockAt || !eventTime) return 24;
  const lockAt = new Date(rsvpLockAt);
  try {
    // Postgres serializes `time` as "HH:MM:SS" — slice to "HH:MM" before
    // appending our own ":00", otherwise this builds an invalid date string
    // ("...T18:00:00:00"), diffHours comes out NaN, and every comparison
    // below silently falls through to the last bucket (48) regardless of
    // what's actually saved.
    const eventAt = zonedTimeToUtc(eventDate, `${eventTime.slice(0, 5)}:00`, timezone);
    const diffHours = Math.round((eventAt.getTime() - lockAt.getTime()) / 3600000);
    if (diffHours <= 0)  return 0;
    if (diffHours <= 12) return 12;
    if (diffHours <= 24) return 24;
    return 48;
  } catch {
    return 24;
  }
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
        <Ionicons name={icon} size={17} color={PULSE_COLORS.ui.muted} style={styles.fieldIcon} />
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
  const { primaryColor, secondaryColor, onSecondary, rgba, timezone, clubName, logoUrl } = useClub();
  const router = useRouter();
  const { clubSlug, eventId } = useLocalSearchParams<{ clubSlug: string; eventId: string }>();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [eventTeamId, setEventTeamId] = useState<string | null>(null);
  const originalRef = useRef<{ date: string; time: string | null; location: string; videoUrl: string | null } | null>(null);

  // Multi-team occurrences (created via the web dashboard's multi-team
  // picker) share event_group_id across one row per team. Mobile had no
  // concept of this at all — editing/cancelling here only ever touched this
  // one row, silently leaving every other team's copy out of sync. Only
  // org_admins get to propagate (mirrors web); a coach always edits just
  // their own team's row.
  const [eventGroupId, setEventGroupId] = useState<string | null>(null);
  const [linkedTeams, setLinkedTeams] = useState<{ id: string; name: string }[]>([]);
  const isOrgAdmin = profile?.role === 'org_admin';

  // Event basics
  const [eventType, setEventType] = useState<EventType>('training');
  const [title, setTitle] = useState('');
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home');
  // Tournament membership itself isn't reassignable from this generic edit
  // screen — tournamentId is display-only context, round_label is the only
  // editable field.
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [roundLabel, setRoundLabel] = useState('');
  // Only set for a DATED (weekend/round-robin) tournament — its games
  // centralize RSVP at the tournament level, so Require RSVP / RSVP lock no
  // longer apply per game. Undated (knockout) games are unaffected.
  const [tournamentStartDate, setTournamentStartDate] = useState<string | null>(null);

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
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [savedFields, setSavedFields] = useState<{ id: string; name: string; address: string | null; lat: number | null; lng: number | null }[]>([]);

  // Details
  const [uniform, setUniform] = useState<UniformOption | null>(null);
  const [playerNotes, setPlayerNotes] = useState('');
  const [coachNotes, setCoachNotes] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [requireRsvp, setRequireRsvp] = useState(true);
  const [rsvpLockHours, setRsvpLockHours] = useState(24);
  const [notifyParents, setNotifyParents] = useState(true);

  // For SmartLocationInput remount when data loads
  const [locationKey, setLocationKey] = useState(0);

  // Set only for events created as part of a recurring series (see
  // create-event.tsx's generateRecurringDates).
  const [recurrenceId, setRecurrenceId] = useState<string | null>(null);
  // Chosen once, up front, the moment we learn this event repeats — not
  // re-asked per action. Save/Delete/Cancel/Restore all just use whatever
  // was picked here for the rest of this screen visit. null = not decided
  // yet (recurring event, prompt still pending) or not applicable (a
  // plain one-off event defaults straight to 'this', no prompt at all).
  const [editScope, setEditScope] = useState<RecurringScope | null>(null);

  useEffect(() => {
    if (eventId) loadEvent();
  }, [eventId]);

  // Shared by the initial on-load prompt and the "Change" link in the
  // scope banner below — same choice, just re-openable if they change
  // their mind partway through editing.
  function promptEditScope(allowDismiss: boolean) {
    Alert.alert(
      'Edit Event',
      'This event repeats. Edit just this event, or this and every future occurrence too? Past events are never affected.',
      [
        { text: 'Cancel', style: 'cancel', onPress: allowDismiss ? undefined : () => router.back() },
        { text: 'This event', onPress: () => setEditScope('this') },
        { text: 'This and future events', onPress: () => setEditScope('future') },
      ]
    );
  }

  useEffect(() => {
    if (!recurrenceId || editScope) return;
    promptEditScope(false);
  }, [recurrenceId]);

  async function loadEvent() {
    const { data } = await supabase
      .from('events')
      .select('id,title,type,event_date,event_time,location,address,lat,lng,field_id,duration_minutes,arrival_buffer_minutes,field_type,field_notes,uniform,home_away,notes,coach_notes,video_url,require_rsvp,rsvp_lock_at,team_id,cancelled_at,recurrence_id,event_group_id,tournament_id,round_label,teams(club_id),tournaments(start_date)')
      .eq('id', eventId)
      .single();
    if (data) setEventTeamId((data as any).team_id ?? null);

    const groupId = (data as any)?.event_group_id ?? null;
    setEventGroupId(groupId);
    if (isOrgAdmin && groupId) {
      const { data: siblings } = await supabase
        .from('events')
        .select('team_id, teams(name)')
        .eq('event_group_id', groupId)
        .neq('id', eventId as string);
      setLinkedTeams(
        ((siblings ?? []) as any[]).map((s) => ({ id: s.team_id as string, name: (s.teams?.name as string) ?? 'another team' }))
      );
    } else {
      setLinkedTeams([]);
    }

    if (!data) { setLoading(false); return; }

    const clubId = ((data as any).teams as { club_id: string } | null)?.club_id;
    if (clubId) {
      supabase
        .from('tryout_fields')
        .select('id,name,address,lat,lng')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('sort_order')
        .then(({ data: fieldsData }) => setSavedFields((fieldsData ?? []) as typeof savedFields));
    }

    setEventType(data.type as EventType);

    if (data.type === 'game') {
      const { homeAway: ha, opponent } = parseGameTitle(data.title);
      setHomeAway((data.home_away as 'home' | 'away') ?? ha);
      setTitle(opponent);
    } else {
      setTitle(data.title);
    }

    setTournamentId((data as any).tournament_id ?? null);
    setRoundLabel((data as any).round_label ?? '');
    const tRaw = (data as any).tournaments;
    const tournamentJoin = Array.isArray(tRaw) ? tRaw[0] ?? null : tRaw ?? null;
    setTournamentStartDate(tournamentJoin?.start_date ?? null);

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
    setFieldId((data as any).field_id ?? null);
    setFieldType((data.field_type as FieldOption) ?? null);
    setFieldNotes(data.field_notes ?? '');
    setUniform((data.uniform as UniformOption) ?? null);
    setPlayerNotes(data.notes ?? '');
    setCoachNotes(data.coach_notes ?? '');
    setVideoUrl((data as any).video_url ?? '');
    setRequireRsvp(data.require_rsvp ?? true);
    setRsvpLockHours(computeLockHours(data.rsvp_lock_at, data.event_date, data.event_time, timezone));
    setIsCancelled(!!(data as any).cancelled_at);
    setRecurrenceId((data as any).recurrence_id ?? null);

    originalRef.current = {
      date: data.event_date,
      time: data.event_time ?? null,
      location: data.location ?? '',
      videoUrl: (data as any).video_url ?? null,
    };

    setLocationKey(k => k + 1);
    setLoading(false);
  }

  const isDatedTournamentGame = !!tournamentId && !!tournamentStartDate;

  async function handleSave(scope: RecurringScope) {
    if (!title.trim() || !eventId) return;
    setSaving(true);

    const eventDate = toDbDate(date);
    const eventTime = hasTime ? toDbTime(startTime) : null;

    function computeLockAtFor(dateStr: string): string | null {
      if (isDatedTournamentGame || !requireRsvp || !eventTime) return null;
      try {
        // Anchored to the club's own timezone, not this device's — see
        // create-event.tsx's computeLockAt for the full reasoning.
        const dt = zonedTimeToUtc(dateStr, `${eventTime}:00`, timezone);
        dt.setHours(dt.getHours() - rsvpLockHours);
        return dt.toISOString();
      } catch (err) {
        console.warn('[edit-event] could not compute rsvp_lock_at', err);
        return null;
      }
    }

    const savedTitle = eventType === 'game'
      ? `${homeAway === 'home' ? 'vs' : '@'} ${title.trim()}`
      : title.trim();

    // event_date is deliberately excluded — bulk-applying to future
    // occurrences only ever changes time-of-day and other details, never
    // collapses the series onto one date.
    const sharedFields = {
      title: savedTitle,
      type: eventType,
      event_time: eventTime,
      duration_minutes: duration ?? null,
      arrival_buffer_minutes: arrival ?? null,
      location: locationName.trim() || null,
      address: address || null,
      lat: lat ?? null,
      lng: lng ?? null,
      field_id: fieldId,
      field_type: fieldType ?? null,
      field_notes: fieldNotes.trim() || null,
      uniform: uniform ?? null,
      home_away: eventType === 'game' ? homeAway : null,
      notes: playerNotes.trim() || null,
      coach_notes: coachNotes.trim() || null,
      video_url: videoUrl.trim() || null,
      require_rsvp: requireRsvp,
      round_label: roundLabel.trim() || null,
    };

    // Combining cross-team propagation with the recurring "future" scope
    // is a rare, more complex combination not covered here — propagation
    // only applies to the single occurrence being edited right now.
    const propagateGroup = scope === 'this' && isOrgAdmin && !!eventGroupId && linkedTeams.length > 0;

    if (scope === 'this') {
      const updatePayload = {
        ...sharedFields,
        event_date: eventDate,
        rsvp_lock_at: computeLockAtFor(eventDate),
      };
      await (propagateGroup
        ? supabase.from('events').update(updatePayload).eq('event_group_id', eventGroupId)
        : supabase.from('events').update(updatePayload).eq('id', eventId));
    } else if (recurrenceId) {
      // rsvp_lock_at depends on each row's own date, so this can't be one
      // blanket update — fetch the affected rows and recompute it per row.
      // event_date/team_id are passed back unchanged (not actually
      // modified) just to satisfy upsert's insert-shaped row type.
      const thresholdDate = originalRef.current?.date ?? eventDate;
      const { data: rows } = await supabase
        .from('events')
        .select('id, event_date, team_id')
        .eq('recurrence_id', recurrenceId)
        .gte('event_date', thresholdDate);
      const upsertRows = (rows ?? []).map((r) => ({
        id: r.id,
        team_id: r.team_id,
        event_date: r.event_date,
        ...sharedFields,
        rsvp_lock_at: computeLockAtFor(r.event_date),
      }));
      if (upsertRows.length) await supabase.from('events').upsert(upsertRows);
    }

    if (eventTeamId && notifyParents) {
      if (scope === 'future') {
        sendTeamPush({
          teamId: eventTeamId,
          title: 'Schedule updated',
          body: `${savedTitle} — upcoming sessions updated`,
          excludeProfileId: profile?.id,
          data: { type: 'schedule_change', event_id: eventId },
        });
      } else {
        const orig = originalRef.current;
        let pushBody = `${savedTitle} has been updated`;
        if (orig) {
          const newDateStr = eventDate;
          const newTimeStr = eventTime;
          const newLocStr = locationName.trim();
          if (newDateStr !== orig.date) {
            pushBody = `${savedTitle} moved to ${fmtDate(date)}`;
          } else if (newTimeStr !== orig.time) {
            pushBody = `${savedTitle} time changed to ${hasTime ? fmtTime(startTime) : 'TBD'}`;
          } else if (newLocStr !== orig.location) {
            pushBody = `${savedTitle} location updated`;
          }
        }
        const notifyTeamIds = propagateGroup ? [eventTeamId, ...linkedTeams.map((t) => t.id)] : [eventTeamId];
        for (const teamId of notifyTeamIds) {
          sendTeamPush({
            teamId,
            title: 'Schedule updated',
            body: pushBody,
            excludeProfileId: profile?.id,
            data: { type: 'schedule_change', event_id: eventId },
          });
          // Extra push when a recording is newly added
          if (videoUrl.trim() && orig && !orig.videoUrl) {
            sendTeamPush({
              teamId,
              title: 'Recording available',
              body: `Watch the recording for ${savedTitle}`,
              excludeProfileId: profile?.id,
              data: { type: 'video_added', event_id: eventId },
            });
          }
        }
      }
    }
    setSaving(false);
    router.back();
  }

  // Both "this" and "future" scopes resolve to the same filter shape
  // below — future always starts at this occurrence's own original date,
  // so it naturally includes "this" without any separate logic.
  function recurringFilter(scope: RecurringScope) {
    return scope === 'this'
      ? { column: 'id' as const, value: eventId as string }
      : { column: 'recurrence_id' as const, value: recurrenceId as string, from: originalRef.current?.date ?? toDbDate(date) };
  }

  // "this"-scope group propagation only — see handleSave's comment on why
  // it never combines with the recurring "future" scope.
  function groupPropagates(scope: RecurringScope): boolean {
    return scope === 'this' && isOrgAdmin && !!eventGroupId && linkedTeams.length > 0;
  }

  function confirmDelete() {
    const scope = editScope ?? 'this';
    const propagateGroup = groupPropagates(scope);
    Alert.alert(
      'Delete Event',
      propagateGroup
        ? `This event is also scheduled for ${linkedTeams.map((t) => t.name).join(', ')}. Delete it for all of them? This cannot be undone.`
        : scope === 'future'
          ? 'Delete this event and every future occurrence? This cannot be undone.'
          : 'Delete this event? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(scope) },
      ]
    );
  }

  async function handleDelete(scope: RecurringScope) {
    setDeleting(true);
    const propagateGroup = groupPropagates(scope);
    const f = recurringFilter(scope);
    const base = supabase.from('events').delete();
    const { error } = propagateGroup
      ? await base.eq('event_group_id', eventGroupId as string)
      : f.column === 'id'
        ? await base.eq('id', f.value)
        : await base.eq('recurrence_id', f.value).gte('event_date', f.from!);
    if (error) {
      setDeleting(false);
      Alert.alert('Error', 'Could not delete event. Please try again.');
      return;
    }
    router.back();
    router.back(); // pop both edit and detail
  }

  function confirmCancel() {
    promptCancelReason(editScope ?? 'this');
  }

  function promptCancelReason(scope: RecurringScope) {
    const propagateGroup = groupPropagates(scope);
    Alert.prompt(
      'Cancel Event',
      propagateGroup
        ? `This event is also scheduled for ${linkedTeams.map((t) => t.name).join(', ')}. Add a reason for parents (optional) — this cancels it for all of them:`
        : scope === 'future'
          ? 'This will cancel this event and every future occurrence. Add a reason for parents (optional):'
          : 'Add a reason for parents (optional):',
      [
        { text: 'Keep Event', style: 'cancel' },
        { text: 'Cancel Event', style: 'destructive', onPress: (reason: string | undefined) => handleCancelEvent(reason ?? '', scope) },
      ],
      'plain-text',
      '',
    );
  }

  async function handleCancelEvent(reason: string, scope: RecurringScope) {
    if (!eventId) return;
    setCancelling(true);
    const propagateGroup = groupPropagates(scope);
    const payload = { cancelled_at: new Date().toISOString(), cancellation_reason: reason.trim() || null } as any;
    const f = recurringFilter(scope);
    const base = supabase.from('events').update(payload);
    const { error } = propagateGroup
      ? await base.eq('event_group_id', eventGroupId as string)
      : f.column === 'id'
        ? await base.eq('id', f.value)
        : await base.eq('recurrence_id', f.value).gte('event_date', f.from!);
    setCancelling(false);
    if (error) {
      Alert.alert('Error', 'Could not cancel the event. Please try again.');
      return;
    }
    if (eventTeamId) {
      const titleLabel = eventType === 'game'
        ? `${homeAway === 'home' ? 'vs' : '@'} ${title.trim()}`
        : title.trim();
      const notifyTeamIds = propagateGroup ? [eventTeamId, ...linkedTeams.map((t) => t.id)] : [eventTeamId];
      const bodyText = scope === 'future'
        ? `${titleLabel} and future sessions cancelled${reason.trim() ? `: ${reason.trim()}` : ''}`
        : reason.trim() ? `${titleLabel} cancelled: ${reason.trim()}` : `${titleLabel} has been cancelled`;
      for (const teamId of notifyTeamIds) {
        sendTeamPush({
          teamId,
          title: 'Event cancelled',
          body: bodyText,
          excludeProfileId: profile?.id,
          data: { type: 'event_cancelled', event_id: eventId },
        });
      }
      // One deduped call across every notified team, not once per team —
      // otherwise a family with kids on two linked teams gets the same
      // cancellation email twice.
      sendTeamEmail({
        teamIds: notifyTeamIds,
        subject: 'Event cancelled',
        body: bodyText,
        fromName: profile?.full_name ?? 'Coach',
        teamName: clubName ?? '',
        clubName,
        logoUrl,
        primaryColor,
      });
    }
    setIsCancelled(true);
    Alert.alert('Event cancelled', 'Parents have been notified by push and email.');
  }

  function confirmRestore() {
    handleUncancelEvent(editScope ?? 'this');
  }

  async function handleUncancelEvent(scope: RecurringScope) {
    if (!eventId) return;
    setCancelling(true);
    const propagateGroup = groupPropagates(scope);
    const payload = { cancelled_at: null, cancellation_reason: null } as any;
    const f = recurringFilter(scope);
    const base = supabase.from('events').update(payload);
    const { error } = propagateGroup
      ? await base.eq('event_group_id', eventGroupId as string)
      : f.column === 'id'
        ? await base.eq('id', f.value)
        : await base.eq('recurrence_id', f.value).gte('event_date', f.from!);
    setCancelling(false);
    if (error) {
      Alert.alert('Error', 'Could not restore the event. Please try again.');
      return;
    }
    if (eventTeamId) {
      const titleLabel = eventType === 'game'
        ? `${homeAway === 'home' ? 'vs' : '@'} ${title.trim()}`
        : title.trim();
      const notifyTeamIds = propagateGroup ? [eventTeamId, ...linkedTeams.map((t) => t.id)] : [eventTeamId];
      const bodyText = `${titleLabel} is back on`;
      for (const teamId of notifyTeamIds) {
        sendTeamPush({
          teamId,
          title: 'Event reinstated',
          body: bodyText,
          excludeProfileId: profile?.id,
          data: { type: 'event_cancelled', event_id: eventId },
        });
      }
      sendTeamEmail({
        teamIds: notifyTeamIds,
        subject: 'Event reinstated',
        body: bodyText,
        fromName: profile?.full_name ?? 'Coach',
        teamName: clubName ?? '',
        clubName,
        logoUrl,
        primaryColor,
      });
    }
    setIsCancelled(false);
    Alert.alert('Event restored', 'Parents have been notified by push and email.');
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
      <ClubHeader
        title="Edit Event"
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            style={[headerBtnStyle as object, { backgroundColor: secondaryColor, opacity: canSave ? 1 : 0.4 }]}
            onPress={() => handleSave(editScope ?? 'this')}
            disabled={!canSave}
          >
            {saving
              ? <ActivityIndicator size="small" color={onSecondary} />
              : <Text style={{ color: onSecondary, fontWeight: '800', fontSize: 12 }}>Save</Text>
            }
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {recurrenceId && editScope && (
            <View style={styles.scopeBanner}>
              <Ionicons name="repeat" size={15} color={primaryColor} />
              <Text style={[styles.scopeBannerText, { color: primaryColor }]}>
                Editing: {editScope === 'future' ? 'This and future events' : 'This event only'}
              </Text>
              <TouchableOpacity onPress={() => promptEditScope(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.scopeBannerChange, { color: primaryColor }]}>Change</Text>
              </TouchableOpacity>
            </View>
          )}

          {linkedTeams.length > 0 && (
            <View style={styles.scopeBanner}>
              <Ionicons name="people-outline" size={15} color={primaryColor} />
              <Text style={[styles.scopeBannerText, { color: primaryColor }]}>
                Also scheduled for {linkedTeams.map((t) => t.name).join(', ')} — saves apply to all
              </Text>
            </View>
          )}

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
                placeholderTextColor={PULSE_COLORS.ui.muted}
                returnKeyType="done"
              />
            </View>
            {!!tournamentId && (
              <>
                <RowDivider />
                <View style={styles.titleRow}>
                  <TextInput
                    style={styles.titleInput}
                    value={roundLabel}
                    onChangeText={setRoundLabel}
                    placeholder="Round (e.g. Quarterfinal, Pool Play)"
                    placeholderTextColor={PULSE_COLORS.ui.muted}
                    returnKeyType="done"
                  />
                </View>
              </>
            )}
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
                    <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
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
                    <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
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
                    <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
                  </TouchableOpacity>
                )}
              </View>
            </FieldRow>
          </Card>

          {/* ── Location ────────────────────────────────── */}
          <SectionHeader title="Location" />
          {savedFields.length > 0 && (
            <Card>
              <View style={{ padding: 12 }}>
                <Text style={styles.savedFieldsLabel}>YOUR FIELDS</Text>
                <View style={styles.typeRow}>
                  {savedFields.map((f) => {
                    const active = fieldId === f.id;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.typeChip, active && { borderColor: primaryColor, backgroundColor: rgba(0.12) }]}
                        onPress={() => {
                          setFieldId(f.id);
                          setLocationName(f.name);
                          setAddress(f.address ?? '');
                          setLat(f.lat ?? null);
                          setLng(f.lng ?? null);
                          setLocationKey((k) => k + 1);
                        }}
                      >
                        <Text style={[styles.typeChipText, active && { color: primaryColor }]}>
                          {f.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </Card>
          )}
          <Card>
            {fieldId ? (
              /* Confirmation view — shows exactly what will be saved so
                 the coach can double-check the address before relying on
                 it, instead of just trusting the chip label silently. */
              <View style={styles.selectedFieldRow}>
                <Ionicons name="checkmark-circle" size={20} color={primaryColor} style={styles.fieldIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedFieldName}>{locationName}</Text>
                  <Text style={styles.selectedFieldAddress}>
                    {address || 'No address on file for this field'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setFieldId(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={[styles.changeLink, { color: primaryColor }]}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.locationNameRow}>
                  <Ionicons name="business-outline" size={17} color={PULSE_COLORS.ui.muted} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.inlineInput}
                    value={locationName}
                    onChangeText={(v) => { setLocationName(v); setFieldId(null); }}
                    placeholder="Venue name (e.g. City Park)"
                    placeholderTextColor={PULSE_COLORS.ui.muted}
                    returnKeyType="next"
                  />
                </View>
                <RowDivider />
                <View style={styles.locationInputRow}>
                  <SmartLocationInput
                    key={locationKey}
                    initialValue={address}
                    onResult={(r) => {
                      setFieldId(null);
                      if (!locationName) setLocationName(r.name);
                      setAddress(r.address ?? '');
                      setLat(r.lat ?? null);
                      setLng(r.lng ?? null);
                    }}
                  />
                </View>
              </>
            )}
            <RowDivider />
            <View style={styles.locationNameRow}>
              <Ionicons name="create-outline" size={17} color={PULSE_COLORS.ui.muted} style={styles.fieldIcon} />
              <TextInput
                style={styles.inlineInput}
                value={fieldNotes}
                onChangeText={setFieldNotes}
                placeholder="Field details (e.g. Field 1, Pitch B)"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                returnKeyType="next"
              />
            </View>
            <RowDivider />
            <FieldRow icon="layers-outline" label="Surface">
              <View style={styles.chipRow}>
                {(['grass', 'turf', 'indoor'] as FieldOption[]).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.chip, fieldType === f && [styles.chipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                    onPress={() => setFieldType(fieldType === f ? null : f)}
                  >
                    <Text style={[styles.chipText, fieldType === f && [styles.chipTextActive, { color: primaryColor }]]}>
                      {f === 'grass' ? 'Grass' : f === 'turf' ? 'Turf' : 'Indoor'}
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
              <Ionicons name="chatbubble-ellipses-outline" size={17} color={PULSE_COLORS.ui.muted} style={styles.fieldIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Team message</Text>
                <TextInput
                  style={styles.notesInput}
                  value={playerNotes}
                  onChangeText={setPlayerNotes}
                  placeholder="Visible to all players and parents…"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            <RowDivider />
            <View style={styles.notesRow}>
              <Ionicons name="lock-closed-outline" size={17} color={PULSE_COLORS.ui.muted} style={styles.fieldIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Coach notes <Text style={styles.coachOnlyTag}>(coach only)</Text></Text>
                <TextInput
                  style={styles.notesInput}
                  value={coachNotes}
                  onChangeText={setCoachNotes}
                  placeholder="Notes for coaching staff…"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            <RowDivider />
            <View style={styles.notesRow}>
              <Ionicons name="videocam-outline" size={17} color={PULSE_COLORS.ui.muted} style={styles.fieldIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Video link</Text>
                <TextInput
                  style={[styles.notesInput, { minHeight: 0 }]}
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  placeholder="Veo, YouTube, Hudl URL…"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  autoCapitalize="none"
                  keyboardType="url"
                  returnKeyType="done"
                />
              </View>
            </View>

            {!isDatedTournamentGame && (
              <>
                <RowDivider />
                <FieldRow icon="checkmark-circle-outline" label="Require RSVP">
                  <Switch
                    value={requireRsvp}
                    onValueChange={setRequireRsvp}
                    trackColor={{ false: PULSE_COLORS.ui.border, true: primaryColor }}
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
              </>
            )}
            <RowDivider />
            <FieldRow icon={notifyParents ? 'notifications-outline' : 'notifications-off-outline'} label="Notify parents & players">
              <Switch
                value={notifyParents}
                onValueChange={setNotifyParents}
                trackColor={{ false: PULSE_COLORS.ui.border, true: primaryColor }}
                thumbColor="#fff"
              />
            </FieldRow>
          </Card>

          {/* ── Cancel / Uncancel ───────────────────────── */}
          {isCancelled ? (
            <TouchableOpacity
              style={styles.uncancelBtn}
              onPress={confirmRestore}
              disabled={cancelling}
            >
              {cancelling
                ? <ActivityIndicator size="small" color="#22c55e" />
                : <>
                    <Ionicons name="refresh-circle-outline" size={16} color="#22c55e" />
                    <Text style={styles.uncancelBtnText}>Restore Event</Text>
                  </>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.cancelEventBtn}
              onPress={confirmCancel}
              disabled={cancelling}
            >
              {cancelling
                ? <ActivityIndicator size="small" color="#F59E0B" />
                : <>
                    <Ionicons name="close-circle-outline" size={16} color="#F59E0B" />
                    <Text style={styles.cancelEventBtnText}>Cancel Event</Text>
                  </>
              }
            </TouchableOpacity>
          )}

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
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PULSE_COLORS.ui.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.background,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text },
  headerSaveBtn: {
    backgroundColor: PULSE_COLORS.brand.green,
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
  },
  headerSaveBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },

  scroll: { paddingHorizontal: 16, paddingTop: 20 },

  scopeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 16, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  scopeBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  scopeBannerChange: { fontSize: 13, fontWeight: '700' },

  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 1, marginBottom: 8, marginTop: 4,
  },
  savedFieldsLabel: {
    fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 1, marginBottom: 8,
  },

  card: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, marginBottom: 20, overflow: 'hidden',
  },

  rowDivider: { height: 1, backgroundColor: PULSE_COLORS.ui.border },

  typeRow: { flexDirection: 'row', padding: 12, gap: 8, flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  typeChipText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },

  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 },
  titlePrefix: { fontSize: 18, fontWeight: '700', color: PULSE_COLORS.ui.muted, marginRight: 6 },
  titleInput: {
    flex: 1, fontSize: 18, fontWeight: '700', color: PULSE_COLORS.ui.text,
    paddingVertical: 12,
  },

  homeAwayRow: { flexDirection: 'row', gap: 10, padding: 12 },
  homeAwayTile: {
    flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 12,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  homeAwayTileActive: { borderColor: PULSE_COLORS.brand.green, backgroundColor: 'rgba(34,197,94,0.1)' },
  homeAwayLabel: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.muted },
  homeAwayLabelActive: { color: PULSE_COLORS.brand.green },

  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 52, gap: 20,
  },
  fieldRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldRowRight: { flex: 1, alignItems: 'flex-end' },
  fieldRowActions: { flexDirection: 'row', alignItems: 'center' },
  fieldIcon: { width: 24 },
  fieldLabel: { fontSize: 14, color: PULSE_COLORS.ui.text, fontWeight: '500' },
  fieldValue: { fontSize: 14, color: PULSE_COLORS.brand.green, fontWeight: '600' },
  fieldValueMuted: { fontSize: 14, color: PULSE_COLORS.ui.muted, fontWeight: '400' },

  locationNameRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  selectedFieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 4,
  },
  selectedFieldName: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  selectedFieldAddress: { fontSize: 12.5, color: PULSE_COLORS.ui.muted, marginTop: 2 },
  changeLink: { fontSize: 13, fontWeight: '700' },
  locationInputRow: { paddingHorizontal: 16, paddingVertical: 12 },
  inlineInput: { flex: 1, color: PULSE_COLORS.ui.text, fontSize: 14 },

  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  chipActive: { borderColor: PULSE_COLORS.brand.green, backgroundColor: 'rgba(34,197,94,0.12)' },
  chipText: { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  chipTextActive: { color: PULSE_COLORS.brand.green },

  notesRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  notesInput: {
    color: PULSE_COLORS.ui.text, fontSize: 14, marginTop: 6,
    minHeight: 70, textAlignVertical: 'top',
  },
  coachOnlyTag: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontStyle: 'italic' },

  cancelEventBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  cancelEventBtnText: { color: '#F59E0B', fontWeight: '700', fontSize: 15 },
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
