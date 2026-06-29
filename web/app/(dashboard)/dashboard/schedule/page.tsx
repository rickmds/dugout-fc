'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, CalendarDays, MapPin, Clock, Bell, BellOff, Pencil, Trash2, X,
  ChevronDown, Sparkles, Users, Check, ChevronLeft, ChevronRight, List,
} from 'lucide-react';

const TEAM_PALETTE = ['#6366F1', '#F59E0B', '#10B981', '#EC4899', '#14B8A6', '#F97316', '#8B5CF6', '#DC2626'];
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import AIScheduleImport from '@/components/dashboard/AIScheduleImport';

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
  uniform: string | null;
  notes: string | null;
  coach_notes: string | null;
  require_rsvp: boolean;
  rsvp_lock_at: string | null;
  team_id: string;
  team_name?: string;
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

function computeLockHours(rsvpLockAt: string | null, eventDate: string, eventTime: string | null): number {
  if (!rsvpLockAt || !eventTime) return 24;
  const lockAt = new Date(rsvpLockAt);
  const eventAt = new Date(`${eventDate}T${eventTime}:00`);
  const diffHours = Math.round((eventAt.getTime() - lockAt.getTime()) / 3600000);
  if (diffHours <= 0) return 0;
  if (diffHours <= 12) return 12;
  if (diffHours <= 24) return 24;
  return 48;
}

