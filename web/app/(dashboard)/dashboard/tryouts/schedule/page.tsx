'use client';

import { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { FlipBoard } from '@/components/FlipBoard';
import { seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Plus, X, LayoutGrid, List, AlertTriangle } from 'lucide-react';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
type Day = typeof DAYS[number];

// 30-min slots 3pm–9pm
const TIME_SLOTS: string[] = [];
for (let h = 15; h < 21; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2,'0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2,'0')}:30`);
}

type PracticeSlot = {
  id: string; club_id: string; season_label: string; age_group: string | null; gender: string | null;
  team: string | null; field_name: string; sub_zone: string | null; day_of_week: Day;
  start_time: string | null; end_time: string | null; notes: string | null;
};
type TryoutField = { id: string; name: string; sub_zones: string[]; is_active: boolean; sort_order: number; rental_cost_per_hour: number | null; };
type TryoutTeam = { id: string; name: string; color: string; age_group: string | null; gender: string | null };

const TEAM_COLORS = ['#22C55E','#3B82F6','#6366F1','#F59E0B','#EF4444','#8B5CF6','#14B8A6','#EC4899'];

function fmt12(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m}${hr >= 12 ? 'pm' : 'am'}`;
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

function timesToMinutes(t: string) { const [h,m] = t.split(':').map(Number); return h*60+m; }

function slotsOverlap(a: PracticeSlot, b: PracticeSlot) {
  if (!a.start_time || !b.start_time) return false;
  const aStart = timesToMinutes(a.start_time);
  const aEnd   = a.end_time ? timesToMinutes(a.end_time) : aStart + 90;
  const bStart = timesToMinutes(b.start_time);
  const bEnd   = b.end_time ? timesToMinutes(b.end_time) : bStart + 90;
  return aStart < bEnd && bStart < aEnd;
}

const inp: React.CSSProperties = {
  padding: '7px 10px', borderRadius: '7px', border: '1px solid #E2E8F0',
  fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none',
  width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
};

export default function PracticeSchedulePage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const [season, setSeason]       = useState(() => seasonOptions()[1] ?? '2026-27');
  const [slots, setSlots]         = useState<PracticeSlot[]>([]);
  const [fields, setFields]       = useState<TryoutField[]>([]);
  const [teams, setTeams]         = useState<TryoutTeam[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<'list'|'fieldview'>('list');
  const [activeDay, setActiveDay] = useState<Day>('Mon');
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [editSlot, setEditSlot]   = useState<PracticeSlot | null>(null);
  const [draftSlot, setDraftSlot] = useState<Partial<PracticeSlot> | null>(null);
  const [filterAg, setFilterAg]   = useState('All');
  const [filterGender, setFG]     = useState('All');
  const [teamSearch, setTeamSearch] = useState('');
  const dragTeamRef = useRef<TryoutTeam | null>(null);

  async function load() {
    if (!club) return;
    const [{ data: sl }, { data: fi }, { data: ts }] = await Promise.all([
      supabase.from('tryout_practice_slots').select('*').eq('club_id', club.id).eq('season_label', season),
      supabase.from('tryout_fields').select('*').eq('club_id', club.id).order('sort_order').order('name'),
      supabase.from('tryout_teams').select('id,name,color,age_group,gender').eq('club_id', club.id).eq('is_active', true),
    ]);
    setSlots((sl ?? []) as PracticeSlot[]);
    setFields((fi ?? []) as TryoutField[]);
    setTeams((ts ?? []) as TryoutTeam[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [club, season]);

  const teamColorMap: Record<string, string> = {};
  teams.forEach((t, i) => { teamColorMap[t.name] = t.color || TEAM_COLORS[i % TEAM_COLORS.length]; });

  const filteredSlots = slots.filter(s => {
    if (filterAg !== 'All' && s.age_group !== filterAg) return false;
    if (filterGender !== 'All' && s.gender !== filterGender) return false;
    return true;
  });

  const activeFields = fields.filter(f => f.is_active);
  const fieldNames = [...new Set([...activeFields.map(f => f.name), ...filteredSlots.map(s => s.field_name)])];
  const ageGroupsUsed = [...new Set(slots.map(s => s.age_group).filter(Boolean))].sort((a, b) => AGE_GROUPS.indexOf(a!) - AGE_GROUPS.indexOf(b!)) as string[];

  // Conflict detection for field view
  const daySlots = slots.filter(s => s.day_of_week === activeDay);
  const conflictIds = new Set<string>();
  for (let i = 0; i < daySlots.length; i++) {
    for (let j = i + 1; j < daySlots.length; j++) {
      const a = daySlots[i], b = daySlots[j];
      if (a.field_name === b.field_name && a.sub_zone && a.sub_zone === b.sub_zone && slotsOverlap(a, b)) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }

  const visibleTeams = teams.filter(t =>
    !teamSearch || t.name.toLowerCase().includes(teamSearch.toLowerCase())
  );

  function openAddSlot() { setEditSlot(null); setDraftSlot({}); setShowSlotModal(true); }
  function openEditSlot(s: PracticeSlot) { setEditSlot(s); setDraftSlot(null); setShowSlotModal(true); }

  function handleDrop(fieldName: string, zone: string, time: string) {
    const team = dragTeamRef.current;
    if (!team) return;
    setEditSlot(null);
    setDraftSlot({
      field_name: fieldName,
      sub_zone: zone,
      day_of_week: activeDay,
      start_time: time,
      end_time: addMinutes(time, 90),
      team: team.name,
      age_group: team.age_group ?? undefined,
      gender: team.gender ?? undefined,
    });
    setShowSlotModal(true);
    dragTeamRef.current = null;
  }

  if (loading) return (
    <FlipBoard title="Loading practice schedule…" rows={[
      { label: 'Slots', pad: 2 }, { label: 'Teams', pad: 2 },
      { label: 'Fields', pad: 2 }, { label: 'Zones', pad: 2 },
    ]} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── Header ── */}
      <div style={{ padding: '14px 24px', background: '#fff', borderBottom: `3px solid ${primary}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: view === 'list' ? '12px' : '0' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Tryouts · {season}</div>
            <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: '2px 0 0', letterSpacing: '-0.5px' }}>Practice Schedule</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
              {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {/* View toggle */}
            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px', gap: '2px' }}>
              {([['list','List',<List key="l" size={13}/>],['fieldview','Field View',<LayoutGrid key="g" size={13}/>]] as const).map(([v, label, icon]) => (
                <button key={v} onClick={() => setView(v as 'list'|'fieldview')}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 11px', borderRadius: '6px', border: 'none', background: view === v ? '#fff' : 'transparent', color: view === v ? '#0F172A' : '#64748B', fontSize: '12.5px', fontWeight: view === v ? '700' : '500', cursor: 'pointer', boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s', fontFamily: 'inherit' }}>
                  {icon}{label}
                </button>
              ))}
            </div>
            {view === 'list' && (
              <button onClick={openAddSlot} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 13px', borderRadius: '7px', background: primary, color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={13} /> Add Slot
              </button>
            )}
            {view === 'fieldview' && conflictIds.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '7px', background: '#FEF2F2', border: '1px solid #FCA5A5', fontSize: '12.5px', fontWeight: '700', color: '#EF4444' }}>
                <AlertTriangle size={13} /> {conflictIds.size} conflict{conflictIds.size !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* List view filters */}
        {view === 'list' && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {['All', ...ageGroupsUsed].map(ag => (
              <button key={ag} onClick={() => setFilterAg(ag)} style={{ padding: '4px 11px', borderRadius: '6px', border: 'none', background: filterAg === ag ? '#0F172A' : '#F1F5F9', color: filterAg === ag ? '#fff' : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>{ag}</button>
            ))}
            <div style={{ marginLeft: '8px', display: 'flex', gap: '4px' }}>
              {['All','Male','Female'].map(g => (
                <button key={g} onClick={() => setFG(g)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid', borderColor: filterGender === g ? primary : '#E2E8F0', background: filterGender === g ? `${primary}15` : '#fff', color: filterGender === g ? primary : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>{g}</button>
              ))}
            </div>
          </div>
        )}

        {/* Field view: day tabs */}
        {view === 'fieldview' && (
          <div style={{ display: 'flex', gap: '4px', marginTop: '12px' }}>
            {DAYS.map(d => (
              <button key={d} onClick={() => setActiveDay(d)}
                style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', background: activeDay === d ? primary : '#F1F5F9', color: activeDay === d ? '#fff' : '#64748B', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── List view ── */}
      {view === 'list' && (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          {fieldNames.length === 0 ? (
            <EmptyState icon="📅" title="No practice slots yet" sub="Add a slot to get started." action={<button onClick={openAddSlot} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '8px', background: primary, color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}><Plus size={13}/> Add slot</button>} />
          ) : (
            <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#0F172A', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', letterSpacing: '1.5px', width: '150px' }}>FIELD</th>
                  {DAYS.map(d => <th key={d} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', letterSpacing: '1.5px', minWidth: '130px' }}>{d.toUpperCase()}</th>)}
                </tr>
              </thead>
              <tbody>
                {fieldNames.map((fn, ri) => (
                  <tr key={fn} style={{ borderBottom: '1px solid #E2E8F0', background: ri % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '10px 16px', fontWeight: '700', color: '#0F172A', fontSize: '13px', borderRight: '1px solid #E2E8F0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{fn}</td>
                    {DAYS.map(day => {
                      const daySlts = filteredSlots.filter(s => s.field_name === fn && s.day_of_week === day);
                      return (
                        <td key={day} style={{ padding: '6px 8px', borderRight: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                          {daySlts.map(s => {
                            const color = s.team ? (teamColorMap[s.team] ?? '#6366F1') : '#94A3B8';
                            const hasConflict = conflictIds.has(s.id);
                            return (
                              <div key={s.id}
                                style={{ background: hasConflict ? '#FEF2F2' : `${color}14`, border: `1.5px solid ${hasConflict ? '#FCA5A5' : color+'45'}`, borderRadius: '8px', padding: '7px 10px', marginBottom: '5px', cursor: 'pointer', borderLeft: `3px solid ${hasConflict ? '#EF4444' : color}`, transition: 'box-shadow 0.12s' }}
                                onClick={() => openEditSlot(s)}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = 'none'}>
                                <div style={{ fontWeight: '800', fontSize: '12px', color: hasConflict ? '#EF4444' : color, lineHeight: 1.2 }}>{s.team ?? 'Open'}</div>
                                {(s.start_time || s.end_time) && <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '3px', fontWeight: '600' }}>{fmt12(s.start_time)}{s.end_time ? `–${fmt12(s.end_time)}` : ''}</div>}
                                <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{[s.age_group, s.gender?.slice(0,1), s.sub_zone].filter(Boolean).join(' · ')}</div>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Field view ── */}
      {view === 'fieldview' && (
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          {/* Left: team panel */}
          <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid #E2E8F0', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>Teams ({teams.length})</div>
              <input
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                placeholder="Search…"
                style={{ ...inp, padding: '6px 10px', fontSize: '12.5px' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {visibleTeams.map((t, i) => {
                const color = t.color || TEAM_COLORS[i % TEAM_COLORS.length];
                const assignedToday = daySlots.filter(s => s.team === t.name).length;
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => { dragTeamRef.current = t; }}
                    onDragEnd={() => { dragTeamRef.current = null; }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', marginBottom: '4px', cursor: 'grab', userSelect: 'none', border: `1.5px solid ${color}30`, background: `${color}10` }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = 'none'}
                  >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{[t.age_group, t.gender?.slice(0,1)].filter(Boolean).join(' · ')}</div>
                    </div>
                    {assignedToday > 0 && (
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800', color: '#fff', flexShrink: 0 }}>{assignedToday}</div>
                    )}
                  </div>
                );
              })}
              {visibleTeams.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '12.5px', color: '#CBD5E1' }}>No teams found</div>
              )}
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
              <button onClick={openAddSlot} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '7px', borderRadius: '7px', background: '#F8FAFC', border: '1px dashed #CBD5E1', fontSize: '12.5px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={12} /> Manual slot
              </button>
            </div>
          </div>

          {/* Right: field cards */}
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', background: '#F0F2F5', padding: '16px' }}>
            {activeFields.length === 0 ? (
              <EmptyState icon="📍" title="No fields configured" sub={<span>Go to <strong>Fields &amp; Zones</strong> in the sidebar to set up your fields and zones first.</span>} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeFields.map(field => {
                  const zones = field.sub_zones.length > 0 ? field.sub_zones : ['(No zones)'];
                  return (
                    <div key={field.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                      {/* Field header */}
                      <div style={{ padding: '10px 16px', background: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: primary }} />
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#fff', letterSpacing: '0.3px' }}>{field.name.toUpperCase()}</span>
                      </div>

                      {/* Zone columns grid */}
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${zones.length}, minmax(160px, 1fr))`, minWidth: `${56 + zones.length * 160}px` }}>
                          {/* Header row */}
                          <div style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }} />
                          {zones.map(z => (
                            <div key={z} style={{ padding: '8px 10px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', borderLeft: '1px solid #E2E8F0', fontSize: '11px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px' }}>{z}</div>
                          ))}

                          {/* Time rows */}
                          {TIME_SLOTS.map(time => (
                            <>
                              {/* Time label */}
                              <div key={`t-${time}`} style={{ padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid #F1F5F9', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', whiteSpace: 'nowrap', height: '48px' }}>
                                {fmt12(time)}
                              </div>

                              {/* Zone cells */}
                              {zones.map(zone => {
                                const cellSlots = daySlots.filter(s =>
                                  s.field_name === field.name &&
                                  s.sub_zone === zone &&
                                  s.start_time === time
                                );
                                const isNoZone = zone === '(No zones)';

                                return (
                                  <div
                                    key={`${zone}-${time}`}
                                    onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = `${primary}10`; }}
                                    onDragLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                    onDrop={e => {
                                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                                      if (!isNoZone) handleDrop(field.name, zone, time);
                                    }}
                                    style={{ borderLeft: '1px solid #E2E8F0', borderBottom: '1px solid #F1F5F9', padding: '4px 6px', minHeight: '48px', position: 'relative', transition: 'background 0.1s' }}
                                  >
                                    {cellSlots.map(s => {
                                      const color = s.team ? (teamColorMap[s.team] ?? '#6366F1') : '#94A3B8';
                                      const hasConflict = conflictIds.has(s.id);
                                      const durationMins = s.start_time && s.end_time ? timesToMinutes(s.end_time) - timesToMinutes(s.start_time) : 90;
                                      const rows = Math.max(1, Math.round(durationMins / 30));
                                      return (
                                        <div
                                          key={s.id}
                                          onClick={() => openEditSlot(s)}
                                          style={{
                                            position: 'absolute', top: '4px', left: '6px', right: '6px',
                                            height: `${rows * 48 - 8}px`,
                                            background: hasConflict ? '#FEF2F2' : `${color}18`,
                                            border: `1.5px solid ${hasConflict ? '#FCA5A5' : color+'60'}`,
                                            borderLeft: `3px solid ${hasConflict ? '#EF4444' : color}`,
                                            borderRadius: '6px', padding: '5px 8px',
                                            cursor: 'pointer', overflow: 'hidden', zIndex: 1,
                                            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                                          }}
                                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.14)'}
                                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'}
                                        >
                                          <div style={{ fontSize: '11.5px', fontWeight: '800', color: hasConflict ? '#EF4444' : color, lineHeight: 1.2 }}>{s.team ?? 'Open'}</div>
                                          <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>{fmt12(s.start_time)}–{fmt12(s.end_time)}</div>
                                          {hasConflict && <div style={{ fontSize: '9.5px', color: '#EF4444', marginTop: '2px', fontWeight: '700' }}>⚠ Conflict</div>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slot modal (add / edit / from drag-drop) */}
      {showSlotModal && (
        <SlotModal
          club={club as {id:string}|null}
          season={season}
          slot={editSlot}
          draft={draftSlot}
          fields={fields}
          teams={teams}
          primary={primary}
          onClose={() => { setShowSlotModal(false); setEditSlot(null); setDraftSlot(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── SlotModal ───────────────────────────────────────────────────────────────

function SlotModal({ club, season, slot, draft, fields, teams, primary, onClose, onSaved }: {
  club: {id:string}|null; season: string; slot: PracticeSlot|null; draft: Partial<PracticeSlot>|null;
  fields: TryoutField[]; teams: TryoutTeam[]; primary: string; onClose: ()=>void; onSaved: ()=>void;
}) {
  const initial = slot ?? draft ?? {};
  const [form, setForm] = useState({
    age_group:   (initial.age_group  ?? '') as string,
    gender:      (initial.gender     ?? 'Male') as string,
    team:        (initial.team       ?? '') as string,
    field_name:  (initial.field_name ?? (fields[0]?.name ?? '')) as string,
    sub_zone:    (initial.sub_zone   ?? '') as string,
    day_of_week: (initial.day_of_week ?? 'Mon') as Day,
    start_time:  (initial.start_time ?? '') as string,
    end_time:    (initial.end_time   ?? '') as string,
    notes:       (initial.notes      ?? '') as string,
  });
  const [saving, setSaving] = useState(false);

  const selectedField = fields.find(f => f.name === form.field_name);
  const inp2: React.CSSProperties = { padding: '7px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl = (t: string) => <label style={{ fontSize: '11px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '3px' }}>{t}</label>;

  async function save() {
    if (!club) return; setSaving(true);
    const payload = { club_id: club.id, season_label: season, age_group: form.age_group || null, gender: form.gender || null, team: form.team || null, field_name: form.field_name, sub_zone: form.sub_zone || null, day_of_week: form.day_of_week, start_time: form.start_time || null, end_time: form.end_time || null, notes: form.notes || null };

    let savedId = slot?.id ?? '';
    if (slot) {
      await supabase.from('tryout_practice_slots').update(payload).eq('id', slot.id);
    } else {
      const { data: ins } = await supabase.from('tryout_practice_slots').insert(payload).select('id').single();
      savedId = ins?.id ?? '';
    }

    // Auto-expense: if field has a rental rate, upsert a Field Rental expense
    const field = fields.find(f => f.name === form.field_name);
    if (field?.rental_cost_per_hour && form.start_time && form.end_time && savedId) {
      const hours = Math.max(0, (timesToMinutes(form.end_time) - timesToMinutes(form.start_time)) / 60);
      const amount = parseFloat((hours * field.rental_cost_per_hour).toFixed(2));
      const description = `${form.team ?? 'Practice'} — ${form.field_name}${form.sub_zone ? ', ' + form.sub_zone : ''} (${form.day_of_week} ${fmt12(form.start_time)}–${fmt12(form.end_time)})`;
      const { data: existing } = await supabase.from('tryout_expenses').select('id').eq('slot_id', savedId).maybeSingle();
      if (existing) {
        await supabase.from('tryout_expenses').update({ amount, description }).eq('id', existing.id);
      } else {
        await supabase.from('tryout_expenses').insert({ club_id: club.id, season_label: season, category: 'Field Rental', description, amount, slot_id: savedId });
      }
    }

    setSaving(false); onSaved(); onClose();
  }

  async function deleteSlot() {
    if (!slot) return;
    await supabase.from('tryout_practice_slots').delete().eq('id', slot.id);
    onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '700', fontSize: '14.5px', color: '#0F172A' }}>{slot ? 'Edit Slot' : 'Add Practice Slot'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={15} color="#64748B" /></button>
        </div>
        <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>{lbl('Day')}<select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value as Day }))} style={inp2}>{DAYS.map(d => <option key={d}>{d}</option>)}</select></div>
          <div>{lbl('Team')}<select value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} style={inp2}><option value="">— None —</option>{teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select></div>
          <div>{lbl('Age Group')}<select value={form.age_group} onChange={e => setForm(f => ({ ...f, age_group: e.target.value }))} style={inp2}><option value="">— Any —</option>{AGE_GROUPS.map(ag => <option key={ag}>{ag}</option>)}</select></div>
          <div>{lbl('Gender')}<select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} style={inp2}><option value="">— Any —</option><option>Male</option><option>Female</option></select></div>
          <div>{lbl('Field')}<select value={form.field_name} onChange={e => setForm(f => ({ ...f, field_name: e.target.value, sub_zone: '' }))} style={inp2}>{fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}</select></div>
          <div>{lbl('Zone')}<select value={form.sub_zone} onChange={e => setForm(f => ({ ...f, sub_zone: e.target.value }))} style={inp2}><option value="">— None —</option>{selectedField?.sub_zones?.map(z => <option key={z}>{z}</option>)}</select></div>
          <div>{lbl('Start Time')}<input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inp2} /></div>
          <div>{lbl('End Time')}<input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inp2} /></div>
          <div style={{ gridColumn: '1/-1' }}>{lbl('Notes')}<input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp2} /></div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {slot
            ? <button onClick={deleteSlot} style={{ padding: '8px 14px', borderRadius: '8px', background: '#FEF2F2', color: '#EF4444', border: '1px solid #FCA5A5', fontSize: '12.5px', cursor: 'pointer', fontWeight: '600', fontFamily: 'inherit' }}>Delete</button>
            : <div />
          }
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: '8px', background: primary, color: '#fff', border: 'none', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub, action }: { icon: string; title: string; sub: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '80px 48px', textAlign: 'center', margin: '0 auto', maxWidth: '400px' }}>
      <div style={{ fontSize: '36px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.6, marginBottom: action ? '20px' : '0' }}>{sub}</div>
      {action}
    </div>
  );
}
