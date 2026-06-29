'use client';

import { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { calcAgeGroup, seasonLabelToYear, seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Lock, Unlock, Send, GripVertical, ChevronDown } from 'lucide-react';

type Player = { id: string; first_name: string; last_name: string; dob: string | null; grade: string | null; gender: string | null; final_age_group: string | null; positions: string[] | null };
type Ranking = { player_id: string; tryout_rank: number | null; coach_rank: number | null };
type Assignment = { player_id: string; team: string | null; status: string; offer_status: string; offer_token?: string };
type TryoutTeam = { id: string; name: string; color: string; age_group: string | null; gender: string | null; format: string | null; roster_locked: boolean; head_coach_id: string | null };
type CoachMap = Record<string, string>; // id → full_name
type ClubT = { id: string } | null;

const OFFER_DOT: Record<string, string> = { NotSent: '#CBD5E1', Sent: '#3B82F6', Accepted: '#22C55E', Declined: '#EF4444' };
const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  Accepted: { bg: '#F0FDF4', color: '#16A34A' }, Declined: { bg: '#FEF2F2', color: '#DC2626' },
  Unassigned: { bg: '#F1F5F9', color: '#94A3B8' }, Offer: { bg: '#EFF6FF', color: '#2563EB' },
};

type ColDef = { id: string; label: string; color: string; teamId?: string; locked?: boolean };

