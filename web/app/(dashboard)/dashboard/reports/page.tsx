'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { BarChart2, ChevronDown, ChevronRight, Download, Users, AlertTriangle, X, TrendingDown, Ghost } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type PlayerStat = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  team_id: string;
  team_name: string;
  // RSVP-based
  total_events: number;
  rsvp_going: number;
  rsvp_out: number;
  rsvp_pending: number;
  rsvp_pct: number;        // going / total_events
  // Actual (coach-marked)
  events_with_att: number; // how many events have any attendance marked for this team
  actual_present: number;
  actual_late: number;
  actual_absent: number;
  actual_pct: number | null; // (present+late) / events_with_att — null if no events marked
  // Playing time (game events only)
  total_games: number;
  games_attended: number;
  games_started: number;
  playing_pct: number | null;
  // Discrepancy
  ghost_count: number;     // RSVPd going but marked absent
  surprise_count: number;  // no RSVP (pending) but showed up
};

type TeamSummary = {
  id: string;
  name: string;
  total_events: number;
  total_games: number;
  avg_rsvp_pct: number;
  avg_actual_pct: number | null;
  events_with_att: number;
  player_count: number;
};

function pctColor(pct: number): string {
  if (pct >= 75) return '#16A34A';
  if (pct >= 50) return '#D97706';
  return '#DC2626';
}
function pctBg(pct: number): string {
  if (pct >= 75) return '#F0FDF4';
  if (pct >= 50) return '#FFFBEB';
  return '#FEF2F2';
}

