'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { AGE_GROUPS } from '@/lib/ageGroup';
import { Edit2, X, ChevronDown, Users, ArrowRight } from 'lucide-react';
import Link from 'next/link';

type Coach = { id: string; full_name: string; email: string | null; phone: string | null; license: string | null; hourly_rate: number; is_active: boolean; notes: string | null };
type TryoutTeam = { id: string; name: string; color: string; age_group: string | null; gender: string | null; format: string | null; head_coach_id: string | null; roster_locked: boolean };
type StaffProfile = { id: string; full_name: string | null; role: string };
type ClubT = { id: string } | null;

export default function TryoutCoachesPage() {
  const { club } = useDashboard();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [teams, setTeams]     = useState<TryoutTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [editC, setEditC]     = useState<Coach | null>(null);
  const [filterAg, setFilterAg] = useState('All');
  const [filterGender, setFG] = useState('All');

  async function load() {
    if (!club) return;
    const [{ data: cs }, { data: ts }, { data: ps }] = await Promise.all([
      supabase.from('tryout_coaches').select('*').eq('club_id', club.id).order('full_name'),
      supabase.from('tryout_teams').select('*').eq('club_id', club.id).eq('is_active', true).order('sort_order').order('name'),
      supabase.from('profiles').select('id, full_name, role').eq('club_id', club.id).in('role', ['coach', 'org_admin']).order('full_name'),
    ]);

    const staffProfiles = (ps ?? []) as StaffProfile[];
    const existingCoaches = (cs ?? []) as Coach[];

    // Auto-sync: create tryout_coaches for any staff profile not already listed (match by full_name)
    const toCreate = staffProfiles.filter(
      p => p.full_name && !existingCoaches.find(c => c.full_name === p.full_name)
    );
    if (toCreate.length > 0) {
      await supabase.from('tryout_coaches').insert(
        toCreate.map(p => ({ club_id: club.id, full_name: p.full_name!, is_active: true, hourly_rate: 100 }))
      );
      const { data: refreshed } = await supabase.from('tryout_coaches').select('*').eq('club_id', club.id).order('full_name');
      // Only show coaches that are current club staff
      const staffNames = staffProfiles.map(p => p.full_name);
      setCoaches(((refreshed ?? []) as Coach[]).filter(c => staffNames.includes(c.full_name)));
    } else {
      // Filter to only show coaches currently in Club Staff
      const staffNames = staffProfiles.map(p => p.full_name);
      setCoaches(existingCoaches.filter(c => staffNames.includes(c.full_name)));
    }

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
  const avatarColors = ['#6366F1','#3B82F6','#22C55E','#F59E0B','#EF4444','#8B5CF6','#EC4899'];

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Left: Coach list */}
      <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', background: '#fff', overflowY: 'auto' }}>
        {/* Left panel header */}
        <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Tryout Module</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Coaches</h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '22px', height: '20px', padding: '0 6px', borderRadius: '10px', background: '#F1F5F9', fontSize: '11px', fontWeight: '700', color: '#64748B' }}>{coaches.length}</span>
          </div>
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, fontSize: '11.5px', color: '#15803D', lineHeight: 1.4 }}>
              Auto-synced from <strong>Club → Staff</strong>
            </div>
            <Link href="/dashboard/staff" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: '700', color: '#15803D', textDecoration: 'none', flexShrink: 0 }}>
              Manage <ArrowRight size={10} />
            </Link>
          </div>
        </div>

        {/* Coach list */}
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>Loading…</div>
        ) : coaches.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={22} color="#94A3B8" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>No coaches yet</div>
              <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: 1.5 }}>Add coaches in Club → Staff and they'll appear here automatically.</div>
            </div>
            <Link href="/dashboard/staff" style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#22C55E', color: '#fff', textDecoration: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', marginTop: '4px' }}>
              Go to Staff <ArrowRight size={13} />
            </Link>
          </div>
        ) : (
          coaches.map((c, index) => {
            const myTeams = coachTeams[c.id] ?? [];
            const initials = c.full_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
            const avatarColor = avatarColors[index % avatarColors.length];
            return (
              <div key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', opacity: c.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  {/* Avatar + info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px', fontWeight: '700', color: '#fff', letterSpacing: '0.02em' }}>
                      {initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{c.full_name}</div>
                        {!c.is_active && (
                          <span style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '4px', padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inactive</span>
                        )}
                      </div>
                      {c.email && <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>}
                      <div style={{ marginTop: '5px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '5px', padding: '2px 7px' }}>${c.hourly_rate}/hr</span>
                      </div>
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    <button onClick={() => setEditC(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: '#64748B' }} title="Edit rate & details"><Edit2 size={12} /></button>
                  </div>
                </div>
                {myTeams.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                    {myTeams.map(t => (
                      <span key={t.id} style={{ fontSize: '10.5px', background: t.color, color: '#fff', borderRadius: '4px', padding: '2px 7px', fontWeight: '700' }}>{t.age_group} {t.gender ? t.gender.slice(0,1) : ''} {t.name}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Right: Team Assignments */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#F8FAFC', overflowY: 'auto' }}>
        {/* Right panel header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Tryout Module</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Team Assignments</h2>
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

        {/* Team cards */}
        <div style={{ padding: '20px 20px', overflowX: 'auto' }}>
          {filteredTeams.length === 0 ? (
            <div style={{ padding: '64px 48px', textAlign: 'center', color: '#94A3B8', fontSize: '13.5px' }}>No teams configured. Add teams in Tryout Setup first.</div>
          ) : (
            visibleAgs.map((ag, agIndex) => {
              const agTeams = filteredTeams.filter(t => t.age_group === ag || (!t.age_group && ag === 'Unknown'));
              if (agTeams.length === 0) return null;
              return (
                <div key={ag} style={{ marginBottom: '28px', paddingBottom: '28px', borderBottom: agIndex < visibleAgs.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>{ag}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                    {agTeams.map(team => {
                      const headCoach = coaches.find(c => c.id === team.head_coach_id);
                      return (
                        <div key={team.id} style={{ minWidth: '200px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                          {/* Colored header band */}
                          <div style={{ background: team.color, padding: '12px 14px 10px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>{team.name}</div>
                            <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
                              {[team.age_group, team.gender, team.format].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          {/* Head coach select */}
                          <div style={{ padding: '10px 12px 12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '6px' }}>Head Coach</div>
                            <select value={team.head_coach_id ?? ''} onChange={e => assignHeadCoach(team.id, e.target.value || null)}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: team.head_coach_id ? '#0F172A' : '#94A3B8', background: '#F8FAFC', outline: 'none', cursor: 'pointer', fontWeight: team.head_coach_id ? '600' : '400' }}>
                              <option value="">— Unassigned —</option>
                              {coaches.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Edit modal (rate & details only — name/email synced from Club Staff) */}
      {editC && <CoachModal club={club as ClubT} coach={editC} onClose={() => setEditC(null)} onSaved={load} />}
    </div>
  );
}

function CoachModal({ club, coach, onClose, onSaved }: { club: ClubT; coach: Coach; onClose: () => void; onSaved: () => void }) {
  const [hourlyRate, setHourlyRate] = useState(coach.hourly_rate);
  const [license, setLicense]       = useState(coach.license ?? '');
  const [phone, setPhone]           = useState(coach.phone ?? '');
  const [saving, setSaving]         = useState(false);
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lbl = (t: string) => <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>{t}</label>;

  async function save() {
    if (!club) return;
    setSaving(true);
    await supabase.from('tryout_coaches').update({ hourly_rate: hourlyRate, license: license || null, phone: phone || null }).eq('id', coach.id);
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A' }}>{coach.full_name}</div>
            <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '1px' }}>Tryout details — name managed in Club Staff</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
        </div>
        <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>{lbl('Phone')}<input value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="Optional" /></div>
          <div>{lbl('License / certification')}<input value={license} onChange={e => setLicense(e.target.value)} style={inp} placeholder="e.g. USSF D" /></div>
          <div style={{ gridColumn: '1/-1' }}>{lbl('Hourly rate ($)')}<input type="number" value={hourlyRate} onChange={e => setHourlyRate(parseFloat(e.target.value) || 0)} style={inp} /></div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: '9px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