export default function TeamBuilderPage() {
  const { club } = useDashboard();
  const [season, setSeason]     = useState(() => seasonOptions()[1] ?? '2026-27');
  const [players, setPlayers]   = useState<Player[]>([]);
  const [rankings, setRankings] = useState<Map<string, Ranking>>(new Map());
  const [assigns, setAssigns]   = useState<Map<string, Assignment>>(new Map());
  const [teams, setTeams]       = useState<TryoutTeam[]>([]);
  const [coaches, setCoaches]   = useState<CoachMap>({});
  const [filterAg, setFilterAg] = useState('All');
  const [filterGender, setFG]   = useState('All');
  const [sortField, setSortField] = useState<'tryout_rank' | 'coach_rank' | 'last_name'>('tryout_rank');
  const [loading, setLoading]   = useState(true);
  const [sendingId, setSendId]  = useState<string | null>(null);

  const seasonYear = seasonLabelToYear(season);
  const getAg = (p: Player) => p.final_age_group || (p.dob ? calcAgeGroup(p.dob, seasonYear) : 'Unknown');

  async function load() {
    if (!club) return;
    const [{ data: ps }, { data: rnk }, { data: asgn }, { data: ts }, { data: cs }] = await Promise.all([
      supabase.from('tryout_players').select('id,first_name,last_name,dob,grade,gender,final_age_group,positions').eq('club_id', club.id),
      supabase.from('tryout_rankings').select('player_id,tryout_rank,coach_rank').eq('club_id', club.id),
      supabase.from('tryout_assignments').select('player_id,team,status,offer_status,offer_token').eq('club_id', club.id),
      supabase.from('tryout_teams').select('*').eq('club_id', club.id).eq('is_active', true).order('sort_order').order('name'),
      supabase.from('tryout_coaches').select('id,full_name').eq('club_id', club.id),
    ]);
    setPlayers((ps ?? []) as Player[]);
    setRankings(new Map(((rnk ?? []) as Ranking[]).map(r => [r.player_id, r])));
    setAssigns(new Map(((asgn ?? []) as Assignment[]).map(a => [a.player_id, a])));
    setTeams((ts ?? []) as TryoutTeam[]);
    setCoaches(Object.fromEntries(((cs ?? []) as { id: string; full_name: string }[]).map(c => [c.id, c.full_name])));
    setLoading(false);
  }
  useEffect(() => { load(); }, [club]);

  // Filter players for current view
  const visibleAgs = filterAg === 'All' ? AGE_GROUPS : [filterAg];
  const visibleTeams = teams.filter(t => {
    if (filterAg !== 'All' && t.age_group && t.age_group !== filterAg) return false;
    if (filterGender !== 'All' && t.gender && t.gender !== filterGender) return false;
    return true;
  });

  function matchesFilter(p: Player) {
    if (filterAg !== 'All' && getAg(p) !== filterAg) return false;
    if (filterGender !== 'All' && p.gender !== filterGender) return false;
    return true;
  }

  function sortPlayers(ids: string[]) {
    return [...ids].sort((a, b) => {
      const ra = rankings.get(a); const rb = rankings.get(b);
      if (sortField === 'last_name') {
        const pa = players.find(p => p.id === a); const pb = players.find(p => p.id === b);
        return (pa?.last_name ?? '').localeCompare(pb?.last_name ?? '');
      }
      const va = ra?.[sortField] ?? 9999; const vb = rb?.[sortField] ?? 9999;
      return va - vb;
    });
  }

  // Build columns
  const poolIds: string[] = [];
  const cutIds: string[] = [];
  const declinedIds: string[] = [];
  const teamIds: Record<string, string[]> = {};
  visibleTeams.forEach(t => { teamIds[t.id] = []; });

  for (const p of players) {
    if (!matchesFilter(p)) continue;
    const a = assigns.get(p.id);
    const team = a?.team;
    if (!team || team === 'Unassigned') { poolIds.push(p.id); continue; }
    if (team === 'Cut') { cutIds.push(p.id); continue; }
    if (team === 'Declined') { declinedIds.push(p.id); continue; }
    const mt = visibleTeams.find(t => t.name === team);
    if (mt) teamIds[mt.id].push(p.id);
    else poolIds.push(p.id);
  }

  const cols: ColDef[] = [
    { id: 'pool', label: 'Unassigned Pool', color: '#94A3B8' },
    ...visibleTeams.map(t => ({ id: t.id, label: t.name, color: t.color, teamId: t.id, locked: t.roster_locked })),
    { id: 'cut', label: 'Cut List', color: '#EF4444' },
    { id: 'declined', label: 'Declined', color: '#94A3B8' },
  ];

  function getColIds(colId: string) {
    if (colId === 'pool') return sortPlayers(poolIds);
    if (colId === 'cut') return cutIds;
    if (colId === 'declined') return declinedIds;
    return sortPlayers(teamIds[colId] ?? []);
  }

  const totalVisible = players.filter(matchesFilter).length;
  const placedCount = players.filter(p => { if (!matchesFilter(p)) return false; const t = assigns.get(p.id)?.team; return t && !['Unassigned','Cut','Declined',null].includes(t); }).length;
  const cutCount = players.filter(p => matchesFilter(p) && assigns.get(p.id)?.team === 'Cut').length;
  const decCount = players.filter(p => matchesFilter(p) && assigns.get(p.id)?.team === 'Declined').length;
  const poolCount = totalVisible - placedCount - cutCount - decCount;
  const pct = totalVisible > 0 ? Math.round((placedCount / totalVisible) * 100) : 0;

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || !club) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    // Check if destination team is locked
    if (destination.droppableId !== 'pool' && destination.droppableId !== 'cut' && destination.droppableId !== 'declined') {
      const destTeam = teams.find(t => t.id === destination.droppableId);
      if (destTeam?.roster_locked) return;
    }
    let newTeam: string;
    if (destination.droppableId === 'pool') newTeam = 'Unassigned';
    else if (destination.droppableId === 'cut') newTeam = 'Cut';
    else if (destination.droppableId === 'declined') newTeam = 'Declined';
    else { const t = teams.find(t => t.id === destination.droppableId); newTeam = t?.name ?? 'Unassigned'; }
    // Optimistic update
    setAssigns(prev => { const next = new Map(prev); const ex = next.get(draggableId) ?? { player_id: draggableId, team: null, status: 'Unassigned', offer_status: 'NotSent' }; next.set(draggableId, { ...ex, team: newTeam }); return next; });
    const { error } = await supabase.from('tryout_assignments').upsert({ club_id: club.id, player_id: draggableId, team: newTeam }, { onConflict: 'club_id,player_id' });
    if (error) load();
  }, [club, teams]);

  async function toggleLock(team: TryoutTeam) {
    if (!club) return;
    const locked = !team.roster_locked;
    setTeams(prev => prev.map(t => t.id === team.id ? { ...t, roster_locked: locked } : t));
    await supabase.from('tryout_teams').update({ roster_locked: locked }).eq('id', team.id);
  }

  async function sendOffer(pid: string) {
    if (!club) return;
    setSendId(pid);
    try {
      const a = assigns.get(pid);
      if (!a) return;
      const res = await fetch('/api/tryout/send-offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_id: pid, club_id: club.id }) });
      if (res.ok) {
        setAssigns(prev => { const next = new Map(prev); const ex = next.get(pid); if (ex) next.set(pid, { ...ex, offer_status: 'Sent' }); return next; });
      }
    } finally { setSendId(null); }
  }

  if (loading) return <div style={{ padding: '40px', color: '#94A3B8' }}>Loading…</div>;

  const agTabs = ['All', ...AGE_GROUPS.filter(ag => players.some(p => getAg(p) === ag))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tryout Module · {season}</div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: '2px 0 0' }}>Team Builder</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
              {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={sortField} onChange={e => setSortField(e.target.value as typeof sortField)} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
              <option value="tryout_rank">Sort: Tryout Rank</option>
              <option value="coach_rank">Sort: Coach Rank</option>
              <option value="last_name">Sort: Name</option>
            </select>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: '600', marginBottom: '10px', alignItems: 'center' }}>
          {[{ label: 'IN POOL', val: poolCount, color: '#94A3B8' }, { label: 'PLACED', val: placedCount, color: '#22C55E' }, { label: 'CUT', val: cutCount, color: '#EF4444' }, { label: 'DECLINED', val: decCount, color: '#64748B' }, { label: 'TOTAL', val: totalVisible, color: '#0F172A' }].map(({ label, val, color }) => (
            <span key={label} style={{ color }}>{label} <strong style={{ fontSize: '14px' }}>{val}</strong></span>
          ))}
          <div style={{ flex: 1, height: '6px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden', marginLeft: '8px' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#22C55E', borderRadius: '3px', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '700' }}>{pct}% placed</span>
        </div>

        {/* Age group + gender tabs */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            {agTabs.map(ag => <button key={ag} onClick={() => setFilterAg(ag)} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: filterAg === ag ? '#0F172A' : '#F1F5F9', color: filterAg === ag ? '#fff' : '#64748B', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>{ag}</button>)}
          </div>
          <div style={{ marginLeft: '8px', display: 'flex', gap: '4px' }}>
            {['All','Male','Female'].map(g => <button key={g} onClick={() => setFG(g)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid', borderColor: filterGender === g ? '#22C55E' : '#E2E8F0', background: filterGender === g ? '#F0FDF4' : '#fff', color: filterGender === g ? '#16A34A' : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{g}</button>)}
          </div>
        </div>
      </div>

      {/* Kanban */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', minHeight: 0 }}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', minWidth: 'max-content', height: '100%', alignItems: 'flex-start' }}>
            {cols.map(col => {
              const ids = getColIds(col.id);
              const isPool = col.id === 'pool';
              const isSpecial = col.id === 'cut' || col.id === 'declined';
              const team = teams.find(t => t.id === col.teamId);
              const coachName = team?.head_coach_id ? coaches[team.head_coach_id] : null;
              const colW = isPool ? '240px' : isSpecial ? '200px' : '220px';

              return (
                <div key={col.id} style={{ width: colW, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  {/* Column header */}
                  <div style={{ borderRadius: '10px 10px 0 0', padding: '10px 12px', background: col.color }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#fff' }}>{col.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.25)', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontWeight: '700' }}>{ids.length}</span>
                        {team && (
                          <button onClick={() => toggleLock(team)} title={team.roster_locked ? 'Unlock roster' : 'Lock roster'}
                            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center' }}>
                            {team.roster_locked ? <Lock size={11} color="#fff" /> : <Unlock size={11} color="rgba(255,255,255,0.7)" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {coachName && <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>{coachName}</div>}
                    {isPool && <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>
                      <span>Sort:</span>
                      <select value={sortField} onChange={e => setSortField(e.target.value as typeof sortField)} style={{ fontSize: '10.5px', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', outline: 'none', cursor: 'pointer', borderRadius: '4px', padding: '1px 4px' }}>
                        <option value="tryout_rank">Tryout Rank</option>
                        <option value="coach_rank">Coach Rank</option>
                        <option value="last_name">Name</option>
                      </select>
                    </div>}
                  </div>

                  {/* Droppable area */}
                  <Droppable droppableId={col.id} isDropDisabled={col.locked}>
                    {(provided: import('@hello-pangea/dnd').DroppableProvided, snapshot: import('@hello-pangea/dnd').DroppableStateSnapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps}
                        style={{ flex: 1, overflowY: 'auto', padding: '6px', minHeight: '120px', background: snapshot.isDraggingOver ? `${col.color}12` : '#F8FAFC', border: `1px solid ${snapshot.isDraggingOver ? col.color : '#E2E8F0'}`, borderTop: 'none', borderRadius: '0 0 10px 10px', transition: 'background 0.1s' }}>
                        {ids.map((pid, idx) => {
                          const p = players.find(pl => pl.id === pid);
                          const a = assigns.get(pid);
                          const r = rankings.get(pid);
                          if (!p) return null;
                          const statusBadge = STATUS_BADGE[a?.status ?? 'Unassigned'] ?? STATUS_BADGE.Unassigned;
                          const offerDot = OFFER_DOT[a?.offer_status ?? 'NotSent'] ?? '#CBD5E1';
                          const rank = r?.tryout_rank ?? r?.coach_rank;

                          return (
                            <Draggable key={pid} draggableId={pid} index={idx} isDragDisabled={col.locked}>
                              {(drag: import('@hello-pangea/dnd').DraggableProvided, snap: import('@hello-pangea/dnd').DraggableStateSnapshot) => (
                                <div ref={drag.innerRef} {...drag.draggableProps}
                                  style={{ background: '#fff', borderRadius: '7px', padding: '7px 9px', marginBottom: '4px', border: '1px solid #E2E8F0', boxShadow: snap.isDragging ? '0 4px 14px rgba(0,0,0,0.14)' : '0 1px 2px rgba(0,0,0,0.04)', userSelect: 'none', ...drag.draggableProps.style }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                    <div {...drag.dragHandleProps} style={{ color: '#CBD5E1', cursor: 'grab', flexShrink: 0, marginTop: '1px' }}><GripVertical size={12} /></div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                        <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.first_name} {p.last_name}</span>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: offerDot, flexShrink: 0 }} />
                                      </div>
                                      <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '2px' }}>
                                        {p.dob ? new Date(p.dob+'T12:00:00').toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'}) : '—'}
                                        {p.grade ? ` · ${p.grade}` : ''}
                                        {rank ? ` · #${rank}` : ''}
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '5px' }}>
                                        <span style={{ fontSize: '10.5px', background: statusBadge.bg, color: statusBadge.color, borderRadius: '4px', padding: '1px 6px', fontWeight: '600' }}>{a?.status ?? 'Unassigned'}</span>
                                        {!isSpecial && !isPool && (a?.offer_status === 'NotSent' || !a?.offer_status) && (
                                          <button onClick={() => sendOffer(pid)} disabled={sendingId === pid}
                                            style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', background: sendingId === pid ? '#E2E8F0' : '#EFF6FF', color: '#2563EB', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontWeight: '600' }}>
                                            <Send size={9} />{sendingId === pid ? '…' : 'Offer'}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                        {ids.length === 0 && !snapshot.isDraggingOver && (
                          <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: '11px', color: '#CBD5E1' }}>Drop players here</div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}
