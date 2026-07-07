'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { calcAgeGroup, seasonLabelToYear, seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Lock, Unlock, Plus, X, Edit2, Trash2, Mail, Search, Send, CheckCircle2, HelpCircle, Copy, Check, MoreHorizontal, Download, Columns } from 'lucide-react';

const TEAM_PALETTE = ['#3B82F6','#22C55E','#EF4444','#F59E0B','#6366F1','#EC4899','#14B8A6','#8B5CF6','#F97316','#06B6D4'];
type NewTeamForm = { name: string; color: string; age_group: string; gender: string; format: string };
const blankTeam = (ag: string, gender: string): NewTeamForm => ({ name: '', color: TEAM_PALETTE[0], age_group: ag, gender, format: '11v11' });

// Standard format by age group
const AG_FORMAT: Record<string, string> = {
  U7:'7v7', U8:'7v7', U9:'7v7', U10:'9v9', U11:'9v9', U12:'9v9',
  U13:'11v11', U14:'11v11', U15:'11v11', U16:'11v11', U17:'11v11', U18:'11v11', U19:'11v11',
};

type Player = {
  id: string; first_name: string; last_name: string;
  date_of_birth: string | null; grade: string | null;
  gender: string | null; final_age_group: string | null;
  positions: string[] | null; maroons_status: string | null;
  email_primary: string | null; maybe_flag: boolean | null;
};
type Ranking = { player_id: string; tryout_rank: number | null; coach_rank: number | null; tryout_status: string | null };
type Assignment = { player_id: string; team: string | null; status: string; offer_status: string };
type TryoutTeam = { id: string; name: string; color: string; age_group: string | null; gender: string | null; format: string | null; roster_locked: boolean; head_coach_id: string | null };
type CoachMap = Record<string, string>;
type ClubCtx = { id: string; name: string | null; primary_color: string | null; secondary_color?: string | null; logo_url?: string | null } | null;

type ColDef = { id: string; label: string; color: string; teamId?: string; locked?: boolean };
type PrevPlayer = { id: string; first_name: string; last_name: string; date_of_birth: string | null; email_primary: string | null };
type GhostCard  = { name: string; prevTeam: string };

function prevSeasonLabel(s: string): string {
  const [start] = s.split('-');
  const y = parseInt(start, 10);
  return `${y - 1}-${String(y).slice(-2)}`;
}

function getOfferBadge(a: Assignment | undefined, inTeam: boolean): { label: string; bg: string; color: string; dot?: string } | null {
  if (!inTeam) return null;
  const os = a?.offer_status ?? 'NotSent';
  const st = a?.status ?? 'Unassigned';
  if (os === 'Accepted') return { label: 'Accepted ✓', bg: '#DCFCE7', color: '#15803D', dot: '#22C55E' };
  if (os === 'Sent')     return { label: 'Resend ⚠',  bg: '#FEF3C7', color: '#D97706', dot: '#F59E0B' };
  if (os === 'Declined') return { label: 'Declined',   bg: '#FEE2E2', color: '#DC2626', dot: '#EF4444' };
  if (st === 'Waitlist') return { label: 'Waitlist',   bg: '#F1F5F9', color: '#64748B', dot: '#94A3B8' };
  return null;
}

function fmtDob(dob: string | null) {
  if (!dob) return '—';
  return dob; // already yyyy-mm-dd from Supabase date
}

