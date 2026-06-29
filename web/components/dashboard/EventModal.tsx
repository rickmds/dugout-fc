'use client';

import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Bell, BellOff, MapPin, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

export type EventFull = {
  id: string; title: string; type: string;
  event_date: string; event_time: string | null;
  location: string | null; address: string | null;
  lat: number | null; lng: number | null;
  duration_minutes: number | null; arrival_buffer_minutes: number | null;
  field_type: string | null; field_notes: string | null;
  uniform: string | null; notes: string | null; coach_notes: string | null;
  require_rsvp: boolean; rsvp_lock_at: string | null; team_id: string;
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

interface EventModalProps {
  event: EventFull | null;
  teamId: string;
  teams: Array<{ id: string; name: string }>;
  primary: string;
  profileId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = { game: 'Game', training: 'Training', other: 'Other' };
const TYPE_COLORS: Record<string, string> = { game: '#EF4444', training: '#22C55E', other: '#8B5CF6' };
const TYPE_BG:    Record<string, string>  = { game: '#FEF2F2', training: '#F0FDF4', other: '#F5F3FF' };

const DURATION_OPTIONS = [
  { label: '30 min', value: 30 }, { label: '45 min', value: 45 },
  { label: '1h', value: 60 },     { label: '1h 15min', value: 75 },
  { label: '1h 30min', value: 90 },{ label: '1h 45min', value: 105 },
  { label: '2h', value: 120 },    { label: '2h 30min', value: 150 },
  { label: '3h', value: 180 },
];
const ARRIVAL_OPTIONS = [
  { label: '5 min before', value: 5 },  { label: '10 min before', value: 10 },
  { label: '15 min before', value: 15 },{ label: '20 min before', value: 20 },
  { label: '30 min before', value: 30 },{ label: '45 min before', value: 45 },
  { label: '1h before', value: 60 },
];
const RSVP_LOCK_OPTIONS = [
  { label: 'At event start', value: 0 },{ label: '12 hrs before', value: 12 },
  { label: '24 hrs before', value: 24 },{ label: '48 hrs before', value: 48 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

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
    event_time: '10:00', hasTime: false,
    duration_minutes: null, arrival_buffer_minutes: null,
    location: '', address: '', lat: null, lng: null,
    field_type: null, field_notes: '', uniform: null,
    notes: '', coach_notes: '',
    require_rsvp: true, rsvp_lock_hours: 24, push_notify: false,
  };
}

function formFromEvent(ev: EventFull): FormState {
  const gameTitle = ev.type === 'game' ? parseGameTitle(ev.title) : null;
  return {
    title: gameTitle ? gameTitle.opponent : ev.title,
    homeAway: gameTitle?.homeAway ?? 'home',
    type: ev.type as 'game' | 'training' | 'other',
    team_id: ev.team_id,
    event_date: ev.event_date,
    event_time: ev.event_time ?? '10:00',
    hasTime: !!ev.event_time,
    duration_minutes: ev.duration_minutes,
    arrival_buffer_minutes: ev.arrival_buffer_minutes,
    location: ev.location ?? '',
    address: ev.address ?? '',
    lat: ev.lat, lng: ev.lng,
    field_type: (ev.field_type as 'turf' | 'grass') ?? null,
    field_notes: ev.field_notes ?? '',
    uniform: (ev.uniform as 'home' | 'away' | 'training') ?? null,
    notes: ev.notes ?? '',
    coach_notes: ev.coach_notes ?? '',
    require_rsvp: ev.require_rsvp ?? true,
    rsvp_lock_hours: computeLockHours(ev.rsvp_lock_at, ev.event_date, ev.event_time),
    push_notify: false,
  };
}

// ── LocationAutocomplete ────────────────────────────────────────────────────────

type PlaceSuggestion = { place_id: string; description: string };

function LocationAutocomplete({ value, onChange, onSelect, inputStyle }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: { address: string; name: string; lat: number | null; lng: number | null }) => void;
  inputStyle: React.CSSProperties;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [fetching,    setFetching]    = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleChange(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 3) { setSuggestions([]); return; }
    timer.current = setTimeout(() => {
      setFetching(true);
      fetch(`/api/places?input=${encodeURIComponent(v)}`)
        .then(r => r.json())
        .then(j => { setSuggestions((j.predictions ?? []).slice(0, 5)); setFetching(false); })
        .catch(() => { setSuggestions([]); setFetching(false); });
    }, 350);
  }

  async function pick(s: PlaceSuggestion) {
    onChange(s.description); setSuggestions([]);
    try {
      const r = await fetch(`/api/places?place_id=${encodeURIComponent(s.place_id)}`);
      const j = await r.json();
      const loc = j.result?.geometry?.location;
      onSelect({ address: s.description, name: j.result?.name ?? s.description, lat: loc?.lat ?? null, lng: loc?.lng ?? null });
    } catch { onSelect({ address: s.description, name: s.description, lat: null, lng: null }); }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input value={value} onChange={e => handleChange(e.target.value)} placeholder="Street address or location…"
          style={{ ...inputStyle, paddingRight: fetching ? '36px' : undefined }} />
        {fetching && <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', border: '2px solid #E2E8F0', borderTopColor: '#64748B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
      </div>
      {suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 300, marginTop: '4px', overflow: 'hidden' }}>
          {suggestions.map((s, i) => (
            <button key={s.place_id} onClick={() => pick(s)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: i < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function EventModal({ event, teamId, teams, primary, profileId, onClose, onSaved }: EventModalProps) {
  const [form,    setForm]    = useState<FormState>(() => event ? formFromEvent(event) : emptyForm(teamId));
  const [saving,  setSaving]  = useState(false);
  const [deleting,setDeleting]= useState(false);
  const [showDel, setShowDel] = useState(false);
  const isEdit = !!event;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: '9px',
    border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: '700', color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block', marginBottom: '6px',
  };
  const sectionStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: '800', color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    padding: '0 0 8px', marginBottom: '16px',
    borderBottom: '1px solid #F1F5F9',
  };

  async function handleSave() {
    if (!form.title.trim() || !form.team_id) return;
    setSaving(true);

    const eventTime  = form.hasTime ? form.event_time : null;
    const savedTitle = form.type === 'game'
      ? `${form.homeAway === 'home' ? 'vs' : '@'} ${form.title.trim()}`
      : form.title.trim();

    function computeLockAt(): string | null {
      if (!form.require_rsvp || !eventTime) return null;
      const dt = new Date(`${form.event_date}T${eventTime}:00`);
      dt.setHours(dt.getHours() - form.rsvp_lock_hours);
      return dt.toISOString();
    }

    const payload = {
      title: savedTitle, type: form.type, team_id: form.team_id,
      event_date: form.event_date, event_time: eventTime,
      location: form.location.trim() || null, address: form.address.trim() || null,
      lat: form.lat, lng: form.lng,
      duration_minutes: form.duration_minutes, arrival_buffer_minutes: form.arrival_buffer_minutes,
      field_type: form.field_type, field_notes: form.field_notes.trim() || null,
      uniform: form.uniform, notes: form.notes.trim() || null,
      coach_notes: form.coach_notes.trim() || null,
      require_rsvp: form.require_rsvp, rsvp_lock_at: computeLockAt(),
      created_by: profileId,
    };

    let eventId = event?.id ?? null;
    if (isEdit) {
      await supabase.from('events').update(payload).eq('id', event!.id);
    } else {
      const { data } = await supabase.from('events').insert(payload).select('id').single();
      eventId = (data as any)?.id ?? null;
    }

    if (!isEdit && form.push_notify && eventId) {
      try {
        const teamName = teams.find(t => t.id === form.team_id)?.name ?? 'your team';
        await supabase.functions.invoke('send-push', {
          body: { team_id: form.team_id, type: 'new_event', title: `New ${TYPE_LABELS[form.type]} — ${teamName}`, body: savedTitle, data: { event_id: eventId } },
        });
      } catch { /* non-critical */ }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    await supabase.from('events').delete().eq('id', event.id);
    setDeleting(false);
    onSaved();
    onClose();
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '24px' }} onClick={onClose}>
        <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', margin: 0 }}>{isEdit ? 'Edit Event' : 'New Event'}</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {isEdit && (
                <button onClick={() => setShowDel(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #FEE2E2', background: '#FFF5F5', cursor: 'pointer', fontSize: '12px', color: '#EF4444', fontWeight: '600' }}>
                  <Trash2 size={12} /> Delete
                </button>
              )}
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}><X size={18} color="#64748B" /></button>
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '0' }}>

            {/* EVENT */}
            <div style={sectionStyle}>EVENT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>Type</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['game', 'training', 'other'] as const).map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                      style={{ flex: 1, padding: '9px 0', borderRadius: '8px', fontFamily: 'inherit', cursor: 'pointer', fontSize: '13px', fontWeight: form.type === t ? '700' : '500', border: `2px solid ${form.type === t ? TYPE_COLORS[t] : '#E2E8F0'}`, background: form.type === t ? TYPE_BG[t] : '#fff', color: form.type === t ? TYPE_COLORS[t] : '#64748B' }}>
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
                      <button key={v} onClick={() => setForm(f => ({ ...f, homeAway: v }))}
                        style={{ flex: 1, padding: '9px 0', borderRadius: '8px', fontFamily: 'inherit', cursor: 'pointer', fontSize: '13px', fontWeight: form.homeAway === v ? '700' : '500', border: `2px solid ${form.homeAway === v ? primary : '#E2E8F0'}`, background: form.homeAway === v ? `${primary}18` : '#fff', color: form.homeAway === v ? primary : '#64748B' }}>
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
              {teams.length > 1 && (
                <div>
                  <label style={labelStyle}>Team</label>
                  <div style={{ position: 'relative' }}>
                    <select value={form.team_id} onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))} style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              )}
            </div>

            {/* DATE & TIME */}
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

            {/* LOCATION */}
            <div style={sectionStyle}>LOCATION</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>Venue name</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. City Park" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <LocationAutocomplete value={form.address} inputStyle={inputStyle}
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

            {/* DETAILS */}
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

            {/* Notify (new events only) */}
            {!isEdit && (
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

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', flexShrink: 0 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              style={{ flex: 2, padding: '11px', background: saving || !form.title.trim() ? '#86EFAC' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: saving || !form.title.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {showDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '24px' }} onClick={() => setShowDel(false)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '380px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <Trash2 size={20} color="#EF4444" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Delete event?</div>
            <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>
              <strong style={{ color: '#0F172A' }}>{event?.title}</strong> will be permanently deleted including all RSVPs.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowDel(false)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
