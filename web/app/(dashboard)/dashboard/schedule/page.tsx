'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, CalendarDays, MapPin, Clock, Bell, BellOff, Pencil, Trash2, X,
  ChevronDown, Sparkles, Users, Check, ChevronLeft, ChevronRight, List,
  Ban, RotateCcw,
} from 'lucide-react';

const TEAM_PALETTE = ['#6366F1', '#F59E0B', '#10B981', '#EC4899', '#14B8A6', '#F97316', '#8B5CF6', '#DC2626'];
import { supabase } from '@/lib/supabase';
import { sendEventPush } from '@/lib/pushEvent';
import { sendTeamEmail } from '@/lib/emailTeam';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { zonedTimeToUtc } from '@/lib/timezone';
import AIScheduleImport from '@/components/dashboard/AIScheduleImport';
import GuestSection from '@/components/dashboard/GuestSection';
import type { ConfirmedGuest } from '@/components/dashboard/GuestSection';
import GuestCalloutSection from '@/components/dashboard/GuestCalloutSection';
import AttendanceFeeModal from '@/components/dashboard/AttendanceFeeModal';
import LocationAutocomplete from '@/components/dashboard/LocationAutocomplete';

type Event = {
  id: string;
  title: string;
  type: 'game' | 'training' | 'other';
  event_date: string;
  event_time: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  duration_minutes: number | null;
  arrival_buffer_minutes: number | null;
  field_type: string | null;
  field_notes: string | null;
  field_id: string | null;
  uniform: string | null;
  notes: string | null;
  coach_notes: string | null;
  require_rsvp: boolean;
  rsvp_lock_at: string | null;
  team_id: string;
  team_name?: string;
  event_group_id: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

type RsvpPlayer = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  status: 'attending' | 'not_attending' | 'pending';
  rsvp_id: string | null;
};

type FormState = {
  title: string;
  type: 'game' | 'training' | 'other';
  homeAway: 'home' | 'away';
  team_id: string;
  event_date: string;
  event_time: string;
  hasTime: boolean;
  duration_minutes: number | null;
  arrival_buffer_minutes: number | null;
  location: string;
  address: string;
  lat: number | null;
  lng: number | null;
  field_type: 'turf' | 'grass' | null;
  field_notes: string;
  field_id: string | null;
  uniform: 'home' | 'away' | 'training' | null;
  notes: string;
  coach_notes: string;
  require_rsvp: boolean;
  rsvp_lock_hours: number;
  push_notify: boolean;
};

const TYPE_LABELS: Record<string, string> = { game: 'Game', training: 'Training', other: 'Other' };
const TYPE_COLORS: Record<string, string> = { game: '#EF4444', training: '#22C55E', other: '#8B5CF6' };
const TYPE_BG:    Record<string, string> = { game: '#FEF2F2', training: '#F0FDF4', other: '#F5F3FF' };
const TYPE_EMOJI: Record<string, string> = { game: '⚽', training: '🏃', other: '📌' };

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const DURATION_OPTIONS = [
  { label: '30 min', value: 30 }, { label: '45 min', value: 45 },
  { label: '1h', value: 60 }, { label: '1h 15min', value: 75 },
  { label: '1h 30min', value: 90 }, { label: '1h 45min', value: 105 },
  { label: '2h', value: 120 }, { label: '2h 30min', value: 150 },
  { label: '3h', value: 180 },
];
const ARRIVAL_OPTIONS = [
  { label: '5 min before', value: 5 }, { label: '10 min before', value: 10 },
  { label: '15 min before', value: 15 }, { label: '20 min before', value: 20 },
  { label: '30 min before', value: 30 }, { label: '45 min before', value: 45 },
  { label: '1h before', value: 60 },
];
const RSVP_LOCK_OPTIONS = [
  { label: 'At event start', value: 0 }, { label: '12 hrs before', value: 12 },
  { label: '24 hrs before', value: 24 }, { label: '48 hrs before', value: 48 },
];

function fmtDate(iso: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
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
    // and every bucket comparison below silently falls through to 48.
    const eventAt = zonedTimeToUtc(eventDate, `${eventTime.slice(0, 5)}:00`, timezone);
    const diffHours = Math.round((eventAt.getTime() - lockAt.getTime()) / 3600000);
    if (diffHours <= 0) return 0;
    if (diffHours <= 12) return 12;
    if (diffHours <= 24) return 24;
    return 48;
  } catch {
    return 24;
  }
}

const emptyForm = (teamId: string): FormState => ({
  title: '', type: 'training', homeAway: 'home', team_id: teamId,
  event_date: new Date().toISOString().split('T')[0],
  event_time: '10:00', hasTime: true,
  duration_minutes: null, arrival_buffer_minutes: null,
  location: '', address: '', lat: null, lng: null,
  field_type: null, field_notes: '', field_id: null,
  uniform: null, notes: '', coach_notes: '',
  require_rsvp: true, rsvp_lock_hours: 24,
  push_notify: true,
});