export default function TeamBuilderPage() {
  const { club } = useDashboard();
  const clubCtx = club as ClubCtx;
  const primary = clubCtx?.primary_color && clubCtx.primary_color !== '#000000' ? clubCtx.primary_color : '#1E293B';

  const [season, setSeason]       = useState(() => seasonOptions()[1] ?? '2026-27');
  const [players, setPlayers]     = useState<Player[]>([]);
  const [rankings, setRankings]   = useState<Map<string, Ranking>>(new Map());
  const [assigns, setAssigns]     = useState<Map<string, Assignment>>(new Map());
  const [teams, setTeams]         = useState<TryoutTeam[]>([]);
  const [coaches, setCoaches]     = useState<CoachMap>({});
  const [filterAg, setFilterAg]   = useState('');
  const [filterGender, setFG]     = useState('All');
  const [sortField, setSortField] = useState<'tryout_rank'|'coach_rank'|'last_name'|'first_name'|'status'>('tryout_rank');
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [sendingId, setSendId]    = useState<string | null>(null);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [editTeam, setEditTeam]   = useState<TryoutTeam | null>(null);
  const [delTeamId, setDelTeamId] = useState<string | null>(null);
  const [highlightNTR, setHighlightNTR] = useState(false);
  const [emailModal, setEmailModal] = useState<{ title: string; rows: { name: string; email: string }[] } | null>(null);
  const [overridePopup, setOverridePopup] = useState<{ pid: string; x: number; y: number } | null>(null);
  const [colMenu, setColMenu] = useState<{ colId: string; colLabel: string; x: number; y: number } | null>(null);
  const [sendOfferModal, setSendOfferModal] = useState<{ colId: string; colLabel: string } | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [cardFields, setCardFields] = useState<Set<string>>(new Set(['dob','grade','position','coach_rank','tryout_rank','offer_status']));
  const [prevTeamMap, setPrevTeamMap]     = useState<Map<string, string>>(new Map());
  const [ghostsByTeam, setGhostsByTeam]   = useState<Map<string, GhostCard[]>>(new Map());
  const [prevPopulating, setPrevPopulating] = useState(false);

  function toggleField(f: string) {
    setCardFields(prev => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });
  }

  const seasonYear = seasonLabelToYear(season);
  const getAg = (p: Player) => p.final_age_group || (p.date_of_birth ? calcAgeGroup(p.date_of_birth, seasonYear) : 'Unknown');

  async function load() {
    if (!club) return;
    const prevSeason = prevSeasonLabel(season);
    const [{ data: ps }, { data: rnk }, { data: asgn }, { data: ts }, { data: cs }, { data: prevPs }] = await Promise.all([
      supabase.from('tryout_players').select('id,first_name,last_name,date_of_birth,grade,gender,final_age_group,positions,maroons_status,email_primary,maybe_flag').eq('club_id', club.id).eq('season_label', season),
      supabase.from('tryout_rankings').select('player_id,tryout_rank,coach_rank,tryout_status').eq('club_id', club.id),
      supabase.from('tryout_assignments').select('player_id,team,status,offer_status').eq('club_id', club.id),
      supabase.from('tryout_teams').select('*').eq('club_id', club.id).eq('is_active', true).order('sort_order').order('name'),
      supabase.from('tryout_coaches').select('id,full_name').eq('club_id', club.id),
      supabase.from('tryout_players').select('id,first_name,last_name,date_of_birth,email_primary').eq('club_id', club.id).eq('season_label', prevSeason),
    ]);

    const currPlayers = (ps ?? []) as Player[];
    const allPrevPs   = (prevPs ?? []) as PrevPlayer[];
    const allAssigns  = (asgn ?? []) as Assignment[];

    const currPlayerIds = new Set(currPlayers.map(p => p.id));
    const prevPlayerIds = new Set(allPrevPs.map(p => p.id));
    const PLACED = (t: string | null) => t && !['Unassigned','Cut','Declined'].includes(t);

    const prevAssignByPrevId = new Map(
      allAssigns.filter(a => prevPlayerIds.has(a.player_id) && PLACED(a.team)).map(a => [a.player_id, a.team!])
    );

    const newPrevTeamMap = new Map<string, string>();
    const matchedPrevIds = new Set<string>();
    for (const curr of currPlayers) {
      let prevMatch: PrevPlayer | undefined;
      if (curr.email_primary) prevMatch = allPrevPs.find(p => p.email_primary === curr.email_primary);
      if (!prevMatch && curr.date_of_birth) {
        prevMatch = allPrevPs.find(p => p.date_of_birth === curr.date_of_birth && p.last_name.toLowerCase() === curr.last_name.toLowerCase());
      }
      if (prevMatch) {
        matchedPrevIds.add(prevMatch.id);
        const prevTeam = prevAssignByPrevId.get(prevMatch.id);
        if (prevTeam) newPrevTeamMap.set(curr.id, prevTeam);
      }
    }

    const ghosts = new Map<string, GhostCard[]>();
    for (const prevP of allPrevPs) {
      if (matchedPrevIds.has(prevP.id)) continue;
      const prevTeam = prevAssignByPrevId.get(prevP.id);
      if (!prevTeam) continue;
      const list = ghosts.get(prevTeam) ?? [];
      list.push({ name: `${prevP.first_name} ${prevP.last_name}`, prevTeam });
      ghosts.set(prevTeam, list);
    }

    setPlayers(currPlayers);
    setRankings(new Map(((rnk ?? []) as Ranking[]).map(r => [r.player_id, r])));
    setAssigns(new Map(allAssigns.filter(a => currPlayerIds.has(a.player_id)).map(a => [a.player_id, a])));
    setTeams((ts ?? []) as TryoutTeam[]);
    setCoaches(Object.fromEntries(((cs ?? []) as { id: string; full_name: string }[]).map(c => [c.id, c.full_name])));
    setPrevTeamMap(newPrevTeamMap);
    setGhostsByTeam(ghosts);
    setLoading(false);
  }
  useEffect(() => { load(); }, [club, season]);

  const agTabs = AGE_GROUPS.filter(ag => players.some(p => getAg(p) === ag));
  if (agTabs.length > 0 && !filterAg) setFilterAg(agTabs[0]);

  const visibleTeams = teams.filter(t => {
    if (filterAg && t.age_group && t.age_group !== filterAg) return false;
    if (filterGender !== 'All' && t.gender && t.gender !== filterGender) return false;
    return true;
  });

  function matchesFilter(p: Player) {
    if (filterAg && getAg(p) !== filterAg) return false;
    if (filterGender !== 'All' && p.gender !== filterGender) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(p.first_name + ' ' + p.last_name).toLowerCase().includes(q)) return false;
    }
    return true;
  }

  function sortPlayers(ids: string[]) {
    return [...ids].sort((a, b) => {
      const pa = players.find(p => p.id === a);
      const pb = players.find(p => p.id === b);
      const ra = rankings.get(a);
      const rb = rankings.get(b);
      if (sortField === 'last_name')  return (pa?.last_name ?? '').localeCompare(pb?.last_name ?? '');
      if (sortField === 'first_name') return (pa?.first_name ?? '').localeCompare(pb?.first_name ?? '');
      if (sortField === 'status') {
        const order: Record<string, number> = { Accepted: 0, Sent: 1, Waitlist: 2, NotSent: 3, Declined: 4 };
        const sa = assigns.get(a)?.offer_status ?? 'NotSent';
        const sb = assigns.get(b)?.offer_status ?? 'NotSent';
        return (order[sa] ?? 9) - (order[sb] ?? 9);
      }
      const va = sortField === 'tryout_rank' ? (ra?.tryout_rank ?? 9999) : (ra?.coach_rank ?? 9999);
      const vb = sortField === 'tryout_rank' ? (rb?.tryout_rank ?? 9999) : (rb?.coach_rank ?? 9999);
      return va - vb;
    });
  }

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
    { id: 'pool',     label: 'Unassigned Pool', color: '#475569' },
    ...visibleTeams.map(t => ({ id: t.id, label: t.name, color: t.color, teamId: t.id, locked: t.roster_locked })),
    { id: 'cut',      label: 'Cut List',  color: '#374151' },
    { id: 'declined', label: 'Declined',  color: '#7F1D1D' },
  ];

  const teamColorByName = new Map(teams.map(t => [t.name, t.color]));

  function getColIds(colId: string) {
    if (colId === 'pool')     return sortPlayers(poolIds);
    if (colId === 'cut')      return cutIds;
    if (colId === 'declined') return declinedIds;
    return sortPlayers(teamIds[colId] ?? []);
  }

  const allVisible = players.filter(matchesFilter);
  const placedCount = allVisible.filter(p => { const t = assigns.get(p.id)?.team; return t && !['Unassigned','Cut','Declined',null].includes(t); }).length;
  const cutCount    = allVisible.filter(p => assigns.get(p.id)?.team === 'Cut').length;
  const decCount    = allVisible.filter(p => assigns.get(p.id)?.team === 'Declined').length;
  const poolCount   = allVisible.length - placedCount - cutCount - decCount;
  const totalCount  = allVisible.length;
  const pct         = totalCount > 0 ? Math.round((placedCount / totalCount) * 100) : 0;

  // NTR = Not Travel Ready
  const ntrIds = new Set([...rankings.values()].filter(r => r.tryout_status === 'NTR').map(r => r.player_id));
  const ntrCount = [...ntrIds].filter(id => { const p = players.find(pl => pl.id === id); return p && matchesFilter(p) && (!assigns.get(id)?.team || assigns.get(id)?.team === 'Unassigned'); }).length;

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || !club) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    if (destination.droppableId !== 'pool' && destination.droppableId !== 'cut' && destination.droppableId !== 'declined') {
      const destTeam = teams.find(t => t.id === destination.droppableId);
      if (destTeam?.roster_locked) return;
    }
    let newTeam: string;
    if (destination.droppableId === 'pool') newTeam = 'Unassigned';
    else if (destination.droppableId === 'cut') newTeam = 'Cut';
    else if (destination.droppableId === 'declined') newTeam = 'Declined';
    else { const t = teams.find(t => t.id === destination.droppableId); newTeam = t?.name ?? 'Unassigned'; }
    setAssigns(prev => {
      const next = new Map(prev);
      const ex = next.get(draggableId) ?? { player_id: draggableId, team: null, status: 'Unassigned', offer_status: 'NotSent' };
      next.set(draggableId, { ...ex, team: newTeam });
      return next;
    });
    const { error } = await supabase.from('tryout_assignments').upsert({ club_id: club.id, player_id: draggableId, team: newTeam }, { onConflict: 'club_id,player_id' });
    if (error) load();
  }, [club, teams]);

  async function toggleLock(team: TryoutTeam) {
    const locked = !team.roster_locked;
    setTeams(prev => prev.map(t => t.id === team.id ? { ...t, roster_locked: locked } : t));
    await supabase.from('tryout_teams').update({ roster_locked: locked }).eq('id', team.id);
  }

  async function sendOffer(pid: string) {
    if (!club) return;
    setSendId(pid);
    try {
      const res = await fetch('/api/tryout/send-offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_id: pid, club_id: club.id }) });
      if (res.ok) setAssigns(prev => { const next = new Map(prev); const ex = next.get(pid); if (ex) next.set(pid, { ...ex, offer_status: 'Sent' }); return next; });
    } finally { setSendId(null); }
  }

  async function toggleMaybe(pid: string) {
    if (!club) return;
    const p = players.find(pl => pl.id === pid);
    if (!p) return;
    const newVal = !p.maybe_flag;
    setPlayers(prev => prev.map(pl => pl.id === pid ? { ...pl, maybe_flag: newVal } : pl));
    await supabase.from('tryout_players').update({ maybe_flag: newVal }).eq('id', pid).eq('club_id', club.id);
  }

  function openTeamEmailModal(colId: string, label: string) {
    const ids = getColIds(colId);
    const rows = ids.flatMap(pid => {
      const p = players.find(pl => pl.id === pid);
      if (!p || !p.email_primary) return [];
      return [{ name: `${p.first_name} ${p.last_name}`, email: p.email_primary }];
    });
    setEmailModal({ title: `${label} — Emails`, rows });
  }

  function openPlayerEmailModal(pid: string) {
    const p = players.find(pl => pl.id === pid);
    if (!p) return;
    setEmailModal({
      title: `${p.first_name} ${p.last_name}`,
      rows: p.email_primary ? [{ name: `${p.first_name} ${p.last_name}`, email: p.email_primary }] : [],
    });
  }

  async function setOfferStatus(pid: string, newStatus: string) {
    if (!club) return;
    setAssigns(prev => {
      const next = new Map(prev);
      const ex = next.get(pid) ?? { player_id: pid, team: null, status: 'Unassigned', offer_status: 'NotSent' };
      next.set(pid, { ...ex, offer_status: newStatus });
      return next;
    });
    await supabase.from('tryout_assignments').upsert({ club_id: club.id, player_id: pid, offer_status: newStatus }, { onConflict: 'club_id,player_id' });
    setOverridePopup(null);
  }

  async function bulkSetOfferStatus(colId: string, newStatus: string) {
    if (!club) return;
    const ids = getColIds(colId);
    setAssigns(prev => {
      const next = new Map(prev);
      ids.forEach(pid => {
        const ex = next.get(pid) ?? { player_id: pid, team: null, status: 'Unassigned', offer_status: 'NotSent' };
        next.set(pid, { ...ex, offer_status: newStatus });
      });
      return next;
    });
    if (ids.length > 0) {
      await supabase.from('tryout_assignments').upsert(
        ids.map(pid => ({ club_id: club.id, player_id: pid, offer_status: newStatus })),
        { onConflict: 'club_id,player_id' }
      );
    }
    setColMenu(null);
  }

  async function sendAllOffersInCol(colId: string, colLabel: string) {
    setColMenu(null);
    setSendOfferModal({ colId, colLabel });
  }

  function exportColCSV(colId: string, label: string) {
    const ids = getColIds(colId);
    const rows = ids.flatMap(pid => {
      const p = players.find(pl => pl.id === pid);
      const a = assigns.get(pid);
      const r = rankings.get(pid);
      if (!p) return [];
      return [[
        `${p.last_name}, ${p.first_name}`,
        p.date_of_birth ?? '',
        p.grade ?? '',
        (p.positions ?? []).join('/'),
        p.email_primary ?? '',
        a?.offer_status ?? 'NotSent',
        String(r?.tryout_rank ?? ''),
        String(r?.coach_rank ?? ''),
      ]];
    });
    const csv = [
      ['Name','DOB','Grade','Positions','Email','Offer Status','Tryout Rank','Coach Rank'].join(','),
      ...rows.map(r => r.map(v => `"${v.replace(/"/g,'""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${label.replace(/\s+/g,'-')}.csv`; anchor.click();
    URL.revokeObjectURL(url);
    setColMenu(null);
  }

  async function deleteTeam(teamId: string) {
    if (!club) return;
    const teamName = teams.find(t => t.id === teamId)?.name;
    if (teamName) {
      const affected = [...assigns.entries()].filter(([, a]) => a.team === teamName).map(([id]) => id);
      if (affected.length > 0) await supabase.from('tryout_assignments').update({ team: 'Unassigned' }).eq('club_id', club.id).in('player_id', affected);
    }
    await supabase.from('tryout_teams').delete().eq('id', teamId);
    setDelTeamId(null);
    load();
  }

  async function autoPopulate() {
    if (!club || prevPopulating) return;
    setPrevPopulating(true);
    const updates: { club_id: string; player_id: string; team: string }[] = [];
    for (const [currId, prevTeam] of prevTeamMap.entries()) {
      const currAssign = assigns.get(currId);
      if (currAssign?.team && currAssign.team !== 'Unassigned') continue;
      if (teams.some(t => t.name === prevTeam)) updates.push({ club_id: club.id, player_id: currId, team: prevTeam });
    }
    if (updates.length > 0) await supabase.from('tryout_assignments').upsert(updates, { onConflict: 'club_id,player_id' });
    await load();
    setPrevPopulating(false);
  }

  const autoPopulateCount = [...prevTeamMap.entries()].filter(([currId, prevTeam]) => {
    const currAssign = assigns.get(currId);
    return (!currAssign?.team || currAssign.team === 'Unassigned') && teams.some(t => t.name === prevTeam);
  }).length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', fontSize: '14px' }}>Loading…</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#F1F5F9' }}>

      {/* ── PRIMARY COLOR HEADER ── */}
      <div style={{ background: primary, flexShrink: 0 }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 8px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px', fontWeight: '900', color: '#fff', letterSpacing: '-0.01em' }}>Team Builder</span>
              <span style={{ fontSize: '10px', fontWeight: '700', color: primary, background: '#fff', borderRadius: '20px', padding: '2px 8px', letterSpacing: '0.05em' }}>LIVE</span>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>Drag · drop · place players into teams</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={season} onChange={e => setSeason(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.2)', fontSize: '12.5px', color: '#fff', background: 'rgba(255,255,255,0.12)', outline: 'none', cursor: 'pointer' }}>
              {seasonOptions().map(s => <option key={s} value={s} style={{ color: '#0F172A' }}>{s}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['All','Male','Female'].map(g => (
                <button key={g} onClick={() => setFG(g)}
                  style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                    background: filterGender === g ? '#fff' : 'rgba(255,255,255,0.15)', color: filterGender === g ? primary : 'rgba(255,255,255,0.8)' }}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ padding: '6px 20px 10px', display: 'flex', alignItems: 'center', gap: '0' }}>
          {[
            { label: 'IN POOL', val: poolCount, accent: 'rgba(255,255,255,0.5)' },
            { label: 'PLACED',  val: placedCount, accent: '#4ADE80' },
            { label: 'CUT',     val: cutCount,    accent: '#FCA5A5' },
            { label: 'DECLINED',val: decCount,    accent: 'rgba(255,255,255,0.4)' },
            { label: 'TOTAL',   val: totalCount,  accent: '#fff' },
          ].map(({ label, val, accent }, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '5px', paddingRight: '18px', borderRight: i < 4 ? '1px solid rgba(255,255,255,0.15)' : 'none', marginRight: '18px' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em' }}>{label}</span>
              <span style={{ fontSize: '18px', fontWeight: '900', color: accent, lineHeight: 1 }}>{val}</span>
            </div>
          ))}
          <div style={{ flex: 1, marginLeft: '4px' }}>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.15)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#4ADE80', borderRadius: '3px', transition: 'width 0.4s' }} />
            </div>
            <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.55)', marginTop: '3px', textAlign: 'right' }}>{pct}% placed</div>
          </div>
        </div>

        {/* Age group tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '0 20px 12px', overflowX: 'auto' }}>
          {agTabs.map(ag => {
            const count = players.filter(p => getAg(p) === ag).length;
            const fmt = teams.find(t => t.age_group === ag)?.format ?? AG_FORMAT[ag] ?? '';
            const active = filterAg === ag;
            return (
              <button key={ag} onClick={() => setFilterAg(ag)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
                  padding: '5px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  background: active ? '#fff' : 'rgba(255,255,255,0.12)',
                  color: active ? primary : 'rgba(255,255,255,0.75)',
                }}>
                <span style={{ fontSize: '13px', fontWeight: '800' }}>{ag}</span>
                {fmt && <span style={{ fontSize: '10px', fontWeight: '600', opacity: 0.7 }}>{fmt}</span>}
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '1px 6px', borderRadius: '10px',
                  background: active ? primary : 'rgba(255,255,255,0.2)',
                  color: active ? '#fff' : 'rgba(255,255,255,0.9)',
                }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TOOLBAR ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '9px 20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '0 0 220px' }}>
          <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search players…"
            style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* NTR button */}
        {ntrCount > 0 && (
          <button onClick={() => setHighlightNTR(h => !h)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '7px', border: `1px solid ${highlightNTR ? '#F59E0B' : '#FDE68A'}`, background: highlightNTR ? '#FEF3C7' : '#FFFBEB', color: '#B45309', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}>
            ⚠ NTR <span style={{ background: '#F59E0B', color: '#fff', borderRadius: '10px', padding: '0 6px', fontSize: '11px', fontWeight: '800' }}>{ntrCount}</span>
          </button>
        )}

        <select value={sortField} onChange={e => setSortField(e.target.value as typeof sortField)}
          style={{ width: '170px', padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#374151', background: '#fff', outline: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <option value="tryout_rank">Sort: Tryout Rank</option>
          <option value="coach_rank">Sort: Coach Rank</option>
          <option value="last_name">Sort: Last Name</option>
          <option value="first_name">Sort: First Name</option>
          <option value="status">Sort: Status</option>
        </select>

        {prevTeamMap.size > 0 && (
          <button
            onClick={autoPopulate}
            disabled={prevPopulating || autoPopulateCount === 0}
            title={autoPopulateCount > 0 ? `Pre-fill ${autoPopulateCount} unassigned players from ${prevSeasonLabel(season)}` : `All returning players already placed`}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: `1px solid ${autoPopulateCount > 0 ? '#86EFAC' : '#E2E8F0'}`, background: autoPopulateCount > 0 ? '#F0FDF4' : '#F8FAFC', color: autoPopulateCount > 0 ? '#15803D' : '#94A3B8', fontSize: '12.5px', fontWeight: '700', cursor: autoPopulateCount > 0 ? 'pointer' : 'default', flexShrink: 0, opacity: prevPopulating ? 0.6 : 1 }}>
            ↩ {prevSeasonLabel(season)}
            {autoPopulateCount > 0 && (
              <span style={{ background: '#22C55E', color: '#fff', borderRadius: '10px', padding: '0 6px', fontSize: '11px', fontWeight: '800' }}>{autoPopulateCount}</span>
            )}
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Fields on cards button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setFieldsOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: `1px solid ${fieldsOpen ? primary : '#E2E8F0'}`, background: fieldsOpen ? `${primary}10` : '#fff', color: fieldsOpen ? primary : '#374151', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>
            <Columns size={13} /> Show
            {cardFields.size < 6 && <span style={{ background: primary, color: '#fff', borderRadius: '10px', padding: '0 5px', fontSize: '10px', fontWeight: '800' }}>{cardFields.size}</span>}
          </button>
          {fieldsOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '8px 0', minWidth: '180px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 14px 8px' }}>Fields on cards</div>
              {([
                { key: 'dob',          label: 'Date of birth' },
                { key: 'grade',        label: 'Grade' },
                { key: 'position',     label: 'Position' },
                { key: 'tryout_rank',  label: 'Tryout rank' },
                { key: 'coach_rank',   label: 'Coach rank' },
                { key: 'offer_status', label: 'Offer status' },
              ] as { key: string; label: string }[]).map(({ key, label }) => (
                <button key={key} onClick={() => toggleField(key)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#0F172A', textAlign: 'left', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${cardFields.has(key) ? primary : '#CBD5E1'}`, background: cardFields.has(key) ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.1s' }}>
                    {cardFields.has(key) && <Check size={10} color="#fff" strokeWidth={3} />}
                  </div>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => { setEditTeam(null); setShowAddTeam(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '7px', background: primary, color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
          <Plus size={14} /> Add Team
        </button>
      </div>

      {/* ── KANBAN BOARD ── */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', minHeight: 0 }}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', minWidth: 'max-content', height: '100%', alignItems: 'flex-start', boxSizing: 'border-box' }}>
            {cols.map(col => {
              const ids = getColIds(col.id);
              const isPool     = col.id === 'pool';
              const isCut      = col.id === 'cut';
              const isDeclined = col.id === 'declined';
              const isSpecial  = isCut || isDeclined;
              const isTeam     = !isPool && !isSpecial;
              const team       = teams.find(t => t.id === col.teamId);
              const coachName  = team?.head_coach_id ? coaches[team.head_coach_id] : null;
              const colW       = isPool ? '265px' : isSpecial ? '210px' : '250px';

              return (
                <div key={col.id} style={{ width: colW, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100%' }}>
                  {/* Column header */}
                  <div style={{ borderRadius: '10px 10px 0 0', background: col.color, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px 6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '800', color: '#fff', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.label}</span>
                      <span style={{ fontSize: '11px', fontWeight: '800', background: 'rgba(255,255,255,0.25)', color: '#fff', borderRadius: '10px', padding: '1px 7px', flexShrink: 0 }}>{ids.length}</span>
                      {team && (
                        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                          <HeaderBtn onClick={() => toggleLock(team)} title={team.roster_locked ? 'Unlock' : 'Lock'}>
                            {team.roster_locked ? <Lock size={11} color="#fff" /> : <Unlock size={11} color="rgba(255,255,255,0.8)" />}
                          </HeaderBtn>
                          <HeaderBtn onClick={() => openTeamEmailModal(col.id, col.label)} title="Email team">
                            <Mail size={11} color="rgba(255,255,255,0.8)" />
                          </HeaderBtn>
                          <HeaderBtn onClick={() => { setEditTeam(team); setShowAddTeam(true); }} title="Edit team">
                            <Edit2 size={10} color="rgba(255,255,255,0.8)" />
                          </HeaderBtn>
                          <HeaderBtn onClick={() => setDelTeamId(team.id)} title="Delete team">
                            <Trash2 size={10} color="rgba(255,255,255,0.7)" />
                          </HeaderBtn>
                          <button
                            onClick={e => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setColMenu(colMenu?.colId === col.id ? null : { colId: col.id, colLabel: col.label, x: rect.left, y: rect.bottom + 4 });
                            }}
                            title="More options"
                            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center' }}>
                            <MoreHorizontal size={11} color="rgba(255,255,255,0.8)" />
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Sub-row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px 8px', fontSize: '10.5px', color: 'rgba(255,255,255,0.6)' }}>
                      {coachName && <><span>Coach {coachName}</span><span>·</span></>}
                      {isPool && (
                        <select value={sortField} onChange={e => setSortField(e.target.value as typeof sortField)}
                          style={{ fontSize: '10.5px', background: 'rgba(255,255,255,0.12)', border: 'none', color: 'rgba(255,255,255,0.8)', outline: 'none', cursor: 'pointer', borderRadius: '3px', padding: '1px 4px' }}>
                          <option value="tryout_rank">Sort: Tryout Rank</option>
                          <option value="coach_rank">Sort: Coach Rank</option>
                          <option value="last_name">Sort: Last Name</option>
                          <option value="first_name">Sort: First Name</option>
                          <option value="status">Sort: Status</option>
                        </select>
                      )}
                      {isTeam && <span>Sort: {sortField === 'tryout_rank' ? 'Tryout Rank' : sortField === 'coach_rank' ? 'Coach Rank' : 'Name'}</span>}
                      {isCut && <span>Players not offered a spot</span>}
                      {isDeclined && <span>Offers declined</span>}
                    </div>
                  </div>

                  {/* Droppable list */}
                  <Droppable droppableId={col.id} isDropDisabled={col.locked}>
                    {(provided: import('@hello-pangea/dnd').DroppableProvided, snapshot: import('@hello-pangea/dnd').DroppableStateSnapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          flex: 1, overflowY: 'auto', padding: '6px',
                          background: snapshot.isDraggingOver ? `${col.color}18` : '#F8FAFC',
                          border: `1px solid ${snapshot.isDraggingOver ? col.color + '60' : '#E2E8F0'}`,
                          borderTop: 'none', borderRadius: '0 0 10px 10px',
                          minHeight: '120px', transition: 'background 0.1s',
                        }}>

                        {ids.length === 0 && !snapshot.isDraggingOver && (
                          <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: '11.5px', color: '#CBD5E1' }}>
                            {isPool ? 'No unassigned players' : 'Drop players here'}
                          </div>
                        )}

                        {ids.map((pid, idx) => {
                          const p   = players.find(pl => pl.id === pid);
                          const a   = assigns.get(pid);
                          const r   = rankings.get(pid);
                          if (!p) return null;
                          const offerBadge       = getOfferBadge(a, isTeam);
                          const tRank            = r?.tryout_rank;
                          const isAccepted       = a?.offer_status === 'Accepted';
                          const isDeclinedOffer  = a?.offer_status === 'Declined';
                          const isMaybe          = !!p.maybe_flag;
                          const isNew            = p.maroons_status === 'new';
                          const isNTR            = ntrIds.has(pid);
                          const highlight        = highlightNTR && isNTR;
                          const pos              = p.positions?.length ? p.positions.slice(0, 2).join(' · ') : null;
                          const prevTeamName     = prevTeamMap.get(pid);
                          const prevTeamColor    = prevTeamName ? teamColorByName.get(prevTeamName) : undefined;

                          return (
                            <Draggable key={pid} draggableId={pid} index={idx} isDragDisabled={col.locked}>
                              {(drag: import('@hello-pangea/dnd').DraggableProvided, snap: import('@hello-pangea/dnd').DraggableStateSnapshot) => {
                                const cardBg = snap.isDragging ? '#fff'
                                  : isAccepted      ? '#DCFCE7'
                                  : isDeclinedOffer ? '#FEE2E2'
                                  : isMaybe         ? '#F3E8FF'
                                  : highlight       ? '#FFFBEB'
                                  : '#fff';
                                const cardBorderColor = snap.isDragging ? col.color
                                  : isAccepted      ? '#22C55E'
                                  : isDeclinedOffer ? '#EF4444'
                                  : isMaybe         ? '#A855F7'
                                  : highlight       ? '#FDE68A'
                                  : '#E9EDF2';
                                const card = (
                                  <div
                                    ref={drag.innerRef}
                                    {...drag.draggableProps}
                                    {...drag.dragHandleProps}
                                    style={{
                                      ...drag.draggableProps.style,
                                      background: cardBg,
                                      borderRadius: '8px',
                                      padding: '8px 10px',
                                      marginBottom: '5px',
                                      borderTop: `1.5px solid ${cardBorderColor}`,
                                      borderRight: `1.5px solid ${cardBorderColor}`,
                                      borderBottom: `1.5px solid ${cardBorderColor}`,
                                      borderLeft: prevTeamColor ? `4px solid ${prevTeamColor}` : `1.5px solid ${cardBorderColor}`,
                                      boxShadow: snap.isDragging
                                        ? `0 20px 50px rgba(0,0,0,0.22), 0 0 0 1px ${col.color}50`
                                        : '0 1px 2px rgba(0,0,0,0.04)',
                                      userSelect: 'none',
                                      cursor: snap.isDragging ? 'grabbing' : col.locked ? 'default' : 'grab',
                                      position: snap.isDragging ? 'fixed' : 'relative',
                                      width: snap.isDragging ? colW : undefined,
                                      boxSizing: 'border-box',
                                      zIndex: snap.isDragging ? 9999 : undefined,
                                    }}>

                                    {/* Top-right actions */}
                                    <div style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      {isNew && <span style={{ fontSize: '9px', fontWeight: '800', background: '#22C55E', color: '#fff', borderRadius: '4px', padding: '1px 5px', letterSpacing: '0.05em' }}>NEW</span>}
                                      {isAccepted && <CheckCircle2 size={13} color="#22C55E" />}
                                      <button
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={e => { e.stopPropagation(); openPlayerEmailModal(pid); }}
                                        title="Copy email"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', display: 'flex', alignItems: 'center', opacity: 0.45, lineHeight: 1 }}>
                                        <Mail size={11} color="#475569" />
                                      </button>
                                      <button
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={e => { e.stopPropagation(); toggleMaybe(pid); }}
                                        title={isMaybe ? 'Remove unsure flag' : 'Mark as unsure'}
                                        style={{ background: isMaybe ? '#A855F7' : 'none', border: isMaybe ? 'none' : 'none', borderRadius: '3px', cursor: 'pointer', padding: '1px 2px', display: 'flex', alignItems: 'center', opacity: isMaybe ? 1 : 0.4, lineHeight: 1 }}>
                                        <HelpCircle size={11} color={isMaybe ? '#fff' : '#475569'} />
                                      </button>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
                                      {/* Checkbox */}
                                      <input type="checkbox" onClick={e => e.stopPropagation()} style={{ marginTop: '3px', flexShrink: 0, width: 'auto', padding: 0, border: 'initial', background: 'transparent', borderRadius: 0, accentColor: primary, cursor: 'pointer' }} />

                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Name */}
                                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '22px' }}>
                                          {p.first_name} {p.last_name}
                                        </div>

                                        {/* DOB + grade + position */}
                                        {(cardFields.has('dob') || cardFields.has('grade') || cardFields.has('position')) && (
                                          <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '2px' }}>
                                            {[
                                              cardFields.has('dob')      ? fmtDob(p.date_of_birth) : null,
                                              cardFields.has('grade')    ? p.grade                  : null,
                                              cardFields.has('position') ? pos                      : null,
                                            ].filter(Boolean).join(' · ')}
                                          </div>
                                        )}

                                        {/* Badges row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                          {cardFields.has('coach_rank') && r?.coach_rank != null && (
                                            <span style={{ fontSize: '10.5px', fontWeight: '800', background: '#EFF6FF', color: '#2563EB', borderRadius: '5px', padding: '1px 6px', border: '1px solid #BFDBFE' }}>
                                              C{r.coach_rank}
                                            </span>
                                          )}
                                          {cardFields.has('tryout_rank') && tRank != null && (
                                            <span style={{ fontSize: '10.5px', fontWeight: '800', background: '#FEF3C7', color: '#B45309', borderRadius: '5px', padding: '1px 6px', border: '1px solid #FDE68A' }}>
                                              T{tRank}
                                            </span>
                                          )}
                                          {isNTR && (
                                            <span style={{ fontSize: '10px', fontWeight: '800', background: '#FEF2F2', color: '#DC2626', borderRadius: '5px', padding: '1px 5px', border: '1px solid #FECACA' }}>NTR</span>
                                          )}
                                          {/* Offer status — gated by cardFields */}
                                          {cardFields.has('offer_status') && isAccepted && (
                                            <button
                                              onMouseDown={e => e.stopPropagation()}
                                              onClick={e => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setOverridePopup(overridePopup?.pid === pid ? null : { pid, x: rect.left, y: rect.bottom + 4 }); }}
                                              style={{ fontSize: '10.5px', fontWeight: '700', background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', borderRadius: '5px', padding: '1px 7px', cursor: 'pointer' }}>
                                              Accepted ✓ ▾
                                            </button>
                                          )}
                                          {cardFields.has('offer_status') && isDeclinedOffer && (
                                            <button
                                              onMouseDown={e => e.stopPropagation()}
                                              onClick={e => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setOverridePopup(overridePopup?.pid === pid ? null : { pid, x: rect.left, y: rect.bottom + 4 }); }}
                                              style={{ fontSize: '10.5px', fontWeight: '700', background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '5px', padding: '1px 7px', cursor: 'pointer' }}>
                                              Declined ▾
                                            </button>
                                          )}
                                          {cardFields.has('offer_status') && a?.status === 'Waitlist' && !isAccepted && !isDeclinedOffer && (
                                            <span style={{ fontSize: '10.5px', fontWeight: '700', background: '#F1F5F9', color: '#64748B', borderRadius: '5px', padding: '1px 7px' }}>Waitlist</span>
                                          )}
                                          {cardFields.has('offer_status') && isTeam && !isAccepted && !isDeclinedOffer && (
                                            <button
                                              onMouseDown={e => e.stopPropagation()}
                                              onClick={e => { e.stopPropagation(); sendOffer(pid); }}
                                              disabled={sendingId === pid}
                                              style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px',
                                                background: a?.offer_status === 'Sent' ? '#FEF3C7' : '#EFF6FF',
                                                color:      a?.offer_status === 'Sent' ? '#B45309'  : '#2563EB',
                                                border:     `1px solid ${a?.offer_status === 'Sent' ? '#FDE68A' : '#BFDBFE'}`,
                                                borderRadius: '5px', padding: '1px 7px', cursor: 'pointer', fontWeight: '700' }}>
                                              {a?.offer_status === 'Sent'
                                                ? <>↺ {sendingId === pid ? '…' : 'Resend'}</>
                                                : <><Send size={8} />{sendingId === pid ? '…' : 'Send Offer'}</>}
                                            </button>
                                          )}
                                          {cardFields.has('offer_status') && isTeam && !isAccepted && !isDeclinedOffer && (
                                            <>
                                              <button
                                                onMouseDown={e => e.stopPropagation()}
                                                onClick={e => { e.stopPropagation(); setOfferStatus(pid, 'Accepted'); }}
                                                title="Manually mark accepted"
                                                style={{ fontSize: '11px', background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', borderRadius: '5px', padding: '1px 6px', cursor: 'pointer', fontWeight: '800', lineHeight: 1 }}>
                                                ✓
                                              </button>
                                              <button
                                                onMouseDown={e => e.stopPropagation()}
                                                onClick={e => { e.stopPropagation(); setOfferStatus(pid, 'Declined'); }}
                                                title="Manually mark declined"
                                                style={{ fontSize: '11px', background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '5px', padding: '1px 6px', cursor: 'pointer', fontWeight: '800', lineHeight: 1 }}>
                                                ✗
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );

                                return snap.isDragging
                                  ? createPortal(card, document.body)
                                  : card;
                              }}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}

                        {/* Ghost cards — previous season players who haven't re-registered */}
                        {isTeam && (() => {
                          const teamGhosts = ghostsByTeam.get(col.label) ?? [];
                          if (teamGhosts.length === 0) return null;
                          return (
                            <div style={{ marginTop: '6px' }}>
                              <div style={{ fontSize: '9px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 2px 4px' }}>
                                Not returned ({teamGhosts.length})
                              </div>
                              {teamGhosts.map((g, i) => (
                                <div key={i} style={{ background: '#F8FAFC', borderRadius: '8px', padding: '7px 10px', marginBottom: '4px', border: '1.5px dashed #CBD5E1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                                    <div style={{ fontSize: '9.5px', color: '#CBD5E1', marginTop: '1px' }}>Last season · not registered</div>
                                  </div>
                                  <span style={{ fontSize: '9.5px', fontWeight: '700', background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', borderRadius: '5px', padding: '1px 6px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                    Not returned
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* ── MODALS ── */}
      {showAddTeam && (
        <AddTeamModal
          club={clubCtx}
          team={editTeam}
          defaultAg={filterAg}
          defaultGender={filterGender !== 'All' ? filterGender : ''}
          usedColors={teams.map(t => t.color)}
          onClose={() => { setShowAddTeam(false); setEditTeam(null); }}
          onSaved={load}
        />
      )}

      {emailModal && (
        <EmailModal title={emailModal.title} rows={emailModal.rows} onClose={() => setEmailModal(null)} />
      )}

      {sendOfferModal && (
        <SendOfferModal
          colLabel={sendOfferModal.colLabel}
          playerIds={getColIds(sendOfferModal.colId)}
          players={players}
          assigns={assigns}
          club={clubCtx}
          season={season}
          primary={primary}
          onClose={() => setSendOfferModal(null)}
          onSent={pids => {
            setAssigns(prev => {
              const next = new Map(prev);
              pids.forEach(pid => {
                const ex = next.get(pid) ?? { player_id: pid, team: null, status: 'Unassigned', offer_status: 'NotSent' };
                next.set(pid, { ...ex, offer_status: 'Sent' });
              });
              return next;
            });
          }}
        />
      )}

      {/* Override offer status popup */}
      {overridePopup && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOverridePopup(null)} />
          <div style={{ position: 'fixed', top: overridePopup.y, left: overridePopup.x, zIndex: 999, background: '#fff', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: '1px solid #E2E8F0', minWidth: '200px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px 6px', fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Override response</div>
            {assigns.get(overridePopup.pid)?.offer_status !== 'Accepted' && (
              <button onClick={() => setOfferStatus(overridePopup.pid, 'Accepted')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', fontSize: '13px', color: '#15803D', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
                <Check size={14} color="#22C55E" /> Mark as Accepted
              </button>
            )}
            {assigns.get(overridePopup.pid)?.offer_status !== 'Declined' && (
              <button onClick={() => setOfferStatus(overridePopup.pid, 'Declined')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', fontSize: '13px', color: '#DC2626', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
                <X size={14} color="#EF4444" /> Mark as Declined
              </button>
            )}
            <button onClick={() => setOfferStatus(overridePopup.pid, 'Sent')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', fontSize: '13px', color: '#92400E', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
              ↺ Reset to "Sent" (awaiting)
            </button>
            <button onClick={() => setOfferStatus(overridePopup.pid, 'NotSent')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', borderTop: '1px solid #F1F5F9', fontSize: '13px', color: '#64748B', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
              Reset to "Not Sent"
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Column actions menu */}
      {colMenu && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setColMenu(null)} />
          <div style={{ position: 'fixed', top: colMenu.y, left: Math.max(8, colMenu.x - 190), zIndex: 999, background: '#fff', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: '1px solid #E2E8F0', minWidth: '200px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px 6px', fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sort by</div>
            {([
              { label: 'Tryout Rank', value: 'tryout_rank' },
              { label: 'Coach Rank',  value: 'coach_rank' },
              { label: 'Last Name',   value: 'last_name' },
              { label: 'First Name',  value: 'first_name' },
              { label: 'Status',      value: 'status' },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => { setSortField(opt.value); setColMenu(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 14px', background: sortField === opt.value ? '#F8FAFC' : 'none', border: 'none', fontSize: '13px', color: sortField === opt.value ? '#2563EB' : '#0F172A', fontWeight: sortField === opt.value ? '700' : '500', cursor: 'pointer', textAlign: 'left' }}>
                {sortField === opt.value && <Check size={12} />}{sortField !== opt.value && <span style={{ width: 12 }} />} {opt.label}
              </button>
            ))}
            <div style={{ borderTop: '1px solid #F1F5F9', margin: '4px 0' }} />
            <div style={{ padding: '6px 14px 4px', fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Set all as</div>
            {([
              { label: 'Accepted', color: '#15803D', bg: '#DCFCE7', status: 'Accepted' },
              { label: 'Declined', color: '#DC2626', bg: '#FEE2E2', status: 'Declined' },
              { label: 'Awaiting', color: '#B45309', bg: '#FEF3C7', status: 'Sent' },
            ]).map(opt => (
              <button key={opt.status} onClick={() => bulkSetOfferStatus(colMenu.colId, opt.status)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 14px', background: 'none', border: 'none', fontSize: '13px', color: opt.color, fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: opt.color, flexShrink: 0 }} />{opt.label}
              </button>
            ))}
            <div style={{ borderTop: '1px solid #F1F5F9', margin: '4px 0' }} />
            <button onClick={() => sendAllOffersInCol(colMenu.colId, colMenu.colLabel)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', fontSize: '13px', color: '#2563EB', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
              <Mail size={13} /> Send offers to all
            </button>
            <button onClick={() => exportColCSV(colMenu.colId, colMenu.colLabel)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', borderTop: '1px solid #F1F5F9', fontSize: '13px', color: '#374151', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </>,
        document.body
      )}

      {delTeamId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '360px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '20px', marginBottom: '10px' }}>🗑</div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#0F172A', marginBottom: '6px' }}>Delete this team?</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '22px' }}>All players will be moved back to the Unassigned Pool.</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setDelTeamId(null)} style={{ padding: '9px 22px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: '13.5px' }}>Cancel</button>
              <button onClick={() => deleteTeam(delTeamId)} style={{ padding: '9px 22px', borderRadius: '9px', background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '13.5px' }}>Delete Team</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type OfferSettings = { email_subject: string | null; email_body_html: string | null; from_name: string | null; offer_deadline: string | null; teamsnap_registration_url: string | null };
type PlayerDetail = { id: string; parent_name: string | null; email_secondary: string | null };

const DEFAULT_OFFER_BODY = `<p>Dear {{parent_name}},</p>
<p>It is our pleasure to offer <strong>{{player_full_name}}</strong> a roster spot on the <strong>{{team_name}}</strong> team for the {{season_label}} season. This is the result of a competitive tryout process, and we're thrilled to invite {{player_first_name}} to continue their journey with {{club_name}}.</p>
<p>Please take a moment to review the details below before accepting your spot.</p>
<h2>Next Steps</h2>
<ol>
  <li><strong>Accept your offer below</strong> by {{offer_deadline}}</li>
  <li>Download the Dugout FC app — connect with your team, RSVP to events, and stay up to date</li>
  <li>Watch for your welcome email from your coach with further details</li>
</ol>
<p>If you can't accept or need more time, please let us know right away — your decision affects other placements.</p>
<p>We're excited to welcome <strong>{{player_first_name}}</strong> to the {{club_name}} family!</p>`;

function buildOfferHtml(club: ClubCtx, bodyHtml: string, season: string): string {
  const primary   = club?.primary_color   ?? '#1E3A5F';
  const secondary = club?.secondary_color ?? '#c99a3f';
  const logoUrl   = club?.logo_url ?? '';
  const clubName  = club?.name ?? 'Your Club';

  const hex = primary.replace('#', '').padEnd(6, '0');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const dark     = `rgb(${Math.round(r * 0.6)},${Math.round(g * 0.6)},${Math.round(b * 0.6)})`;
  const veryDark = `rgb(${Math.round(r * 0.35)},${Math.round(g * 0.35)},${Math.round(b * 0.35)})`;

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" width="92" alt="${clubName}" style="display:block;margin:0 auto;border:0;width:92px;height:auto;">`
    : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.18);display:inline-flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;color:#fff;font-family:Georgia,serif;">${clubName.charAt(0)}</div>`;

  const body = bodyHtml || DEFAULT_OFFER_BODY;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  .letter p{margin:0 0 16px;color:#283142;font-size:15.5px;line-height:1.78}
  .letter h2{font-family:Georgia,serif;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:${primary};font-weight:700;margin:34px 0 14px;padding-bottom:10px;border-bottom:1px solid #eef0f4}
  .letter ul,.letter ol{margin:0 0 16px;padding-left:22px}
  .letter li{margin:0 0 8px;line-height:1.7;color:#283142;font-size:15.5px}
  .letter ul li::marker{color:${secondary}}
  .letter ol li::marker{color:${primary};font-weight:700}
  .letter strong{color:#111827}
  .letter a{color:${primary}}
</style>
</head>
<body style="margin:0;padding:0;background:#eceef3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#283142;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eceef3;"><tr><td align="center" style="padding:36px 12px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 24px 64px rgba(15,23,42,0.16);">
  <tr><td style="height:4px;background:${secondary};line-height:4px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="background:${veryDark};padding:11px 34px;"><table role="presentation" width="100%"><tr>
    <td style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:700;">${clubName}</td>
    <td align="right" style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:700;">${season.replace('-', '/')} Season</td>
  </tr></table></td></tr>
  <tr><td style="background:${primary};background-image:radial-gradient(ellipse at 50% 0%,${primary} 0%,${dark} 45%,${veryDark} 100%);padding:0;">
    <table role="presentation" width="100%"><tr><td align="center" style="padding:54px 32px 46px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 26px;">
        <tr><td align="center" style="width:128px;height:128px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.3);border-radius:50%;padding:18px;">${logoHtml}</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;"><tr>
        <td style="width:40px;height:1px;background:${secondary};line-height:1px;font-size:0;">&nbsp;</td>
        <td style="padding:0 12px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${secondary};font-weight:700;white-space:nowrap;">Roster Offer</td>
        <td style="width:40px;height:1px;background:${secondary};line-height:1px;font-size:0;">&nbsp;</td>
      </tr></table>
      <div style="font-family:Georgia,serif;font-size:44px;line-height:1.08;color:#fff;font-weight:700;letter-spacing:-0.8px;">Welcome,<br><em style="color:rgba(255,255,255,0.88);font-style:italic;font-weight:400;">{{player_first_name}}</em></div>
      <div style="margin:18px auto 0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.82);max-width:440px;">You've earned a place on the roster for<br><strong style="color:rgba(255,255,255,0.96);font-size:17px;">{{team_name}}</strong></div>
      <div style="margin:28px auto 0;color:${secondary};font-size:13px;letter-spacing:8px;">&#9670; &#9670; &#9670;</div>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#f8f9fc;padding:22px 28px;border-bottom:1px solid #eef0f4;">
    <table role="presentation" width="100%"><tr>
      <td align="center" valign="top" style="padding:8px;width:33.33%;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:7px;">Team</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#111827;font-weight:700;">{{team_name}}</div>
      </td>
      <td align="center" valign="top" style="padding:8px;width:33.33%;border-left:1px solid #e9ebf1;border-right:1px solid #e9ebf1;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:7px;">Age Group</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#111827;font-weight:700;">{{age_group}}</div>
      </td>
      <td align="center" valign="top" style="padding:8px;width:33.33%;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:7px;">Head Coach</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#111827;font-weight:700;">{{coach_name}}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td class="letter" style="padding:46px 50px 18px;">${body}</td></tr>
  <tr><td style="padding:0 50px 18px;background:#fff;">
    <div style="padding:32px 28px;background:linear-gradient(160deg,${dark} 0%,${veryDark} 100%);border-radius:18px;border:1px solid ${primary};text-align:center;box-shadow:0 16px 40px rgba(0,0,0,0.25);">
      <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:4px;font-weight:700;margin-bottom:6px;">Action Required</div>
      <div style="font-family:Georgia,serif;font-size:23px;color:#fff;font-weight:700;margin-bottom:20px;">Confirm Your Roster Spot</div>
      <div>
        <a href="{{accept_link}}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;font-weight:700;padding:15px 34px;border-radius:10px;font-size:15px;box-shadow:0 6px 16px rgba(21,128,61,0.35);">&#10003; Accept My Spot</a>
        &nbsp;
        <a href="{{decline_link}}" style="display:inline-block;background:#fff;color:#b91c1c;text-decoration:none;font-weight:700;padding:15px 30px;border-radius:10px;font-size:15px;border:1.5px solid #f3c2c2;">Decline</a>
      </div>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.15);font-size:12px;color:rgba(255,255,255,0.7);">&#9201; Please respond by <strong style="color:#fff;">{{offer_deadline}}</strong></div>
    </div>
  </td></tr>
  <tr><td style="padding:12px 50px 46px;background:#fff;">
    <div style="border-top:1px solid #f1f1f4;padding-top:30px;">
      <div style="font-size:14px;color:#6b7280;">With pride and gratitude,</div>
      <div style="margin-top:6px;font-family:Georgia,serif;font-size:21px;font-style:italic;color:${primary};font-weight:700;">${clubName}</div>
      <div style="margin-top:4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;">Coaching Staff</div>
    </div>
  </td></tr>
  <tr><td style="background:#111827;padding:32px;text-align:center;">
    ${logoUrl ? `<img src="${logoUrl}" width="46" alt="" style="display:block;margin:0 auto 14px;border:0;opacity:0.9;">` : ''}
    <div style="font-family:Georgia,serif;font-size:20px;color:#fff;font-weight:700;">${clubName}</div>
    <div style="margin-top:6px;font-size:11px;color:#9ca3af;letter-spacing:2.5px;text-transform:uppercase;font-weight:600;">Coaching Staff</div>
    <div style="margin-top:18px;font-size:11px;color:#9ca3af;">&#169; ${year} ${clubName} &middot; All rights reserved</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function SendOfferModal({ colLabel, playerIds, players, assigns, club, season, primary, onClose, onSent }: {
  colLabel: string; playerIds: string[]; players: Player[]; assigns: Map<string, Assignment>;
  club: ClubCtx; season: string; primary: string; onClose: () => void; onSent: (pids: string[]) => void;
}) {
  const colPlayers = playerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
  const [selectedPid, setSelectedPid] = useState(colPlayers[0]?.id ?? '');
  const [settings, setSettings] = useState<OfferSettings | null>(null);
  const [detailMap, setDetailMap] = useState<Map<string, PlayerDetail>>(new Map());
  const [previewTab, setPreviewTab] = useState<'preview' | 'content' | 'html'>('preview');
  const [htmlOverride, setHtmlOverride] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedGmail, setCopiedGmail] = useState(false);

  useEffect(() => {
    if (!club) return;
    Promise.all([
      supabase.from('tryout_offer_settings').select('email_subject,email_body_html,from_name,offer_deadline,teamsnap_registration_url').eq('club_id', club.id).maybeSingle(),
      playerIds.length > 0
        ? supabase.from('tryout_players').select('id,parent_name,email_secondary').eq('club_id', club.id).in('id', playerIds)
        : Promise.resolve({ data: [] }),
    ]).then(([{ data: s }, { data: d }]) => {
      if (s) setSettings(s as OfferSettings);
      if (d) setDetailMap(new Map((d as PlayerDetail[]).map(r => [r.id, r])));
    });
  }, []);

  const selectedPlayer = colPlayers.find(p => p.id === selectedPid);
  const detail = selectedPlayer ? detailMap.get(selectedPlayer.id) : null;
  const toEmails = selectedPlayer
    ? [selectedPlayer.email_primary, detail?.email_secondary].filter((e): e is string => !!e)
    : [];
  const notSentCount = playerIds.filter(pid => { const a = assigns.get(pid); return !a?.offer_status || a.offer_status === 'NotSent'; }).length;

  function merge(tmpl: string, p: Player): string {
    const det = detailMap.get(p.id);
    const tokens: Record<string, string> = {
      player_first_name: p.first_name,
      player_full_name: `${p.first_name} ${p.last_name}`,
      parent_name: det?.parent_name ?? p.first_name,
      team_name: colLabel,
      club_name: club?.name ?? 'Club',
      offer_deadline: settings?.offer_deadline ?? '',
      season_label: season,
      teamsnap_url: settings?.teamsnap_registration_url ?? '#',
      accept_link: '#', decline_link: '#',
    };
    return Object.entries(tokens).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), tmpl);
  }

  const defaultSubject = '{{club_name}} Roster Offer: {{player_first_name}} — {{team_name}} ({{season_label}})';
  const innerBody  = htmlOverride ?? settings?.email_body_html ?? DEFAULT_OFFER_BODY;
  const fullHtml   = buildOfferHtml(club, innerBody, season);
  const subjectTmpl = settings?.email_subject ?? defaultSubject;
  const mergedBody    = selectedPlayer ? merge(fullHtml, selectedPlayer) : fullHtml;
  const mergedSubject = selectedPlayer ? merge(subjectTmpl, selectedPlayer) : subjectTmpl;

  async function sendOne(pid: string) {
    const res = await fetch('/api/tryout/send-offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_id: pid, club_id: club?.id }) });
    return res.ok;
  }

  async function handleSendOne() {
    if (!selectedPlayer) return;
    setSending(true);
    const ok = await sendOne(selectedPlayer.id);
    setSending(false);
    if (ok) { onSent([selectedPlayer.id]); onClose(); }
  }

  async function handleSendAll() {
    setSending(true);
    const toSend = playerIds.filter(pid => { const a = assigns.get(pid); return !a?.offer_status || a.offer_status === 'NotSent'; });
    const sent: string[] = [];
    for (let i = 0; i < toSend.length; i++) {
      const ok = await sendOne(toSend[i]);
      if (ok) sent.push(toSend[i]);
      setSendProgress(i + 1);
    }
    setSending(false);
    onSent(sent);
    onClose();
  }

  async function copyForGmail() {
    try {
      const blob = new Blob([mergedBody], { type: 'text/html' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]);
    } catch {
      await navigator.clipboard.writeText(mergedBody.replace(/<[^>]+>/g, ''));
    }
    setCopiedGmail(true);
    setTimeout(() => setCopiedGmail(false), 2500);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', boxSizing: 'border-box' };
  const lbl = (text: string, note?: string) => (
    <div style={{ fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {text}{note && <span style={{ fontWeight: '400', color: '#94A3B8', textTransform: 'none', marginLeft: '6px' }}>{note}</span>}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '680px', height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '18px 22px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <Mail size={16} color="#64748B" />
          <span style={{ fontWeight: '800', fontSize: '16px', color: '#0F172A' }}>Offer Email — {colLabel}</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', cursor: 'pointer', padding: '6px', display: 'flex' }}><X size={14} color="#64748B" /></button>
        </div>

        {/* Player + To */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '16px 22px 0' }}>
          <div>
            {lbl('Player')}
            <select value={selectedPid} onChange={e => setSelectedPid(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {colPlayers.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </div>
          <div>
            {lbl('To (parent emails)', '— both will be emailed')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingTop: '2px' }}>
              {toEmails.length > 0
                ? toEmails.map((e, i) => <div key={i} style={{ fontSize: '13px', color: '#374151', padding: '5px 0', borderBottom: i < toEmails.length - 1 ? '1px solid #F1F5F9' : 'none' }}>{e}</div>)
                : <div style={{ fontSize: '13px', color: '#94A3B8', fontStyle: 'italic', paddingTop: '4px' }}>No email on file</div>
              }
            </div>
          </div>
        </div>

        {/* Subject */}
        <div style={{ padding: '14px 22px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            {lbl('Subject')}
            <button onClick={async () => { await navigator.clipboard.writeText(mergedSubject); setCopiedSubject(true); setTimeout(() => setCopiedSubject(false), 2000); }}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: copiedSubject ? '#15803D' : '#64748B', marginBottom: '6px' }}>
              {copiedSubject ? <Check size={11} /> : <Copy size={11} />} {copiedSubject ? 'Copied' : 'copy subject'}
            </button>
          </div>
          <div style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#F8FAFC', minHeight: '36px' }}>
            {mergedSubject || <span style={{ color: '#94A3B8' }}>Configure in Settings → Offers</span>}
          </div>
        </div>

        {/* Preview tabs */}
        <div style={{ padding: '14px 22px 0' }}>
          {lbl('Email body', '(edits are honored when sending)')}
          <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0' }}>
            {(['preview', 'content', 'html'] as const).map(tab => (
              <button key={tab} onClick={() => setPreviewTab(tab)}
                style={{ padding: '6px 16px', background: 'none', border: 'none', borderBottom: previewTab === tab ? `2px solid ${primary}` : '2px solid transparent', marginBottom: '-1px', fontSize: '12.5px', fontWeight: previewTab === tab ? '700' : '500', color: previewTab === tab ? primary : '#64748B', cursor: 'pointer' }}>
                {tab === 'preview' ? 'Inbox Preview' : tab === 'content' ? 'Content Only' : 'HTML (edit)'}
              </button>
            ))}
          </div>
        </div>

        {/* Preview area */}
        <div style={{ flex: 1, overflow: 'hidden', margin: '0 22px', minHeight: 0 }}>
          {previewTab === 'preview' && (
            <iframe
              srcDoc={mergedBody}
              style={{ width: '100%', height: '100%', border: 'none' }}
              sandbox="allow-same-origin"
            />
          )}
          {previewTab === 'content' && (
            <div style={{ height: '100%', overflowY: 'auto', padding: '14px 0', fontSize: '13px', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {mergedBody.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' ').trim() || 'No content configured.'}
            </div>
          )}
          {previewTab === 'html' && (
            <textarea
              value={innerBody}
              onChange={e => setHtmlOverride(e.target.value)}
              style={{ width: '100%', height: '100%', border: 'none', borderTop: '1px solid #F1F5F9', padding: '12px 0', fontFamily: 'monospace', fontSize: '11.5px', color: '#374151', resize: 'none', outline: 'none', background: '#F8FAFC', boxSizing: 'border-box' }}
              placeholder="Paste or edit HTML here…"
            />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 22px', borderTop: '1px solid #F1F5F9' }}>
          <button onClick={handleSendAll} disabled={sending || notSentCount === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '9px', background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#374151', fontSize: '13px', fontWeight: '700', cursor: sending || notSentCount === 0 ? 'default' : 'pointer', opacity: notSentCount === 0 ? 0.45 : 1 }}>
            {sending && sendProgress > 0 ? `Sending ${sendProgress}/${notSentCount}…` : `Send to All (${notSentCount})`}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>Cancel</button>
          <button onClick={copyForGmail}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '9px', border: '1px solid #E2E8F0', background: copiedGmail ? '#DCFCE7' : '#fff', color: copiedGmail ? '#15803D' : '#374151', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            {copiedGmail ? <Check size={13} /> : <Copy size={13} />} {copiedGmail ? 'Copied!' : 'Copy for Gmail'}
          </button>
          <button onClick={handleSendOne} disabled={sending || !selectedPlayer || !toEmails.length}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '9px', background: primary, color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: sending || !toEmails.length ? 'default' : 'pointer', opacity: !selectedPlayer || !toEmails.length ? 0.5 : 1 }}>
            <Send size={13} /> {sending && sendProgress === 0 ? 'Sending…' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailModal({ title, rows, onClose }: { title: string; rows: { name: string; email: string }[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copyAll() {
    const text = rows.map(r => r.email).join(', ');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '480px', maxHeight: '72vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#0F172A' }}>{title}</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{rows.length} email{rows.length !== 1 ? 's' : ''} on file</div>
          </div>
          <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', cursor: 'pointer', padding: '6px', display: 'flex' }}><X size={14} color="#64748B" /></button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 20px' }}>
          {rows.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No emails on file for these players.</div>
          ) : rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < rows.length - 1 ? '1px solid #F8FAFC' : 'none', gap: '12px' }}>
              <div style={{ fontWeight: '600', fontSize: '13px', color: '#0F172A', flexShrink: 0 }}>{r.name}</div>
              <div style={{ fontSize: '12.5px', color: '#64748B', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {rows.length > 0 && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5F9' }}>
            <button onClick={copyAll}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', borderRadius: '10px', border: `1.5px solid ${copied ? '#86EFAC' : '#BFDBFE'}`, background: copied ? '#DCFCE7' : '#EFF6FF', color: copied ? '#15803D' : '#2563EB', fontWeight: '700', fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s' }}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied!' : `Copy ${rows.length === 1 ? 'email' : `all ${rows.length} emails`}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function HeaderBtn({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', display: 'flex', alignItems: 'center' }}>
      {children}
    </button>
  );
}

function AddTeamModal({ club, team, defaultAg, defaultGender, usedColors, onClose, onSaved }: {
  club: ClubCtx; team: TryoutTeam | null; defaultAg: string; defaultGender: string;
  usedColors: string[]; onClose: () => void; onSaved: () => void;
}) {
  const nextColor = TEAM_PALETTE.find(c => !usedColors.includes(c)) ?? TEAM_PALETTE[0];
  const [form, setForm] = useState<NewTeamForm>(
    team
      ? { name: team.name, color: team.color, age_group: team.age_group ?? defaultAg, gender: team.gender ?? defaultGender, format: team.format ?? '11v11' }
      : blankTeam(defaultAg, defaultGender)
  );
  const [color, setColor] = useState(team ? team.color : nextColor);
  const [saving, setSaving] = useState(false);

  const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lbl = (t: string) => <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t}</label>;

  async function save() {
    if (!club || !form.name.trim()) return;
    setSaving(true);
    const payload = { club_id: club.id, name: form.name.trim(), color, age_group: form.age_group || null, gender: form.gender || null, format: form.format || null, is_active: true, sort_order: 0, roster_locked: false };
    if (team) await supabase.from('tryout_teams').update(payload).eq('id', team.id);
    else       await supabase.from('tryout_teams').insert(payload);
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Modal header */}
        <div style={{ background: color, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '800', fontSize: '15px', color: '#fff' }}>{team ? 'Edit Team' : 'New Team'}</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '4px 6px', display: 'flex' }}><X size={14} color="#fff" /></button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            {lbl('Team name *')}
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. U9 Boys A" autoFocus style={inp} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div>
              {lbl('Age Group')}
              <select value={form.age_group} onChange={e => setForm(f => ({ ...f, age_group: e.target.value }))} style={inp}>
                <option value="">Any</option>
                {AGE_GROUPS.map(ag => <option key={ag}>{ag}</option>)}
              </select>
            </div>
            <div>
              {lbl('Gender')}
              <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} style={inp}>
                <option value="">Any</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
            <div>
              {lbl('Format')}
              <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))} style={inp}>
                <option value="7v7">7v7</option>
                <option value="9v9">9v9</option>
                <option value="11v11">11v11</option>
              </select>
            </div>
          </div>

          <div>
            {lbl('Team color')}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {TEAM_PALETTE.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ width: '30px', height: '30px', borderRadius: '50%', background: c, border: color === c ? `3px solid #0F172A` : '2px solid transparent', cursor: 'pointer', outline: 'none', boxShadow: color === c ? '0 0 0 2px #fff inset' : 'none', transition: 'all 0.1s' }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: color, border: '1px solid #E2E8F0' }} />
              <input value={color} onChange={e => setColor(e.target.value)} style={{ ...inp, width: '110px' }} placeholder="#3B82F6" />
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            style={{ padding: '9px 20px', borderRadius: '9px', background: color, color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer', opacity: saving || !form.name.trim() ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            {saving ? 'Saving…' : team ? 'Save Changes' : 'Create Team'}
          </button>
        </div>
      </div>
    </div>
  );
}
