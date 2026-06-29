'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Plus, X, Edit2, Trash2, Settings } from 'lucide-react';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
type Day = typeof DAYS[number];

type PracticeSlot = {
  id: string; club_id: string; season_label: string; age_group: string | null; gender: string | null;
  team: string | null; field_name: string; sub_zone: string | null; day_of_week: Day;
  start_time: string | null; end_time: string | null; notes: string | null;
};
type Field = { id: string; name: string; sub_zones: string[]; is_active: boolean; sort_order: number };
type TryoutTeam = { id: string; name: string; color: string; age_group: string | null; gender: string | null };

const TEAM_COLORS = ['#22C55E','#3B82F6','#6366F1','#F59E0B','#EF4444','#8B5CF6','#14B8A6','#EC4899'];

function timeStr(t: string | null) { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); const ampm = hr >= 12 ? 'pm' : 'am'; return `${hr % 12 || 12}:${m}${ampm}`; }

export default function PracticeSchedulePage() {
  const { club } = useDashboard();
  const [season, setSeason] = useState(() => seasonOptions()[1] ?? '2026-27');
  const [slots, setSlots] = useState<PracticeSlot[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [teams, setTeams] = useState<TryoutTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'schedule'|'fields'>('schedule');
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [editSlot, setEditSlot] = useState<PracticeSlot | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [editField, setEditField] = useState<Field | null>(null);
  const [filterAg, setFilterAg] = useState('All');
  const [filterGender, setFG] = useState('All');

  async function load() {
    if (!club) return;
    const [{ data: sl }, { data: fi }, { data: ts }] = await Promise.all([
      supabase.from('tryout_practice_slots').select('*').eq('club_id', club.id).eq('season_label', season),
      supabase.from('tryout_fields').select('*').eq('club_id', club.id).order('sort_order').order('name'),
      supabase.from('tryout_teams').select('id,name,color,age_group,gender').eq('club_id', club.id).eq('is_active', true),
    ]);
    setSlots((sl ?? []) as PracticeSlot[]);
    setFields((fi ?? []) as Field[]);
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

  // Grid by field × day
  const activeFields = fields.filter(f => f.is_active);
  const fieldNames = [...new Set([...activeFields.map(f => f.name), ...filteredSlots.map(s => s.field_name)])];

  const ageGroupsUsed = [...new Set(slots.map(s => s.age_group).filter(Boolean))].sort((a, b) => AGE_GROUPS.indexOf(a!) - AGE_GROUPS.indexOf(b!)) as string[];

  if (loading) return <div style={{ padding: '40px', color: '#94A3B8' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tryout Module · {season}</div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: '2px 0 0' }}>{view === 'fields' ? 'Manage Fields' : 'Practice Schedule'}</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
              {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => setView(v => v === 'fields' ? 'schedule' : 'fields')}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '1px solid #E2E8F0', background: view === 'fields' ? '#F1F5F9' : '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151', fontWeight: '600' }}>
              <Settings size={13} />{view === 'fields' ? 'Back to Schedule' : 'Manage Fields'}
            </button>
            <button onClick={() => { if (view === 'fields') { setEditField(null); setShowAddField(true); } else { setEditSlot(null); setShowAddSlot(true); } }}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
              <Plus size={13} />{view === 'fields' ? 'Add Field' : 'Add Slot'}
            </button>
          </div>
        </div>
        {view === 'schedule' && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {['All',...ageGroupsUsed].map(ag => (
              <button key={ag} onClick={() => setFilterAg(ag)} style={{ padding: '4px 11px', borderRadius: '6px', border: 'none', background: filterAg === ag ? '#0F172A' : '#F1F5F9', color: filterAg === ag ? '#fff' : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{ag}</button>
            ))}
            <div style={{ marginLeft: '8px', display: 'flex', gap: '4px' }}>
              {['All','Male','Female'].map(g => (
                <button key={g} onClick={() => setFG(g)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid', borderColor: filterGender === g ? '#22C55E' : '#E2E8F0', background: filterGender === g ? '#F0FDF4' : '#fff', color: filterGender === g ? '#16A34A' : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{g}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {view === 'fields' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {fields.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>No fields yet. Add your first field.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {fields.map(f => (
                <div key={f.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#0F172A' }}>{f.name}</div>
                    {f.sub_zones && f.sub_zones.length > 0 && (
                      <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {f.sub_zones.map(z => <span key={z} style={{ fontSize: '11.5px', background: '#F1F5F9', color: '#64748B', borderRadius: '4px', padding: '1px 8px', fontWeight: '600' }}>{z}</span>)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11.5px', color: f.is_active ? '#16A34A' : '#94A3B8', fontWeight: '600', background: f.is_active ? '#F0FDF4' : '#F8FAFC', borderRadius: '5px', padding: '2px 8px' }}>{f.is_active ? 'Active' : 'Inactive'}</span>
                    <button onClick={() => { setEditField(f); setShowAddField(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '3px' }}><Edit2 size={13} /></button>
                    <button onClick={async () => { await supabase.from('tryout_fields').delete().eq('id', f.id); load(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '3px' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Grid view: rows = fields, cols = days */
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          {fieldNames.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8', fontSize: '13.5px' }}>No practice slots yet. Add a slot or manage fields first.</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94A3B8', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', width: '140px', background: '#F8FAFC' }}>FIELD</th>
                  {DAYS.map(d => <th key={d} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: '#94A3B8', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', minWidth: '120px', background: '#F8FAFC' }}>{d.toUpperCase()}</th>)}
                </tr>
              </thead>
              <tbody>
                {fieldNames.map((fn, ri) => (
                  <tr key={fn} style={{ borderBottom: '1px solid #E2E8F0', background: ri % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '10px 16px', fontWeight: '700', color: '#0F172A', fontSize: '13px', borderRight: '1px solid #E2E8F0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{fn}</td>
                    {DAYS.map(day => {
                      const daySlots = filteredSlots.filter(s => s.field_name === fn && s.day_of_week === day);
                      return (
                        <td key={day} style={{ padding: '6px 8px', borderRight: '1px solid #E2E8F0', verticalAlign: 'top', minHeight: '60px' }}>
                          {daySlots.map(s => {
                            const color = s.team ? (teamColorMap[s.team] ?? '#6366F1') : '#94A3B8';
                            return (
                              <div key={s.id} style={{ background: `${color}18`, border: `1px solid ${color}50`, borderRadius: '6px', padding: '5px 8px', marginBottom: '4px', cursor: 'pointer' }}
                                onClick={() => { setEditSlot(s); setShowAddSlot(true); }}>
                                <div style={{ fontWeight: '700', fontSize: '11.5px', color }}>{s.team ?? 'Open'}</div>
                                <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
                                  {timeStr(s.start_time)}{s.end_time ? `–${timeStr(s.end_time)}` : ''}
                                  {s.sub_zone ? ` · ${s.sub_zone}` : ''}
                                </div>
                                {s.age_group && <div style={{ fontSize: '10px', color: '#94A3B8' }}>{s.age_group}{s.gender ? ` ${s.gender.slice(0,1)}` : ''}</div>}
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

      {showAddSlot && <SlotModal club={club as {id:string}|null} season={season} slot={editSlot} fields={fields} teams={teams} onClose={() => { setShowAddSlot(false); setEditSlot(null); }} onSaved={load} />}
      {showAddField && <FieldModal club={club as {id:string}|null} field={editField} onClose={() => { setShowAddField(false); setEditField(null); }} onSaved={load} />}
    </div>
  );
}

function SlotModal({ club, season, slot, fields, teams, onClose, onSaved }: { club:{id:string}|null; season:string; slot:PracticeSlot|null; fields:Field[]; teams:TryoutTeam[]; onClose:()=>void; onSaved:()=>void }) {
  const [form, setForm] = useState({ age_group: slot?.age_group ?? '', gender: slot?.gender ?? 'Male', team: slot?.team ?? '', field_name: slot?.field_name ?? (fields[0]?.name ?? ''), sub_zone: slot?.sub_zone ?? '', day_of_week: slot?.day_of_week ?? 'Mon' as Day, start_time: slot?.start_time ?? '', end_time: slot?.end_time ?? '', notes: slot?.notes ?? '' });
  const [saving, setSaving] = useState(false);
  const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lbl = (t: string) => <label style={{ fontSize: '11px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '3px' }}>{t}</label>;

  async function save() {
    if (!club) return; setSaving(true);
    const payload = { club_id: club.id, season_label: season, age_group: form.age_group || null, gender: form.gender || null, team: form.team || null, field_name: form.field_name, sub_zone: form.sub_zone || null, day_of_week: form.day_of_week, start_time: form.start_time || null, end_time: form.end_time || null, notes: form.notes || null };
    if (slot) { await supabase.from('tryout_practice_slots').update(payload).eq('id', slot.id); }
    else { await supabase.from('tryout_practice_slots').insert(payload); }
    setSaving(false); onSaved(); onClose();
  }

  const selectedField = fields.find(f => f.name === form.field_name);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '700', fontSize: '14.5px', color: '#0F172A' }}>{slot ? 'Edit Slot' : 'Add Practice Slot'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={15} color="#64748B" /></button>
        </div>
        <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>{lbl('Day')}<select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value as Day }))} style={inp}>{DAYS.map(d => <option key={d}>{d}</option>)}</select></div>
          <div>{lbl('Team')}<select value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} style={inp}><option value="">— None —</option>{teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select></div>
          <div>{lbl('Age Group')}<select value={form.age_group} onChange={e => setForm(f => ({ ...f, age_group: e.target.value }))} style={inp}><option value="">— Any —</option>{AGE_GROUPS.map(ag => <option key={ag}>{ag}</option>)}</select></div>
          <div>{lbl('Gender')}<select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} style={inp}><option value="">— Any —</option><option>Male</option><option>Female</option></select></div>
          <div>{lbl('Field')}<select value={form.field_name} onChange={e => setForm(f => ({ ...f, field_name: e.target.value, sub_zone: '' }))} style={inp}>{fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}<option value="">Other</option></select></div>
          <div>{lbl('Sub-Zone')}<select value={form.sub_zone} onChange={e => setForm(f => ({ ...f, sub_zone: e.target.value }))} style={inp}><option value="">— None —</option>{selectedField?.sub_zones?.map(z => <option key={z}>{z}</option>)}</select></div>
          <div>{lbl('Start Time')}<input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inp} /></div>
          <div>{lbl('End Time')}<input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inp} /></div>
          <div style={{ gridColumn: '1/-1' }}>{lbl('Notes')}<input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} /></div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {slot && <button onClick={async () => { await supabase.from('tryout_practice_slots').delete().eq('id', slot.id); onSaved(); onClose(); }} style={{ padding: '8px 14px', borderRadius: '8px', background: '#FEF2F2', color: '#EF4444', border: '1px solid #FCA5A5', fontSize: '12.5px', cursor: 'pointer', fontWeight: '600' }}>Delete</button>}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: '8px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldModal({ club, field, onClose, onSaved }: { club:{id:string}|null; field:Field|null; onClose:()=>void; onSaved:()=>void }) {
  const [name, setName] = useState(field?.name ?? '');
  const [subZones, setSubZones] = useState(field?.sub_zones?.join(', ') ?? '');
  const [isActive, setIsActive] = useState(field?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };

  async function save() {
    if (!club || !name.trim()) return; setSaving(true);
    const zones = subZones ? subZones.split(',').map(s => s.trim()).filter(Boolean) : [];
    const payload = { club_id: club.id, name: name.trim(), sub_zones: zones, is_active: isActive };
    if (field) { await supabase.from('tryout_fields').update(payload).eq('id', field.id); }
    else { await supabase.from('tryout_fields').insert(payload); }
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '700', fontSize: '14.5px', color: '#0F172A' }}>{field ? 'Edit Field' : 'Add Field'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={15} color="#64748B" /></button>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div><label style={{ fontSize: '11px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '3px' }}>Field name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Field 1" style={inp} /></div>
          <div><label style={{ fontSize: '11px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '3px' }}>Sub-zones (comma-separated)</label><input value={subZones} onChange={e => setSubZones(e.target.value)} placeholder="North Half, South Half" style={inp} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active</label>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving || !name.trim()} style={{ padding: '8px 16px', borderRadius: '8px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