export default function ReportsPage() {
  const { club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const router = useRouter();

  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [playerStats, setPlayerStats]   = useState<PlayerStat[]>([]);
  const [teamSummaries, setTeamSummaries] = useState<TeamSummary[]>([]);
  const [sortBy, setSortBy]             = useState<'name' | 'rsvp_pct' | 'actual_pct' | 'ghost_count' | 'started'>('actual_pct');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerStat | null>(null);
  const [playerHistory, setPlayerHistory]   = useState<{ title: string; type: string; event_date: string; rsvp: 'attending' | 'not_attending' | 'pending'; actual: 'present' | 'absent' | 'late' | null }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});

  const loadStats = useCallback(async () => {
    if (!teams.length) return;
    setLoading(true);

    const teamIds = teams.map((t) => t.id);

    let evQ = supabase.from('events').select('id, team_id, type').in('team_id', teamIds);
    if (dateFrom) evQ = evQ.gte('event_date', dateFrom);
    if (dateTo)   evQ = evQ.lte('event_date', dateTo);
    const { data: events } = await evQ.limit(2000);

    if (!events?.length) {
      setPlayerStats([]);
      setTeamSummaries([]);
      setLoading(false);
      return;
    }

    const allEventIds  = events.map((e) => e.id);
    const gameEvents   = events.filter((e) => e.type === 'game');
    const gameEventIds = gameEvents.map((e) => e.id);
    const teamIdSet    = [...new Set(events.map((e) => e.team_id))];

    const eventCountByTeam: Record<string, number> = {};
    const gameCountByTeam:  Record<string, number> = {};
    for (const e of events) {
      eventCountByTeam[e.team_id] = (eventCountByTeam[e.team_id] ?? 0) + 1;
      if (e.type === 'game') gameCountByTeam[e.team_id] = (gameCountByTeam[e.team_id] ?? 0) + 1;
    }

    // Which events have at least 1 attendance record? (per team)
    const [playerRes, rsvpRes, attRes, lineupRes] = await Promise.all([
      supabase.from('players').select('id, full_name, jersey_number, position, team_id').in('team_id', teamIdSet),
      supabase.from('event_rsvps').select('player_id, event_id, status').in('event_id', allEventIds).limit(20000),
      supabase.from('event_attendance').select('player_id, event_id, status').in('event_id', allEventIds).limit(20000),
      gameEventIds.length
        ? supabase.from('lineups').select('id, event_id').in('event_id', gameEventIds)
        : Promise.resolve({ data: [] }),
    ]);

    // Which event_ids have attendance marked → per team
    const markedEventsByTeam: Record<string, Set<string>> = {};
    for (const a of attRes.data ?? []) {
      const ev = events.find((e) => e.id === a.event_id);
      if (!ev) continue;
      if (!markedEventsByTeam[ev.team_id]) markedEventsByTeam[ev.team_id] = new Set();
      markedEventsByTeam[ev.team_id].add(a.event_id);
    }

    // Lineup → event map
    const lineupEventMap: Record<string, string> = {};
    for (const l of (lineupRes as any).data ?? []) lineupEventMap[l.id] = l.event_id;
    const lineupIds = Object.keys(lineupEventMap);
    const startedEventsByPlayer: Record<string, Set<string>> = {};
    if (lineupIds.length) {
      const { data: posData } = await supabase.from('lineup_positions').select('lineup_id, player_id').in('lineup_id', lineupIds);
      for (const lp of posData ?? []) {
        const eventId = lineupEventMap[lp.lineup_id];
        if (!eventId) continue;
        if (!startedEventsByPlayer[lp.player_id]) startedEventsByPlayer[lp.player_id] = new Set();
        startedEventsByPlayer[lp.player_id].add(eventId);
      }
    }

    const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    const gameEventSet = new Set(gameEventIds);

    // Per-player RSVP counts
    type RsvpCounts = { going: number; out: number; game_going: number };
    const rsvpByPlayer: Record<string, RsvpCounts> = {};
    for (const r of rsvpRes.data ?? []) {
      if (!rsvpByPlayer[r.player_id]) rsvpByPlayer[r.player_id] = { going: 0, out: 0, game_going: 0 };
      if (r.status === 'attending') {
        rsvpByPlayer[r.player_id].going++;
        if (gameEventSet.has(r.event_id)) rsvpByPlayer[r.player_id].game_going++;
      } else {
        rsvpByPlayer[r.player_id].out++;
      }
    }

    // Per-player attendance counts + ghost/surprise tracking
    type AttCounts = { present: number; late: number; absent: number };
    const attByPlayer: Record<string, AttCounts> = {};
    // Track per player which events they were marked absent vs their RSVP
    const rsvpGoingEvents: Record<string, Set<string>> = {};
    for (const r of rsvpRes.data ?? []) {
      if (r.status === 'attending') {
        if (!rsvpGoingEvents[r.player_id]) rsvpGoingEvents[r.player_id] = new Set();
        rsvpGoingEvents[r.player_id].add(r.event_id);
      }
    }
    const rsvpPendingEvents: Record<string, Set<string>> = {};
    for (const e of events) {
      for (const p of playerRes.data ?? []) {
        if (p.team_id !== e.team_id) continue;
        if (!rsvpGoingEvents[p.id]?.has(e.id) && !(rsvpRes.data ?? []).some((r: any) => r.player_id === p.id && r.event_id === e.id && r.status === 'not_attending')) {
          if (!rsvpPendingEvents[p.id]) rsvpPendingEvents[p.id] = new Set();
          rsvpPendingEvents[p.id].add(e.id);
        }
      }
    }

    let ghostCountByPlayer: Record<string, number> = {};
    let surpriseCountByPlayer: Record<string, number> = {};
    for (const a of attRes.data ?? []) {
      if (!attByPlayer[a.player_id]) attByPlayer[a.player_id] = { present: 0, late: 0, absent: 0 };
      attByPlayer[a.player_id][a.status as 'present' | 'late' | 'absent']++;
      // Ghost: RSVPd going but absent
      if (a.status === 'absent' && rsvpGoingEvents[a.player_id]?.has(a.event_id)) {
        ghostCountByPlayer[a.player_id] = (ghostCountByPlayer[a.player_id] ?? 0) + 1;
      }
      // Surprise: no RSVP (pending) but present/late
      if ((a.status === 'present' || a.status === 'late') && rsvpPendingEvents[a.player_id]?.has(a.event_id)) {
        surpriseCountByPlayer[a.player_id] = (surpriseCountByPlayer[a.player_id] ?? 0) + 1;
      }
    }

    const stats: PlayerStat[] = (playerRes.data ?? []).map((p) => {
      const totalEvents  = eventCountByTeam[p.team_id] ?? 0;
      const totalGames   = gameCountByTeam[p.team_id] ?? 0;
      const rsvp         = rsvpByPlayer[p.id] ?? { going: 0, out: 0, game_going: 0 };
      const att          = attByPlayer[p.id] ?? { present: 0, late: 0, absent: 0 };
      const eventsWithAtt = markedEventsByTeam[p.team_id]?.size ?? 0;
      const rsvpPct      = totalEvents > 0 ? Math.round((rsvp.going / totalEvents) * 100) : 0;
      const actualPct    = eventsWithAtt > 0 ? Math.min(100, Math.round(((att.present + att.late) / eventsWithAtt) * 100)) : null;
      const gamesStarted = startedEventsByPlayer[p.id]?.size ?? 0;
      const playingPct   = rsvp.game_going > 0 ? Math.min(100, Math.round((gamesStarted / rsvp.game_going) * 100)) : null;
      return {
        ...p,
        team_name: teamMap[p.team_id] ?? '—',
        total_events: totalEvents,
        rsvp_going: rsvp.going, rsvp_out: rsvp.out,
        rsvp_pending: Math.max(0, totalEvents - rsvp.going - rsvp.out),
        rsvp_pct: rsvpPct,
        events_with_att: eventsWithAtt,
        actual_present: att.present, actual_late: att.late, actual_absent: att.absent,
        actual_pct: actualPct,
        total_games: totalGames,
        games_attended: rsvp.game_going,
        games_started: gamesStarted,
        playing_pct: playingPct,
        ghost_count: ghostCountByPlayer[p.id] ?? 0,
        surprise_count: surpriseCountByPlayer[p.id] ?? 0,
      };
    });

    const summaries: TeamSummary[] = teamIdSet.map((tid) => {
      const tp = stats.filter((p) => p.team_id === tid);
      const eventsWithAtt = markedEventsByTeam[tid]?.size ?? 0;
      const playersWithAtt = tp.filter((p) => p.actual_pct !== null);
      return {
        id: tid,
        name: teamMap[tid] ?? '—',
        total_events: eventCountByTeam[tid] ?? 0,
        total_games:  gameCountByTeam[tid] ?? 0,
        avg_rsvp_pct: tp.length ? Math.round(tp.reduce((s, p) => s + p.rsvp_pct, 0) / tp.length) : 0,
        avg_actual_pct: playersWithAtt.length ? Math.round(playersWithAtt.reduce((s, p) => s + (p.actual_pct ?? 0), 0) / playersWithAtt.length) : null,
        events_with_att: eventsWithAtt,
        player_count: tp.length,
      };
    });

    setPlayerStats(stats);
    setTeamSummaries(summaries);
    setLoading(false);
  }, [teams, dateFrom, dateTo]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const openPlayer = useCallback(async (p: PlayerStat) => {
    setSelectedPlayer(p);
    setPlayerHistory([]);
    setHistoryLoading(true);
    const { data: evData } = await supabase
      .from('events').select('id, title, type, event_date')
      .eq('team_id', p.team_id).order('event_date', { ascending: false }).limit(20);
    const evIds = (evData ?? []).map((e: any) => e.id);
    const [rsvpData, attData] = evIds.length ? await Promise.all([
      supabase.from('event_rsvps').select('event_id, status').eq('player_id', p.id).in('event_id', evIds),
      supabase.from('event_attendance').select('event_id, status').eq('player_id', p.id).in('event_id', evIds),
    ]) : [{ data: [] }, { data: [] }];
    const rsvpMap = new Map<string, string>();
    for (const r of rsvpData.data ?? []) rsvpMap.set(r.event_id, r.status);
    const attMap = new Map<string, string>();
    for (const a of attData.data ?? []) attMap.set(a.event_id, a.status);
    setPlayerHistory((evData ?? []).map((e: any) => ({
      title: e.title, type: e.type, event_date: e.event_date,
      rsvp: (rsvpMap.get(e.id) ?? 'pending') as 'attending' | 'not_attending' | 'pending',
      actual: (attMap.get(e.id) ?? null) as 'present' | 'absent' | 'late' | null,
    })));
    setHistoryLoading(false);
  }, []);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'name' ? 'asc' : 'desc'); }
  }

  const sortedPlayers = [...playerStats].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'name')        return a.full_name.localeCompare(b.full_name) * dir;
    if (sortBy === 'rsvp_pct')    return (a.rsvp_pct - b.rsvp_pct) * dir;
    if (sortBy === 'actual_pct')  return ((a.actual_pct ?? -1) - (b.actual_pct ?? -1)) * dir;
    if (sortBy === 'ghost_count') return (a.ghost_count - b.ghost_count) * dir;
    if (sortBy === 'started')     return (a.games_started - b.games_started) * dir;
    return 0;
  });

  function exportCSV() {
    const rows = [
      ['Name','Team','Position','Jersey','Events','RSVP Going','RSVP Out','RSVP Pending','RSVP %','Events w/ Att','Present','Late','Absent','Actual %','Ghost Count','Surprise Count','Games','Games Attended','Games Started','Playing Time %'],
      ...sortedPlayers.map((p) => [
        p.full_name, p.team_name, p.position ?? '', p.jersey_number ?? '',
        p.total_events, p.rsvp_going, p.rsvp_out, p.rsvp_pending, `${p.rsvp_pct}%`,
        p.events_with_att, p.actual_present, p.actual_late, p.actual_absent,
        p.actual_pct !== null ? `${p.actual_pct}%` : 'N/A',
        p.ghost_count, p.surprise_count,
        p.total_games, p.games_attended, p.games_started,
        p.playing_pct !== null ? `${p.playing_pct}%` : 'N/A',
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  const hasActual  = playerStats.some((p) => p.actual_pct !== null);
  const hasGames   = playerStats.some((p) => p.games_attended > 0);

  // Alert conditions
  const alerts: { level: 'red' | 'amber'; icon: React.ReactNode; text: string }[] = [];
  const teamsLowAtt = teamSummaries.filter((t) => (t.avg_actual_pct ?? t.avg_rsvp_pct) < 50);
  if (teamsLowAtt.length) alerts.push({ level: 'red', icon: <TrendingDown size={13} />, text: `${teamsLowAtt.map((t) => t.name).join(', ')} ${teamsLowAtt.length === 1 ? 'is' : 'are'} below 50% attendance` });
  const ghostPlayers = sortedPlayers.filter((p) => p.ghost_count >= 2);
  if (ghostPlayers.length) alerts.push({ level: 'amber', icon: <Ghost size={13} />, text: `${ghostPlayers.length} player${ghostPlayers.length > 1 ? 's' : ''} RSVPd Going but repeatedly didn't show up` });
  const teamsNoAtt = teamSummaries.filter((t) => t.events_with_att === 0 && t.total_events > 0);
  if (teamsNoAtt.length) alerts.push({ level: 'amber', icon: <AlertTriangle size={13} />, text: `No attendance has been marked for ${teamsNoAtt.length} team${teamsNoAtt.length > 1 ? 's' : ''} — go to Schedule → past event → Attendance tab` });

  // Top discrepancy players for spotlight
  const spotlightPlayers = [...sortedPlayers]
    .filter((p) => p.ghost_count > 0 || p.surprise_count > 0)
    .sort((a, b) => (b.ghost_count + b.surprise_count) - (a.ghost_count + a.surprise_count))
    .slice(0, 5);

  const thSt: React.CSSProperties = { padding: '11px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const tdSt: React.CSSProperties = { padding: '10px 14px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' };

  const renderPlayerRow = (p: PlayerStat) => {
    const hasGhost = p.ghost_count >= 2;
    return (
      <tr key={p.id}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
        onMouseLeave={(e) => (e.currentTarget.style.background = hasGhost ? '#FFFBEB' : '#fff')}
        style={{ background: hasGhost ? '#FFFBEB' : '#fff' }}>
        <td style={tdSt}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }} onClick={() => openPlayer(p)}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800', color: '#fff', flexShrink: 0 }}>
              {p.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontWeight: '600', color: primary, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' }}>{p.full_name}</span>
                {hasGhost && <span title="Repeated no-show after RSVPing Going" style={{ fontSize: '10px' }}>👻</span>}
              </div>
              {(p.jersey_number != null || p.position) && (
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                  {p.jersey_number != null ? `#${p.jersey_number}` : ''}{p.position ? ` · ${p.position}` : ''}
                </div>
              )}
            </div>
          </div>
        </td>
        {/* RSVP group */}
        <td style={{ ...tdSt, borderLeft: '1px solid #F1F5F9', color: '#64748B', fontSize: '12px' }}>{p.total_events}</td>
        <td style={{ ...tdSt, fontWeight: '700', color: '#16A34A', fontSize: '12px' }}>{p.rsvp_going}</td>
        <td style={{ ...tdSt, color: '#DC2626', fontSize: '12px' }}>{p.rsvp_out}</td>
        <td style={{ ...tdSt, color: '#94A3B8', fontSize: '12px' }}>{p.rsvp_pending}</td>
        <td style={tdSt}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '40px', height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${p.rsvp_pct}%`, background: pctColor(p.rsvp_pct), borderRadius: '3px' }} />
            </div>
            <span style={{ padding: '2px 8px', borderRadius: '20px', fontWeight: '700', fontSize: '11px', background: pctBg(p.rsvp_pct), color: pctColor(p.rsvp_pct), minWidth: '38px', textAlign: 'center' }}>
              {p.rsvp_pct}%
            </span>
          </div>
        </td>
        {/* Actual group */}
        <td style={{ ...tdSt, borderLeft: '3px solid #E2E8F0' }}>
          {p.actual_pct !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '40px', height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${p.actual_pct}%`, background: pctColor(p.actual_pct), borderRadius: '3px' }} />
              </div>
              <span style={{ padding: '2px 8px', borderRadius: '20px', fontWeight: '700', fontSize: '11px', background: pctBg(p.actual_pct), color: pctColor(p.actual_pct), minWidth: '38px', textAlign: 'center' }}>
                {p.actual_pct}%
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: '#CBD5E1', fontStyle: 'italic' }}>not marked</span>
          )}
        </td>
        <td style={{ ...tdSt, fontSize: '12px', color: '#64748B' }}>
          <span style={{ fontWeight: '700', color: '#16A34A' }}>{p.actual_present}</span>
          {p.actual_late > 0 && <span style={{ color: '#D97706', marginLeft: '4px' }}>+{p.actual_late}L</span>}
          {p.actual_absent > 0 && <span style={{ color: '#DC2626', marginLeft: '4px' }}>{p.actual_absent}✗</span>}
        </td>
        <td style={{ ...tdSt, fontSize: '12px' }}>
          {p.ghost_count > 0 ? (
            <span style={{ fontWeight: '800', color: '#D97706', background: '#FFFBEB', padding: '2px 8px', borderRadius: '20px' }}>
              {p.ghost_count}× 👻
            </span>
          ) : <span style={{ color: '#CBD5E1' }}>—</span>}
        </td>
        {/* Playing time */}
        {hasGames && <>
          <td style={{ ...tdSt, borderLeft: '3px solid #E2E8F0', color: '#64748B', fontSize: '12px' }}>{p.games_attended}/{p.total_games}</td>
          <td style={{ ...tdSt, fontWeight: '700', color: '#7C3AED', fontSize: '12px' }}>{p.games_started}</td>
          <td style={tdSt}>
            {p.playing_pct !== null ? (
              <span style={{ padding: '2px 8px', borderRadius: '20px', fontWeight: '700', fontSize: '11px', color: '#7C3AED', background: '#F5F3FF' }}>{p.playing_pct}%</span>
            ) : <span style={{ fontSize: '11px', color: '#CBD5E1' }}>—</span>}
          </td>
        </>}
      </tr>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Club</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Reports</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>RSVP intent vs coach-marked actual attendance</p>
        </div>
        <button onClick={exportCSV} disabled={!playerStats.length}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: '700', color: '#374151', cursor: playerStats.length ? 'pointer' : 'not-allowed', opacity: playerStats.length ? 1 : 0.5, fontFamily: 'inherit' }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div style={{ padding: '20px 32px' }}>

        {/* Filters + Legend — one compact bar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center', background: '#fff', border: '1px solid #E8ECF0', borderRadius: '12px', padding: '10px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '4px' }}>Period</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ border: '1px solid #E2E8F0', outline: 'none', fontSize: '12px', color: '#374151', fontFamily: 'inherit', background: '#F8FAFC', borderRadius: '7px', padding: '4px 8px', fontWeight: '600' }} />
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ border: '1px solid #E2E8F0', outline: 'none', fontSize: '12px', color: '#374151', fontFamily: 'inherit', background: '#F8FAFC', borderRadius: '7px', padding: '4px 8px', fontWeight: '600' }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ fontSize: '11px', fontWeight: '700', color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontFamily: 'inherit' }}>✕ Clear</button>
          )}
          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: '#E2E8F0', margin: '0 6px' }} />
          {/* Legend pills */}
          <span style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748B', display: 'inline-block' }} />
            <strong>RSVP %</strong> — pre-event intent
          </span>
          <span style={{ fontSize: '11px', color: primary, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: primary, display: 'inline-block' }} />
            <strong>Actual %</strong> — coach-marked ground truth
          </span>
          <span style={{ fontSize: '11px', color: '#D97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>👻</span>
            <strong>Ghost</strong> — RSVPd Going, marked Absent
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', background: '#fff', borderRadius: '14px', border: '1px solid #E8ECF0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ width: '32px', height: '32px', border: `3px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '14px' }} />
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#64748B' }}>Loading reports…</div>
          </div>
        ) : playerStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '14px', border: '1px solid #E8ECF0' }}>
            <BarChart2 size={30} color="#CBD5E1" style={{ marginBottom: '14px' }} />
            <div style={{ fontSize: '17px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No data yet</div>
            <div style={{ fontSize: '13px', color: '#94A3B8' }}>Add events and players, then check back here for reports</div>
          </div>
        ) : (
          <>
            {/* ── Alert bar ── */}
            {alerts.length > 0 && (
              <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 14px', borderRadius: '9px', background: a.level === 'red' ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${a.level === 'red' ? '#FECACA' : '#FDE68A'}` }}>
                    <span style={{ color: a.level === 'red' ? '#DC2626' : '#D97706', flexShrink: 0 }}>{a.icon}</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: a.level === 'red' ? '#DC2626' : '#92400E' }}>{a.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Team summary cards ── */}
            {teamSummaries.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                {teamSummaries.map((t) => {
                  const displayPct = t.avg_actual_pct ?? t.avg_rsvp_pct;
                  const accColor   = pctColor(displayPct);
                  return (
                    <div key={t.id}
                      onClick={() => router.push(`/dashboard/teams/${t.id}`)}
                      onMouseEnter={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.10)'; el.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; el.style.transform = 'translateY(0)'; }}
                      style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer', transition: 'all 0.15s' }}>
                      <div style={{ height: '4px', background: accColor }} />
                      <div style={{ padding: '14px 18px 16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', marginBottom: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>

                        {/* RSVP bar */}
                        <div style={{ marginBottom: '7px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>📋 RSVP</span>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: pctColor(t.avg_rsvp_pct), fontVariantNumeric: 'tabular-nums' }}>{t.avg_rsvp_pct}%</span>
                          </div>
                          <div style={{ height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${t.avg_rsvp_pct}%`, background: pctColor(t.avg_rsvp_pct), borderRadius: '3px' }} />
                          </div>
                        </div>

                        {/* Actual bar */}
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', fontWeight: '700', color: primary, textTransform: 'uppercase', letterSpacing: '0.07em' }}>✅ Actual</span>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: t.avg_actual_pct !== null ? pctColor(t.avg_actual_pct) : '#CBD5E1', fontVariantNumeric: 'tabular-nums' }}>
                              {t.avg_actual_pct !== null ? `${t.avg_actual_pct}%` : 'Not marked'}
                            </span>
                          </div>
                          <div style={{ height: '5px', background: `${primary}20`, borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${t.avg_actual_pct ?? 0}%`, background: t.avg_actual_pct !== null ? pctColor(t.avg_actual_pct) : '#CBD5E1', borderRadius: '3px' }} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          {[`${t.total_events} events`, `${t.total_games} games`, `${t.player_count} players`, `${t.events_with_att}/${t.total_events} marked`].map((chip) => (
                            <span key={chip} style={{ fontSize: '10px', fontWeight: '600', color: chip.includes('marked') && t.events_with_att === 0 ? '#DC2626' : '#64748B', background: chip.includes('marked') && t.events_with_att === 0 ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${chip.includes('marked') && t.events_with_att === 0 ? '#FECACA' : '#E8ECF0'}`, borderRadius: '20px', padding: '2px 8px' }}>{chip}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Discrepancy spotlight ── */}
            {spotlightPlayers.length > 0 && (
              <div style={{ background: '#fff', borderRadius: '14px', border: '1.5px solid #FDE68A', marginBottom: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #FEF3C7', display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFBEB' }}>
                  <span style={{ fontSize: '15px' }}>👻</span>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#92400E' }}>Discrepancy spotlight</span>
                  <span style={{ fontSize: '11px', color: '#B45309' }}>Players where RSVP doesn&apos;t match reality</span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '700', color: '#B45309', background: '#FEF3C7', borderRadius: '20px', padding: '2px 9px' }}>{spotlightPlayers.length} flagged</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '14px 16px' }}>
                  {spotlightPlayers.map((p) => {
                    const ghostDominant = p.ghost_count >= p.surprise_count;
                    const accentColor  = ghostDominant ? '#D97706' : '#7C3AED';
                    const accentBg     = ghostDominant ? '#FFFBEB' : '#F5F3FF';
                    const narrative    = p.ghost_count > 0 && p.surprise_count > 0
                      ? `${p.ghost_count}× no-show after going · ${p.surprise_count}× surprise`
                      : p.ghost_count > 0
                        ? `Said Going ${p.rsvp_going}×, no-showed ${p.ghost_count}×`
                        : `Showed up ${p.surprise_count}× without RSVP`;
                    return (
                      <div key={p.id} onClick={() => openPlayer(p)}
                        style={{ flex: '0 0 auto', width: '230px', borderRadius: '10px', border: '1px solid #E8ECF0', borderLeft: `4px solid ${accentColor}`, padding: '12px 14px', cursor: 'pointer', background: '#fff', transition: 'background 0.12s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = accentBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                        {/* Avatar + name */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: accentBg, border: `2px solid ${accentColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: accentColor, flexShrink: 0 }}>
                            {p.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name}</div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.team_name}</div>
                          </div>
                        </div>
                        {/* RSVP vs Actual comparison */}
                        {p.actual_pct !== null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', padding: '5px 8px', background: '#F8FAFC', borderRadius: '7px' }}>
                            <span style={{ fontSize: '10px', fontWeight: '700', color: pctColor(p.rsvp_pct), fontVariantNumeric: 'tabular-nums' }}>📋 {p.rsvp_pct}%</span>
                            <span style={{ fontSize: '10px', color: '#CBD5E1' }}>→</span>
                            <span style={{ fontSize: '10px', fontWeight: '700', color: pctColor(p.actual_pct), fontVariantNumeric: 'tabular-nums' }}>✅ {p.actual_pct}%</span>
                            {p.rsvp_pct - (p.actual_pct ?? p.rsvp_pct) >= 15 && (
                              <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: '700', color: '#DC2626' }}>−{p.rsvp_pct - p.actual_pct}pp</span>
                            )}
                          </div>
                        )}
                        {/* Narrative */}
                        <div style={{ fontSize: '11px', color: accentColor, fontWeight: '600', marginBottom: '8px', lineHeight: '1.4' }}>{narrative}</div>
                        {/* Chips */}
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          {p.ghost_count > 0 && <span style={{ fontSize: '10px', fontWeight: '700', color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '20px', padding: '2px 7px' }}>👻 {p.ghost_count}× ghost</span>}
                          {p.surprise_count > 0 && <span style={{ fontSize: '10px', fontWeight: '700', color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '20px', padding: '2px 7px' }}>⚡ {p.surprise_count}× surprise</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Player breakdown table ── */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E8ECF0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={15} color="#64748B" />
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>Player breakdown</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', background: '#F1F5F9', borderRadius: '20px', padding: '2px 9px' }}>{sortedPlayers.length}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                  <button onClick={() => setCollapsedTeams({})} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '700', color: primary, background: `${primary}12`, border: `1px solid ${primary}30`, borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Expand all
                  </button>
                  <button onClick={() => setCollapsedTeams(Object.fromEntries(teamSummaries.map((t) => [t.id, true])))} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '700', color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Collapse all
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    {/* Group label row */}
                    <tr style={{ background: '#1A2335' }}>
                      <th style={{ padding: '6px 14px' }} />
                      <th colSpan={5} style={{ padding: '5px 14px', fontSize: '9px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '1.2px', textAlign: 'left', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                        📋 RSVP — pre-event intent
                      </th>
                      <th colSpan={3} style={{ padding: '5px 14px', fontSize: '9px', fontWeight: '800', color: primary, textTransform: 'uppercase', letterSpacing: '1.2px', textAlign: 'left', borderLeft: '3px solid rgba(255,255,255,0.12)' }}>
                        ✅ Actual — coach marked
                      </th>
                      {hasGames && <th colSpan={3} style={{ padding: '5px 14px', fontSize: '9px', fontWeight: '800', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '1.2px', textAlign: 'left', borderLeft: '3px solid rgba(255,255,255,0.12)' }}>
                        🟣 Playing time
                      </th>}
                    </tr>
                    {/* Column headers */}
                    <tr style={{ background: '#0F172A' }}>
                      <th style={thSt} onClick={() => toggleSort('name')}>Player {sortBy === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                      <th style={{ ...thSt, borderLeft: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>Events</th>
                      <th style={{ ...thSt, color: '#4ade80' }}>Going</th>
                      <th style={{ ...thSt, color: '#f87171' }}>Out</th>
                      <th style={{ ...thSt, color: 'rgba(255,255,255,0.3)' }}>Pending</th>
                      <th style={{ ...thSt }} onClick={() => toggleSort('rsvp_pct')}>RSVP % {sortBy === 'rsvp_pct' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                      <th style={{ ...thSt, borderLeft: '3px solid rgba(255,255,255,0.15)', color: primary }} onClick={() => toggleSort('actual_pct')}>Actual % {sortBy === 'actual_pct' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                      <th style={{ ...thSt, color: 'rgba(255,255,255,0.4)' }}>P / L / A</th>
                      <th style={{ ...thSt, color: '#fbbf24' }} onClick={() => toggleSort('ghost_count')}>👻 Ghosts {sortBy === 'ghost_count' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                      {hasGames && <>
                        <th style={{ ...thSt, borderLeft: '3px solid rgba(255,255,255,0.15)', color: '#a78bfa' }}>Games</th>
                        <th style={{ ...thSt, color: '#a78bfa' }} onClick={() => toggleSort('started')}>Started {sortBy === 'started' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                        <th style={{ ...thSt, color: '#a78bfa' }}>Playing time</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {teamSummaries.map((t) => {
                      const teamPlayers = sortedPlayers.filter((p) => p.team_id === t.id);
                      const isCollapsed = collapsedTeams[t.id] ?? false;
                      return (
                        <React.Fragment key={t.id}>
                          <tr style={{ background: `${primary}08`, cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => setCollapsedTeams((prev) => ({ ...prev, [t.id]: !(prev[t.id] ?? false) }))}>
                            <td colSpan={20} style={{ padding: '10px 14px', borderBottom: `1px solid ${primary}20`, borderTop: `2px solid ${primary}25` }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {isCollapsed ? <ChevronRight size={14} color={primary} /> : <ChevronDown size={14} color={primary} />}
                                <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>{t.name}</span>
                                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B', background: '#fff', borderRadius: '20px', padding: '2px 9px', border: '1px solid #E2E8F0' }}>
                                  {teamPlayers.length} players
                                </span>
                                {/* Dual summary pills */}
                                <span style={{ fontSize: '11px', fontWeight: '700', color: pctColor(t.avg_rsvp_pct), background: pctBg(t.avg_rsvp_pct), padding: '2px 8px', borderRadius: '20px' }}>
                                  📋 {t.avg_rsvp_pct}% RSVP
                                </span>
                                {t.avg_actual_pct !== null && (
                                  <span style={{ fontSize: '11px', fontWeight: '700', color: pctColor(t.avg_actual_pct), background: pctBg(t.avg_actual_pct), padding: '2px 8px', borderRadius: '20px' }}>
                                    ✅ {t.avg_actual_pct}% actual
                                  </span>
                                )}
                                {t.events_with_att === 0 && (
                                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: '20px', marginLeft: 'auto' }}>
                                    No attendance marked
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                          {!isCollapsed && teamPlayers.map((p) => renderPlayerRow(p))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Player detail modal ── */}
      {selectedPlayer && (() => {
        const p = selectedPlayer;
        const TYPE_EMOJI: Record<string, string> = { game: '⚽', training: '🏃', other: '📌' };
        const fmtHistDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }}
            onClick={() => setSelectedPlayer(null)}>
            <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden' }}
              onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '900', color: '#fff', flexShrink: 0 }}>
                    {p.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', lineHeight: 1.2 }}>{p.full_name}</div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      {p.jersey_number != null ? `#${p.jersey_number}` : ''}{p.position ? `${p.jersey_number != null ? ' · ' : ''}${p.position}` : ''}{p.team_name ? ` · ${p.team_name}` : ''}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedPlayer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', flexShrink: 0 }}>
                  <X size={18} color="#64748B" />
                </button>
              </div>

              {/* Stat tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '1px', background: '#F1F5F9', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
                {[
                  { label: '📋 RSVP rate', value: `${p.rsvp_pct}%`, sub: `${p.rsvp_going}/${p.total_events} events`, color: pctColor(p.rsvp_pct) },
                  { label: '✅ Actual', value: p.actual_pct !== null ? `${p.actual_pct}%` : '—', sub: p.actual_pct !== null ? `${p.actual_present} present, ${p.actual_late} late, ${p.actual_absent} absent` : 'Not marked yet', color: p.actual_pct !== null ? pctColor(p.actual_pct) : '#CBD5E1' },
                  { label: '👻 Ghost rate', value: p.ghost_count > 0 ? `${p.ghost_count}×` : '—', sub: p.ghost_count > 0 ? 'RSVPd Going, marked Absent' : 'No discrepancies', color: p.ghost_count >= 2 ? '#D97706' : '#16A34A' },
                  { label: '⚡ Surprises', value: p.surprise_count > 0 ? `${p.surprise_count}×` : '—', sub: p.surprise_count > 0 ? 'Showed up without RSVPing' : 'None', color: p.surprise_count > 0 ? '#7C3AED' : '#16A34A' },
                ].map((s) => (
                  <div key={s.label} style={{ background: '#fff', padding: '16px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: '900', color: s.color, lineHeight: 1, marginBottom: '4px' }}>{s.value}</div>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748B', marginBottom: '3px' }}>{s.label}</div>
                    <div style={{ fontSize: '10px', color: '#94A3B8' }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Event history */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '18px 24px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>Recent events (last 20)</div>
                {historyLoading ? (
                  <div style={{ textAlign: 'center', padding: '24px' }}>
                    <div style={{ width: '20px', height: '20px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                  </div>
                ) : playerHistory.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '16px' }}>No events in range</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {playerHistory.map((h, i) => {
                      const rsvpColor = h.rsvp === 'attending' ? '#16A34A' : h.rsvp === 'not_attending' ? '#DC2626' : '#94A3B8';
                      const rsvpLabel = h.rsvp === 'attending' ? 'Going' : h.rsvp === 'not_attending' ? 'Out' : 'No RSVP';
                      const rsvpBg    = h.rsvp === 'attending' ? '#F0FDF4' : h.rsvp === 'not_attending' ? '#FEF2F2' : '#F8FAFC';
                      const actColor  = h.actual === 'present' ? '#16A34A' : h.actual === 'late' ? '#D97706' : h.actual === 'absent' ? '#DC2626' : '#CBD5E1';
                      const actLabel  = h.actual === 'present' ? '✓ Present' : h.actual === 'late' ? '⏰ Late' : h.actual === 'absent' ? '✗ Absent' : 'Not marked';
                      const actBg     = h.actual === 'present' ? '#F0FDF4' : h.actual === 'late' ? '#FFFBEB' : h.actual === 'absent' ? '#FEF2F2' : '#F8FAFC';
                      // Ghost highlight
                      const isGhost = h.rsvp === 'attending' && h.actual === 'absent';
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: i < playerHistory.length - 1 ? '1px solid #F8FAFC' : 'none', background: isGhost ? '#FFFBEB' : 'transparent', borderRadius: isGhost ? '6px' : '0', paddingLeft: isGhost ? '6px' : '0' }}>
                          <span style={{ fontSize: '14px', flexShrink: 0 }}>{TYPE_EMOJI[h.type] ?? '📌'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {isGhost && '👻 '}{h.title}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94A3B8' }}>{fmtHistDate(h.event_date)}</div>
                          </div>
                          {/* RSVP pill */}
                          <span style={{ fontSize: '10px', fontWeight: '700', color: rsvpColor, background: rsvpBg, borderRadius: '20px', padding: '2px 7px', flexShrink: 0 }}>{rsvpLabel}</span>
                          {/* Actual pill */}
                          <span style={{ fontSize: '10px', fontWeight: '700', color: actColor, background: actBg, borderRadius: '20px', padding: '2px 7px', flexShrink: 0, minWidth: '64px', textAlign: 'center' }}>{actLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
