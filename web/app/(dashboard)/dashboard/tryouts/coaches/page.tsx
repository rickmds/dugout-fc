'use client';

import { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { AGE_GROUPS } from '@/lib/ageGroup';
import { seasonOptions } from '@/lib/ageGroup';
import {
  Edit2, X, Users, ArrowRight, Search, Mail, Download,
  FileText, CheckSquare, Square, Send, Clock, AlertCircle,
} from 'lucide-react';
import Link from 'next/link';

type Coach = {
  id: string; full_name: string; email: string | null; phone: string | null;
  license: string | null; hourly_rate: number; is_active: boolean; notes: string | null;
  packet_sent_at: string | null;
};
type TryoutTeam = {
  id: string; name: string; color: string; age_group: string | null;
  gender: string | null; format: string | null; head_coach_id: string | null; roster_locked: boolean;
};
type CoachAssignment = { id: string; coach_id: string; team: string; role: string };
type StaffProfile = { id: string; full_name: string | null; role: string };

const AVATAR_COLORS = ['#6366F1','#3B82F6','#22C55E','#F59E0B','#EF4444','#8B5CF6','#EC4899'];

function avatarColor(index: number) { return AVATAR_COLORS[index % AVATAR_COLORS.length]; }
function initials(name: string) { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

export default function TryoutCoachesPage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [coaches, setCoaches]           = useState<Coach[]>([]);
  const [teams, setTeams]               = useState<TryoutTeam[]>([]);
  const [assignments, setAssignments]   = useState<CoachAssignment[]>([]);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [loading, setLoading]           = useState(true);
  const [editC, setEditC]               = useState<Coach | null>(null);
  const [filterAg, setFilterAg]         = useState('All');
  const [filterGender, setFG]           = useState('All');
  const [search, setSearch]             = useState('');
  const [season, setSeason]             = useState(() => seasonOptions()[1] ?? '2026-27');

  // Send packet modal
  const [showPacketModal, setShowPacketModal] = useState(false);
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [sending, setSending]                 = useState(false);
  const [sendResult, setSendResult]           = useState<{ sent: number; total: number } | null>(null);

  // Assistant add state per team
  const [addingAssistant, setAddingAssistant] = useState<Record<string, string>>({}); // teamId → coachId

  async function load() {
    if (!club) return;
    const [{ data: cs }, { data: ts }, { data: as_ }, { data: ps }, { data: counts }] = await Promise.all([
      supabase.from('tryout_coaches').select('*').eq('club_id', club.id).order('full_name'),
      supabase.from('tryout_teams').select('*').eq('club_id', club.id).eq('is_active', true).order('sort_order').order('name'),
      supabase.from('tryout_coach_assignments').select('*').eq('club_id', club.id),
      supabase.from('profiles').select('id,full_name,role').eq('club_id', club.id).in('role', ['coach','org_admin']).order('full_name'),
      supabase.from('tryout_assignments').select('team').eq('club_id', club.id).in('status', ['Offer','Accepted']),
    ]);

    const staffProfiles = (ps ?? []) as StaffProfile[];
    const existingCoaches = (cs ?? []) as Coach[];

    // Auto-sync staff → tryout_coaches
    const toCreate = staffProfiles.filter(
      p => p.full_name && !existingCoaches.find(c => c.full_name === p.full_name)
    );
    let finalCoaches = existingCoaches;
    if (toCreate.length > 0) {
      await supabase.from('tryout_coaches').insert(
        toCreate.map(p => ({ club_id: club.id, full_name: p.full_name!, is_active: true, hourly_rate: 100 }))
      );
      const { data: refreshed } = await supabase.from('tryout_coaches').select('*').eq('club_id', club.id).order('full_name');
      finalCoaches = (refreshed ?? []) as Coach[];
    }
    const staffNames = staffProfiles.map(p => p.full_name);
    setCoaches(finalCoaches.filter(c => staffNames.includes(c.full_name)));
    setTeams((ts ?? []) as TryoutTeam[]);
    setAssignments((as_ ?? []) as CoachAssignment[]);

    // Player counts per team
    const pc: Record<string, number> = {};
    for (const row of (counts ?? []) as { team: string | null }[]) {
      if (row.team) pc[row.team] = (pc[row.team] ?? 0) + 1;
    }
    setPlayerCounts(pc);
    setLoading(false);
  }

  useEffect(() => { load(); }, [club]);

  const ageGroupsWithTeams = [...new Set(teams.map(t => t.age_group).filter(Boolean))]
    .sort((a, b) => AGE_GROUPS.indexOf(a!) - AGE_GROUPS.indexOf(b!)) as string[];

  const filteredTeams = teams.filter(t => {
    if (filterAg !== 'All' && t.age_group !== filterAg) return false;
    if (filterGender !== 'All') {
      const g = filterGender === 'Boys' ? 'Male' : 'Female';
      if (t.gender !== g) return false;
    }
    return true;
  });

  const visibleAgs = filterAg === 'All' ? ageGroupsWithTeams : [filterAg];

  const filteredCoaches = coaches.filter(c =>
    !search || c.full_name.toLowerCase().includes(search.toLowerCase()) || (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Coach → their head-coached teams
  const coachHeadTeams: Record<string, TryoutTeam[]> = {};
  coaches.forEach(c => { coachHeadTeams[c.id] = teams.filter(t => t.head_coach_id === c.id); });

  // Assistant assignments per team
  function teamAssistants(teamName: string): Coach[] {
    const assistIds = assignments.filter(a => a.team === teamName && a.role === 'assistant').map(a => a.coach_id);
    return coaches.filter(c => assistIds.includes(c.id));
  }

  async function assignHeadCoach(teamId: string, coachId: string | null) {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, head_coach_id: coachId } : t));
    await supabase.from('tryout_teams').update({ head_coach_id: coachId }).eq('id', teamId);
  }

  async function addAssistant(teamName: string, coachId: string) {
    if (!club || !coachId) return;
    await supabase.from('tryout_coach_assignments').upsert({
      club_id: club.id, coach_id: coachId, team: teamName, role: 'assistant',
    }, { onConflict: 'club_id,coach_id,team,role' });
    await load();
  }

  async function removeAssistant(teamName: string, coachId: string) {
    if (!club) return;
    await supabase.from('tryout_coach_assignments')
      .delete()
      .eq('club_id', club.id)
      .eq('coach_id', coachId)
      .eq('team', teamName)
      .eq('role', 'assistant');
    await load();
  }

  // Send packet
  async function sendPackets() {
    if (!club || selectedIds.size === 0) return;
    setSending(true);
    setSendResult(null);
    const res = await fetch('/api/tryout/send-coach-packet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_ids: [...selectedIds], club_id: club.id, season_label: season }),
    });
    const data = await res.json();
    setSendResult({ sent: data.sent, total: data.total });
    setSending(false);
    await load();
  }

  // Download CSV for a coach
  function downloadCSV(coach: Coach) {
    const myTeams = coachHeadTeams[coach.id] ?? [];
    const rows = [['Team','Role','Contact Email','Phone']];
    myTeams.forEach(t => rows.push([t.name, 'Head Coach', coach.email ?? '', coach.phone ?? '']));
    teamAssistants(myTeams[0]?.name ?? '').forEach(a => rows.push([myTeams[0]?.name ?? '', 'Assistant', a.email ?? '', a.phone ?? '']));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${coach.full_name.replace(' ','_')}_packet.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
      <div style={{ fontSize: '13px', color: '#94A3B8' }}>Loading coaches…</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* ── Left panel: Coach list ── */}
      <div style={{ width: '290px', flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', background: '#fff', overflowY: 'auto' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '900', color: '#0D1117', margin: 0 }}>Coaches</h2>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '22px', height: '20px', padding: '0 6px', borderRadius: '10px', background: '#F1F5F9', fontSize: '11px', fontWeight: '700', color: '#64748B' }}>{coaches.length}</span>
            </div>
            <button
              onClick={() => { setSelectedIds(new Set(coaches.filter(c => c.email).map(c => c.id))); setSendResult(null); setShowPacketModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '7px', background: primary, color: '#fff', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Send size={11} /> Coaches Packet
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search coaches…"
              style={{ ...inp, paddingLeft: '30px', fontSize: '13px' }}
            />
          </div>

          {/* Auto-sync notice */}
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '7px', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
            <div style={{ flex: 1, fontSize: '11px', color: '#15803D', lineHeight: 1.4 }}>Auto-synced from <strong>Club → Staff</strong></div>
            <Link href="/dashboard/staff" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: '700', color: '#15803D', textDecoration: 'none', flexShrink: 0 }}>
              Manage <ArrowRight size={10} />
            </Link>
          </div>
        </div>

        {/* Coach rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredCoaches.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: '12px' }}>
              <Users size={28} color="#CBD5E1" />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>{search ? 'No matches' : 'No coaches yet'}</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>{search ? 'Try a different name.' : 'Add coaches in Club → Staff.'}</div>
              </div>
            </div>
          ) : filteredCoaches.map((c, i) => {
            const myTeams = coachHeadTeams[c.id] ?? [];
            const packetSent = c.packet_sent_at ? new Date(c.packet_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
            return (
              <div key={c.id} style={{ padding: '12px 14px', borderBottom: '1px solid #F8FAFC' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  {/* Avatar */}
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: avatarColor(i), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '12px', fontWeight: '700', color: '#fff' }}>
                    {initials(c.full_name)}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                      {myTeams.length > 0 && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748B', background: '#F1F5F9', borderRadius: '4px', padding: '1px 5px', flexShrink: 0 }}>{myTeams.length} team{myTeams.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {c.email && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>}
                    {/* Packet status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      {packetSent
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10.5px', color: '#16A34A', fontWeight: '600' }}><Clock size={10} /> Sent {packetSent}</span>
                        : <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10.5px', color: '#94A3B8', fontWeight: '600' }}><Clock size={10} /> Never sent</span>
                      }
                    </div>
                    {/* Team tags */}
                    {myTeams.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '6px' }}>
                        {myTeams.map(t => (
                          <span key={t.id} style={{ fontSize: '10px', background: t.color, color: '#fff', borderRadius: '4px', padding: '1px 6px', fontWeight: '700' }}>
                            {t.age_group} {t.gender ? t.gender.slice(0,1) : ''} {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Edit */}
                  <button onClick={() => setEditC(c)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', padding: '3px', flexShrink: 0 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#64748B'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#CBD5E1'}>
                    <Edit2 size={12} />
                  </button>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '5px', marginTop: '8px', marginLeft: '48px' }}>
                  <ActionBtn icon={<FileText size={11} />} label="PDF" onClick={() => window.open(`/dashboard/tryouts/coaches/packet?coachId=${c.id}&season=${encodeURIComponent(season)}`, '_blank')} />
                  <ActionBtn icon={<Download size={11} />} label="CSV" onClick={() => downloadCSV(c)} />
                  {c.email && (
                    <ActionBtn
                      icon={<Mail size={11} />}
                      label="Email"
                      onClick={async () => {
                        await fetch('/api/tryout/send-coach-packet', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ coach_ids: [c.id], club_id: club?.id, season_label: season }),
                        });
                        await load();
                      }}
                      primary
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right panel: Team Assignments ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#F0F2F5' }}>
        {/* Right header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: '900', color: '#0D1117', margin: 0 }}>Team Assignments</h2>
            <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', outline: 'none', background: '#fff', color: '#0F172A' }}>
              {seasonOptions().map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {['All', ...ageGroupsWithTeams].map(ag => (
              <button key={ag} onClick={() => setFilterAg(ag)}
                style={{ padding: '4px 11px', borderRadius: '6px', border: 'none', background: filterAg === ag ? '#0F172A' : '#F1F5F9', color: filterAg === ag ? '#fff' : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                {ag}
              </button>
            ))}
            <div style={{ marginLeft: '8px', display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px', gap: '2px' }}>
              {['All','Boys','Girls'].map(g => (
                <button key={g} onClick={() => setFG(g)}
                  style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: filterGender === g ? '#fff' : 'transparent', color: filterGender === g ? '#0F172A' : '#64748B', fontSize: '12px', fontWeight: filterGender === g ? '700' : '500', cursor: 'pointer', fontFamily: 'inherit', boxShadow: filterGender === g ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.12s' }}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Team cards grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {filteredTeams.length === 0 ? (
            <div style={{ padding: '64px', textAlign: 'center', color: '#94A3B8', fontSize: '13.5px' }}>No teams found. Add teams in Teams &amp; Tiers first.</div>
          ) : (
            visibleAgs.map((ag, agIdx) => {
              const agTeams = filteredTeams.filter(t => t.age_group === ag);
              if (agTeams.length === 0) return null;
              return (
                <div key={ag} style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px', paddingBottom: '6px', borderBottom: `2px solid ${agIdx === 0 ? primary : '#E2E8F0'}` }}>{ag}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
                    {agTeams.map(team => {
                      const headCoach = coaches.find(c => c.id === team.head_coach_id);
                      const assistants = teamAssistants(team.name);
                      const count = playerCounts[team.name] ?? 0;
                      const draftAssistant = addingAssistant[team.id] ?? '';
                      const availableAssistants = coaches.filter(c => c.is_active && c.id !== team.head_coach_id && !assistants.find(a => a.id === c.id));

                      return (
                        <div key={team.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                          {/* Colored header */}
                          <div style={{ background: team.color, padding: '11px 14px 9px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#fff' }}>{team.name}</div>
                              <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                                {[team.age_group, team.gender ? (team.gender === 'Male' ? '♂' : '♀') : null, team.format].filter(Boolean).join(' ')}
                              </div>
                            </div>
                            {count > 0 && (
                              <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Users size={10} /> {count}
                              </span>
                            )}
                          </div>

                          <div style={{ padding: '12px 14px' }}>
                            {/* Head coach */}
                            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Head Coach</div>
                            <select
                              value={team.head_coach_id ?? ''}
                              onChange={e => assignHeadCoach(team.id, e.target.value || null)}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: team.head_coach_id ? '#0F172A' : '#94A3B8', background: '#F8FAFC', outline: 'none', cursor: 'pointer', fontWeight: team.head_coach_id ? '600' : '400', fontFamily: 'inherit' }}>
                              <option value="">— Unassigned —</option>
                              {coaches.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                            </select>

                            {/* Assistants */}
                            <div style={{ marginTop: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>Assistants ({assistants.length})</div>
                              </div>
                              {assistants.map(a => (
                                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: '#F8FAFC', borderRadius: '6px', marginBottom: '3px' }}>
                                  <span style={{ fontSize: '12.5px', color: '#374151', fontWeight: '600' }}>{a.full_name}</span>
                                  <button onClick={() => removeAssistant(team.name, a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', padding: '2px', display: 'flex' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#EF4444'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#CBD5E1'}>
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                              {/* Add assistant */}
                              <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                                <select
                                  value={draftAssistant}
                                  onChange={e => setAddingAssistant(prev => ({ ...prev, [team.id]: e.target.value }))}
                                  style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px dashed #CBD5E1', fontSize: '12px', color: draftAssistant ? '#0F172A' : '#94A3B8', background: '#fff', outline: 'none', fontFamily: 'inherit' }}>
                                  <option value="">+ Add assistant</option>
                                  {availableAssistants.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                                </select>
                                {draftAssistant && (
                                  <button
                                    onClick={() => { addAssistant(team.name, draftAssistant); setAddingAssistant(p => ({ ...p, [team.id]: '' })); }}
                                    style={{ padding: '5px 10px', borderRadius: '6px', background: primary, color: '#fff', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Add
                                  </button>
                                )}
                              </div>
                            </div>
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

      {/* ── Edit coach modal ── */}
      {editC && <CoachModal coach={editC} primary={primary} onClose={() => setEditC(null)} onSaved={load} />}

      {/* ── Send Coaches Packet modal ── */}
      {showPacketModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }} onClick={e => e.target === e.currentTarget && setShowPacketModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: primary }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff' }}>Send Coaches Packet</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>Roster + practice schedule emailed to each coach</div>
              </div>
              <button onClick={() => setShowPacketModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', borderRadius: '6px', padding: '4px', display: 'flex' }}><X size={16} /></button>
            </div>

            <div style={{ padding: '16px 22px 8px' }}>
              {/* Season selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Season:</span>
                <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', outline: 'none', background: '#fff', fontFamily: 'inherit' }}>
                  {seasonOptions().map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              {/* Select all / none */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <button
                  onClick={() => setSelectedIds(new Set(coaches.filter(c => c.email).map(c => c.id)))}
                  style={{ fontSize: '12px', fontWeight: '600', color: primary, background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontFamily: 'inherit' }}>
                  Select all with email
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontFamily: 'inherit' }}>
                  Deselect all
                </button>
              </div>
            </div>

            {/* Coach list */}
            <div style={{ maxHeight: '320px', overflowY: 'auto', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
              {coaches.map((c, i) => {
                const hasEmail = !!c.email;
                const selected = selectedIds.has(c.id);
                const packetSent = c.packet_sent_at ? new Date(c.packet_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
                return (
                  <div
                    key={c.id}
                    onClick={() => hasEmail && setSelectedIds(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 22px', borderBottom: '1px solid #F8FAFC', cursor: hasEmail ? 'pointer' : 'not-allowed', opacity: hasEmail ? 1 : 0.45, background: selected ? `${primary}08` : 'transparent', transition: 'background 0.12s' }}>
                    {selected
                      ? <CheckSquare size={16} color={primary} />
                      : <Square size={16} color="#CBD5E1" />
                    }
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: avatarColor(i), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
                      {initials(c.full_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>{c.full_name}</div>
                      <div style={{ fontSize: '11.5px', color: hasEmail ? '#64748B' : '#EF4444' }}>{c.email ?? 'No email — add in Club Staff'}</div>
                    </div>
                    {packetSent
                      ? <span style={{ fontSize: '10.5px', color: '#16A34A', fontWeight: '600', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px' }}><Clock size={10} /> {packetSent}</span>
                      : <span style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: '600', whiteSpace: 'nowrap' }}>Never sent</span>
                    }
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {sendResult ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: sendResult.sent === sendResult.total ? '#16A34A' : '#F59E0B' }}>
                  {sendResult.sent === sendResult.total
                    ? `✓ Sent ${sendResult.sent} packet${sendResult.sent !== 1 ? 's' : ''} successfully`
                    : `${sendResult.sent}/${sendResult.total} sent — check coaches without email`
                  }
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: '#94A3B8' }}>{selectedIds.size} coach{selectedIds.size !== 1 ? 'es' : ''} selected</div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowPacketModal(false)} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {sendResult ? 'Close' : 'Cancel'}
                </button>
                {!sendResult && (
                  <button
                    onClick={sendPackets}
                    disabled={sending || selectedIds.size === 0}
                    style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: selectedIds.size > 0 ? primary : '#E2E8F0', color: selectedIds.size > 0 ? '#fff' : '#94A3B8', fontSize: '13px', fontWeight: '700', cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {sending ? 'Sending…' : <><Send size={13} /> Send {selectedIds.size > 0 ? selectedIds.size : ''} packet{selectedIds.size !== 1 ? 's' : ''}</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ActionBtn ───────────────────────────────────────────────────────────────

function ActionBtn({ icon, label, onClick, primary: isPrimary }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 9px', borderRadius: '6px', border: `1px solid ${isPrimary ? (hover ? '#16A34A' : '#22C55E') : '#E2E8F0'}`, background: isPrimary ? (hover ? '#16A34A' : '#22C55E') : (hover ? '#F8FAFC' : '#fff'), color: isPrimary ? '#fff' : '#64748B', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
      {icon}{label}
    </button>
  );
}

// ── CoachModal ──────────────────────────────────────────────────────────────

function CoachModal({ coach, primary, onClose, onSaved }: { coach: Coach; primary: string; onClose: () => void; onSaved: () => void }) {
  const [hourlyRate, setHourlyRate] = useState(coach.hourly_rate);
  const [license, setLicense]       = useState(coach.license ?? '');
  const [phone, setPhone]           = useState(coach.phone ?? '');
  const [saving, setSaving]         = useState(false);
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl = (t: string) => <label style={{ fontSize: '11px', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '4px' }}>{t}</label>;

  async function save() {
    setSaving(true);
    await supabase.from('tryout_coaches').update({ hourly_rate: hourlyRate, license: license || null, phone: phone || null }).eq('id', coach.id);
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A' }}>{coach.full_name}</div>
            <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '1px' }}>Name &amp; email managed in Club → Staff</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
        </div>
        <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>{lbl('Phone')}<input value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="Optional" /></div>
          <div>{lbl('License / certification')}<input value={license} onChange={e => setLicense(e.target.value)} style={inp} placeholder="e.g. USSF D" /></div>
          <div style={{ gridColumn: '1/-1' }}>{lbl('Hourly rate ($)')}<input type="number" value={hourlyRate} onChange={e => setHourlyRate(parseFloat(e.target.value) || 0)} style={inp} /></div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: '8px', background: primary, color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
