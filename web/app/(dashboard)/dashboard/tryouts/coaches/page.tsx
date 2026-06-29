'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { AGE_GROUPS } from '@/lib/ageGroup';
import { Plus, Edit2, Trash2, X, ChevronDown } from 'lucide-react';

type Coach = { id: string; full_name: string; email: string | null; phone: string | null; license: string | null; hourly_rate: number; is_active: boolean; notes: string | null };
type TryoutTeam = { id: string; name: string; color: string; age_group: string | null; gender: string | null; format: string | null; head_coach_id: string | null; roster_locked: boolean };
type ClubT = { id: string } | null;

const blankCoach = (): Omit<Coach,'id'> => ({ full_name: '', email: null, phone: null, license: null, hourly_rate: 100, is_active: true, notes: null });

export default function TryoutCoachesPage() {
  const { club } = useDashboard();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [teams, setTeams]     = useState<TryoutTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editC, setEditC]     = useState<Coach | null>(null);
  const [delId, setDelId]     = useState<string | null>(null);
  const [filterAg, setFilterAg] = useState('All');
  const [filterGender, setFG] = useState('All');

  async function load() {
    if (!club) return;
    const [{ data: cs }, { data: ts }] = await Promise.all([
      supabase.from('tryout_coaches').select('*').eq('club_id', club.id).order('full_name'),
      supabase.from('tryout_teams').select('*').eq('club_id', club.id).eq('is_active', true).order('sort_order').order('name'),
    ]);
    setCoaches((cs ?? []) as Coach[]);
    setTeams((ts ?? []) as TryoutTeam[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [club]);

  const ageGroupsWithTeams = [...new Set(teams.map(t => t.age_group).filter(Boolean))]
    .sort((a, b) => AGE_GROUPS.indexOf(a!) - AGE_GROUPS.indexOf(b!)) as string[];
  const visibleAgs = filterAg === 'All' ? ageGroupsWithTeams : [filterAg];

  const filteredTeams = teams.filter(t => {
    if (filterAg !== 'All' && t.age_group !== filterAg) return false;
    if (filterGender !== 'All' && t.gender !== filterGender) return false;
    return true;
  });

  // Coach → list of teams they're head coach of
  const coachTeams: Record<string, TryoutTeam[]> = {};
  coaches.forEach(c => { coachTeams[c.id] = teams.filter(t => t.head_coach_id === c.id); });

  async function assignHeadCoach(teamId: string, coachId: string | null) {
    if (!club) return;
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, head_coach_id: coachId } : t));
    await supabase.from('tryout_teams').update({ head_coach_id: coachId }).eq('id', teamId);
  }

  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Left: Coach list */}
      <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', background: '#fff', overflowY: 'auto' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', margin: 0 }}>Coaches</h2>
            <button onClick={() => { setEditC(null); setShowAdd(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: '7px', padding: '5px 10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
              <Plus size={12} /> Add
            </button>
          </div>
        </div>
        {loading ? <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>Loading…</div>
          : coaches.map(c => {
            const myTeams = coachTeams[c.id] ?? [];
            return (
              <div key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>{c.full_name}</div>
                    {c.email && <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '1px' }}>{c.email}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button onClick={() => { setEditC(c); setShowAdd(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: '#64748B' }}><Edit2 size={12} /></button>
                    <button onClick={() => setDelId(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: '#EF4444' }}><Trash2 size={12} /></button>
                  </div>
                </div>
                {myTeams.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                    {myTeams.map(t => (
                      <span key={t.id} style={{ fontSize: '10.5px', background: `${t.color}20`, color: t.color, border: `1px solid ${t.color}50`, borderRadius: '4px', padding: '1px 7px', fontWeight: '700' }}>{t.age_group} {t.gender ? t.gender.slice(0,1) : ''} {t.name}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Right: Team Assignments */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#F8FAFC', overflowY: 'auto' }}>
        <div style={{ padding: '16px 20px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', margin: 0 }}>Team Assignments</h2>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['All', ...ageGroupsWithTeams].map(ag => (
              <button key={ag} onClick={() => setFilterAg(ag)}
                style={{ padding: '4px 11px', borderRadius: '6px', border: 'none', background: filterAg === ag ? '#0F172A' : '#F1F5F9', color: filterAg === ag ? '#fff' : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{ag}</button>
            ))}
            <div style={{ marginLeft: '8px', display: 'flex', gap: '4px' }}>
              {['All','Male','Female'].map(g => (
                <button key={g} onClick={() => setFG(g)}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid', borderColor: filterGender === g ? '#22C55E' : '#E2E8F0', background: filterGender === g ? '#F0FDF4' : '#fff', color: filterGender === g ? '#16A34A' : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{g}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
          {visibleAgs.map(ag => {
            const agTeams = filteredTeams.filter(t => t.age_group === ag || (!t.age_group && ag === 'Unknown'));
            if (agTeams.length === 0) return null;
            return (
              <div key={ag} style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>{ag}</div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {agTeams.map(team => {
                    const headCoach = coaches.find(c => c.id === team.head_coach_id);
                    return (
                      <div key={team.id} style={{ width: '220px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <div style={{ background: team.color, padding: '10px 12px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>{team.name}</div>
                          <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.75)', marginTop: '1px' }}>
                            {[team.age_group, team.gender, team.format].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>Head Coach</div>
                          <select value={team.head_coach_id ?? ''} onChange={e => assignHeadCoach(team.id, e.target.value || null)}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#0F172A', background: '#fff', outline: 'none', cursor: 'pointer' }}>
                            <option value="">— None —</option>
                            {coaches.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filteredTeams.length === 0 && <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8', fontSize: '13.5px' }}>No teams found. Add teams in Tryout Setup first.</div>}
        </div>
      </div>

      {/* Add/Edit modal */}
      {showAdd && <CoachModal club={club as ClubT} coach={editC} onClose={() => { setShowAdd(false); setEditC(null); }} onSaved={load} />}

      {delId && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '340px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A', marginBottom: '16px' }}>Delete coach?</div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => setDelId(null)} style={{ padding: '9px 20px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: '13.5px' }}>Cancel</button>
            <button onClick={async () => { await supabase.from('tryout_coaches').delete().eq('id', delId); setDelId(null); load(); }} style={{ padding: '9px 20px', borderRadius: '9px', background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13.5px' }}>Delete</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

function CoachModal({ club, coach, onClose, onSaved }: { club: ClubT; coach: Coach | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Omit<Coach,'id'>>(coach ? { full_name: coach.full_name, email: coach.email, phone: coach.phone, license: coach.license, hourly_rate: coach.hourly_rate, is_active: coach.is_active, notes: coach.notes } : blankCoach());
  const [saving, setSaving] = useState(false);
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lbl = (t: string) => <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>{t}</label>;

  async function save() {
    if (!form.full_name.trim() || !club) return; setSaving(true);
    const payload = { ...form, full_name: form.full_name.trim(), club_id: club.id };
    if (coach) { await supabase.from('tryout_coaches').update(payload).eq('id', coach.id); }
    else { await supabase.from('tryout_coaches').insert(payload); }
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A' }}>{coach ? 'Edit Coach' : 'Add Coach'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
        </div>
        <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ gridColumn: '1/-1' }}>{lbl('Full name *')}<input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={inp} /></div>
          <div>{lbl('Email')}<input type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value || null }))} style={inp} /></div>
          <div>{lbl('Phone')}<input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value || null }))} style={inp} /></div>
          <div>{lbl('License')}<input value={form.license ?? ''} onChange={e => setForm(f => ({ ...f, license: e.target.value || null }))} style={inp} /></div>
          <div>{lbl('Hourly rate ($)')}<input type="number" value={form.hourly_rate} onChange={e => setForm(f => ({ ...f, hourly_rate: parseFloat(e.target.value) || 0 }))} style={inp} /></div>
          <div style={{ gridColumn: '1/-1' }}><label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', color: '#374151' }}><input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Active</label></div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: '9px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
