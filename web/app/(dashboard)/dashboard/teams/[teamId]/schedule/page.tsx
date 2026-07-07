'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Plus, CalendarDays, MapPin, Clock, Bell, BellOff, Pencil,
  Trash2, X, ChevronDown, Users, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

// ── Types ──────────────────────────────────────────────────────────────────────

type Event = {
  id: string; title: string; type: 'game' | 'training' | 'other';
  event_date: string; event_time: string | null;
  location: string | null; address: string | null;
  lat: number | null; lng: number | null;
  duration_minutes: number | null; arrival_buffer_minutes: number | null;
  field_type: string | null; field_notes: string | null;
  uniform: string | null; notes: string | null; coach_notes: string | null;
  require_rsvp: boolean; rsvp_lock_at: string | null; team_id: string;
  attending: number; not_attending: number; total: number;
};

type RsvpPlayer = {
  id: string; full_name: string; jersey_number: number | null;
  position: string | null; status: 'attending' | 'not_attending' | 'pending';
  rsvp_id: string | null;
};

type FormState = {
  title: string; type: 'game' | 'training' | 'other';
  homeAway: 'home' | 'away'; team_id: string;
  event_date: string; event_time: string; hasTime: boolean;
  duration_minutes: number | null; arrival_buffer_minutes: number | null;
  location: string; address: string; lat: number | null; lng: number | null;
  field_type: 'turf' | 'grass' | null; field_notes: string;
  uniform: 'home' | 'away' | 'training' | null;
  notes: string; coach_notes: string;
  require_rsvp: boolean; rsvp_lock_hours: number; push_notify: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = { game: 'Game', training: 'Training', other: 'Other' };
const TYPE_COLORS: Record<string, string> = { game: '#EF4444', training: '#22C55E', other: '#8B5CF6' };
const TYPE_BG:    Record<string, string>  = { game: '#FEF2F2', training: '#F0FDF4', other: '#F5F3FF' };
const TYPE_EMOJI: Record<string, string>  = { game: '⚽', training: '🏃', other: '📌' };

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

const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: '700', color: '#64748B', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };
const inputStyle: React.CSSProperties = { width: '100%', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const sectionStyle: React.CSSProperties = { fontSize: '10px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #F1F5F9' };

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  const diff = Math.round((new Date(`${eventDate}T${eventTime}:00`).getTime() - new Date(rsvpLockAt).getTime()) / 3600000);
  if (diff <= 0) return 0; if (diff <= 12) return 12; if (diff <= 24) return 24; return 48;
}

function emptyForm(teamId: string): FormState {
  return {
    title: '', type: 'training', homeAway: 'home', team_id: teamId,
    event_date: new Date().toISOString().split('T')[0],
    event_time: '10:00', hasTime: true,
    duration_minutes: null, arrival_buffer_minutes: null,
    location: '', address: '', lat: null, lng: null,
    field_type: null, field_notes: '', uniform: null,
    notes: '', coach_notes: '',
    require_rsvp: true, rsvp_lock_hours: 24, push_notify: false,
  };
}

// ── LocationAutocomplete ────────────────────────────────────────────────────────

type PlaceSuggestion = { place_id: string; description: string };

