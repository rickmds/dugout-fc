'use client';

import { useRef, useState } from 'react';
import { X, Upload, AlertTriangle, CheckSquare, Square, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from './DashboardContext';
import type { Team } from './DashboardContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'game' | 'training' | 'other';
type Phase = 'idle' | 'processing' | 'review' | 'importing' | 'done';
type ImportMode = 'single' | 'club';

type ReviewEvent = {
  _id: string;
  teamId: string | null;
  teamName: string | null;
  date: string | null;
  time: string | null;
  title: string;
  type: EventType;
  location: string | null;
  address: string | null;
  uncertain: boolean;
  uncertaintyReason: string | null;
  selected: boolean;
};

type UnmatchedEvent = {
  date: string | null;
  time: string | null;
  title: string;
  type: EventType;
  raw_team_name: string;
  uncertaintyReason: string | null;
};

const TYPE_COLORS: Record<EventType, string> = { game: '#EF4444', training: '#22C55E', other: '#8B5CF6' };
const TYPE_BG: Record<EventType, string>     = { game: '#FEF2F2', training: '#F0FDF4', other: '#F5F3FF' };
const TYPE_LABELS: Record<EventType, string> = { game: 'Game', training: 'Training', other: 'Other' };

const PROCESSING_STEPS = [
  'Reading your file…',
  'Extracting events…',
  'Matching teams…',
  'Checking dates and times…',
  'Almost done…',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result as string; resolve(r.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function uid() { return Math.random().toString(36).slice(2); }

function matchTeam(name: string, teams: Team[]): Team | null {
  const n = name.toLowerCase().trim();
  return teams.find((t) => t.name.toLowerCase().trim() === n)
    ?? teams.find((t) => t.name.toLowerCase().includes(n) || n.includes(t.name.toLowerCase()))
    ?? null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIScheduleImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [phase, setPhase]       = useState<Phase>('idle');
  const [mode, setMode]         = useState<ImportMode>(profile?.role === 'org_admin' && teams.length > 1 ? 'club' : 'single');
  const [teamId, setTeamId]     = useState(teams[0]?.id ?? '');
  const [events, setEvents]     = useState<ReviewEvent[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedEvent[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [procStep, setProcStep] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [warningsOpen, setWarningsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOrgAdmin = profile?.role === 'org_admin';

  // ── File handling ──────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    if (!file) return;
    startProcessing();

    try {
      const base64 = await fileToBase64(file);
      const file_type = file.type || 'text/plain';

      if (mode === 'club') {
        await runClubSchedule(base64, file_type);
      } else {
        await runSingleSchedule(base64, file_type);
      }
    } catch (e) {
      stopProcessing();
      alert(`Could not read file: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setPhase('idle');
    }
  }

  async function runSingleSchedule(base64: string, file_type: string) {
    const { data, error } = await supabase.functions.invoke('parse-schedule', {
      body: { file_base64: base64, file_type },
    });
    stopProcessing();

    if (error || !data?.events) {
      alert(data?.error ?? error?.message ?? 'Failed to parse schedule.');
      setPhase('idle'); return;
    }
    if (!data.events.length) {
      alert('No events found in this file. Try a different format.'); setPhase('idle'); return;
    }

    setEvents(data.events.map((e: any) => ({
      _id: uid(), teamId, teamName: teams.find((t) => t.id === teamId)?.name ?? null,
      date: e.date, time: e.time, title: e.title, type: e.type,
      location: e.location, address: e.address,
      uncertain: !!e.uncertain, uncertaintyReason: e.uncertainty_reason ?? null,
      selected: !e.uncertain,
    })));
    setWarnings(data.warnings ?? []);
    setPhase('review');
  }

  async function runClubSchedule(base64: string, file_type: string) {
    const { data, error } = await supabase.functions.invoke('parse-club-schedule', {
      body: {
        file_base64: base64,
        file_type,
        existing_teams: teams.map((t) => ({ id: t.id, name: t.name })),
      },
    });
    stopProcessing();

    if (error || !data) {
      alert(data?.error ?? error?.message ?? 'Failed to parse schedule.');
      setPhase('idle'); return;
    }

    const allEvents: ReviewEvent[] = [];
    for (const te of data.team_events ?? []) {
      const matched = matchTeam(te.team_name, teams);
      for (const e of te.events ?? []) {
        allEvents.push({
          _id: uid(),
          teamId: matched?.id ?? null,
          teamName: te.team_name,
          date: e.date, time: e.time, title: e.title, type: e.type,
          location: e.location, address: e.address,
          uncertain: !!e.uncertain || !matched || !!te.uncertain,
          uncertaintyReason: !matched ? `Team "${te.team_name}" not matched` : (e.uncertainty_reason ?? null),
          selected: !e.uncertain && !!matched && !te.uncertain,
        });
      }
    }

    if (!allEvents.length && !(data.unmatched_events ?? []).length) {
      alert('No events found in this file.'); setPhase('idle'); return;
    }

    setEvents(allEvents);
    setUnmatched(data.unmatched_events ?? []);
    setWarnings(data.warnings ?? []);

    // Expand all team groups by default
    const teamNames = new Set(allEvents.map((e) => e.teamName ?? ''));
    setExpandedTeams(teamNames as Set<string>);
    setPhase('review');
  }

  function startProcessing() {
    setPhase('processing');
    setProcStep(0);
    timerRef.current = setInterval(() => setProcStep((i) => (i + 1) % PROCESSING_STEPS.length), 1600);
  }

  function stopProcessing() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    const toImport = events.filter((e) => e.selected && e.teamId);
    if (!toImport.length) return;
    setPhase('importing');
    let count = 0;

    for (const e of toImport) {
      const { error } = await supabase.from('events').insert({
        team_id: e.teamId,
        title: e.title,
        type: e.type,
        event_date: e.date,
        event_time: e.time,
        location: e.location,
        address: e.address ?? null,
        created_by: profile?.id,
      });
      if (!error) count++;
    }

    setDoneCount(count);
    setPhase('done');
  }

  // ── Selection helpers ──────────────────────────────────────────────────────

  function toggle(id: string) { setEvents((p) => p.map((e) => e._id === id ? { ...e, selected: !e.selected } : e)); }
  function selectAll()    { setEvents((p) => p.map((e) => ({ ...e, selected: !!e.teamId }))); }
  function deselectAll()  { setEvents((p) => p.map((e) => ({ ...e, selected: false }))); }
  function toggleTeamGroup(name: string) {
    setExpandedTeams((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  const selectedCount  = events.filter((e) => e.selected).length;
  const unmatchedCount = events.filter((e) => e.selected && !e.teamId).length;
  const canImport      = selectedCount > 0 && unmatchedCount === 0;

  // ── Group events by team (for club mode review) ────────────────────────────
  const grouped: Record<string, ReviewEvent[]> = {};
  if (mode === 'club') {
    for (const e of events) {
      const key = e.teamName ?? 'Unknown Team';
      grouped[key] = grouped[key] ?? [];
      grouped[key].push(e);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' }} onClick={phase === 'processing' || phase === 'importing' ? undefined : onClose}>
      <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', margin: 0 }}>AI Schedule Import</h2>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '2px 0 0' }}>Upload a PDF, image, or CSV — AI reads it automatically</p>
          </div>
          {phase !== 'processing' && phase !== 'importing' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '6px' }}>
              <X size={18} color="#64748B" />
            </button>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

          {/* ── IDLE ── */}
          {phase === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Mode picker — org_admin only */}
              {isOrgAdmin && teams.length > 1 && (
                <div>
                  <label style={labelSt}>Import type</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {([['single', 'One team'], ['club', 'Club schedule (all teams)']] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setMode(val)} style={{
                        flex: 1, padding: '10px 14px', borderRadius: '10px', border: `2px solid ${mode === val ? primary : '#E2E8F0'}`,
                        background: mode === val ? `${primary}10` : '#fff',
                        color: mode === val ? primary : '#64748B',
                        fontWeight: mode === val ? '700' : '500', fontSize: '13px',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
                      }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {mode === 'club' && (
                    <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px' }}>
                      AI will match each event to the correct team. Upload your entire club schedule in one file.
                    </p>
                  )}
                </div>
              )}

              {/* Team selector — single mode with multiple teams */}
              {mode === 'single' && teams.length > 1 && (
                <div>
                  <label style={labelSt}>Team</label>
                  <div style={{ position: 'relative' }}>
                    <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ ...inputSt, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              )}

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? primary : '#CBD5E1'}`,
                  borderRadius: '14px', padding: '48px 24px', textAlign: 'center',
                  cursor: 'pointer', background: dragOver ? `${primary}06` : '#FAFAFA',
                  transition: 'all 0.15s',
                }}
              >
                <Upload size={32} color={dragOver ? primary : '#CBD5E1'} style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                  Drop your schedule here
                </div>
                <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '16px' }}>
                  PDF, image (photo of the schedule), CSV, or spreadsheet
                </div>
                <span style={{ display: 'inline-block', background: primary, color: '#fff', fontWeight: '700', fontSize: '13px', padding: '9px 20px', borderRadius: '8px' }}>
                  Browse files
                </span>
                <input ref={fileRef} type="file" accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
            </div>
          )}

          {/* ── PROCESSING ── */}
          {phase === 'processing' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ width: '52px', height: '52px', border: `3px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
              <div style={{ fontSize: '17px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Analysing your schedule…</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>{PROCESSING_STEPS[procStep]}</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── REVIEW ── */}
          {phase === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Summary bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>{events.length} events found</span>
                  <span style={{ fontSize: '13px', color: '#64748B', marginLeft: '10px' }}>{selectedCount} selected</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={selectAll} style={ghostBtnSt}>Select all</button>
                  <button onClick={deselectAll} style={ghostBtnSt}>Deselect all</button>
                </div>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <button onClick={() => setWarningsOpen((o) => !o)} style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '10px 14px', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={14} color="#F59E0B" />
                    <span style={{ fontSize: '13px', color: '#B45309', fontWeight: '600', flex: 1 }}>
                      {warnings.length} AI note{warnings.length !== 1 ? 's' : ''}
                    </span>
                    {warningsOpen ? <ChevronDown size={13} color="#B45309" /> : <ChevronRight size={13} color="#B45309" />}
                  </div>
                  {warningsOpen && (
                    <ul style={{ margin: '8px 0 0 22px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {warnings.map((w, i) => (
                        <li key={i} style={{ fontSize: '12px', color: '#92400E' }}>{w}</li>
                      ))}
                    </ul>
                  )}
                </button>
              )}

              {/* ── SINGLE MODE: flat list ── */}
              {mode === 'single' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {events.map((e) => (
                    <EventRow key={e._id} event={e} primary={primary} onToggle={() => toggle(e._id)} />
                  ))}
                </div>
              )}

              {/* ── CLUB MODE: grouped by team ── */}
              {mode === 'club' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(grouped).map(([teamName, teamEvts]) => {
                    const matched = matchTeam(teamName, teams);
                    const isOpen  = expandedTeams.has(teamName);
                    const selCount = teamEvts.filter((e) => e.selected).length;
                    return (
                      <div key={teamName} style={{ border: `1px solid ${matched ? '#E2E8F0' : 'rgba(239,68,68,0.3)'}`, borderRadius: '12px', overflow: 'hidden' }}>
                        {/* Team header row */}
                        <button onClick={() => toggleTeamGroup(teamName)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: matched ? '#F8FAFC' : '#FEF2F2', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                          {isOpen ? <ChevronDown size={14} color="#64748B" /> : <ChevronRight size={14} color="#64748B" />}
                          <span style={{ flex: 1, fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{teamName}</span>
                          {matched
                            ? <span style={{ fontSize: '11px', color: '#22C55E', background: '#F0FDF4', borderRadius: '20px', padding: '2px 8px', fontWeight: '600' }}>✓ Matched</span>
                            : <span style={{ fontSize: '11px', color: '#EF4444', background: '#FEF2F2', borderRadius: '20px', padding: '2px 8px', fontWeight: '600' }}>⚠ No match</span>
                          }
                          <span style={{ fontSize: '12px', color: '#64748B' }}>{selCount}/{teamEvts.length} selected</span>
                        </button>
                        {isOpen && (
                          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid #F1F5F9' }}>
                            {teamEvts.map((e) => <EventRow key={e._id} event={e} primary={primary} onToggle={() => toggle(e._id)} />)}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Unmatched events */}
                  {unmatched.length > 0 && (
                    <div style={{ background: '#FEF2F2', borderRadius: '12px', padding: '14px', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#DC2626', marginBottom: '8px' }}>
                        {unmatched.length} events couldn't be matched to a team
                      </div>
                      {unmatched.map((u, i) => (
                        <div key={i} style={{ fontSize: '12px', color: '#7F1D1D', padding: '4px 0', borderBottom: i < unmatched.length - 1 ? '1px solid rgba(239,68,68,0.15)' : 'none' }}>
                          {u.title} · {fmtDate(u.date)} · <em>Team: {u.raw_team_name}</em>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Unmatched warning */}
                  {unmatchedCount > 0 && (
                    <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#92400E' }}>
                      <AlertTriangle size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                      {unmatchedCount} selected event{unmatchedCount !== 1 ? 's' : ''} can't be imported because their team couldn't be matched. Deselect them or fix the team names first.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── IMPORTING ── */}
          {phase === 'importing' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ width: '52px', height: '52px', border: `3px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
              <div style={{ fontSize: '17px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Creating events…</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Adding to your schedule — this takes a moment</div>
            </div>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', marginBottom: '8px' }}>
                {doneCount} event{doneCount !== 1 ? 's' : ''} added
              </div>
              <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '28px' }}>Your schedule is up to date.</div>
              <button onClick={() => { onDone(); onClose(); }} style={{ background: primary, color: '#fff', fontWeight: '700', fontSize: '14px', padding: '12px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                View Schedule
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'review' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', flexShrink: 0 }}>
            <button onClick={() => { setEvents([]); setUnmatched([]); setWarnings([]); setPhase('idle'); }} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              Try another file
            </button>
            <button onClick={handleImport} disabled={!canImport} style={{ flex: 2, padding: '11px', background: canImport ? primary : '#CBD5E1', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: canImport ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              Import {selectedCount} event{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Event row sub-component ──────────────────────────────────────────────────

function EventRow({ event: e, primary, onToggle }: { event: ReviewEvent; primary: string; onToggle: () => void }) {
  return (
    <div onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
      borderRadius: '8px', cursor: 'pointer', border: `1px solid ${e.uncertain ? 'rgba(245,158,11,0.35)' : '#E2E8F0'}`,
      background: e.uncertain ? 'rgba(245,158,11,0.04)' : e.selected ? `${primary}08` : '#fff',
      transition: 'background 0.1s',
    }}>
      {e.selected
        ? <CheckSquare size={16} color={primary} style={{ flexShrink: 0 }} />
        : <Square size={16} color="#CBD5E1" style={{ flexShrink: 0 }} />}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: '700', color: TYPE_COLORS[e.type], background: TYPE_BG[e.type], borderRadius: '5px', padding: '2px 6px', textTransform: 'uppercase', flexShrink: 0 }}>
            {TYPE_LABELS[e.type]}
          </span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{e.title}</span>
        </div>
        <div style={{ fontSize: '12px', color: '#64748B' }}>
          {fmtDate(e.date)} · {fmtTime(e.time)}
          {e.location && ` · ${e.location}`}
        </div>
        {e.uncertain && e.uncertaintyReason && (
          <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={10} /> {e.uncertaintyReason}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  fontSize: '11px', fontWeight: '700', color: '#64748B',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};

const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const ghostBtnSt: React.CSSProperties = {
  background: 'none', border: '1px solid #E2E8F0', borderRadius: '7px',
  padding: '5px 12px', fontSize: '12px', fontWeight: '600', color: '#64748B',
  cursor: 'pointer', fontFamily: 'inherit',
};
