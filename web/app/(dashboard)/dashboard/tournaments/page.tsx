'use client';

import { useEffect, useState, useMemo } from 'react';
import { Medal, Trophy, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type TournamentRow = {
  id: string;
  name: string;
  team_id: string;
  start_date: string | null;
  end_date: string | null;
  cancelled_at: string | null;
};

type GameRow = { tournament_id: string; type: string; score_home: number | null; score_away: number | null; cancelled_at: string | null; event_date: string };
type EntryRsvpRow = { tournament_id: string; status: 'attending' | 'not_attending' };

type TournamentStats = TournamentRow & {
  team_name: string;
  games: number;
  wins: number; losses: number; draws: number;
  rsvpIn: number; rsvpOut: number;
  dateRangeLabel: string;
};

function fmtDateRange(start: string | null, end: string | null, games: GameRow[]): string {
  const dates = games.length > 0 ? games.map(g => g.event_date).sort() : [start, end].filter(Boolean) as string[];
  if (dates.length === 0) return 'Dates TBD';
  const first = dates[0], last = dates[dates.length - 1];
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

export default function TournamentsPage() {
  const { club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [rows, setRows] = useState<TournamentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'tournaments' | 'teams'>('tournaments');

  useEffect(() => {
    if (!teams.length) { setLoading(false); return; }
    (async () => {
      const teamIds = teams.map(t => t.id);
      const teamNameById = new Map(teams.map(t => [t.id, t.name]));

      const { data: tournaments } = await supabase
        .from('tournaments')
        .select('id, name, team_id, start_date, end_date, cancelled_at')
        .in('team_id', teamIds)
        .returns<TournamentRow[]>();

      if (!tournaments?.length) { setRows([]); setLoading(false); return; }

      const tournamentIds = tournaments.map(t => t.id);
      const [{ data: games }, { data: entryRsvps }] = await Promise.all([
        supabase.from('events')
          .select('tournament_id, type, score_home, score_away, cancelled_at, event_date')
          .in('tournament_id', tournamentIds)
          .returns<GameRow[]>(),
        supabase.from('tournament_rsvps').select('tournament_id, status').in('tournament_id', tournamentIds).returns<EntryRsvpRow[]>(),
      ]);

      const gamesByTournament = new Map<string, GameRow[]>();
      for (const g of games ?? []) {
        if (!gamesByTournament.has(g.tournament_id)) gamesByTournament.set(g.tournament_id, []);
        gamesByTournament.get(g.tournament_id)!.push(g);
      }
      const rsvpsByTournament = new Map<string, EntryRsvpRow[]>();
      for (const r of entryRsvps ?? []) {
        if (!rsvpsByTournament.has(r.tournament_id)) rsvpsByTournament.set(r.tournament_id, []);
        rsvpsByTournament.get(r.tournament_id)!.push(r);
      }

      const stats: TournamentStats[] = tournaments.map(t => {
        const tGames = gamesByTournament.get(t.id) ?? [];
        let wins = 0, losses = 0, draws = 0;
        for (const g of tGames) {
          if (g.cancelled_at || g.type !== 'game' || g.score_home == null || g.score_away == null) continue;
          if (g.score_home > g.score_away) wins++;
          else if (g.score_home < g.score_away) losses++;
          else draws++;
        }
        const tRsvps = rsvpsByTournament.get(t.id) ?? [];
        return {
          ...t,
          team_name: teamNameById.get(t.team_id) ?? 'Team',
          games: tGames.length,
          wins, losses, draws,
          rsvpIn: tRsvps.filter(r => r.status === 'attending').length,
          rsvpOut: tRsvps.filter(r => r.status === 'not_attending').length,
          dateRangeLabel: fmtDateRange(t.start_date, t.end_date, tGames),
        };
      });

      // Soonest-dated (or dateless/knockout) first, so what's most relevant to plan for shows up top.
      stats.sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'));
      setRows(stats);
      setLoading(false);
    })();
  }, [teams]);

  const totalGames = useMemo(() => rows.reduce((n, r) => n + r.games, 0), [rows]);

  // Every team, not just ones that already have a tournament — a team
  // with zero is exactly the case a DOC admin needs surfaced, and it'll
  // never appear by scanning the tournaments table alone.
  const teamRows = useMemo(() => {
    const byTeam = new Map<string, TournamentStats[]>();
    for (const r of rows) {
      if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, []);
      byTeam.get(r.team_id)!.push(r);
    }
    return teams
      .map(t => ({ team: t, tournaments: (byTeam.get(t.id) ?? []).sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999')) }))
      .sort((a, b) => {
        if (a.tournaments.length === 0 && b.tournaments.length > 0) return -1;
        if (b.tournaments.length === 0 && a.tournaments.length > 0) return 1;
        return a.team.name.localeCompare(b.team.name);
      });
  }, [teams, rows]);
  const teamsMissing = teamRows.filter(t => t.tournaments.length === 0).length;

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Club</div>
        <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Tournaments</h1>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '20px' }}>
          {view === 'tournaments' ? (
            <>
              <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#FEF9C3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Medal size={20} color="#CA8A04" />
                </div>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: '900', color: '#CA8A04', lineHeight: 1 }}>{rows.length}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Across every team</div>
                </div>
              </div>
              <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trophy size={20} color={primary} />
                </div>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: '900', color: primary, lineHeight: 1 }}>{totalGames}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Tournament games total</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: teamsMissing > 0 ? '#FEF2F2' : '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={20} color={teamsMissing > 0 ? '#DC2626' : '#16A34A'} />
                </div>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: '900', color: teamsMissing > 0 ? '#DC2626' : '#16A34A', lineHeight: 1 }}>{teamsMissing}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Teams with no tournament yet</div>
                </div>
              </div>
              <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Medal size={20} color={primary} />
                </div>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: '900', color: primary, lineHeight: 1 }}>{teamRows.length - teamsMissing}/{teamRows.length}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Teams with at least one</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px', gap: '2px', width: 'fit-content', marginBottom: '16px' }}>
          {(['tournaments', 'teams'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: '700', fontFamily: 'inherit', background: view === v ? '#fff' : 'transparent', color: view === v ? primary : '#64748B', boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
              {v === 'tournaments' ? 'By Tournament' : 'By Team'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            {[1, 2, 3].map((i, idx) => (
              <div key={i} style={{ padding: '14px 20px', borderBottom: idx < 2 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ height: '36px', borderRadius: '8px', background: '#F1F5F9' }} />
              </div>
            ))}
          </div>
        ) : view === 'tournaments' ? (
          rows.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Medal size={26} color="#94A3B8" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No tournaments yet</div>
              <div style={{ fontSize: '13px', color: '#64748B' }}>
                Coaches create tournaments from the mobile app — they'll show up here across every team once they do.
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 130px 110px', padding: '10px 20px', background: '#0F172A' }}>
                {['Tournament', 'Team', 'Dates', 'Entry RSVP', 'Record'].map((label) => (
                  <div key={label} style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                    {label}
                  </div>
                ))}
              </div>

              {rows.map((r, idx) => (
                <div
                  key={r.id}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 130px 110px', padding: '13px 20px', borderBottom: idx < rows.length - 1 ? '1px solid #F1F5F9' : 'none', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#FEF9C3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '16px' }}>
                      🏆
                    </div>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                      {r.cancelled_at && (
                        <span style={{ fontSize: '10px', fontWeight: '800', color: '#DC2626', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '6px', padding: '2px 6px', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          Cancelled
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.team_name}</div>

                  <div style={{ fontSize: '13px', color: (r.start_date || r.games > 0) ? '#0F172A' : '#94A3B8' }}>
                    {r.dateRangeLabel}
                  </div>

                  <div style={{ fontSize: '12.5px' }}>
                    {(r.rsvpIn + r.rsvpOut) > 0
                      ? <span><span style={{ color: '#16A34A', fontWeight: '700' }}>{r.rsvpIn} in</span>{r.rsvpOut > 0 && <span style={{ color: '#DC2626', fontWeight: '700' }}> · {r.rsvpOut} out</span>}</span>
                      : <span style={{ color: '#CBD5E1' }}>—</span>}
                  </div>

                  <div style={{ fontSize: '13px' }}>
                    {r.games > 0
                      ? <span style={{ fontWeight: '700', color: '#0F172A' }}>{r.wins}-{r.losses}-{r.draws}</span>
                      : <span style={{ color: '#CBD5E1' }}>—</span>}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : teamRows.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Medal size={26} color="#94A3B8" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No teams yet</div>
            <div style={{ fontSize: '13px', color: '#64748B' }}>Add teams on the Teams page first.</div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', padding: '10px 20px', background: '#0F172A' }}>
              {['Team', 'Age', 'Tournaments'].map((label) => (
                <div key={label} style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  {label}
                </div>
              ))}
            </div>

            {teamRows.map(({ team, tournaments: tTournaments }, idx) => (
              <div key={team.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', padding: '13px 20px', borderBottom: idx < teamRows.length - 1 ? '1px solid #F1F5F9' : 'none', alignItems: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {team.name}
                </div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', background: '#F1F5F9', borderRadius: '4px', padding: '3px 8px', display: 'inline-block', width: 'fit-content' }}>
                  {team.age_group ?? '—'}
                </div>
                <div>
                  {tTournaments.length === 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '700', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '5px', padding: '3px 9px' }}>
                      <AlertTriangle size={11} /> No tournament yet
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {tTournaments.map(t => (
                        <span key={t.id} title={t.dateRangeLabel}
                          style={{ fontSize: '12px', fontWeight: '600', color: t.cancelled_at ? '#94A3B8' : '#0F172A', background: t.cancelled_at ? '#F1F5F9' : '#FEF9C3', textDecoration: t.cancelled_at ? 'line-through' : 'none', borderRadius: '5px', padding: '3px 9px' }}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