const emptyForm = (teamId: string): FormState => ({
  title: '', type: 'training', homeAway: 'home', team_id: teamId,
  event_date: new Date().toISOString().split('T')[0],
  event_time: '10:00', hasTime: true,
  duration_minutes: null, arrival_buffer_minutes: null,
  location: '', address: '', lat: null, lng: null,
  field_type: null, field_notes: '',
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
  const [saving, setSaving]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [filterTeam, setFilterTeam] = useState<string>(searchParams.get('team') ?? 'all');
  const [tab, setTab]               = useState<'upcoming' | 'past'>('upcoming');
  const [viewMode, setViewMode]     = useState<'list' | 'calendar'>('list');

  // RSVP panel
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [rsvpPlayers, setRsvpPlayers]     = useState<RsvpPlayer[]>([]);
  const [rsvpLoading, setRsvpLoading]     = useState(false);

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
      .select('id, title, type, event_date, event_time, location, address, lat, lng, duration_minutes, arrival_buffer_minutes, field_type, field_notes, uniform, notes, coach_notes, require_rsvp, rsvp_lock_at, team_id, teams(name)')
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
    const evs = (data ?? []).map((e: any) => ({ ...e, team_name: e.teams?.name })) as Event[];
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
  }, [teams, tab, viewMode, calMonth]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Load RSVP players when an event is selected
  useEffect(() => {
    if (!selectedEvent) return;
    (async () => {
      setRsvpLoading(true);
      const [playerRes, rsvpRes] = await Promise.all([
        supabase.from('players').select('id, full_name, jersey_number, position').eq('team_id', selectedEvent.team_id).order('full_name'),
        supabase.from('event_rsvps').select('id, player_id, status').eq('event_id', selectedEvent.id),
      ]);
      const rsvpMap = new Map<string, { id: string; status: 'attending' | 'not_attending' }>();
      for (const r of rsvpRes.data ?? []) rsvpMap.set(r.player_id, { id: r.id, status: r.status });

      setRsvpPlayers((playerRes.data ?? []).map((p) => {
        const r = rsvpMap.get(p.id);
        return { ...p, status: r?.status ?? 'pending', rsvp_id: r?.id ?? null };
      }));
      setRsvpLoading(false);
    })();
  }, [selectedEvent]);

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
      }).select('id').single();
      setRsvpPlayers((p) => p.map((pl) => pl.id === player.id ? { ...pl, status: newStatus, rsvp_id: (data as any)?.id ?? null } : pl));
      return;
    }
    setRsvpPlayers((p) => p.map((pl) => pl.id === player.id ? { ...pl, status: newStatus } : pl));
  }

  function openCreate() {
    const tid = filterTeam !== 'all' ? filterTeam : (selectedTeamId ?? teams[0]?.id ?? '');
    setForm(emptyForm(tid));
    setEditId(null);
    setShowModal(true);
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
      uniform: (ev.uniform as 'home' | 'away' | 'training') ?? null,
      notes: ev.notes ?? '',
      coach_notes: ev.coach_notes ?? '',
      require_rsvp: ev.require_rsvp ?? true,
      rsvp_lock_hours: computeLockHours(ev.rsvp_lock_at, ev.event_date, ev.event_time),
      push_notify: false,
    });
    setEditId(ev.id);
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    await supabase.from('events').delete().eq('id', id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (selectedEvent?.id === id) setSelectedEvent(null);
    setDeleteConfirm(null);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.team_id) return;
    setSaving(true);
    const eventDate = form.event_date;
    const eventTime = form.hasTime ? form.event_time : null;
    const savedTitle = form.type === 'game'
      ? `${form.homeAway === 'home' ? 'vs' : '@'} ${form.title.trim()}`
      : form.title.trim();
    function computeLockAt(): string | null {
      if (!form.require_rsvp || !eventTime) return null;
      const t = eventTime.substring(0, 5);
      const dt = new Date(`${eventDate}T${t}:00`);
      dt.setHours(dt.getHours() - form.rsvp_lock_hours);
      return dt.toISOString();
    }
    const payload = {
      title: savedTitle, type: form.type, team_id: form.team_id,
      event_date: eventDate, event_time: eventTime,
      location: form.location.trim() || null,
      address: form.address.trim() || null,
      lat: form.lat,
      lng: form.lng,
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
    let eventId = editId;
    if (editId) {
      await supabase.from('events').update(payload).eq('id', editId);
    } else {
      const { data } = await supabase.from('events').insert(payload).select('id').single();
      eventId = (data as any)?.id ?? null;
    }
    if (!editId && form.push_notify && eventId) {
      const teamName = teams.find((t) => t.id === form.team_id)?.name ?? 'your team';
      const label = new Date(form.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      try {
        await supabase.functions.invoke('send-push', {
          body: { team_id: form.team_id, type: 'new_event', title: `New ${TYPE_LABELS[form.type]} — ${teamName}`, body: `${savedTitle} · ${label}${eventTime ? ' · ' + fmtTime(eventTime) : ''}`, data: { event_id: eventId } },
        });
      } catch { /* non-critical */ }
    }
    setSaving(false);
    setShowModal(false);
    loadEvents();
  }

  const displayed = events.filter((e) => filterTeam === 'all' || e.team_id === filterTeam);

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
    <div style={{ padding: '32px 36px', maxWidth: selectedEvent ? '1200px' : '960px', transition: 'max-width 0.2s' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>Schedule</h1>
          <p style={{ fontSize: '13px', color: '#64748B' }}>Manage events across your teams</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowAI(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', color: '#374151', fontWeight: '600', fontSize: '14px', padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #E2E8F0', cursor: 'pointer' }}>
            <Sparkles size={15} color="#8B5CF6" /> AI Import
          </button>
          <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', fontWeight: '700', fontSize: '14px', padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> New Event
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>

        {/* View mode toggle */}
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px' }}>
          {([['list', <List key="l" size={13} />, 'List'], ['calendar', <CalendarDays key="c" size={13} />, 'Calendar']] as const).map(([mode, icon, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px',
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
          <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px' }}>
            {(['upcoming', 'past'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px',
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
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* ── Main content ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Calendar view */}
          {viewMode === 'calendar' && (
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
                <button onClick={() => { setCalMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }); setSelectedCalDay(null); }}
                  style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex' }}>
                  <ChevronLeft size={16} color="#374151" />
                </button>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>
                  {MONTH_NAMES[calMonth.month]} {calMonth.year}
                </div>
                <button onClick={() => { setCalMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }); setSelectedCalDay(null); }}
                  style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex' }}>
                  <ChevronRight size={16} color="#374151" />
                </button>
              </div>

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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #F1F5F9' }}>
                {DAY_NAMES.map((d) => (
                  <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.05em' }}>{d}</div>
                ))}
              </div>

              {/* Calendar cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {calDays.map((day, i) => {
                  const todayD    = todayDate.getDate();
                  const isToday   = day === todayD && calMonth.month === todayDate.getMonth() && calMonth.year === todayDate.getFullYear();
                  const isSelected = day === selectedCalDay;
                  const dayEvents = day ? (eventsByDay[day] ?? []) : [];
                  const isLast    = i >= calDays.length - 7;
                  const multiTeam = filterTeam === 'all' && teams.length > 1;
                  return (
                    <div key={i}
                      onClick={() => day && setSelectedCalDay(isSelected ? null : day)}
                      style={{
                        minHeight: '90px',
                        borderRight: (i + 1) % 7 !== 0 ? '1px solid #F1F5F9' : 'none',
                        borderBottom: isLast ? 'none' : '1px solid #F1F5F9',
                        padding: '8px',
                        background: isSelected ? `${primary}08` : day ? '#fff' : '#FAFAFA',
                        cursor: day ? 'pointer' : 'default',
                        transition: 'background 0.1s',
                        outline: isSelected ? `2px solid ${primary}40` : 'none',
                        outlineOffset: '-2px',
                      }}
                    >
                      {day && (
                        <>
                          <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: isToday ? primary : isSelected ? `${primary}20` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: isToday || isSelected ? '800' : '500', color: isToday ? '#fff' : isSelected ? primary : '#374151' }}>{day}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {dayEvents.slice(0, 3).map((ev) => {
                              const teamColor = multiTeam ? teamColorMap[ev.team_id] : TYPE_COLORS[ev.type];
                              return (
                                <button key={ev.id}
                                  onClick={(e) => { e.stopPropagation(); setSelectedCalDay(day); setSelectedEvent(ev); }}
                                  style={{ display: 'flex', alignItems: 'center', gap: '0', background: TYPE_BG[ev.type], border: `1px solid ${TYPE_COLORS[ev.type]}25`, borderRadius: '5px', padding: '0', cursor: 'pointer', width: '100%', textAlign: 'left', overflow: 'hidden' }}>
                                  <div style={{ width: '3px', alignSelf: 'stretch', background: teamColor, flexShrink: 0 }} />
                                  <div style={{ flex: 1, padding: '2px 4px', minWidth: 0 }}>
                                    <div style={{ fontSize: '10px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {ev.event_time ? fmtTime(ev.event_time).split(':')[0] + fmtTime(ev.event_time).split(' ')[1]?.toLowerCase().replace('m','') : ''} {ev.title}
                                    </div>
                                    {ev.team_name && (
                                      <div style={{ fontSize: '9px', fontWeight: '700', color: teamColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px', opacity: 0.85 }}>
                                        {ev.team_name}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                            {dayEvents.length > 3 && (
                              <span style={{ fontSize: '10px', color: '#94A3B8', paddingLeft: '4px' }}>+{dayEvents.length - 3} more</span>
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
                              style={{ display: 'flex', alignItems: 'center', gap: '0', background: isActive ? `${primary}08` : '#fff', border: `1.5px solid ${isActive ? primary : '#E2E8F0'}`, borderRadius: '10px', overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.1s' }}>
                              <div style={{ width: '4px', alignSelf: 'stretch', background: teamColor, flexShrink: 0 }} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: TYPE_COLORS[ev.type], background: TYPE_BG[ev.type], borderRadius: '5px', padding: '2px 7px', flexShrink: 0 }}>
                                  {TYPE_LABELS[ev.type]}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
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
            </div>
          )}

          {/* List view */}
          {viewMode === 'list' && (
            loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
                <div style={{ width: '28px', height: '28px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : sortedDates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <CalendarDays size={40} color="#CBD5E1" style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748B', marginBottom: '4px' }}>No {tab} events</div>
                <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '20px' }}>
                  {tab === 'upcoming' ? 'Add your first event to get started' : 'Past events will appear here'}
                </div>
                {tab === 'upcoming' && (
                  <button onClick={openCreate} style={{ background: primary, color: '#fff', fontWeight: '700', fontSize: '13px', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                    + Add Event
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                {sortedDates.map((date) => {
                  const isToday = date === today;
                  return (
                    <div key={date}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', color: isToday ? primary : '#64748B', background: isToday ? `${primary}12` : '#F1F5F9', padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>
                          {fmtDate(date)}
                        </span>
                        <div style={{ flex: 1, height: '1px', background: '#F1F5F9' }} />
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
                            onSelect={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                            onEdit={() => openEdit(ev)}
                            onDelete={() => setDeleteConfirm({ id: ev.id, title: ev.title })}
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
          <div style={{ width: '340px', flexShrink: 0, background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', position: 'sticky', top: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}>

            {/* Panel header */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
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

            {/* RSVP summary pills */}
            {!rsvpLoading && (
              <div style={{ display: 'flex', gap: '8px', padding: '12px 18px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ flex: 1, textAlign: 'center', background: '#F0FDF4', borderRadius: '10px', padding: '8px 6px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#16A34A' }}>{attending.length}</div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#22C55E' }}>Going</div>
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

            {/* Player list */}
            <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
              {rsvpLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <div style={{ width: '22px', height: '22px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                </div>
              ) : rsvpPlayers.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <Users size={28} color="#CBD5E1" style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '13px', color: '#94A3B8' }}>No players on this team yet</div>
                </div>
              ) : (
                <>
                  {[{ list: attending, label: 'Going', color: '#16A34A', bg: '#F0FDF4' },
                    { list: notAttending, label: 'Not going', color: '#DC2626', bg: '#FEF2F2' },
                    { list: pending, label: 'No response', color: '#94A3B8', bg: '#F8FAFC' }].map(({ list, label, color, bg }) =>
                    list.length > 0 && (
                      <div key={label}>
                        <div style={{ padding: '8px 18px 4px', fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', background: '#FAFAFA', borderTop: '1px solid #F1F5F9' }}>
                          {label} · {list.length}
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
                      </div>
                    )
                  )}
                </>
              )}
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
                  <div>
                    <label style={labelStyle}>Venue name</label>
                    <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. City Park" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Address</label>
                    <LocationAutocomplete
                      value={form.address}
                      onChange={(v) => setForm((f) => ({ ...f, address: v, lat: null, lng: null }))}
                      onSelect={({ address, name, lat, lng }) => setForm((f) => ({
                        ...f,
                        address,
                        lat,
                        lng,
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

                {/* Notify parents (new events only) */}
                {!editId && (
                  <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {form.push_notify ? <Bell size={16} color={primary} /> : <BellOff size={16} color="#94A3B8" />}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>Notify parents &amp; players</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>Send push to all team members</div>
                      </div>
                    </div>
                    <button onClick={() => setForm((f) => ({ ...f, push_notify: !f.push_notify }))}
                      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: form.push_notify ? primary : '#CBD5E1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', left: form.push_notify ? '22px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.title.trim()} style={{ flex: 2, padding: '11px', background: saving || !form.title.trim() ? '#86EFAC' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: saving || !form.title.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAI && <AIScheduleImport onClose={() => setShowAI(false)} onDone={() => loadEvents()} />}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '380px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <Trash2 size={20} color="#EF4444" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Delete event?</div>
            <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>
              <strong style={{ color: '#0F172A' }}>{deleteConfirm.title}</strong> will be permanently deleted including all RSVPs.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

type PlaceSuggestion = { place_id: string; description: string };

function LocationAutocomplete({
  value, onChange, onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: { address: string; name: string; lat: number | null; lng: number | null }) => void;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [fetching, setFetching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleChange(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 3) { setSuggestions([]); return; }
    timer.current = setTimeout(() => fetchSuggestions(v), 350);
  }

  async function fetchSuggestions(q: string) {
    setFetching(true);
    try {
      const res  = await fetch(`/api/places?input=${encodeURIComponent(q)}`);
      const json = await res.json();
      setSuggestions((json.predictions ?? []).slice(0, 5));
    } catch { setSuggestions([]); }
    setFetching(false);
  }

  async function pick(s: PlaceSuggestion) {
    onChange(s.description);
    setSuggestions([]);
    try {
      const res  = await fetch(`/api/places?place_id=${encodeURIComponent(s.place_id)}`);
      const json = await res.json();
      const loc  = json.result?.geometry?.location;
      onSelect({ address: s.description, name: json.result?.name ?? s.description, lat: loc?.lat ?? null, lng: loc?.lng ?? null });
    } catch {
      onSelect({ address: s.description, name: s.description, lat: null, lng: null });
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Street address or location…"
          style={{ ...inputStyle, paddingRight: fetching ? '36px' : '13px' }}
        />
        {fetching && (
          <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', border: '2px solid #E2E8F0', borderTopColor: '#64748B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        )}
      </div>
      {suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, marginTop: '4px', overflow: 'hidden' }}>
          {suggestions.map((s, i) => (
            <button key={s.place_id} onClick={() => pick(s)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: i < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}
            >
              <MapPin size={13} color="#94A3B8" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#374151', lineHeight: '1.4' }}>{s.description}</span>
            </button>
          ))}
        </div>
      )}
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

function EventRow({ ev, primary, showTeam, selected, rsvpSummary, onSelect, onEdit, onDelete }: {
  ev: Event; primary: string; showTeam: boolean; selected: boolean;
  rsvpSummary: { attending: number; not_attending: number; total: number } | null;
  onSelect: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const color = TYPE_COLORS[ev.type];
  const bg    = TYPE_BG[ev.type];

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: selected ? `${primary}06` : '#fff',
        borderRadius: '14px',
        border: `1.5px solid ${selected ? primary : hover ? '#CBD5E1' : '#E2E8F0'}`,
        display: 'flex', alignItems: 'stretch', overflow: 'hidden',
        boxShadow: hover ? '0 4px 16px rgba(0,0,0,0.07)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.15s', transform: hover ? 'translateY(-1px)' : 'none', cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      <div style={{ width: '5px', flexShrink: 0, background: `linear-gradient(180deg, ${color}, ${color}80)` }} />
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 16px 14px 14px', borderRight: '1px solid #F8FAFC', minWidth: '72px' }}>
        <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{ev.event_time ? fmtTime(ev.event_time).split(' ')[0] : '—'}</span>
        {ev.event_time && <span style={{ fontSize: '11px', fontWeight: '600', color: '#94A3B8', marginTop: '2px' }}>{fmtTime(ev.event_time).split(' ')[1]}</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top row */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px', background: bg, borderRadius: '7px', padding: '5px 9px', border: `1px solid ${color}20` }}>
            <span style={{ fontSize: '13px', lineHeight: 1 }}>{TYPE_EMOJI[ev.type]}</span>
            <span style={{ fontSize: '11px', fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{TYPE_LABELS[ev.type]}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
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
