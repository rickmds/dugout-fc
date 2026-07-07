'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { BarChart2, ChevronDown, ChevronRight, Download, Users, X } from 'lucide-react';
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
  // Attendance (all events)
  total_events: number;
  attended: number;
  not_attending: number;
  pending: number;
  att_pct: number;
  // Playing time (game events only)
  total_games: number;
  games_attended: number;
  games_started: number;
  playing_pct: number | null; // null = no games attended yet
};

type TeamSummary = {
  id: string;
  name: string;
  total_events: number;
  total_games: number;
  avg_att_pct: number;
  avg_playing_pct: number | null;
};

function pctColor(pct: number): string {
  if (pct >= 80) return '#16A34A';
  if (pct >= 60) return '#D97706';
  return '#DC2626';
}
function pctBg(pct: number): string {
  if (pct >= 80) return '#F0FDF4';
  if (pct >= 60) return '#FFFBEB';
  return '#FEF2F2';
}

export default function ReportsPage() {
  const { club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const router = useRouter();

  const [filterTeam, setFilterTeam]     = useState<string>('all');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [playerStats, setPlayerStats]   = useState<PlayerStat[]>([]);
  const [teamSummaries, setTeamSummaries] = useState<TeamSummary[]>([]);
  const [sortBy, setSortBy]             = useState<'name' | 'att_pct' | 'attended' | 'playing_pct' | 'started'>('att_pct');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerStat | null>(null);
  const [playerHistory, setPlayerHistory]   = useState<{ title: string; type: string; event_date: string; status: 'attending' | 'not_attending' | 'pending' }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});

  const loadStats = useCallback(async () => {
    if (!teams.length) return;
    setLoading(true);

    const teamIds = filterTeam === 'all' ? teams.map((t) => t.id) : [filterTeam];

    // All events for date range
    let evQ = supabase.from('events').select('id, team_id, type').in('team_id', teamIds);
    if (dateFrom) evQ = evQ.gte('event_date', dateFrom);
    if (dateTo)   evQ = evQ.lte('event_date', dateTo);
    const { data: events } = await evQ.limit(1000);

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

    // Counts per team
    const eventCountByTeam: Record<string, number> = {};
    const gameCountByTeam:  Record<string, number> = {};
    for (const e of events) {
      eventCountByTeam[e.team_id] = (eventCountByTeam[e.team_id] ?? 0) + 1;
      if (e.type === 'game') gameCountByTeam[e.team_id] = (gameCountByTeam[e.team_id] ?? 0) + 1;
    }

    // Parallel: players + all RSVPs + lineup data
    const [playerRes, rsvpRes, lineupRes] = await Promise.all([
      supabase.from('players').select('id, full_name, jersey_number, position, team_id').in('team_id', teamIdSet),
      supabase.from('event_rsvps').select('player_id, event_id, status').in('event_id', allEventIds).limit(10000),
      gameEventIds.length
        ? supabase.from('lineups').select('id, event_id').in('event_id', gameEventIds)
        : Promise.resolve({ data: [] }),
    ]);

    // lineup_id → event_id map
    const lineupEventMap: Record<string, string> = {};
    for (const l of lineupRes.data ?? []) lineupEventMap[l.id] = l.event_id;
    const lineupIds = Object.keys(lineupEventMap);

    // Lineup positions → player → set of game event IDs they started
    const startedEventsByPlayer: Record<string, Set<string>> = {};
    if (lineupIds.length) {
      const { data: posData } = await supabase
        .from('lineup_positions')
        .select('lineup_id, player_id')
        .in('lineup_id', lineupIds);
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
    type RsvpCounts = { all_attending: number; all_not: number; game_attending: number };
    const rsvpByPlayer: Record<string, RsvpCounts> = {};
    for (const r of rsvpRes.data ?? []) {
      if (!rsvpByPlayer[r.player_id]) rsvpByPlayer[r.player_id] = { all_attending: 0, all_not: 0, game_attending: 0 };
      if (r.status === 'attending') {
        rsvpByPlayer[r.player_id].all_attending++;
        if (gameEventSet.has(r.event_id)) rsvpByPlayer[r.player_id].game_attending++;
      } else {
        rsvpByPlayer[r.player_id].all_not++;
      }
    }

    const stats: PlayerStat[] = (playerRes.data ?? []).map((p) => {
      const totalEvents   = eventCountByTeam[p.team_id] ?? 0;
      const totalGames    = gameCountByTeam[p.team_id] ?? 0;
      const rsvp          = rsvpByPlayer[p.id] ?? { all_attending: 0, all_not: 0, game_attending: 0 };
      const pending       = Math.max(0, totalEvents - rsvp.all_attending - rsvp.all_not);
      const att_pct       = totalEvents > 0 ? Math.round((rsvp.all_attending / totalEvents) * 100) : 0;
      const gamesStarted  = startedEventsByPlayer[p.id]?.size ?? 0;
      const playing_pct   = rsvp.game_attending > 0
        ? Math.min(100, Math.round((gamesStarted / rsvp.game_attending) * 100))
        : null;
      return {
        ...p,
        team_name: teamMap[p.team_id] ?? '—',
        total_events: totalEvents,
        attended: rsvp.all_attending,
        not_attending: rsvp.all_not,
        pending,
        att_pct,
        total_games: totalGames,
        games_attended: rsvp.game_attending,
        games_started: gamesStarted,
        playing_pct,
      };
    });

    // Team summaries
    const summaries: TeamSummary[] = teamIdSet.map((tid) => {
      const tp         = stats.filter((p) => p.team_id === tid);
      const totalStarts = tp.reduce((s, p) => s + p.games_started, 0);
      const tGames      = gameCountByTeam[tid] ?? 0;
      return {
        id: tid,
        name: teamMap[tid] ?? '—',
        total_events: eventCountByTeam[tid] ?? 0,
        total_games:  tGames,
        avg_att_pct:  tp.length ? Math.round(tp.reduce((s, p) => s + p.att_pct, 0) / tp.length) : 0,
        // avg starts per player ÷ total games — always 0-100%
        avg_playing_pct: tGames > 0 && tp.length > 0
          ? Math.min(100, Math.round((totalStarts / (tGames * tp.length)) * 100))
          : null,
      };
    });

    setPlayerStats(stats);
    setTeamSummaries(summaries);
    setLoading(false);
  }, [teams, filterTeam, dateFrom, dateTo]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const openPlayer = useCallback(async (p: PlayerStat) => {
    setSelectedPlayer(p);
    setPlayerHistory([]);
    setHistoryLoading(true);
    const { data: evData } = await supabase
      .from('events')
      .select('id, title, type, event_date')
      .eq('team_id', p.team_id)
      .order('event_date', { ascending: false })
      .limit(15);
    const evIds = (evData ?? []).map((e: { id: string }) => e.id);
    const { data: rsvpData } = evIds.length
      ? await supabase.from('event_rsvps').select('event_id, status').eq('player_id', p.id).in('event_id', evIds)
      : { data: [] };
    const rsvpMap = new Map<string, string>();
    for (const r of rsvpData ?? []) rsvpMap.set(r.event_id, r.status);
    setPlayerHistory(
      (evData ?? []).map((e: { id: string; title: string; type: string; event_date: string }) => ({
        title: e.title,
        type: e.type,
        event_date: e.event_date,
        status: (rsvpMap.get(e.id) ?? 'pending') as 'attending' | 'not_attending' | 'pending',
      }))
    );
    setHistoryLoading(false);
  }, []);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'name' ? 'asc' : 'desc'); }
  }

  const sortedPlayers = [...playerStats].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'name')        return a.full_name.localeCompare(b.full_name) * dir;
    if (sortBy === 'att_pct')     return (a.att_pct - b.att_pct) * dir;
    if (sortBy === 'attended')    return (a.attended - b.attended) * dir;
    if (sortBy === 'playing_pct') return ((a.playing_pct ?? -1) - (b.playing_pct ?? -1)) * dir;
    if (sortBy === 'started')     return (a.games_started - b.games_started) * dir;
    return 0;
  });

  function exportCSV() {
    const rows = [
      ['Name', 'Team', 'Position', 'Jersey', 'Events', 'Going', 'Out', 'Pending', 'Attendance %', 'Games', 'Games Attended', 'Games Started', 'Playing Time %'],
      ...sortedPlayers.map((p) => [
        p.full_name, p.team_name, p.position ?? '', p.jersey_number ?? '',
        p.total_events, p.attended, p.not_attending, p.pending, `${p.att_pct}%`,
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

  const thSt: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const tdSt: React.CSSProperties = { padding: '11px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' };

  const hasGames = playerStats.some((p) => p.games_attended > 0);

  const renderPlayerRow = (p: PlayerStat, i: number) => (
    <tr key={p.id}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
      <td style={tdSt}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }} onClick={() => openPlayer(p)}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800', color: '#fff', flexShrink: 0 }}>
            {p.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: '600', color: primary, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' }}>{p.full_name}</div>
            {(p.jersey_number != null || p.position) && (
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                {p.jersey_number != null ? `#${p.jersey_number}` : ''}{p.position ? ` · ${p.position}` : ''}
              </div>
            )}
          </div>
        </div>
      </td>
      <td style={{ ...tdSt, borderLeft: '1px solid #F1F5F9', color: '#64748B' }}>{p.total_events}</td>
      <td style={{ ...tdSt, fontWeight: '700', color: '#16A34A' }}>{p.attended}</td>
      <td style={{ ...tdSt, color: '#DC2626' }}>{p.not_attending}</td>
      <td style={{ ...tdSt, color: '#94A3B8' }}>{p.pending}</td>
      <td style={tdSt}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '48px', height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ height: '100%', width: `${p.att_pct}%`, background: pctColor(p.att_pct), borderRadius: '3px' }} />
          </div>
          <span style={{ padding: '3px 10px', borderRadius: '20px', fontWeight: '700', fontSize: '12px', background: pctBg(p.att_pct), color: pctColor(p.att_pct), minWidth: '42px', textAlign: 'center' }}>
            {p.att_pct}%
          </span>
        </div>
      </td>
      {hasGames && <>
        <td style={{ ...tdSt, borderLeft: '2px solid #F1F5F9', color: '#64748B' }}>{p.games_attended}/{p.total_games}</td>
        <td style={{ ...tdSt, fontWeight: '700', color: '#7C3AED' }}>{p.games_started}</td>
        <td style={tdSt}>
          {p.playing_pct !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '48px', height: '5px', background: '#F5F3FF', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${p.playing_pct}%`, background: '#7C3AED', borderRadius: '3px' }} />
              </div>
              <span style={{ padding: '3px 10px', borderRadius: '20px', fontWeight: '700', fontSize: '12px', color: '#7C3AED', background: '#F5F3FF', minWidth: '42px', textAlign: 'center' }}>
                {p.playing_pct}%
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '12px', color: '#CBD5E1' }}>—</span>
          )}
        </td>
      </>}
    </tr>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '20px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Club</div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>Reports</h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748B' }}>Attendance and playing time across your teams</p>
        </div>
        <button onClick={exportCSV} disabled={!playerStats.length}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 16px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: '#374151', cursor: playerStats.length ? 'pointer' : 'not-allowed', opacity: playerStats.length ? 1 : 0.5, fontFamily: 'inherit' }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
          {teams.length > 1 && (
            <div style={{ position: 'relative' }}>
              <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
                style={{ appearance: 'none', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '9px', padding: '8px 32px 8px 12px', fontSize: '13px', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                <option value="all">All teams</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '9px', padding: '6px 12px' }}>
            <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ border: 'none', outline: 'none', fontSize: '13px', color: '#374151', fontFamily: 'inherit', background: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '9px', padding: '6px 12px' }}>
            <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ border: 'none', outline: 'none', fontSize: '13px', color: '#374151', fontFamily: 'inherit', background: 'none' }} />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '9px', padding: '6px 14px', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#FEF2F2'; b.style.borderColor = '#FECACA'; b.style.color = '#DC2626'; }}
              onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#fff'; b.style.borderColor = '#E2E8F0'; b.style.color = '#64748B'; }}
            >
              ✕ Clear dates
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '32px', height: '32px', border: `3px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '14px' }} />
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#64748B' }}>Loading reports…</div>
          </div>
        ) : playerStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <BarChart2 size={30} color="#CBD5E1" />
            </div>
            <div style={{ fontSize: '17px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No data yet</div>
            <div style={{ fontSize: '13px', color: '#94A3B8', lineHeight: '1.6' }}>Add events and players, then check back here for attendance and playing-time reports</div>
          </div>
        ) : (
          <>
            {/* Team summary cards */}
            {filterTeam === 'all' && teamSummaries.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                {teamSummaries.map((t) => (
                  <div key={t.id}
                    onClick={() => router.push(`/dashboard/teams/${t.id}`)}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = primary; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 16px rgba(0,0,0,0.10)`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}
                    style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', marginBottom: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Attendance</div>
                      <div style={{ fontSize: '28px', fontWeight: '900', color: pctColor(t.avg_att_pct), lineHeight: 1, marginBottom: '8px' }}>{t.avg_att_pct}%</div>
                      <div style={{ height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${t.avg_att_pct}%`, background: pctColor(t.avg_att_pct), borderRadius: '3px' }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '14px' }}>
                      {t.total_events} event{t.total_events !== 1 ? 's' : ''} · {t.total_games} game{t.total_games !== 1 ? 's' : ''} · {playerStats.filter((p) => p.team_id === t.id).length} players
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Player table */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={15} color="#64748B" />
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Player breakdown</span>
                <span style={{ fontSize: '12px', color: '#94A3B8', background: '#F1F5F9', borderRadius: '20px', padding: '1px 8px' }}>{sortedPlayers.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                      <th style={thSt} onClick={() => toggleSort('name')}>
                        Player {sortBy === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      {/* Attendance group */}
                      <th style={{ ...thSt, borderLeft: '1px solid #F1F5F9' }}>Events</th>
                      <th style={{ ...thSt, color: '#16A34A' }} onClick={() => toggleSort('attended')}>
                        Going {sortBy === 'attended' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th style={{ ...thSt, color: '#DC2626' }}>Out</th>
                      <th style={{ ...thSt, color: '#94A3B8' }}>Pending</th>
                      <th style={thSt} onClick={() => toggleSort('att_pct')}>
                        Att % {sortBy === 'att_pct' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      {hasGames && <>
                        <th style={{ ...thSt, borderLeft: '2px solid #E2E8F0', color: '#7C3AED' }}>Games attended</th>
                        <th style={{ ...thSt, color: '#7C3AED' }} onClick={() => toggleSort('started')}>
                          Started {sortBy === 'started' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ ...thSt, color: '#7C3AED' }} onClick={() => toggleSort('playing_pct')}>
                          Playing time {sortBy === 'playing_pct' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {filterTeam === 'all' ? (
                      teamSummaries.map((t) => {
                        const teamPlayers = sortedPlayers.filter((p) => p.team_id === t.id);
                        const isCollapsed = collapsedTeams[t.id] ?? false;
                        return (
                          <React.Fragment key={t.id}>
                            <tr
                              style={{ background: '#EFF6FF', cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => setCollapsedTeams((prev) => ({ ...prev, [t.id]: !(prev[t.id] ?? false) }))}
                            >
                              <td colSpan={20} style={{ padding: '10px 16px', borderBottom: '1px solid #E2E8F0', borderTop: '2px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  {isCollapsed
                                    ? <ChevronRight size={14} color="#64748B" />
                                    : <ChevronDown size={14} color="#64748B" />}
                                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{t.name}</span>
                                  <span style={{ fontSize: '11px', color: '#94A3B8', background: '#fff', borderRadius: '20px', padding: '1px 8px', border: '1px solid #E2E8F0' }}>
                                    {teamPlayers.length} player{teamPlayers.length !== 1 ? 's' : ''}
                                  </span>
                                  <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: '700', color: pctColor(t.avg_att_pct) }}>
                                    {t.avg_att_pct}% avg attendance
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {!isCollapsed && teamPlayers.map((p, i) => renderPlayerRow(p, i))}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      sortedPlayers.map((p, i) => renderPlayerRow(p, i))
                    )}
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
        const rsvpRate = p.total_events > 0 ? Math.round(((p.attended + p.not_attending) / p.total_events) * 100) : 0;
        const totalTraining = p.total_events - p.total_games;
        const trainingAttended = Math.max(0, p.attended - p.games_attended);
        const streak = (() => {
          let s = 0;
          for (const h of playerHistory) {
            if (h.status === 'attending') s++;
            else break;
          }
          return s;
        })();
        const TYPE_EMOJI: Record<string, string> = { game: '⚽', training: '🏃', other: '📌' };
        const fmtHistDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }}
            onClick={() => setSelectedPlayer(null)}
          >
            <div
              style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '520px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '900', color: '#fff', flexShrink: 0 }}>
                    {p.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', lineHeight: 1.2 }}>{p.full_name}</div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      {p.jersey_number != null ? `#${p.jersey_number}` : ''}
                      {p.position ? `${p.jersey_number != null ? ' · ' : ''}${p.position}` : ''}
                      {p.team_name ? ` · ${p.team_name}` : ''}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedPlayer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', flexShrink: 0 }}>
                  <X size={18} color="#64748B" />
                </button>
              </div>

              {/* Scrollable body */}
              <div style={{ overflowY: 'auto', flex: 1 }}>

                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1px', background: '#F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
                  {[
                    { label: 'Attendance', value: `${p.att_pct}%`, sub: `${p.attended}/${p.total_events} events`, color: pctColor(p.att_pct) },
                    { label: 'RSVP rate', value: `${rsvpRate}%`, sub: `${p.attended + p.not_attending} responded`, color: rsvpRate >= 80 ? '#16A34A' : rsvpRate >= 50 ? '#D97706' : '#DC2626' },
                    { label: 'Playing time', value: p.playing_pct !== null ? `${p.playing_pct}%` : '—', sub: p.games_attended > 0 ? `${p.games_started} started` : 'No games attended', color: '#7C3AED' },
                    { label: 'Streak', value: streak > 0 ? `${streak}` : '—', sub: streak > 0 ? `events in a row` : 'No current streak', color: streak >= 3 ? '#16A34A' : '#64748B' },
                  ].map((s) => (
                    <div key={s.label} style={{ background: '#fff', padding: '16px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: '900', color: s.color, lineHeight: 1, marginBottom: '4px' }}>{s.value}</div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{s.label}</div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Games vs Training breakdown */}
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>Breakdown</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Games */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>⚽ Games attended</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#0F172A' }}>{p.games_attended}/{p.total_games}</span>
                      </div>
                      <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${p.total_games > 0 ? (p.games_attended / p.total_games) * 100 : 0}%`, background: '#EF4444', borderRadius: '4px' }} />
                      </div>
                    </div>
                    {/* Training */}
                    {totalTraining > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>🏃 Training attended</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#0F172A' }}>{trainingAttended}/{totalTraining}</span>
                        </div>
                        <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(trainingAttended / totalTraining) * 100}%`, background: '#22C55E', borderRadius: '4px' }} />
                        </div>
                      </div>
                    )}
                    {/* Playing time bar */}
                    {p.games_attended > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>🟣 Games started</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#0F172A' }}>{p.games_started}/{p.games_attended} attended</span>
                        </div>
                        <div style={{ height: '6px', background: '#F5F3FF', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${p.playing_pct ?? 0}%`, background: '#7C3AED', borderRadius: '4px' }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent event history */}
                <div style={{ padding: '18px 24px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>Recent events (last 15)</div>
                  {historyLoading ? (
                    <div style={{ textAlign: 'center', padding: '24px' }}>
                      <div style={{ width: '20px', height: '20px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                    </div>
                  ) : playerHistory.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '16px' }}>No events in range</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      {playerHistory.map((h, i) => {
                        const statusColor = h.status === 'attending' ? '#16A34A' : h.status === 'not_attending' ? '#DC2626' : '#94A3B8';
                        const statusLabel = h.status === 'attending' ? 'Going' : h.status === 'not_attending' ? 'Out' : 'No response';
                        const statusBg    = h.status === 'attending' ? '#F0FDF4' : h.status === 'not_attending' ? '#FEF2F2' : '#F8FAFC';
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderBottom: i < playerHistory.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                            <span style={{ fontSize: '14px', flexShrink: 0 }}>{TYPE_EMOJI[h.type] ?? '📌'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</div>
                              <div style={{ fontSize: '11px', color: '#94A3B8' }}>{fmtHistDate(h.event_date)}</div>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: statusColor, background: statusBg, borderRadius: '20px', padding: '2px 9px', flexShrink: 0 }}>{statusLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