export default function SchedulePage() {
  const { profile, club, teams, selectedTeamId } = useDashboard();
  const searchParams = useSearchParams();
  const [events, setEvents]         = useState<Event[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [showAI, setShowAI]         = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<FormState>(emptyForm(selectedTeamId ?? teams[0]?.id ?? ''));
  // Only used when creating (not editing) — lets an admin on multiple teams
  // create the same event for several at once, each getting its own
  // independent copy (own RSVP list, lock time, attendance).
  const [createTeamIds, setCreateTeamIds] = useState<string[]>([]);
  // Only used when editing — set when the event being edited was created
  // together with other teams' copies via the multi-team picker. Only an
  // org_admin gets to propagate a save across the group; a coach's save
  // always stays scoped to their own row (plain .eq('id', editId)).
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [linkedTeams, setLinkedTeams] = useState<{ id: string; name: string }[]>([]);
  const isOrgAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';
  const [saving, setSaving]         = useState(false);
  const [savedFields, setSavedFields] = useState<{ id: string; name: string; address: string | null; lat: number | null; lng: number | null }[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<{ id: string; title: string } | null>(null);
  const [cancelReason, setCancelReason]   = useState('');
  const [cancelling, setCancelling]       = useState(false);
  const [restoringId, setRestoringId]     = useState<string | null>(null);
  const [filterTeam, setFilterTeam] = useState<string>(searchParams.get('team') ?? 'all');
  const [filterType, setFilterType] = useState<'all' | 'game' | 'training' | 'other'>('all');
  const [tab, setTab]               = useState<'upcoming' | 'past'>('upcoming');
  const [viewMode, setViewMode]     = useState<'list' | 'calendar'>('list');

  // RSVP panel
  const [selectedEvent, setSelectedEvent]         = useState<Event | null>(null);
  const [rsvpPlayers, setRsvpPlayers]             = useState<RsvpPlayer[]>([]);
  const [rsvpLoading, setRsvpLoading]             = useState(false);
  const [confirmedGuestCount, setConfirmedGuestCount] = useState(0);
  const [confirmedGuests, setConfirmedGuests] = useState<ConfirmedGuest[]>([]);

  // Attendance panel (past events)
  type AttStatus = 'present' | 'absent' | 'late';
  type AttRecord = { id: string; status: AttStatus };
  const [panelTab, setPanelTab]                   = useState<'rsvps' | 'attendance'>('rsvps');
  const [attMarks, setAttMarks]                   = useState<Record<string, AttRecord | null>>({}); // player_id → record
  const [attLoading, setAttLoading]               = useState(false);
  const [attSaving, setAttSaving]                 = useState<string | null>(null); // player_id being saved

  // RSVP summary bars (eventId → counts)
  type RsvpSummary = { attending: number; not_attending: number; total: number };
  const [rsvpSummaries, setRsvpSummaries] = useState<Record<string, RsvpSummary>>({});

  // Calendar
  const todayDate = new Date();
  const [calMonth, setCalMonth]     = useState({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
  const [selectedCalDay, setSelectedCalDay] = useState<number | null>(null);

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const today   = new Date().toISOString().split('T')[0];

  const teamColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((t, i) => { map[t.id] = TEAM_PALETTE[i % TEAM_PALETTE.length]; });
    return map;
  }, [teams]);

  const loadEvents = useCallback(async () => {
    if (!teams.length) { setLoading(false); return; }
    setLoading(true);
    const teamIds = teams.map((t) => t.id);

    let q = supabase.from('events')
      .select('id, title, type, event_date, event_time, location, address, lat, lng, duration_minutes, arrival_buffer_minutes, field_type, field_notes, field_id, uniform, notes, coach_notes, require_rsvp, rsvp_lock_at, team_id, teams(name), event_group_id, cancelled_at, cancellation_reason')
      .in('team_id', teamIds)
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true });

    if (viewMode === 'list') {
      if (tab === 'upcoming') q = q.gte('event_date', today);
      else                    q = q.lt('event_date', today);
    } else {
      // Calendar: load entire displayed month
      const y = calMonth.year; const m = calMonth.month;
      const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const end   = new Date(y, m + 1, 0).toISOString().split('T')[0];
      q = q.gte('event_date', start).lte('event_date', end);
    }

    const { data } = await q.limit(200);
    const evs = (data ?? []).map((e) => ({ ...e, team_name: (e.teams as unknown as { name: string } | null)?.name })) as Event[];
    setEvents(evs);
    setLoading(false);

    // Batch-load RSVP summaries for all loaded events
    if (evs.length) {
      const eventIds = evs.map((e) => e.id);
      const teamIds  = [...new Set(evs.map((e) => e.team_id))];
      const [rsvpRes, playerRes] = await Promise.all([
        supabase.from('event_rsvps').select('event_id, status').in('event_id', eventIds),
        supabase.from('players').select('id, team_id').in('team_id', teamIds),
      ]);
      const playersByTeam: Record<string, number> = {};
      for (const p of playerRes.data ?? []) {
        playersByTeam[p.team_id] = (playersByTeam[p.team_id] ?? 0) + 1;
      }
      const summaries: Record<string, { attending: number; not_attending: number; total: number }> = {};
      for (const ev of evs) {
        summaries[ev.id] = { attending: 0, not_attending: 0, total: playersByTeam[ev.team_id] ?? 0 };
      }
      for (const r of rsvpRes.data ?? []) {
        if (!summaries[r.event_id]) continue;
        if (r.status === 'attending') summaries[r.event_id].attending++;
        else if (r.status === 'not_attending') summaries[r.event_id].not_attending++;
      }
      setRsvpSummaries(summaries);
    }
  }, [teams, tab, viewMode, calMonth, today]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    if (!club?.id) return;
    supabase
      .from('tryout_fields')
      .select('id,name,address,lat,lng')
      .eq('club_id', club.id)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setSavedFields((data ?? []) as typeof savedFields));
  }, [club?.id]);

  // Reset guest count + panel tab when event changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
    setConfirmedGuestCount(0);
    setConfirmedGuests([]);
    setPanelTab('rsvps');
    setAttMarks({});
  }, [selectedEvent?.id]);

  // Load RSVP players + attendance when an event is selected
  useEffect(() => {
    if (!selectedEvent) return;
    (async () => {
      setRsvpLoading(true);
      const isPast = selectedEvent.event_date < today;
      const [playerRes, rsvpRes, attRes] = await Promise.all([
        supabase.from('players').select('id, full_name, jersey_number, position').eq('team_id', selectedEvent.team_id).order('full_name'),
        supabase.from('event_rsvps').select('id, player_id, status').eq('event_id', selectedEvent.id),
        isPast
          ? supabase.from('event_attendance').select('id, player_id, status').eq('event_id', selectedEvent.id)
          : Promise.resolve({ data: [] as { id: string; player_id: string; status: string }[] }),
      ]);
      const rsvpMap = new Map<string, { id: string; status: 'attending' | 'not_attending' }>();
      for (const r of rsvpRes.data ?? []) rsvpMap.set(r.player_id, { id: r.id, status: r.status });

      setRsvpPlayers((playerRes.data ?? []).map((p) => {
        const r = rsvpMap.get(p.id);
        return { ...p, status: r?.status ?? 'pending', rsvp_id: r?.id ?? null };
      }));

      const marks: Record<string, AttRecord | null> = {};
      for (const a of attRes.data ?? []) marks[a.player_id] = { id: a.id, status: a.status as AttStatus };
      setAttMarks(marks);
      setRsvpLoading(false);
    })();
  }, [selectedEvent, today]);

  async function toggleRsvp(player: RsvpPlayer, newStatus: 'attending' | 'not_attending' | 'pending') {
    if (!selectedEvent) return;
    if (newStatus === 'pending') {
      if (player.rsvp_id) await supabase.from('event_rsvps').delete().eq('id', player.rsvp_id);
      setRsvpPlayers((p) => p.map((pl) => pl.id === player.id ? { ...pl, status: 'pending', rsvp_id: null } : pl));
      return;
    }
    if (player.rsvp_id) {
      await supabase.from('event_rsvps').update({ status: newStatus }).eq('id', player.rsvp_id);
    } else {
      const { data } = await supabase.from('event_rsvps').insert({
        event_id: selectedEvent.id, player_id: player.id, status: newStatus, responded_by: profile?.id,
      }).select('id').single<{ id: string }>();
      setRsvpPlayers((p) => p.map((pl) => pl.id === player.id ? { ...pl, status: newStatus, rsvp_id: data?.id ?? null } : pl));
      return;
    }
    setRsvpPlayers((p) => p.map((pl) => pl.id === player.id ? { ...pl, status: newStatus } : pl));
  }

  async function markAttendance(playerId: string, newStatus: AttStatus | null) {
    if (!selectedEvent) return;
    setAttSaving(playerId);
    const existing = attMarks[playerId];
    if (newStatus === null) {
      // Clear
      if (existing) await supabase.from('event_attendance').delete().eq('id', existing.id);
      setAttMarks((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    } else if (existing) {
      await supabase.from('event_attendance').update({ status: newStatus, marked_by: profile?.id, marked_at: new Date().toISOString() }).eq('id', existing.id);
      setAttMarks((prev) => ({ ...prev, [playerId]: { id: existing.id, status: newStatus } }));
    } else {
      const { data } = await supabase.from('event_attendance').insert({ event_id: selectedEvent.id, player_id: playerId, status: newStatus, marked_by: profile?.id }).select('id').single<{ id: string }>();
      if (data) setAttMarks((prev) => ({ ...prev, [playerId]: { id: data.id, status: newStatus } }));
    }
    setAttSaving(null);
  }

  async function markAllPresent() {
    if (!selectedEvent) return;
    setAttLoading(true);
    const rows = rsvpPlayers.map((p) => ({ event_id: selectedEvent.id, player_id: p.id, status: 'present' as const, marked_by: profile?.id }));
    await supabase.from('event_attendance').upsert(rows, { onConflict: 'event_id,player_id' });
    const { data } = await supabase.from('event_attendance').select('id, player_id, status').eq('event_id', selectedEvent.id);
    const marks: Record<string, AttRecord | null> = {};
    for (const a of data ?? []) marks[a.player_id] = { id: a.id, status: a.status as AttStatus };
    setAttMarks(marks);
    setAttLoading(false);
  }

  function openCreate() {
    const tid = filterTeam !== 'all' ? filterTeam : (selectedTeamId ?? teams[0]?.id ?? '');
    setForm(emptyForm(tid));
    setCreateTeamIds(tid ? [tid] : []);
    setEditId(null);
    setEditGroupId(null);
    setLinkedTeams([]);
    setShowModal(true);
  }

  function toggleCreateTeam(teamId: string) {
    setCreateTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  }

  function openEdit(ev: Event) {
    const gameTitle = ev.type === 'game' ? parseGameTitle(ev.title) : null;
    setForm({
      title: gameTitle ? gameTitle.opponent : ev.title,
      homeAway: gameTitle?.homeAway ?? 'home',
      type: ev.type, team_id: ev.team_id,
      event_date: ev.event_date,
      event_time: ev.event_time ?? '10:00',
      hasTime: !!ev.event_time,
      duration_minutes: ev.duration_minutes,
      arrival_buffer_minutes: ev.arrival_buffer_minutes,
      location: ev.location ?? '',
      address: ev.address ?? '',
      lat: ev.lat,
      lng: ev.lng,
      field_type: (ev.field_type as 'turf' | 'grass') ?? null,
      field_notes: ev.field_notes ?? '',
      field_id: ev.field_id,
      uniform: (ev.uniform as 'home' | 'away' | 'training') ?? null,
      notes: ev.notes ?? '',
      coach_notes: ev.coach_notes ?? '',
      require_rsvp: ev.require_rsvp ?? true,
      rsvp_lock_hours: computeLockHours(ev.rsvp_lock_at, ev.event_date, ev.event_time, club?.timezone ?? 'America/New_York'),
      push_notify: true,
    });
    setEditId(ev.id);
    setEditGroupId(ev.event_group_id);
    // Sibling copies (other teams, same occurrence) share event_group_id
    // and the same event_date, so they're already in the loaded `events`
    // list alongside this one — no extra fetch needed. Only org_admins
    // can propagate, so coaches never see or compute this.
    setLinkedTeams(
      isOrgAdmin && ev.event_group_id
        ? events
            .filter((e) => e.event_group_id === ev.event_group_id && e.id !== ev.id)
            .map((e) => ({ id: e.team_id, name: e.team_name ?? 'another team' }))
        : []
    );
    setShowModal(true);
  }

  // Other teams' copies of this same occurrence — already in the loaded
  // `events` list (see openEdit). Only org_admins get to act on the whole
  // group; anyone else only ever acts on the one row they clicked.
  function siblingTeamIds(ev: Event): string[] {
    if (!isOrgAdmin || !ev.event_group_id) return [];
    return events.filter((e) => e.event_group_id === ev.event_group_id && e.id !== ev.id).map((e) => e.team_id);
  }

  async function handleDelete(id: string) {
    const ev = events.find((e) => e.id === id);
    const linkedIds = ev ? siblingTeamIds(ev) : [];
    const propagate = !!ev?.event_group_id && linkedIds.length > 0;

    const { error } = propagate
      ? await supabase.from('events').delete().eq('event_group_id', ev!.event_group_id)
      : await supabase.from('events').delete().eq('id', id);
    if (error) { alert(`Could not delete event: ${error.message}`); return; }

    setEvents((prev) => prev.filter((e) => propagate ? e.event_group_id !== ev!.event_group_id : e.id !== id));
    if (selectedEvent && (propagate ? selectedEvent.event_group_id === ev!.event_group_id : selectedEvent.id === id)) {
      setSelectedEvent(null);
    }
    setDeleteConfirm(null);
    if (ev) {
      // "deleted", not "cancelled" — this hard-removes the row (no restore),
      // unlike handleCancelEvent below which soft-cancels.
      const notifyTeamIds = propagate ? [ev.team_id, ...linkedIds] : [ev.team_id];
      const bodyText = `${ev.title} has been deleted`;
      for (const teamId of notifyTeamIds) {
        sendEventPush({ team_id: teamId, exclude_profile_id: profile?.id, type: 'event_cancelled', title: '🗑️ Event deleted', body: bodyText, data: { type: 'event_cancelled' } }).catch(() => {});
      }
      sendTeamEmail({
        teamIds: notifyTeamIds,
        subject: 'Event deleted',
        body: bodyText,
        fromName: profile?.full_name ?? club?.name ?? 'Coach',
        teamName: teams.find((t) => t.id === ev.team_id)?.name ?? club?.name ?? '',
        clubName: club?.name ?? null,
        logoUrl: club?.logo_url ?? null,
        primaryColor: club?.primary_color ?? null,
      });
    }
  }

  function openCancel(ev: Event) {
    setCancelReason('');
    setCancelConfirm({ id: ev.id, title: ev.title });
  }

  async function handleCancelEvent() {
    if (!cancelConfirm) return;
    const ev = events.find((e) => e.id === cancelConfirm.id);
    if (!ev) { setCancelConfirm(null); return; }
    setCancelling(true);

    const linkedIds = siblingTeamIds(ev);
    const propagate = !!ev.event_group_id && linkedIds.length > 0;
    const payload = { cancelled_at: new Date().toISOString(), cancellation_reason: cancelReason.trim() || null };

    const { error } = propagate
      ? await supabase.from('events').update(payload).eq('event_group_id', ev.event_group_id)
      : await supabase.from('events').update(payload).eq('id', ev.id);
    setCancelling(false);
    if (error) { alert(`Could not cancel event: ${error.message}`); return; }

    const notifyTeamIds = propagate ? [ev.team_id, ...linkedIds] : [ev.team_id];
    const bodyText = cancelReason.trim() ? `${ev.title} cancelled: ${cancelReason.trim()}` : `${ev.title} has been cancelled`;
    for (const teamId of notifyTeamIds) {
      sendEventPush({
        team_id: teamId, exclude_profile_id: profile?.id, type: 'event_cancelled',
        title: '❌ Event cancelled',
        body: bodyText,
        data: { type: 'event_cancelled', event_id: ev.id },
      }).catch(() => {});
    }
    // One deduped call across every notified team, not once per team —
    // otherwise a family with kids on two linked teams gets the same
    // cancellation email twice.
    sendTeamEmail({
      teamIds: notifyTeamIds,
      subject: 'Event cancelled',
      body: bodyText,
      fromName: profile?.full_name ?? club?.name ?? 'Coach',
      teamName: teams.find((t) => t.id === ev.team_id)?.name ?? club?.name ?? '',
      clubName: club?.name ?? null,
      logoUrl: club?.logo_url ?? null,
      primaryColor: club?.primary_color ?? null,
    });

    setCancelConfirm(null);
    loadEvents();
  }

  async function handleRestoreEvent(ev: Event) {
    setRestoringId(ev.id);
    const linkedIds = siblingTeamIds(ev);
    const propagate = !!ev.event_group_id && linkedIds.length > 0;
    const payload = { cancelled_at: null, cancellation_reason: null };

    const { error } = propagate
      ? await supabase.from('events').update(payload).eq('event_group_id', ev.event_group_id)
      : await supabase.from('events').update(payload).eq('id', ev.id);
    setRestoringId(null);
    if (error) { alert(`Could not restore event: ${error.message}`); return; }

    const notifyTeamIds = propagate ? [ev.team_id, ...linkedIds] : [ev.team_id];
    const bodyText = `${ev.title} is back on`;
    for (const teamId of notifyTeamIds) {
      sendEventPush({
        team_id: teamId, exclude_profile_id: profile?.id, type: 'event_cancelled',
        title: '✅ Event restored', body: bodyText,
        data: { type: 'event_cancelled', event_id: ev.id },
      }).catch(() => {});
    }
    sendTeamEmail({
      teamIds: notifyTeamIds,
      subject: 'Event restored',
      body: bodyText,
      fromName: profile?.full_name ?? club?.name ?? 'Coach',
      teamName: teams.find((t) => t.id === ev.team_id)?.name ?? club?.name ?? '',
      clubName: club?.name ?? null,
      logoUrl: club?.logo_url ?? null,
      primaryColor: club?.primary_color ?? null,
    });

    loadEvents();
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    if (editId ? !form.team_id : createTeamIds.length === 0) return;
    setSaving(true);
    const eventDate = form.event_date;
    const eventTime = form.hasTime ? form.event_time : null;
    const savedTitle = form.type === 'game'
      ? `${form.homeAway === 'home' ? 'vs' : '@'} ${form.title.trim()}`
      : form.title.trim();
    function computeLockAt(): string | null {
      if (!form.require_rsvp || !eventTime) return null;
      const t = eventTime.substring(0, 5);
      try {
        // Anchored to the club's own timezone, not the browser's — otherwise
        // an org_admin creating an event from a different timezone than
        // their club saves a deadline that's off by however many hours
        // separate the two.
        const dt = zonedTimeToUtc(eventDate, `${t}:00`, club?.timezone ?? 'America/New_York');
        dt.setHours(dt.getHours() - form.rsvp_lock_hours);
        return dt.toISOString();
      } catch (err) {
        console.warn('[dashboard/schedule] could not compute rsvp_lock_at', err);
        return null;
      }
    }
    const basePayload = {
      title: savedTitle, type: form.type,
      event_date: eventDate, event_time: eventTime,
      location: form.location.trim() || null,
      address: form.address.trim() || null,
      lat: form.lat,
      lng: form.lng,
      field_id: form.field_id,
      duration_minutes: form.duration_minutes,
      arrival_buffer_minutes: form.arrival_buffer_minutes,
      field_type: form.field_type,
      field_notes: form.field_notes.trim() || null,
      uniform: form.uniform,
      notes: form.notes.trim() || null,
      coach_notes: form.coach_notes.trim() || null,
      require_rsvp: form.require_rsvp,
      rsvp_lock_at: computeLockAt(),
      created_by: profile?.id,
    };
    const label = new Date(form.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    // An org_admin editing an event that's linked to other teams (created
    // via the multi-team picker) propagates the save to every linked
    // team's copy of this same occurrence. A coach's save (isOrgAdmin
    // false, or linkedTeams never populated for them in openEdit) always
    // stays scoped to just this row.
    const propagate = isOrgAdmin && !!editGroupId && linkedTeams.length > 0;

    let shouldClose = false;
    try {
      if (editId) {
        const { error } = propagate
          ? await supabase.from('events').update(basePayload).eq('event_group_id', editGroupId)
          : await supabase.from('events').update({ ...basePayload, team_id: form.team_id }).eq('id', editId);
        if (error) { alert(`Could not save event: ${error.message}`); return; }
        shouldClose = true;

        if (form.push_notify) {
          const notifyTeamIds = propagate ? [form.team_id, ...linkedTeams.map((t) => t.id)] : [form.team_id];
          for (const teamId of notifyTeamIds) {
            const teamName = teams.find((t) => t.id === teamId)?.name ?? 'your team';
            try {
              await sendEventPush({
                team_id: teamId,
                exclude_profile_id: profile?.id,
                type: 'event_updated',
                title: `📝 Event updated — ${teamName}`,
                body: `${savedTitle} · ${label}${eventTime ? ' · ' + fmtTime(eventTime) : ''}`,
                data: { event_id: editId },
              });
            } catch { /* non-critical */ }
          }
        }
      } else {
        // Each selected team gets its own independent copy of the event —
        // own RSVP list, lock time, and attendance — same as creating them
        // one at a time. When more than one team is selected they share an
        // event_group_id, so an org_admin editing one later can update
        // every team's copy of this occurrence at once.
        const groupId = createTeamIds.length > 1 ? crypto.randomUUID() : null;
        const failed: string[] = [];
        for (const teamId of createTeamIds) {
          const { data, error } = await supabase.from('events').insert({ ...basePayload, team_id: teamId, event_group_id: groupId }).select('id').single<{ id: string }>();
          if (error) { failed.push(teams.find((t) => t.id === teamId)?.name ?? teamId); continue; }
          shouldClose = true;
          const eventId = data?.id ?? null;

          if (form.push_notify && eventId) {
            const teamName = teams.find((t) => t.id === teamId)?.name ?? 'your team';
            try {
              await sendEventPush({
                team_id: teamId,
                exclude_profile_id: profile?.id,
                type: 'new_event',
                title: `New ${TYPE_LABELS[form.type]} — ${teamName}`,
                body: `${savedTitle} · ${label}${eventTime ? ' · ' + fmtTime(eventTime) : ''}`,
                data: { event_id: eventId },
              });
            } catch { /* non-critical */ }
          }
        }
        if (failed.length) alert(`Could not create event for: ${failed.join(', ')}`);
      }
    } finally {
      setSaving(false);
    }
    if (shouldClose) {
      setShowModal(false);
      loadEvents();
    }
  }

  const displayed = events.filter((e) =>
    (filterTeam === 'all' || e.team_id === filterTeam) &&
    (filterType === 'all' || e.type === filterType)
  );

  // List view grouping
  const grouped: Record<string, Event[]> = {};
  for (const ev of displayed) {
    grouped[ev.event_date] = grouped[ev.event_date] ?? [];
    grouped[ev.event_date].push(ev);
  }
  const sortedDates = Object.keys(grouped).sort((a, b) =>
    tab === 'upcoming' ? a.localeCompare(b) : b.localeCompare(a)
  );

  // Calendar grid
  const calDays = (() => {
    const { year, month } = calMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  })();

  const eventsByDay = displayed.reduce<Record<number, Event[]>>((acc, ev) => {
    const d = new Date(ev.event_date + 'T00:00:00').getDate();
    (acc[d] ??= []).push(ev);
    return acc;
  }, {});

  const attending = rsvpPlayers.filter((p) => p.status === 'attending');
  const notAttending = rsvpPlayers.filter((p) => p.status === 'not_attending');
  const pending = rsvpPlayers.filter((p) => p.status === 'pending');

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      <style>{`
        @media (max-width: 768px) {
          .sched-header { padding: 12px 16px !important; }
          .sched-header-actions { flex-wrap: wrap !important; gap: 8px !important; }
          .sched-content { padding: 14px 16px !important; }
          .sched-layout { flex-direction: column !important; gap: 16px !important; }
          .sched-sidebar { width: 100% !important; position: static !important; flex-shrink: 0; }
          .cal-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; }
          .cal-inner { min-width: 420px !important; }
        }
      `}</style>

      {/* Sticky header */}
      <div className="sched-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>{club?.name ?? 'Club'}</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Schedule</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

          {/* View mode toggle */}
          <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px', gap: '2px' }}>
            {([['list', <List key="l" size={13} />, 'List'], ['calendar', <CalendarDays key="c" size={13} />, 'Calendar']] as const).map(([mode, icon, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px',
                fontWeight: viewMode === mode ? '700' : '500',
                background: viewMode === mode ? '#fff' : 'transparent',
                color: viewMode === mode ? '#0F172A' : '#64748B',
                boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Upcoming / Past (list only) */}
          {viewMode === 'list' && (
            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px', gap: '2px' }}>
              {(['upcoming', 'past'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px',
                  fontWeight: tab === t ? '700' : '500',
                  background: tab === t ? '#fff' : 'transparent',
                  color: tab === t ? '#0F172A' : '#64748B',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Event type filter */}
          <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px', gap: '2px' }}>
            {([
              ['all',      'All'],
              ['game',     '⚽ Games'],
              ['training', '🏃 Training'],
              ['other',    '📌 Other'],
            ] as const).map(([type, label]) => (
              <button key={type} onClick={() => setFilterType(type)} style={{
                padding: '6px 11px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px',
                fontWeight: filterType === type ? '700' : '500',
                background: filterType === type
                  ? (type === 'game' ? '#FEF2F2' : type === 'training' ? '#F0FDF4' : type === 'other' ? '#F5F3FF' : '#fff')
                  : 'transparent',
                color: filterType === type
                  ? (type === 'game' ? '#DC2626' : type === 'training' ? '#16A34A' : type === 'other' ? '#7C3AED' : '#0F172A')
                  : '#64748B',
                boxShadow: filterType === type ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* Team filter */}
          {teams.length > 1 && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
                style={{ appearance: 'none', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '7px 32px 7px 12px', fontSize: '13px', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                <option value="all">All teams</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }} />
            </div>
          )}

          <button onClick={() => setShowAI(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', fontWeight: '600', fontSize: '13px', padding: '9px 14px', borderRadius: '6px', border: '1.5px solid #E2E8F0', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Sparkles size={14} color="#8B5CF6" /> AI Import
          </button>
          <button onClick={openCreate} style={{ background: primary, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={15} /> New Event
          </button>
        </div>
      </div>

      <div className="sched-content" style={{ padding: '24px 32px' }}>
      <div className="sched-layout" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* ── Main content ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Calendar view */}
          {viewMode === 'calendar' && (
            <div className="cal-scroll"><div className="cal-inner" style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #F1F5F9', gap: '12px' }}>
                <button onClick={() => { setCalMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }); setSelectedCalDay(null); }}
                  style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex' }}>
                  <ChevronLeft size={16} color="#374151" />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifyContent: 'center' }}>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.3px' }}>
                    {MONTH_NAMES[calMonth.month]} {calMonth.year}
                  </span>
                  {(calMonth.month !== todayDate.getMonth() || calMonth.year !== todayDate.getFullYear()) && (
                    <button onClick={() => { setCalMonth({ year: todayDate.getFullYear(), month: todayDate.getMonth() }); setSelectedCalDay(null); }}
                      style={{ fontSize: '11px', fontWeight: '700', color: primary, background: `${primary}12`, border: `1px solid ${primary}30`, borderRadius: '20px', padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Today
                    </button>
                  )}
                </div>
                <button onClick={() => { setCalMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }); setSelectedCalDay(null); }}
                  style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex' }}>
                  <ChevronRight size={16} color="#374151" />
                </button>
              </div>

              {/* Month event summary */}
              {(() => {
                const gameCount     = displayed.filter((e) => e.type === 'game').length;
                const trainingCount = displayed.filter((e) => e.type === 'training').length;
                const otherCount    = displayed.filter((e) => e.type === 'other').length;
                const total = gameCount + trainingCount + otherCount;
                if (total === 0) return null;
                return (
                  <div style={{ display: 'flex', gap: '16px', padding: '8px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC' }}>
                    {gameCount > 0 && (
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '13px' }}>⚽</span>{gameCount} game{gameCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {trainingCount > 0 && (
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '13px' }}>🏃</span>{trainingCount} training{trainingCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {otherCount > 0 && (
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#7C3AED', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '13px' }}>📌</span>{otherCount} other
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Team legend (multi-team only) */}
              {filterTeam === 'all' && teams.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                  {teams.map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: teamColorMap[t.id], flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>{t.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #E2E8F0', borderLeft: '1px solid #E2E8F0' }}>
                {DAY_NAMES.map((d, di) => (
                  <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: di === 0 || di === 6 ? '#CBD5E1' : '#94A3B8', letterSpacing: '0.05em', borderRight: di === 6 ? '1px solid #E2E8F0' : 'none' }}>{d}</div>
                ))}
              </div>

              {/* Calendar cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderLeft: '1px solid #E2E8F0' }}>
                {calDays.map((day, i) => {
                  const todayD     = todayDate.getDate();
                  const isToday    = day === todayD && calMonth.month === todayDate.getMonth() && calMonth.year === todayDate.getFullYear();
                  const isSelected = day === selectedCalDay;
                  const isWeekend  = i % 7 === 0 || i % 7 === 6;
                  const dayEvents  = day ? (eventsByDay[day] ?? []) : [];
                  const isLast     = i >= calDays.length - 7;
                  const multiTeam  = filterTeam === 'all' && teams.length > 1;
                  const isSat = (i % 7) === 6;
                  return (
                    <div key={i}
                      onClick={() => day && setSelectedCalDay(isSelected ? null : day)}
                      style={{
                        minHeight: '90px',
                        borderTop: '1px solid #E2E8F0',
                        borderRight: isSat ? '1px solid #E2E8F0' : 'none',
                        borderBottom: isLast ? 'none' : '1px solid #E2E8F0',
                        borderLeft: 'none',
                        padding: '6px',
                        overflow: 'hidden',
                        background: isSelected
                          ? `${primary}10`
                          : isToday
                          ? `${primary}06`
                          : day
                          ? isWeekend ? '#FCFCFD' : '#fff'
                          : '#F8FAFC',
                        cursor: day ? 'pointer' : 'default',
                        transition: 'background 0.1s',
                        outline: isToday ? `2px solid ${primary}` : isSelected ? `2px solid ${primary}50` : 'none',
                        outlineOffset: '-2px',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => { if (day && !isSelected && !isToday) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                      onMouseLeave={(e) => { if (day && !isSelected && !isToday) (e.currentTarget as HTMLElement).style.background = isWeekend ? '#FCFCFD' : '#fff'; }}
                    >
                      {day && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: isToday ? primary : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: isToday ? '800' : '600', color: isToday ? '#fff' : isSelected ? primary : isWeekend ? '#94A3B8' : '#374151' }}>{day}</span>
                            </div>
                            {dayEvents.length > 0 && (
                              <span style={{ fontSize: '9px', fontWeight: '700', color: '#94A3B8' }}>{dayEvents.length}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {dayEvents.slice(0, 3).map((ev) => {
                              const teamColor = multiTeam ? teamColorMap[ev.team_id] : TYPE_COLORS[ev.type];
                              const timeStr = ev.event_time
                                ? (() => {
                                    const [h, m] = ev.event_time.split(':').map(Number);
                                    const suffix = h >= 12 ? 'p' : 'a';
                                    return m ? `${h % 12 || 12}:${String(m).padStart(2,'0')}${suffix}` : `${h % 12 || 12}${suffix}`;
                                  })()
                                : null;
                              const tooltip = [timeStr, ev.title, ev.location].filter(Boolean).join(' · ');
                              return (
                                <button key={ev.id}
                                  title={tooltip}
                                  onClick={(e) => { e.stopPropagation(); setSelectedCalDay(day); setSelectedEvent(ev); }}
                                  style={{ display: 'flex', alignItems: 'center', gap: '0', background: TYPE_BG[ev.type], border: `1px solid ${TYPE_COLORS[ev.type]}30`, borderRadius: '5px', padding: '0', cursor: 'pointer', width: '100%', textAlign: 'left', overflow: 'hidden', transition: 'filter 0.1s' }}
                                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.filter = 'brightness(0.96)'}
                                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.filter = 'none'}
                                >
                                  <div style={{ width: '3px', alignSelf: 'stretch', background: teamColor, flexShrink: 0 }} />
                                  <div style={{ flex: 1, padding: '3px 5px', minWidth: 0, overflow: 'hidden' }}>
                                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                                      {timeStr && <span style={{ color: TYPE_COLORS[ev.type], marginRight: '3px', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>}{ev.title}
                                    </div>
                                    {multiTeam && ev.team_name && (
                                      <div style={{ fontSize: '9px', fontWeight: '700', color: teamColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.8, lineHeight: 1.3 }}>
                                        {ev.team_name}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                            {dayEvents.length > 3 && (
                              <span style={{ fontSize: '10px', fontWeight: '600', color: primary, paddingLeft: '4px', cursor: 'pointer' }}>+{dayEvents.length - 3} more</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Selected day event list */}
              {selectedCalDay !== null && (() => {
                const iso = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(selectedCalDay).padStart(2, '0')}`;
                const dayEvs = eventsByDay[selectedCalDay] ?? [];
                const dateLabel = new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                return (
                  <div style={{ borderTop: `2px solid ${primary}20`, background: '#FAFBFC' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: primary }} />
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{dateLabel}</span>
                        {dayEvs.length > 0 && <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '500' }}>{dayEvs.length} event{dayEvs.length !== 1 ? 's' : ''}</span>}
                      </div>
                      <button onClick={() => setSelectedCalDay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex' }}>
                        <X size={15} color="#94A3B8" />
                      </button>
                    </div>
                    {dayEvs.length === 0 ? (
                      <div style={{ padding: '16px 20px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CalendarDays size={16} color="#CBD5E1" />
                        <span style={{ fontSize: '13px', color: '#94A3B8' }}>No events scheduled</span>
                        <button onClick={openCreate} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px', background: primary, color: '#fff', border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                          <Plus size={12} /> Add event
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 16px 16px' }}>
                        {dayEvs.map((ev) => {
                          const teamColor = teams.length > 1 ? teamColorMap[ev.team_id] : TYPE_COLORS[ev.type];
                          const isActive  = selectedEvent?.id === ev.id;
                          return (
                            <div key={ev.id}
                              onClick={() => setSelectedEvent(isActive ? null : ev)}
                              style={{ display: 'flex', alignItems: 'center', gap: '0', background: isActive ? `${primary}08` : '#fff', border: `1.5px solid ${isActive ? primary : '#E2E8F0'}`, borderRadius: '10px', overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.1s', opacity: ev.cancelled_at ? 0.6 : 1 }}>
                              <div style={{ width: '4px', alignSelf: 'stretch', background: ev.cancelled_at ? '#EF4444' : teamColor, flexShrink: 0 }} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', flex: 1, minWidth: 0 }}>
                                {ev.cancelled_at ? (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#EF4444', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '5px', padding: '2px 7px', flexShrink: 0 }}>
                                    <Ban size={11} color="#EF4444" /> Cancelled
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '11px', fontWeight: '700', color: TYPE_COLORS[ev.type], background: TYPE_BG[ev.type], borderRadius: '5px', padding: '2px 7px', flexShrink: 0 }}>
                                    {TYPE_LABELS[ev.type]}
                                  </span>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: ev.cancelled_at ? 'line-through' : 'none' }}>{ev.title}</div>
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                    {ev.event_time && <span style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '3px' }}><Clock size={10} color="#94A3B8" />{fmtTime(ev.event_time)}</span>}
                                    {ev.location   && <span style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '3px' }}><MapPin size={10} color="#94A3B8" />{ev.location}</span>}
                                  </div>
                                  <EventInfoPills ev={ev} primary={teams.length > 1 ? (teamColorMap[ev.team_id] ?? primary) : primary} />
                                </div>
                                {teams.length > 1 && ev.team_name && (
                                  <span style={{ fontSize: '10px', fontWeight: '700', color: teamColor, background: `${teamColor}15`, border: `1px solid ${teamColor}30`, borderRadius: '20px', padding: '2px 8px', flexShrink: 0 }}>{ev.team_name}</span>
                                )}
                                <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => openEdit(ev)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
                                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                                    <Pencil size={13} color="#64748B" />
                                  </button>
                                  {ev.cancelled_at ? (
                                    <button onClick={() => handleRestoreEvent(ev)} disabled={restoringId === ev.id} style={{ background: 'none', border: 'none', cursor: restoringId === ev.id ? 'not-allowed' : 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#F0FDF4'}
                                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                                      <RotateCcw size={13} color="#22C55E" />
                                    </button>
                                  ) : (
                                    <button onClick={() => openCancel(ev)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#FFFBEB'}
                                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                                      <Ban size={13} color="#94A3B8" />
                                    </button>
                                  )}
                                  <button onClick={() => setDeleteConfirm({ id: ev.id, title: ev.title })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#FEF2F2'}
                                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                                    <Trash2 size={13} color="#94A3B8" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div></div>
          )}

          {/* List view */}
          {viewMode === 'list' && (
            loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
                <div style={{ width: '28px', height: '28px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : sortedDates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                <CalendarDays size={40} color="#CBD5E1" style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748B', marginBottom: '4px' }}>No {tab} events</div>
                <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '20px' }}>
                  {tab === 'upcoming' ? 'Add your first event to get started' : 'Past events will appear here'}
                </div>
                {tab === 'upcoming' && (
                  <button onClick={openCreate} style={{ background: primary, color: '#fff', fontWeight: '700', fontSize: '13px', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
                    + Add Event
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {sortedDates.map((date) => {
                  const isToday = date === today;
                  return (
                    <div key={date}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', marginTop: '20px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: isToday ? primary : '#94A3B8', padding: '4px 0', flexShrink: 0 }}>
                          {fmtDate(date)}
                        </span>
                        <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                        <span style={{ fontSize: '11px', color: '#CBD5E1', flexShrink: 0 }}>{grouped[date].length} event{grouped[date].length !== 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {grouped[date].map((ev) => (
                          <EventRow
                            key={ev.id}
                            ev={ev}
                            primary={primary}
                            showTeam={teams.length > 1}
                            selected={selectedEvent?.id === ev.id}
                            rsvpSummary={rsvpSummaries[ev.id] ?? null}
                            restoring={restoringId === ev.id}
                            onSelect={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                            onEdit={() => openEdit(ev)}
                            onDelete={() => setDeleteConfirm({ id: ev.id, title: ev.title })}
                            onCancel={() => openCancel(ev)}
                            onRestore={() => handleRestoreEvent(ev)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* ── RSVP Panel ── */}
        {selectedEvent && (
          <div className="sched-sidebar" style={{ width: '340px', flexShrink: 0, background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', overflow: 'hidden', position: 'sticky', top: '80px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 100px)' }}>

            {/* Panel header — pinned */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: TYPE_COLORS[selectedEvent.type], flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', fontWeight: '700', color: TYPE_COLORS[selectedEvent.type], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {TYPE_LABELS[selectedEvent.type]}
                  </span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#0F172A', lineHeight: 1.3 }}>{selectedEvent.title}</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                  {fmtDate(selectedEvent.event_date)}{selectedEvent.event_time ? ` · ${fmtTime(selectedEvent.event_time)}` : ''}
                </div>
                {selectedEvent.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                    <MapPin size={11} color="#94A3B8" />
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>{selectedEvent.location}</span>
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                <X size={16} color="#94A3B8" />
              </button>
            </div>

            {/* Tab switcher — pinned */}
            {(() => {
              const isPast = selectedEvent.event_date < today;
              const markedCount = Object.keys(attMarks).length;
              return isPast ? (
                <div style={{ display: 'flex', padding: '10px 14px', gap: '6px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
                  {([['rsvps', '📋 RSVPs'], ['attendance', '✅ Attendance']] as const).map(([t, label]) => (
                    <button key={t} onClick={() => setPanelTab(t)}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: '9px', border: panelTab === t ? `2px solid ${primary}` : '2px solid #E2E8F0', background: panelTab === t ? `${primary}12` : '#F8FAFC', color: panelTab === t ? primary : '#64748B', fontWeight: '700', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', position: 'relative' }}>
                      {label}
                      {t === 'attendance' && markedCount > 0 && (
                        <span style={{ marginLeft: '5px', fontSize: '10px', fontWeight: '800', background: primary, color: '#fff', borderRadius: '10px', padding: '1px 6px' }}>{markedCount}</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}

            {/* RSVP summary pills — pinned (RSVPs tab or upcoming) */}
            {!rsvpLoading && panelTab === 'rsvps' && (
              <div style={{ display: 'flex', gap: '8px', padding: '12px 18px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
                <div style={{ flex: 1, textAlign: 'center', background: '#F0FDF4', borderRadius: '10px', padding: '8px 6px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#16A34A' }}>{attending.length + confirmedGuestCount}</div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#22C55E' }}>Going</div>
                  {confirmedGuestCount > 0 && (
                    <div style={{ fontSize: '9px', fontWeight: '700', color: '#f97316', marginTop: '2px' }}>{attending.length} + {confirmedGuestCount}G</div>
                  )}
                </div>
                <div style={{ flex: 1, textAlign: 'center', background: '#FEF2F2', borderRadius: '10px', padding: '8px 6px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#DC2626' }}>{notAttending.length}</div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#EF4444' }}>Out</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', background: '#F8FAFC', borderRadius: '10px', padding: '8px 6px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#64748B' }}>{pending.length}</div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8' }}>Pending</div>
                </div>
              </div>
            )}

            {/* Attendance summary pills — pinned (attendance tab) */}
            {!rsvpLoading && panelTab === 'attendance' && (() => {
              const presentCount = Object.values(attMarks).filter((a) => a?.status === 'present').length;
              const lateCount    = Object.values(attMarks).filter((a) => a?.status === 'late').length;
              const absentCount  = Object.values(attMarks).filter((a) => a?.status === 'absent').length;
              return (
                <div style={{ flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: '8px', padding: '12px 18px 10px', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ flex: 1, textAlign: 'center', background: '#F0FDF4', borderRadius: '10px', padding: '8px 6px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '900', color: '#16A34A' }}>{presentCount}</div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#22C55E' }}>Present</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', background: '#FFFBEB', borderRadius: '10px', padding: '8px 6px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '900', color: '#D97706' }}>{lateCount}</div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#F59E0B' }}>Late</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', background: '#FEF2F2', borderRadius: '10px', padding: '8px 6px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '900', color: '#DC2626' }}>{absentCount}</div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#EF4444' }}>Absent</div>
                    </div>
                  </div>
                  <div style={{ padding: '8px 18px 6px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <AttendanceFeeModal
                      teamId={selectedEvent.team_id}
                      eventId={selectedEvent.id}
                      eventTitle={selectedEvent.title}
                      primary={primary}
                      players={rsvpPlayers.map(p => ({ id: p.id, full_name: p.full_name }))}
                      attStatusByPlayer={Object.fromEntries(Object.entries(attMarks).map(([id, rec]) => [id, rec?.status]))}
                    />
                    <button onClick={markAllPresent} disabled={attLoading}
                      style={{ fontSize: '11px', fontWeight: '700', color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {attLoading ? 'Saving…' : '✓ Mark all present'}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Scrollable body — players + guests + callouts */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {rsvpLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <div style={{ width: '22px', height: '22px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                </div>
              ) : rsvpPlayers.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <Users size={28} color="#CBD5E1" style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '13px', color: '#94A3B8' }}>No players on this team yet</div>
                </div>
              ) : panelTab === 'attendance' ? (
                /* ── Attendance marking UI ── */
                <div>
                  <div style={{ padding: '8px 18px 4px', fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', background: '#FAFAFA', borderBottom: '1px solid #F1F5F9' }}>
                    Mark who actually showed up
                  </div>
                  {rsvpPlayers.map((p) => {
                    const att = attMarks[p.id];
                    const isSaving = attSaving === p.id;
                    const rsvpColor = p.status === 'attending' ? '#16A34A' : p.status === 'not_attending' ? '#DC2626' : '#94A3B8';
                    const rsvpLabel = p.status === 'attending' ? 'RSVPd Going' : p.status === 'not_attending' ? 'RSVPd Out' : 'No RSVP';
                    return (
                      <div key={p.id} style={{ padding: '10px 18px', borderBottom: '1px solid #F8FAFC', opacity: isSaving ? 0.6 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: '#64748B', flexShrink: 0 }}>
                            {p.full_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name}</div>
                            <div style={{ fontSize: '10px', fontWeight: '600', color: rsvpColor }}>{rsvpLabel}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          {([['present', '✓ Present', '#16A34A', '#F0FDF4', '#BBF7D0'],
                             ['late',    '⏰ Late',    '#D97706', '#FFFBEB', '#FDE68A'],
                             ['absent',  '✗ Absent',  '#DC2626', '#FEF2F2', '#FECACA']] as const).map(([s, label, color, bg, border]) => (
                            <button key={s} onClick={() => markAttendance(p.id, att?.status === s ? null : s)}
                              disabled={isSaving}
                              style={{ flex: 1, padding: '6px 4px', borderRadius: '8px', border: `1.5px solid ${att?.status === s ? border : '#E2E8F0'}`, background: att?.status === s ? bg : '#fff', color: att?.status === s ? color : '#94A3B8', fontWeight: '700', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {[{ list: attending, label: 'Going', color: '#16A34A', bg: '#F0FDF4' },
                    { list: notAttending, label: 'Not going', color: '#DC2626', bg: '#FEF2F2' },
                    { list: pending, label: 'No response', color: '#94A3B8', bg: '#F8FAFC' }].map(({ list, label, color, bg }) => {
                    const isGoing = label === 'Going';
                    const totalCount = isGoing ? list.length + confirmedGuests.length : list.length;
                    if (totalCount === 0) return null;
                    return (
                      <div key={label}>
                        <div style={{ padding: '8px 18px 4px', fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', background: '#FAFAFA', borderTop: '1px solid #F1F5F9' }}>
                          {label} · {totalCount}
                        </div>
                        {list.map((p) => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 18px', borderBottom: '1px solid #F8FAFC' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color, flexShrink: 0 }}>
                              {p.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name}</div>
                              {p.jersey_number != null && <div style={{ fontSize: '11px', color: '#94A3B8' }}>#{p.jersey_number}{p.position ? ` · ${p.position}` : ''}</div>}
                            </div>
                            {/* Quick RSVP buttons */}
                            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                              <button onClick={() => toggleRsvp(p, p.status === 'attending' ? 'pending' : 'attending')}
                                title="Mark attending"
                                style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1.5px solid ${p.status === 'attending' ? '#22C55E' : '#E2E8F0'}`, background: p.status === 'attending' ? '#F0FDF4' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={13} color={p.status === 'attending' ? '#16A34A' : '#CBD5E1'} strokeWidth={2.5} />
                              </button>
                              <button onClick={() => toggleRsvp(p, p.status === 'not_attending' ? 'pending' : 'not_attending')}
                                title="Mark not attending"
                                style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1.5px solid ${p.status === 'not_attending' ? '#EF4444' : '#E2E8F0'}`, background: p.status === 'not_attending' ? '#FEF2F2' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={13} color={p.status === 'not_attending' ? '#DC2626' : '#CBD5E1'} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {/* Confirmed guests appended at the bottom of the Going group */}
                        {isGoing && confirmedGuests.map((g) => (
                          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 18px', borderBottom: '1px solid #F8FAFC' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(249,115,22,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: '#f97316', flexShrink: 0 }}>
                              {g.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.full_name}</div>
                              <div style={{ fontSize: '11px', color: '#f97316', fontWeight: '600' }}>Guest {g.role}</div>
                            </div>
                            <div style={{ fontSize: '10px', fontWeight: '700', color: '#f97316', background: 'rgba(249,115,22,0.1)', padding: '3px 7px', borderRadius: '5px', flexShrink: 0 }}>G</div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            <GuestSection
              eventId={selectedEvent.id}
              teamId={selectedEvent.team_id}
              teamName={selectedEvent.team_name ?? ''}
              eventTitle={selectedEvent.title}
              primary={primary}
              onConfirmedCount={setConfirmedGuestCount}
              onConfirmedGuests={setConfirmedGuests}
            />
            <GuestCalloutSection
              eventId={selectedEvent.id}
              teamId={selectedEvent.team_id}
              teamName={selectedEvent.team_name ?? ''}
              teamClubId={teams.find(t => t.id === selectedEvent.team_id)?.club_id ?? club?.id ?? ''}
              eventTitle={selectedEvent.title}
              primary={primary}
            />
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px' }} onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>{editId ? 'Edit Event' : 'New Event'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex' }}><X size={18} color="#64748B" /></button>
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '0' }}>

                {linkedTeams.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 14px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', marginBottom: '20px', fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
                    <span>🔗</span>
                    <span>Also scheduled for <strong>{linkedTeams.map((t) => t.name).join(', ')}</strong> — saving will update all of them.</span>
                  </div>
                )}

                {/* ── EVENT ── */}
                <div style={modalSectionStyle}>EVENT</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div>
                    <label style={labelStyle}>Type</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['game', 'training', 'other'] as const).map((t) => (
                        <button key={t} onClick={() => setForm((f) => ({ ...f, type: t }))} style={{ flex: 1, padding: '9px 0', borderRadius: '8px', border: `2px solid ${form.type === t ? TYPE_COLORS[t] : '#E2E8F0'}`, background: form.type === t ? TYPE_BG[t] : '#fff', color: form.type === t ? TYPE_COLORS[t] : '#64748B', fontWeight: form.type === t ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.type === 'game' && (
                    <div>
                      <label style={labelStyle}>Venue</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {(['home', 'away'] as const).map((v) => (
                          <button key={v} onClick={() => setForm((f) => ({ ...f, homeAway: v }))} style={{ flex: 1, padding: '9px 0', borderRadius: '8px', border: `2px solid ${form.homeAway === v ? primary : '#E2E8F0'}`, background: form.homeAway === v ? `${primary}18` : '#fff', color: form.homeAway === v ? primary : '#64748B', fontWeight: form.homeAway === v ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {v === 'home' ? 'Home' : 'Away'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>{form.type === 'game' ? 'Opponent' : 'Title'}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {form.type === 'game' && (
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#64748B', flexShrink: 0, width: '22px' }}>{form.homeAway === 'home' ? 'vs' : '@'}</span>
                      )}
                      <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder={form.type === 'game' ? 'Opponent name…' : form.type === 'training' ? 'e.g. Tuesday Training' : 'e.g. Team Meeting'}
                        style={{ ...inputStyle, flex: 1 }} />
                    </div>
                  </div>
                  {teams.length > 1 && (
                    editId ? (
                      <div>
                        <label style={labelStyle}>Team</label>
                        <div style={{ position: 'relative' }}>
                          <select value={form.team_id} onChange={(e) => setForm((f) => ({ ...f, team_id: e.target.value }))}
                            style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label style={labelStyle}>Teams</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {teams.map((t) => {
                            const active = createTeamIds.includes(t.id);
                            return (
                              <button key={t.id} onClick={() => toggleCreateTeam(t.id)}
                                style={{ padding: '8px 14px', borderRadius: '8px', border: `2px solid ${active ? primary : '#E2E8F0'}`, background: active ? `${primary}12` : '#fff', color: active ? primary : '#64748B', fontWeight: active ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                {t.name}
                              </button>
                            );
                          })}
                        </div>
                        {createTeamIds.length > 1 && (
                          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px' }}>
                            Creates {createTeamIds.length} independent copies — one per team, each with its own RSVP list.
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>

                {/* ── DATE & TIME ── */}
                <div style={modalSectionStyle}>DATE & TIME</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Date</label>
                      <input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Start time</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {form.hasTime ? (
                          <input type="time" value={form.event_time} onChange={(e) => setForm((f) => ({ ...f, event_time: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                        ) : (
                          <button onClick={() => setForm((f) => ({ ...f, hasTime: true }))} style={{ ...inputStyle, textAlign: 'left' as const, cursor: 'pointer', color: '#94A3B8', background: '#F8FAFC', flex: 1 }}>No time set</button>
                        )}
                        {form.hasTime && (
                          <button onClick={() => setForm((f) => ({ ...f, hasTime: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                            <X size={14} color="#94A3B8" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Duration</label>
                      <div style={{ position: 'relative' }}>
                        <select value={form.duration_minutes ?? ''} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value ? Number(e.target.value) : null }))}
                          style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer', color: form.duration_minutes ? '#0F172A' : '#94A3B8' }}>
                          <option value="">Not set</option>
                          {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Arrive</label>
                      <div style={{ position: 'relative' }}>
                        <select value={form.arrival_buffer_minutes ?? ''} onChange={(e) => setForm((f) => ({ ...f, arrival_buffer_minutes: e.target.value ? Number(e.target.value) : null }))}
                          style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer', color: form.arrival_buffer_minutes ? '#0F172A' : '#94A3B8' }}>
                          <option value="">Not set</option>
                          {ARRIVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── LOCATION ── */}
                <div style={modalSectionStyle}>LOCATION</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  {savedFields.length > 0 && (
                    <div>
                      <label style={labelStyle}>Your fields</label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {savedFields.map((sf) => {
                          const active = form.field_id === sf.id;
                          return (
                            <button key={sf.id} onClick={() => setForm((f) => ({
                              ...f, field_id: sf.id, location: sf.name, address: sf.address ?? '', lat: sf.lat, lng: sf.lng,
                            }))}
                              style={{ padding: '7px 14px', borderRadius: '20px', border: `2px solid ${active ? primary : '#E2E8F0'}`, background: active ? `${primary}12` : '#fff', color: active ? primary : '#64748B', fontWeight: active ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                              {sf.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>Venue name</label>
                    <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value, field_id: null }))} placeholder="e.g. City Park" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Address</label>
                    <LocationAutocomplete
                      value={form.address}
                      onChange={(v) => setForm((f) => ({ ...f, address: v, lat: null, lng: null, field_id: null }))}
                      onSelect={({ address, name, lat, lng }) => setForm((f) => ({
                        ...f,
                        address,
                        lat,
                        lng,
                        field_id: null,
                        location: f.location.trim() ? f.location : name,
                      }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Field details</label>
                    <input value={form.field_notes} onChange={(e) => setForm((f) => ({ ...f, field_notes: e.target.value }))} placeholder="e.g. Field 1, Pitch B" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Surface</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['turf', 'grass'] as const).map((s) => (
                        <button key={s} onClick={() => setForm((f) => ({ ...f, field_type: f.field_type === s ? null : s }))} style={{ padding: '8px 20px', borderRadius: '8px', border: `2px solid ${form.field_type === s ? primary : '#E2E8F0'}`, background: form.field_type === s ? `${primary}12` : '#fff', color: form.field_type === s ? primary : '#64748B', fontWeight: form.field_type === s ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {s === 'turf' ? 'Turf' : 'Grass'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── DETAILS ── */}
                <div style={modalSectionStyle}>DETAILS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  <div>
                    <label style={labelStyle}>Uniform</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['home', 'away', 'training'] as const).map((u) => (
                        <button key={u} onClick={() => setForm((f) => ({ ...f, uniform: f.uniform === u ? null : u }))} style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: `2px solid ${form.uniform === u ? primary : '#E2E8F0'}`, background: form.uniform === u ? `${primary}12` : '#fff', color: form.uniform === u ? primary : '#64748B', fontWeight: form.uniform === u ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {u.charAt(0).toUpperCase() + u.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Team message</label>
                    <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Visible to all players and parents…" rows={3}
                      style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: '1.5', display: 'block' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Coach notes <span style={{ fontWeight: '400', color: '#94A3B8', textTransform: 'none', letterSpacing: '0', fontSize: '11px' }}>(coach only)</span></label>
                    <textarea value={form.coach_notes} onChange={(e) => setForm((f) => ({ ...f, coach_notes: e.target.value }))} placeholder="Notes for coaching staff only…" rows={3}
                      style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: '1.5', display: 'block' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>Require RSVP</span>
                    <button onClick={() => setForm((f) => ({ ...f, require_rsvp: !f.require_rsvp }))}
                      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: form.require_rsvp ? primary : '#CBD5E1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', left: form.require_rsvp ? '22px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </button>
                  </div>
                  {form.require_rsvp && (
                    <div>
                      <label style={labelStyle}>RSVP closes</label>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {RSVP_LOCK_OPTIONS.map((o) => (
                          <button key={o.value} onClick={() => setForm((f) => ({ ...f, rsvp_lock_hours: o.value }))} style={{ padding: '7px 12px', borderRadius: '8px', border: `2px solid ${form.rsvp_lock_hours === o.value ? primary : '#E2E8F0'}`, background: form.rsvp_lock_hours === o.value ? `${primary}12` : '#fff', color: form.rsvp_lock_hours === o.value ? primary : '#64748B', fontWeight: form.rsvp_lock_hours === o.value ? '700' : '500', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 24px 16px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
              {/* Notify toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', padding: '10px 14px', background: form.push_notify ? `${primary}08` : '#F8FAFC', borderRadius: '10px', border: `1px solid ${form.push_notify ? `${primary}30` : '#E2E8F0'}`, transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {form.push_notify ? <Bell size={14} color={primary} /> : <BellOff size={14} color="#94A3B8" />}
                  <span style={{ fontSize: '13px', fontWeight: '600', color: form.push_notify ? '#0F172A' : '#64748B' }}>
                    Notify parents &amp; players
                  </span>
                </div>
                <button onClick={() => setForm((f) => ({ ...f, push_notify: !f.push_notify }))}
                  style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: form.push_notify ? primary : '#CBD5E1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', left: form.push_notify ? '20px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                {(() => {
                  const disabled = saving || !form.title.trim() || (editId ? !form.team_id : createTeamIds.length === 0);
                  return (
                    <button onClick={handleSave} disabled={disabled} style={{ flex: 2, padding: '11px', background: disabled ? '#86EFAC' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {saving ? 'Saving…' : editId ? 'Save changes' : createTeamIds.length > 1 ? `Create ${createTeamIds.length} Events` : 'Create Event'}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      </div>{/* end padding wrapper */}

      {showAI && <AIScheduleImport onClose={() => setShowAI(false)} onDone={() => loadEvents()} />}

      {deleteConfirm && (() => {
        const ev = events.find((e) => e.id === deleteConfirm.id);
        const linkedCount = ev ? siblingTeamIds(ev).length : 0;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => setDeleteConfirm(null)}>
            <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '380px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <Trash2 size={20} color="#EF4444" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Delete event{linkedCount > 0 ? ` for all ${linkedCount + 1} teams` : ''}?</div>
              <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>
                <strong style={{ color: '#0F172A' }}>{deleteConfirm.title}</strong> will be permanently deleted including all RSVPs{linkedCount > 0 ? ', for every linked team' : ''}.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={() => handleDelete(deleteConfirm.id)} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
              </div>
            </div>
          </div>
        );
      })()}

      {cancelConfirm && (() => {
        const ev = events.find((e) => e.id === cancelConfirm.id);
        const linkedCount = ev ? siblingTeamIds(ev).length : 0;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => setCancelConfirm(null)}>
            <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '380px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <Ban size={20} color="#D97706" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Cancel event{linkedCount > 0 ? ` for all ${linkedCount + 1} teams` : ''}?</div>
              <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '16px', lineHeight: '1.5' }}>
                <strong style={{ color: '#0F172A' }}>{cancelConfirm.title}</strong> will be marked cancelled and parents{linkedCount > 0 ? ' on every linked team' : ''} will be notified. It stays in the schedule and can be restored later.
              </div>
              <label style={labelStyle}>Reason for parents (optional)</label>
              <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Field closed for weather" rows={2}
                style={{ ...inputStyle, resize: 'vertical', marginBottom: '20px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setCancelConfirm(null)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Keep Event</button>
                <button onClick={handleCancelEvent} disabled={cancelling} style={{ flex: 1, padding: '11px', background: cancelling ? '#FCD34D' : '#D97706', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {cancelling ? 'Cancelling…' : 'Cancel Event'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EventInfoPills({ ev, primary }: { ev: Event; primary: string }) {
  const isHome  = ev.type === 'game' && ev.title.startsWith('vs ');
  const isAway  = ev.type === 'game' && ev.title.startsWith('@ ');
  const hasGame = isHome || isAway;

  const pills: { label: string; color: string; bg: string; border: string }[] = [];

  if (hasGame) {
    pills.push(isHome
      ? { label: 'Home', color: '#16A34A', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' }
      : { label: 'Away', color: '#EA580C', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.25)' }
    );
  }
  if (ev.field_type) {
    pills.push(ev.field_type === 'turf'
      ? { label: 'Turf', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)' }
      : { label: 'Grass', color: '#16A34A', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' }
    );
  }
  if (ev.uniform) {
    pills.push({
      label: ev.uniform.charAt(0).toUpperCase() + ev.uniform.slice(1) + ' kit',
      color: primary, bg: `${primary}15`, border: `${primary}30`,
    });
  }
  if (ev.arrival_buffer_minutes) {
    pills.push({
      label: `Arrive ${ev.arrival_buffer_minutes}min early`,
      color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0',
    });
  }

  if (!pills.length) return null;

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
      {pills.map((p) => (
        <span key={p.label} style={{ fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '20px', background: p.bg, color: p.color, border: `1px solid ${p.border}`, whiteSpace: 'nowrap' }}>
          {p.label}
        </span>
      ))}
    </div>
  );
}

function EventRow({ ev, primary, showTeam, selected, rsvpSummary, restoring, onSelect, onEdit, onDelete, onCancel, onRestore }: {
  ev: Event; primary: string; showTeam: boolean; selected: boolean;
  rsvpSummary: { attending: number; not_attending: number; total: number } | null;
  restoring: boolean;
  onSelect: () => void; onEdit: () => void; onDelete: () => void; onCancel: () => void; onRestore: () => void;
}) {
  const [hover, setHover] = useState(false);
  const color = TYPE_COLORS[ev.type];
  const bg    = TYPE_BG[ev.type];
  const isCancelled = !!ev.cancelled_at;

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: selected ? `${primary}08` : '#fff',
        borderRadius: '14px',
        border: selected ? `2px solid ${primary}` : `1px solid ${hover ? '#CBD5E1' : '#E2E8F0'}`,
        display: 'flex', alignItems: 'stretch', overflow: 'hidden',
        boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s, transform 0.15s', transform: hover ? 'translateY(-1px)' : 'none', cursor: 'pointer',
        opacity: isCancelled ? 0.6 : 1,
      }}
      onClick={onSelect}
    >
      <div style={{ width: '3px', flexShrink: 0, background: isCancelled ? '#EF4444' : color }} />
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 16px 14px 14px', borderRight: '1px solid #F8FAFC', minWidth: '72px' }}>
        <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{ev.event_time ? fmtTime(ev.event_time).split(' ')[0] : '—'}</span>
        {ev.event_time && <span style={{ fontSize: '11px', fontWeight: '600', color: '#94A3B8', marginTop: '2px' }}>{fmtTime(ev.event_time).split(' ')[1]}</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top row */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          {isCancelled ? (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px', background: '#FEF2F2', borderRadius: '7px', padding: '5px 9px', border: '1px solid #FECACA' }}>
              <Ban size={12} color="#EF4444" />
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cancelled</span>
            </div>
          ) : (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px', background: bg, borderRadius: '7px', padding: '5px 9px', border: `1px solid ${color}20` }}>
              <span style={{ fontSize: '13px', lineHeight: 1 }}>{TYPE_EMOJI[ev.type]}</span>
              <span style={{ fontSize: '11px', fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{TYPE_LABELS[ev.type]}</span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isCancelled ? 'line-through' : 'none' }}>{ev.title}</div>
            {ev.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                <MapPin size={11} color="#94A3B8" />
                <span style={{ fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>{ev.location}</span>
              </div>
            )}
            <EventInfoPills ev={ev} primary={primary} />
          </div>
          {showTeam && ev.team_name && (
            <div style={{ fontSize: '11px', fontWeight: '600', color: primary, background: `${primary}12`, borderRadius: '20px', padding: '3px 10px', flexShrink: 0, whiteSpace: 'nowrap', border: `1px solid ${primary}20` }}>{ev.team_name}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0, opacity: hover ? 1 : 0.35, transition: 'opacity 0.15s' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '7px', borderRadius: '7px', display: 'flex' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
              <Pencil size={14} color="#64748B" />
            </button>
            {isCancelled ? (
              <button onClick={(e) => { e.stopPropagation(); onRestore(); }} disabled={restoring} style={{ background: 'none', border: 'none', cursor: restoring ? 'not-allowed' : 'pointer', padding: '7px', borderRadius: '7px', display: 'flex' }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#F0FDF4'}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                <RotateCcw size={14} color="#22C55E" />
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '7px', borderRadius: '7px', display: 'flex' }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#FFFBEB'}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                <Ban size={14} color="#94A3B8" />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '7px', borderRadius: '7px', display: 'flex' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#FEF2F2'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
              <Trash2 size={14} color="#94A3B8" />
            </button>
          </div>
        </div>
        {/* RSVP bar */}
        {rsvpSummary && rsvpSummary.total > 0 && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '4px', borderRadius: '4px', overflow: 'hidden', display: 'flex', gap: '1px', background: '#F1F5F9' }}>
                {rsvpSummary.attending > 0 && (
                  <div style={{ flex: rsvpSummary.attending, background: '#22C55E' }} />
                )}
                {(rsvpSummary.total - rsvpSummary.attending - rsvpSummary.not_attending) > 0 && (
                  <div style={{ flex: rsvpSummary.total - rsvpSummary.attending - rsvpSummary.not_attending, background: '#CBD5E1' }} />
                )}
                {rsvpSummary.not_attending > 0 && (
                  <div style={{ flex: rsvpSummary.not_attending, background: '#EF4444' }} />
                )}
              </div>
              <span style={{ fontSize: '10px', fontWeight: '700', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: '#16A34A' }}>{rsvpSummary.attending}</span>
                <span style={{ color: '#CBD5E1', margin: '0 2px' }}>·</span>
                <span style={{ color: '#94A3B8' }}>{rsvpSummary.total - rsvpSummary.attending - rsvpSummary.not_attending}</span>
                <span style={{ color: '#CBD5E1', margin: '0 2px' }}>·</span>
                <span style={{ color: '#DC2626' }}>{rsvpSummary.not_attending}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: '700', color: '#64748B', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };
const inputStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const modalSectionStyle: React.CSSProperties = { fontSize: '10px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #F1F5F9' };