function LocationAutocomplete({ value, onChange, onSelect }: {
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
    timer.current = setTimeout(async () => {
      setFetching(true);
      try {
        const res = await fetch(`/api/places?input=${encodeURIComponent(v)}`);
        const json = await res.json();
        setSuggestions((json.predictions ?? []).slice(0, 5));
      } catch { setSuggestions([]); }
      setFetching(false);
    }, 350);
  }

  async function pick(s: PlaceSuggestion) {
    onChange(s.description); setSuggestions([]);
    try {
      const res = await fetch(`/api/places?place_id=${encodeURIComponent(s.place_id)}`);
      const json = await res.json();
      const loc = json.result?.geometry?.location;
      onSelect({ address: s.description, name: json.result?.name ?? s.description, lat: loc?.lat ?? null, lng: loc?.lng ?? null });
    } catch { onSelect({ address: s.description, name: s.description, lat: null, lng: null }); }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input value={value} onChange={e => handleChange(e.target.value)} placeholder="Street address or location…"
          style={{ ...inputStyle, paddingRight: fetching ? '36px' : '13px' }} />
        {fetching && <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', border: '2px solid #E2E8F0', borderTopColor: '#64748B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
      </div>
      {suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, marginTop: '4px', overflow: 'hidden' }}>
          {suggestions.map((s, i) => (
            <button key={s.place_id} onClick={() => pick(s)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: i < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
              <MapPin size={13} color="#94A3B8" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#374151', lineHeight: '1.4' }}>{s.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── EventInfoPills ─────────────────────────────────────────────────────────────

function EventInfoPills({ ev, primary }: { ev: Event; primary: string }) {
  const isHome = ev.type === 'game' && ev.title.startsWith('vs ');
  const isAway = ev.type === 'game' && ev.title.startsWith('@ ');
  const pills: { label: string; color: string; bg: string; border: string }[] = [];
  if (isHome || isAway) {
    pills.push(isHome
      ? { label: 'Home', color: '#16A34A', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' }
      : { label: 'Away', color: '#EA580C', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.25)' });
  }
  if (ev.field_type) {
    pills.push(ev.field_type === 'turf'
      ? { label: 'Turf', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)' }
      : { label: 'Grass', color: '#16A34A', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' });
  }
  if (ev.uniform) pills.push({ label: ev.uniform.charAt(0).toUpperCase() + ev.uniform.slice(1) + ' kit', color: primary, bg: `${primary}15`, border: `${primary}30` });
  if (ev.arrival_buffer_minutes) pills.push({ label: `Arrive ${ev.arrival_buffer_minutes}min early`, color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' });
  if (!pills.length) return null;
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
      {pills.map(p => (
        <span key={p.label} style={{ fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '20px', background: p.bg, color: p.color, border: `1px solid ${p.border}`, whiteSpace: 'nowrap' }}>{p.label}</span>
      ))}
    </div>
  );
}

// ── EventRow ───────────────────────────────────────────────────────────────────

function EventRow({ ev, primary, selected, onSelect, onEdit, onDelete }: {
  ev: Event; primary: string; selected: boolean;
  onSelect: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const color = TYPE_COLORS[ev.type];
  const pending = Math.max(0, ev.total - ev.attending - ev.not_attending);

  return (
    <div id={`event-${ev.id}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      style={{
        background: selected ? `${primary}0D` : '#fff',
        borderRadius: '14px',
        border: `1.5px solid ${selected ? primary : hover ? '#CBD5E1' : '#E2E8F0'}`,
        display: 'flex', alignItems: 'stretch', overflow: 'hidden',
        boxShadow: hover ? '0 4px 16px rgba(0,0,0,0.07)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.15s', transform: hover ? 'translateY(-1px)' : 'none', cursor: 'pointer',
      }}>
      <div style={{ width: '5px', flexShrink: 0, background: `linear-gradient(180deg, ${color}, ${color}80)` }} />
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 16px 14px 14px', borderRight: '1px solid #F8FAFC', minWidth: '72px' }}>
        <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{ev.event_time ? fmtTime(ev.event_time).split(' ')[0] : '—'}</span>
        {ev.event_time && <span style={{ fontSize: '11px', fontWeight: '600', color: '#94A3B8', marginTop: '2px' }}>{fmtTime(ev.event_time).split(' ')[1]}</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px', background: TYPE_BG[ev.type], borderRadius: '7px', padding: '5px 9px', border: `1px solid ${color}20` }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0, opacity: hover ? 1 : 0.35, transition: 'opacity 0.15s' }} onClick={e => e.stopPropagation()}>
            <button onClick={e => { e.stopPropagation(); onEdit(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '7px', borderRadius: '7px', display: 'flex' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
              <Pencil size={14} color="#64748B" />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '7px', borderRadius: '7px', display: 'flex' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FEF2F2'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
              <Trash2 size={14} color="#94A3B8" />
            </button>
          </div>
        </div>
        {ev.total > 0 && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, height: '4px', borderRadius: '4px', overflow: 'hidden', display: 'flex', background: '#F1F5F9' }}>
                {ev.attending > 0 && <div style={{ flex: ev.attending, background: '#22C55E' }} />}
                {pending > 0 && <div style={{ flex: pending, background: '#CBD5E1' }} />}
                {ev.not_attending > 0 && <div style={{ flex: ev.not_attending, background: '#EF4444' }} />}
              </div>
              <span style={{ fontSize: '10px', fontWeight: '700', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: '#16A34A' }}>{ev.attending}</span>
                <span style={{ color: '#CBD5E1', margin: '0 2px' }}>·</span>
                <span style={{ color: '#94A3B8' }}>{pending}</span>
                <span style={{ color: '#CBD5E1', margin: '0 2px' }}>·</span>
                <span style={{ color: '#DC2626' }}>{ev.not_attending}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TeamSchedulePage() {
  const { teamId } = useParams<{ teamId: string }>();
  const searchParams = useSearchParams();
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const today   = new Date().toISOString().slice(0, 10);

  const [events,     setEvents]     = useState<Event[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<'upcoming' | 'past'>('upcoming');
  const [editId,     setEditId]     = useState<string | null>(null);
  const [form,       setForm]       = useState<FormState>(emptyForm(teamId));
  const [saving,     setSaving]     = useState(false);
  const [delTitle,   setDelTitle]   = useState('');

  // RSVP panel
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [rsvpPlayers,   setRsvpPlayers]   = useState<RsvpPlayer[]>([]);
  const [rsvpLoading,   setRsvpLoading]   = useState(false);

  const dialogRef    = useRef<HTMLDialogElement>(null);
  const delDialogRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    const { data: evs } = await supabase
      .from('events')
      .select('id,title,type,event_date,event_time,location,address,lat,lng,duration_minutes,arrival_buffer_minutes,field_type,field_notes,uniform,notes,coach_notes,require_rsvp,rsvp_lock_at,team_id')
      .eq('team_id', teamId)
      .order('event_date', { ascending: tab === 'upcoming' })
      .order('event_time', { ascending: true });

    if (!evs?.length) { setEvents([]); setLoading(false); return; }

    const filtered = evs.filter(e => tab === 'upcoming' ? e.event_date >= today : e.event_date < today);
    if (!filtered.length) { setEvents([]); setLoading(false); return; }

    const eventIds = filtered.map(e => e.id);
    const [rsvpRes, countRes] = await Promise.all([
      supabase.from('event_rsvps').select('event_id,status').in('event_id', eventIds),
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
    ]);

    const total = (countRes as any).count ?? 0;
    const rsvpMap: Record<string, { attending: number; not_attending: number }> = {};
    for (const r of rsvpRes.data ?? []) {
      if (!rsvpMap[r.event_id]) rsvpMap[r.event_id] = { attending: 0, not_attending: 0 };
      if (r.status === 'attending') rsvpMap[r.event_id].attending++;
      else rsvpMap[r.event_id].not_attending++;
    }

    setEvents(filtered.map(e => ({
      ...e,
      type: e.type as 'game' | 'training' | 'other',
      attending:     rsvpMap[e.id]?.attending     ?? 0,
      not_attending: rsvpMap[e.id]?.not_attending ?? 0,
      total,
    })));
    setLoading(false);
  }, [teamId, tab]);

  useEffect(() => { load(); }, [load]);

  // Auto-select and scroll to event from ?event= query param
  useEffect(() => {
    const eventId = searchParams.get('event');
    if (!eventId || !events.length) return;
    const match = events.find((e) => e.id === eventId);
    if (!match) return;
    setSelectedEvent(match);
    setTimeout(() => {
      document.getElementById(`event-${eventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, [events, searchParams]);

  // Load RSVP players when an event is selected
  useEffect(() => {
    if (!selectedEvent) return;
    (async () => {
      setRsvpLoading(true);
      const [playerRes, rsvpRes] = await Promise.all([
        supabase.from('players').select('id,full_name,jersey_number,position').eq('team_id', teamId).order('full_name'),
        supabase.from('event_rsvps').select('id,player_id,status').eq('event_id', selectedEvent.id),
      ]);
      const rsvpMap = new Map<string, { id: string; status: 'attending' | 'not_attending' }>();
      for (const r of rsvpRes.data ?? []) rsvpMap.set(r.player_id, { id: r.id, status: r.status });
      setRsvpPlayers((playerRes.data ?? []).map(p => {
        const r = rsvpMap.get(p.id);
        return { ...p, status: r?.status ?? 'pending', rsvp_id: r?.id ?? null };
      }));
      setRsvpLoading(false);
    })();
  }, [selectedEvent, teamId]);

  async function toggleRsvp(player: RsvpPlayer, newStatus: 'attending' | 'not_attending' | 'pending') {
    if (!selectedEvent) return;
    if (newStatus === 'pending') {
      if (player.rsvp_id) await supabase.from('event_rsvps').delete().eq('id', player.rsvp_id);
      setRsvpPlayers(p => p.map(pl => pl.id === player.id ? { ...pl, status: 'pending', rsvp_id: null } : pl));
      return;
    }
    if (player.rsvp_id) {
      await supabase.from('event_rsvps').update({ status: newStatus }).eq('id', player.rsvp_id);
    } else {
      const { data } = await supabase.from('event_rsvps').insert({
        event_id: selectedEvent.id, player_id: player.id, status: newStatus, responded_by: profile?.id,
      }).select('id').single();
      setRsvpPlayers(p => p.map(pl => pl.id === player.id ? { ...pl, status: newStatus, rsvp_id: (data as any)?.id ?? null } : pl));
      return;
    }
    setRsvpPlayers(p => p.map(pl => pl.id === player.id ? { ...pl, status: newStatus } : pl));
  }

  function openCreate() {
    setForm(emptyForm(teamId));
    setEditId(null);
    dialogRef.current?.showModal();
  }

  function openEdit(ev: Event) {
    const gameTitle = ev.type === 'game' ? parseGameTitle(ev.title) : null;
    setForm({
      title: gameTitle ? gameTitle.opponent : ev.title,
      homeAway: gameTitle?.homeAway ?? 'home',
      type: ev.type, team_id: ev.team_id,
      event_date: ev.event_date, event_time: ev.event_time ?? '10:00', hasTime: !!ev.event_time,
      duration_minutes: ev.duration_minutes, arrival_buffer_minutes: ev.arrival_buffer_minutes,
      location: ev.location ?? '', address: ev.address ?? '', lat: ev.lat, lng: ev.lng,
      field_type: (ev.field_type as 'turf' | 'grass') ?? null,
      field_notes: ev.field_notes ?? '',
      uniform: (ev.uniform as 'home' | 'away' | 'training') ?? null,
      notes: ev.notes ?? '', coach_notes: ev.coach_notes ?? '',
      require_rsvp: ev.require_rsvp ?? true,
      rsvp_lock_hours: computeLockHours(ev.rsvp_lock_at, ev.event_date, ev.event_time),
      push_notify: false,
    });
    setEditId(ev.id);
    dialogRef.current?.showModal();
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const eventTime  = form.hasTime ? form.event_time : null;
      const savedTitle = form.type === 'game'
        ? `${form.homeAway === 'home' ? 'vs' : '@'} ${form.title.trim()}`
        : form.title.trim();
      const lockAt = (() => {
        if (!form.require_rsvp || !eventTime) return null;
        const t = eventTime.substring(0, 5); // normalise to HH:MM regardless of DB format
        const dt = new Date(`${form.event_date}T${t}:00`);
        dt.setHours(dt.getHours() - form.rsvp_lock_hours);
        return dt.toISOString();
      })();
      const payload = {
        title: savedTitle, type: form.type, team_id: teamId,
        event_date: form.event_date, event_time: eventTime,
        location: form.location.trim() || null, address: form.address.trim() || null,
        lat: form.lat, lng: form.lng,
        duration_minutes: form.duration_minutes, arrival_buffer_minutes: form.arrival_buffer_minutes,
        field_type: form.field_type, field_notes: form.field_notes.trim() || null,
        uniform: form.uniform, notes: form.notes.trim() || null,
        coach_notes: form.coach_notes.trim() || null,
        require_rsvp: form.require_rsvp, rsvp_lock_at: lockAt,
        created_by: profile?.id,
      };
      if (editId) {
        const { error } = await supabase.from('events').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('events').insert(payload).select('id').single();
        if (error) throw error;
        if (form.push_notify && (data as any)?.id) {
          try {
            const teamName = teams.find(t => t.id === teamId)?.name ?? 'your team';
            await supabase.functions.invoke('send-push', {
              body: { team_id: teamId, type: 'new_event', title: `New ${TYPE_LABELS[form.type]} — ${teamName}`, body: savedTitle, data: { event_id: (data as any).id } },
            });
          } catch { /* non-critical */ }
        }
      }
      dialogRef.current?.close();
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : JSON.stringify(err);
      alert(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ev = events.find((e) => e.id === id);
    await supabase.from('events').delete().eq('id', id);
    if (selectedEvent?.id === id) setSelectedEvent(null);
    delDialogRef.current?.close();
    load();
    if (ev && teamId) {
      supabase.functions.invoke('send-push', {
        body: { team_id: teamId, type: 'event_cancelled', title: '❌ Event cancelled', body: `${ev.title} has been cancelled`, data: { type: 'event_cancelled' } },
      }).catch(() => {});
    }
  }

  // Date grouping
  const grouped: Record<string, Event[]> = {};
  for (const ev of events) {
    grouped[ev.event_date] = grouped[ev.event_date] ?? [];
    grouped[ev.event_date].push(ev);
  }
  const sortedDates = Object.keys(grouped).sort((a, b) =>
    tab === 'upcoming' ? a.localeCompare(b) : b.localeCompare(a)
  );

  const attending    = rsvpPlayers.filter(p => p.status === 'attending');
  const notAttending = rsvpPlayers.filter(p => p.status === 'not_attending');
  const pending      = rsvpPlayers.filter(p => p.status === 'pending');

  return (
    <div style={{ maxWidth: selectedEvent ? '1200px' : '900px', transition: 'max-width 0.2s' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px' }}>
          {(['upcoming', 'past'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#0F172A' : '#64748B', fontSize: '13px', fontWeight: tab === t ? '700' : '500', cursor: 'pointer', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', textTransform: 'capitalize', fontFamily: 'inherit' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '9px', background: primary, color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit' }}>
          <Plus size={14} /> Add Event
        </button>
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* Event list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
              <div style={{ width: '28px', height: '28px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : sortedDates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 40px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <CalendarDays size={26} color="#94A3B8" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No {tab} events</div>
              <div style={{ fontSize: '13px', color: '#64748B', marginBottom: tab === 'upcoming' ? '20px' : '0' }}>
                {tab === 'upcoming' ? 'Create your first event to get started.' : 'No past events recorded for this team.'}
              </div>
              {tab === 'upcoming' && (
                <button onClick={openCreate} style={{ background: primary, color: '#fff', fontWeight: '700', fontSize: '13px', padding: '10px 22px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Add Event
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {sortedDates.map(date => {
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
                      {grouped[date].map(ev => (
                        <EventRow key={ev.id} ev={ev} primary={primary}
                          selected={selectedEvent?.id === ev.id}
                          onSelect={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                          onEdit={() => openEdit(ev)}
                          onDelete={() => { setDelTitle(ev.title); setEditId(ev.id); delDialogRef.current?.showModal(); }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RSVP Panel */}
        {selectedEvent && (
          <div style={{ width: '320px', flexShrink: 0, background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', position: 'sticky', top: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}>

            <div style={{ padding: '16px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: TYPE_COLORS[selectedEvent.type], flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', fontWeight: '700', color: TYPE_COLORS[selectedEvent.type], textTransform: 'uppercase', letterSpacing: '0.05em' }}>{TYPE_LABELS[selectedEvent.type]}</span>
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
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button onClick={() => openEdit(selectedEvent)} title="Edit event" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                  <Pencil size={14} color="#64748B" />
                </button>
                <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}>
                  <X size={16} color="#94A3B8" />
                </button>
              </div>
            </div>

            {!rsvpLoading && (
              <div style={{ display: 'flex', gap: '8px', padding: '12px 18px', borderBottom: '1px solid #F1F5F9' }}>
                {[{ count: attending.length, label: 'Going', numColor: '#16A34A', bg: '#F0FDF4', labelColor: '#22C55E' },
                  { count: notAttending.length, label: 'Out', numColor: '#DC2626', bg: '#FEF2F2', labelColor: '#EF4444' },
                  { count: pending.length, label: 'Pending', numColor: '#64748B', bg: '#F8FAFC', labelColor: '#94A3B8' }].map(({ count, label, numColor, bg, labelColor }) => (
                  <div key={label} style={{ flex: 1, textAlign: 'center', background: bg, borderRadius: '10px', padding: '8px 6px' }}>
                    <div style={{ fontSize: '20px', fontWeight: '900', color: numColor }}>{count}</div>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: labelColor }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

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
                        {list.map(p => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 18px', borderBottom: '1px solid #F8FAFC' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color, flexShrink: 0 }}>
                              {p.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name}</div>
                              {p.jersey_number != null && <div style={{ fontSize: '11px', color: '#94A3B8' }}>#{p.jersey_number}{p.position ? ` · ${p.position}` : ''}</div>}
                            </div>
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

      {/* Edit / Create modal */}
      <dialog ref={dialogRef} className="modal-form" onClick={e => { if (e.target === dialogRef.current) dialogRef.current.close(); }}
        style={{ padding: 0, margin: 'auto', border: 'none', borderRadius: '20px', width: 'calc(100vw - 48px)', maxWidth: '560px', maxHeight: '90vh', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden', background: '#fff' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', margin: 0 }}>{editId ? 'Edit Event' : 'New Event'}</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            {editId && (
              <button onClick={() => { dialogRef.current?.close(); setDelTitle(form.type === 'game' ? `${form.homeAway === 'home' ? 'vs' : '@'} ${form.title}` : form.title); delDialogRef.current?.showModal(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #FEE2E2', background: '#FFF5F5', cursor: 'pointer', fontSize: '12px', color: '#EF4444', fontWeight: '600', fontFamily: 'inherit' }}>
                <Trash2 size={12} /> Delete
              </button>
            )}
            <button onClick={() => dialogRef.current?.close()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex' }}><X size={18} color="#64748B" /></button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '0' }}>

            <div style={sectionStyle}>EVENT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>Type</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['game', 'training', 'other'] as const).map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{ flex: 1, padding: '9px 0', borderRadius: '8px', border: `2px solid ${form.type === t ? TYPE_COLORS[t] : '#E2E8F0'}`, background: form.type === t ? TYPE_BG[t] : '#fff', color: form.type === t ? TYPE_COLORS[t] : '#64748B', fontWeight: form.type === t ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              {form.type === 'game' && (
                <div>
                  <label style={labelStyle}>Venue</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['home', 'away'] as const).map(v => (
                      <button key={v} onClick={() => setForm(f => ({ ...f, homeAway: v }))} style={{ flex: 1, padding: '9px 0', borderRadius: '8px', border: `2px solid ${form.homeAway === v ? primary : '#E2E8F0'}`, background: form.homeAway === v ? `${primary}18` : '#fff', color: form.homeAway === v ? primary : '#64748B', fontWeight: form.homeAway === v ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {v === 'home' ? 'Home' : 'Away'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label style={labelStyle}>{form.type === 'game' ? 'Opponent' : 'Title'}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {form.type === 'game' && <span style={{ fontSize: '15px', fontWeight: '700', color: '#64748B', flexShrink: 0, width: '22px' }}>{form.homeAway === 'home' ? 'vs' : '@'}</span>}
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={form.type === 'game' ? 'Opponent name…' : form.type === 'training' ? 'e.g. Tuesday Training' : 'e.g. Team Meeting'}
                    style={{ ...inputStyle, flex: 1 }} />
                </div>
              </div>
            </div>

            <div style={sectionStyle}>DATE &amp; TIME</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Start time</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {form.hasTime
                      ? <input type="time" value={form.event_time} onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                      : <button onClick={() => setForm(f => ({ ...f, hasTime: true }))} style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', color: '#94A3B8', background: '#F8FAFC', flex: 1 }}>No time set</button>
                    }
                    {form.hasTime && <button onClick={() => setForm(f => ({ ...f, hasTime: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}><X size={14} color="#94A3B8" /></button>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Duration</label>
                  <div style={{ position: 'relative' }}>
                    <select value={form.duration_minutes ?? ''} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value ? Number(e.target.value) : null }))}
                      style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer', color: form.duration_minutes ? '#0F172A' : '#94A3B8' }}>
                      <option value="">Not set</option>
                      {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Arrive</label>
                  <div style={{ position: 'relative' }}>
                    <select value={form.arrival_buffer_minutes ?? ''} onChange={e => setForm(f => ({ ...f, arrival_buffer_minutes: e.target.value ? Number(e.target.value) : null }))}
                      style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer', color: form.arrival_buffer_minutes ? '#0F172A' : '#94A3B8' }}>
                      <option value="">Not set</option>
                      {ARRIVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={sectionStyle}>LOCATION</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>Venue name</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. City Park" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <LocationAutocomplete value={form.address}
                  onChange={v => setForm(f => ({ ...f, address: v, lat: null, lng: null }))}
                  onSelect={({ address, name, lat, lng }) => setForm(f => ({ ...f, address, lat, lng, location: f.location.trim() ? f.location : name }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Field details</label>
                <input value={form.field_notes} onChange={e => setForm(f => ({ ...f, field_notes: e.target.value }))} placeholder="e.g. Field 1, Pitch B" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Surface</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['turf', 'grass'] as const).map(s => (
                    <button key={s} onClick={() => setForm(f => ({ ...f, field_type: f.field_type === s ? null : s }))}
                      style={{ padding: '8px 20px', borderRadius: '8px', border: `2px solid ${form.field_type === s ? primary : '#E2E8F0'}`, background: form.field_type === s ? `${primary}12` : '#fff', color: form.field_type === s ? primary : '#64748B', fontWeight: form.field_type === s ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {s === 'turf' ? 'Turf' : 'Grass'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={sectionStyle}>DETAILS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>Uniform</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['home', 'away', 'training'] as const).map(u => (
                    <button key={u} onClick={() => setForm(f => ({ ...f, uniform: f.uniform === u ? null : u }))}
                      style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: `2px solid ${form.uniform === u ? primary : '#E2E8F0'}`, background: form.uniform === u ? `${primary}12` : '#fff', color: form.uniform === u ? primary : '#64748B', fontWeight: form.uniform === u ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {u.charAt(0).toUpperCase() + u.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Team message</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Visible to all players and parents…" rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.5', display: 'block' }} />
              </div>
              <div>
                <label style={labelStyle}>Coach notes <span style={{ fontWeight: '400', color: '#94A3B8', textTransform: 'none', letterSpacing: '0', fontSize: '11px' }}>(coach only)</span></label>
                <textarea value={form.coach_notes} onChange={e => setForm(f => ({ ...f, coach_notes: e.target.value }))} placeholder="Notes for coaching staff only…" rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.5', display: 'block' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>Require RSVP</span>
                <button onClick={() => setForm(f => ({ ...f, require_rsvp: !f.require_rsvp }))}
                  style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: form.require_rsvp ? primary : '#CBD5E1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', left: form.require_rsvp ? '22px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
              </div>
              {form.require_rsvp && (
                <div>
                  <label style={labelStyle}>RSVP closes</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {RSVP_LOCK_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setForm(f => ({ ...f, rsvp_lock_hours: o.value }))}
                        style={{ padding: '7px 12px', borderRadius: '8px', border: `2px solid ${form.rsvp_lock_hours === o.value ? primary : '#E2E8F0'}`, background: form.rsvp_lock_hours === o.value ? `${primary}12` : '#fff', color: form.rsvp_lock_hours === o.value ? primary : '#64748B', fontWeight: form.rsvp_lock_hours === o.value ? '700' : '500', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!editId && (
              <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {form.push_notify ? <Bell size={16} color={primary} /> : <BellOff size={16} color="#94A3B8" />}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>Notify parents &amp; players</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>Send push to all team members</div>
                  </div>
                </div>
                <button onClick={() => setForm(f => ({ ...f, push_notify: !f.push_notify }))}
                  style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: form.push_notify ? primary : '#CBD5E1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', left: form.push_notify ? '22px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button onClick={() => dialogRef.current?.close()} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()}
            style={{ flex: 2, padding: '11px', background: saving || !form.title.trim() ? '#86EFAC' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: saving || !form.title.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : editId ? 'Save changes' : 'Create Event'}
          </button>
        </div>
      </dialog>

      {/* Delete confirm */}
      <dialog ref={delDialogRef} onClick={e => { if (e.target === delDialogRef.current) delDialogRef.current.close(); }}
        style={{ padding: '24px', margin: 'auto', border: 'none', borderRadius: '20px', width: 'calc(100vw - 48px)', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', background: '#fff' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><Trash2 size={20} color="#EF4444" /></div>
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Delete event?</div>
        <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>
          <strong style={{ color: '#0F172A' }}>{delTitle}</strong> will be permanently deleted including all RSVPs.
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => delDialogRef.current?.close()} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={() => editId && handleDelete(editId)} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
        </div>
      </dialog>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        dialog.modal-form[open] { display: flex; flex-direction: column; }
        dialog[open]::backdrop { background: rgba(0,0,0,0.4); }
      `}</style>
    </div>
  );
}
