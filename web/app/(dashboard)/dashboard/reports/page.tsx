'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart2, ChevronDown, Download, Users } from 'lucide-react';
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

  const [filterTeam, setFilterTeam]     = useState<string>('all');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [playerStats, setPlayerStats]   = useState<PlayerStat[]>([]);
  const [teamSummaries, setTeamSummaries] = useState<TeamSummary[]>([]);
  const [sortBy, setSortBy]             = useState<'name' | 'att_pct' | 'attended' | 'playing_pct' | 'started'>('att_pct');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc');

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
      const playing_pct   = rsvp.game_attending > 0 ? Math.round((gamesStarted / rsvp.game_attending) * 100) : null;
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
      const tp = stats.filter((p) => p.team_id === tid);
      const totalStarts        = tp.reduce((s, p) => s + p.games_started, 0);
      const totalGamesAttended = tp.reduce((s, p) => s + p.games_attended, 0);
      return {
        id: tid,
        name: teamMap[tid] ?? '—',
        total_events: eventCountByTeam[tid] ?? 0,
        total_games:  gameCountByTeam[tid] ?? 0,
        avg_att_pct:  tp.length ? Math.round(tp.reduce((s, p) => s + p.att_pct, 0) / tp.length) : 0,
        avg_playing_pct: totalGamesAttended > 0
          ? Math.round((totalStarts / totalGamesAttended) * 100)
          : null,
      };
    });

    setPlayerStats(stats);
    setTeamSummaries(summaries);
    setLoading(false);
  }, [teams, filterTeam, dateFrom, dateTo]);

  useEffect(() => { loadStats(); }, [loadStats]);

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

  const thSt: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const tdSt: React.CSSProperties = { padding: '11px 14px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #F8FAFC', verticalAlign: 'middle' };

  const hasGames = playerStats.some((p) => p.total_games > 0);

  return (
    <div style={{ padding: '32px 36px', maxWidth: '1200px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>Reports</h1>
          <p style={{ fontSize: '13px', color: '#64748B' }}>Attendance and playing time across your teams</p>
        </div>
        <button onClick={exportCSV} disabled={!playerStats.length}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 16px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: '#374151', cursor: playerStats.length ? 'pointer' : 'not-allowed', opacity: playerStats.length ? 1 : 0.5, fontFamily: 'inherit' }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {teams.length > 1 && (
          <div style={{ position: 'relative' }}>
            <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
              style={{ appearance: 'none', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 32px 8px 12px', fontSize: '13px', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
              <option value="all">All teams</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px' }}>
          <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ border: 'none', outline: 'none', fontSize: '13px', color: '#374151', fontFamily: 'inherit', background: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px' }}>
          <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ border: 'none', outline: 'none', fontSize: '13px', color: '#374151', fontFamily: 'inherit', background: 'none' }} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); }}
            style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear dates
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px' }}>
          <div style={{ width: '28px', height: '28px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : playerStats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <BarChart2 size={40} color="#CBD5E1" style={{ marginBottom: '12px' }} />
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748B' }}>No data yet</div>
          <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '4px' }}>Add events and players to see reports</div>
        </div>
      ) : (
        <>
          {/* Team summary cards */}
          {filterTeam === 'all' && teamSummaries.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px', marginBottom: '28px' }}>
              {teamSummaries.map((t) => (
                <div key={t.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px 18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', marginBottom: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Attendance */}
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Attendance</div>
                      <div style={{ fontSize: '26px', fontWeight: '900', color: pctColor(t.avg_att_pct), lineHeight: 1, marginBottom: '6px' }}>{t.avg_att_pct}%</div>
                      <div style={{ height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${t.avg_att_pct}%`, background: pctColor(t.avg_att_pct), borderRadius: '3px' }} />
                      </div>
                    </div>
                    {/* Playing time */}
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Playing time</div>
                      {t.avg_playing_pct !== null ? (
                        <>
                          <div style={{ fontSize: '26px', fontWeight: '900', color: pctColor(t.avg_playing_pct), lineHeight: 1, marginBottom: '6px' }}>{t.avg_playing_pct}%</div>
                          <div style={{ height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${t.avg_playing_pct}%`, background: pctColor(t.avg_playing_pct), borderRadius: '3px' }} />
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '13px', color: '#CBD5E1', marginTop: '6px' }}>No lineups set</div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '12px' }}>
                    {t.total_events} event{t.total_events !== 1 ? 's' : ''} · {t.total_games} game{t.total_games !== 1 ? 's' : ''} · {playerStats.filter((p) => p.team_id === t.id).length} players
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Player table */}
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={15} color="#64748B" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Player breakdown</span>
              <span style={{ fontSize: '12px', color: '#94A3B8', background: '#F1F5F9', borderRadius: '20px', padding: '1px 8px' }}>{sortedPlayers.length}</span>
              {!hasGames && (
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
                  Playing time shows once game events exist
                </span>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={thSt} onClick={() => toggleSort('name')}>Player {sortBy === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                    {filterTeam === 'all' && <th style={thSt}>Team</th>}
                    {/* Attendance group */}
                    <th style={{ ...thSt, borderLeft: '1px solid #F1F5F9' }}>Events</th>
                    <th style={{ ...thSt, color: '#16A34A' }} onClick={() => toggleSort('attended')}>Going {sortBy === 'attended' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                    <th style={{ ...thSt, color: '#DC2626' }}>Out</th>
                    <th style={{ ...thSt, color: '#94A3B8' }}>Pending</th>
                    <th style={thSt} onClick={() => toggleSort('att_pct')}>Att % {sortBy === 'att_pct' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                    {/* Playing time group */}
                    {hasGames && <>
                      <th style={{ ...thSt, borderLeft: '2px solid #E2E8F0', color: '#7C3AED' }}>Games</th>
                      <th style={{ ...thSt, color: '#7C3AED' }} onClick={() => toggleSort('started')}>Started {sortBy === 'started' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                      <th style={{ ...thSt, color: '#7C3AED' }} onClick={() => toggleSort('playing_pct')}>Playing time {sortBy === 'playing_pct' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((p) => (
                    <tr key={p.id}>
                      <td style={tdSt}>
                        <div style={{ fontWeight: '600', color: '#0F172A' }}>{p.full_name}</div>
                        {(p.jersey_number != null || p.position) && (
                          <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                            {p.jersey_number != null ? `#${p.jersey_number}` : ''}{p.position ? ` · ${p.position}` : ''}
                          </div>
                        )}
                      </td>
                      {filterTeam === 'all' && <td style={{ ...tdSt, fontSize: '12px', color: '#64748B' }}>{p.team_name}</td>}
                      {/* Attendance */}
                      <td style={{ ...tdSt, borderLeft: '1px solid #F1F5F9', color: '#64748B' }}>{p.total_events}</td>
                      <td style={{ ...tdSt, fontWeight: '700', color: '#16A34A' }}>{p.attended}</td>
                      <td style={{ ...tdSt, color: '#DC2626' }}>{p.not_attending}</td>
                      <td style={{ ...tdSt, color: '#94A3B8' }}>{p.pending}</td>
                      <td style={tdSt}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '48px', height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ height: '100%', width: `${p.att_pct}%`, background: pctColor(p.att_pct), borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: pctColor(p.att_pct), background: pctBg(p.att_pct), borderRadius: '20px', padding: '2px 7px', minWidth: '38px', textAlign: 'center' }}>
                            {p.att_pct}%
                          </span>
                        </div>
                      </td>
                      {/* Playing time */}
                      {hasGames && <>
                        <td style={{ ...tdSt, borderLeft: '2px solid #F1F5F9', color: '#64748B' }}>
                          {p.games_attended}/{p.total_games}
                        </td>
                        <td style={{ ...tdSt, fontWeight: '700', color: '#7C3AED' }}>{p.games_started}</td>
                        <td style={tdSt}>
                          {p.playing_pct !== null ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '48px', height: '5px', background: '#F5F3FF', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
                                <div style={{ height: '100%', width: `${p.playing_pct}%`, background: '#7C3AED', borderRadius: '3px' }} />
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: '700', color: '#7C3AED', background: '#F5F3FF', borderRadius: '20px', padding: '2px 7px', minWidth: '38px', textAlign: 'center' }}>
                                {p.playing_pct}%
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#CBD5E1' }}>—</span>
                          )}
                        </td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {hasGames && (
            <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '10px', textAlign: 'right' }}>
              Player playing time % = games started ÷ games attended · Team playing time % = total starts across squad ÷ total game appearances
            </p>
          )}
        </>
      )}
    </div>
  );
}
