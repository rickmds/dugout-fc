'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { FlipBoard } from '@/components/FlipBoard';
import { calcAgeGroup, seasonLabelToYear, seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Users, Target, CheckCircle, XCircle, Clock, AlertTriangle, ArrowRight } from 'lucide-react';

type Player = { id: string; date_of_birth: string | null; gender: string | null; final_age_group: string | null };
type Assignment = { player_id: string; team: string | null; status: string; offer_status: string };
type TryoutTeam = { id: string; name: string; color: string; age_group: string | null; gender: string | null };
type Ranking = { player_id: string; tryout_rank: number | null; tryout_status: string | null };

type AgGroupStats = {
  ag: string;
  male: { pool: number; placed: number; accepted: number; declined: number; cut: number; total: number };
  female: { pool: number; placed: number; accepted: number; declined: number; cut: number; total: number };
};

function empty() { return { pool: 0, placed: 0, accepted: 0, declined: 0, cut: 0, total: 0 }; }

export default function TryoutOverviewPage() {
  const { club } = useDashboard();
  const [season, setSeason] = useState(() => seasonOptions()[1] ?? '2026-27');
  const [players, setPlayers] = useState<Player[]>([]);
  const [assigns, setAssigns] = useState<Map<string, Assignment>>(new Map());
  const [teams, setTeams] = useState<TryoutTeam[]>([]);
  const [rankings, setRankings] = useState<Map<string, Ranking>>(new Map());
  const [loading, setLoading] = useState(true);
  const seasonYear = seasonLabelToYear(season);

  useEffect(() => {
    if (!club) return;
    Promise.all([
      supabase.from('tryout_players').select('id,date_of_birth,gender,final_age_group').eq('club_id', club.id),
      supabase.from('tryout_assignments').select('player_id,team,status,offer_status').eq('club_id', club.id),
      supabase.from('tryout_teams').select('id,name,color,age_group,gender').eq('club_id', club.id).eq('is_active', true),
      supabase.from('tryout_rankings').select('player_id,tryout_rank,tryout_status').eq('club_id', club.id),
    ]).then(([{ data: ps }, { data: asgn }, { data: ts }, { data: rnk }]) => {
      setPlayers((ps ?? []) as Player[]);
      setAssigns(new Map(((asgn ?? []) as Assignment[]).map(a => [a.player_id, a])));
      setTeams((ts ?? []) as TryoutTeam[]);
      setRankings(new Map(((rnk ?? []) as Ranking[]).map(r => [r.player_id, r])));
      setLoading(false);
    });
  }, [club]);

  const getAg = (p: Player) => p.final_age_group || (p.date_of_birth ? calcAgeGroup(p.date_of_birth, seasonYear) : 'Unknown');

  const agStats: Record<string, AgGroupStats> = {};
  for (const p of players) {
    const ag = getAg(p);
    if (!agStats[ag]) agStats[ag] = { ag, male: empty(), female: empty() };
    const g = p.gender === 'Female' ? 'female' : 'male';
    const s = agStats[ag][g];
    s.total++;
    const a = assigns.get(p.id);
    const team = a?.team;
    if (!team || team === 'Unassigned') s.pool++;
    else if (team === 'Cut') s.cut++;
    else if (team === 'Declined') s.declined++;
    else {
      s.placed++;
      if (a?.offer_status === 'Accepted') s.accepted++;
    }
  }

  const sortedAgs = AGE_GROUPS.filter(ag => agStats[ag]);
  const totalPlayers = players.length;
  const totalPlaced = players.filter(p => { const t = assigns.get(p.id)?.team; return t && !['Unassigned','Cut','Declined',null].includes(t); }).length;
  const totalAccepted = players.filter(p => assigns.get(p.id)?.offer_status === 'Accepted').length;
  const totalCut = players.filter(p => assigns.get(p.id)?.team === 'Cut').length;
  const totalPool = players.filter(p => { const t = assigns.get(p.id)?.team; return !t || t === 'Unassigned'; }).length;
  const ntrCount = [...rankings.values()].filter(r => r.tryout_status === 'NTR').length;

  // Auto-detect current phase
  const unrankedCount = players.filter(p => !rankings.get(p.id)?.tryout_rank).length;
  const offerNotSentCount = players.filter(p => {
    const a = assigns.get(p.id);
    return a?.team && !['Unassigned','Cut','Declined',null].includes(a.team) && (!a.offer_status || a.offer_status === 'NotSent');
  }).length;
  const allResponded = players.length > 0 && players.every(p => {
    const os = assigns.get(p.id)?.offer_status;
    return ['Accepted','Declined'].includes(os ?? '') || ['Cut','Declined','Unassigned'].includes(assigns.get(p.id)?.team ?? '');
  });

  const currentPhase =
    teams.length === 0 ? 0 :
    players.length === 0 ? 1 :
    unrankedCount > players.length * 0.4 ? 2 :
    totalPool > 0 ? 3 :
    offerNotSentCount > 0 ? 4 :
    allResponded ? 5 : 4;

  const PHASES = [
    { label: 'Setup',       sub: 'Configure teams, form & offers',     href: '/dashboard/tryouts/settings/teams', cta: 'Go to Setup' },
    { label: 'Registration', sub: 'Players registering via form',       href: '/dashboard/tryouts/players',        cta: 'View Players' },
    { label: 'Evaluation',  sub: 'Import scores from coaches',          href: '/dashboard/tryouts/players',        cta: 'Import Rankings' },
    { label: 'Placement',   sub: 'Drag players into teams',             href: '/dashboard/tryouts/builder',        cta: 'Open Builder' },
    { label: 'Offers',      sub: 'Send offers & track responses',       href: '/dashboard/tryouts/rosters',        cta: 'Go to Rosters' },
    { label: 'Done',        sub: 'All offers accepted or declined',     href: '/dashboard/tryouts',                cta: 'View Report' },
  ];

  const teamAcceptance = teams.map(t => {
    const inTeam = players.filter(p => assigns.get(p.id)?.team === t.name);
    const accepted = inTeam.filter(p => assigns.get(p.id)?.offer_status === 'Accepted').length;
    const sent = inTeam.filter(p => ['Sent','Accepted','Declined'].includes(assigns.get(p.id)?.offer_status ?? '')).length;
    return { ...t, count: inTeam.length, accepted, sent };
  }).filter(t => t.count > 0);

  const StatCard = ({ label, val, icon, color }: { label: string; val: number | string; icon: React.ReactNode; color: string }) => (
    <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
      <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${color}12`, border: `1.5px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: '30px', fontWeight: '900', color: '#0F172A', lineHeight: 1, letterSpacing: '-0.02em' }}>{val}</div>
        <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      </div>
    </div>
  );

  if (loading) return (
    <FlipBoard title="Loading tryout overview…" rows={[
      { label: 'Prospects', pad: 3 },
      { label: 'Teams',     pad: 2 },
      { label: 'Games',     pad: 2 },
      { label: 'Coaches',   pad: 2 },
    ]} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#F0F2F5' }}>
      {/* Page header */}
      <div style={{ padding: '14px 32px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Tryout Module</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: '2px 0 0', letterSpacing: '-0.5px' }}>Overview — {season}</h1>
        </div>
        <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '7px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
          {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

        {/* Phase tracker */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px 24px', marginBottom: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '20px' }}>Tryout Progress</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', position: 'relative' }}>
            {PHASES.map((phase, i) => {
              const isDone    = i < currentPhase;
              const isCurrent = i === currentPhase;
              const dotSize   = isCurrent ? 36 : 28;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flex: i < PHASES.length - 1 ? '1' : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: isCurrent ? '96px' : '72px' }}>
                    <div style={{
                      width: `${dotSize}px`, height: `${dotSize}px`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? '#22C55E' : isCurrent ? '#3B82F6' : '#F1F5F9',
                      border: `2px solid ${isDone ? '#22C55E' : isCurrent ? '#3B82F6' : '#E2E8F0'}`,
                      flexShrink: 0,
                    }}>
                      {isDone
                        ? <CheckCircle size={isCurrent ? 18 : 14} color="#fff" />
                        : <span style={{ fontSize: isCurrent ? '14px' : '11px', fontWeight: '800', color: isCurrent ? '#fff' : '#CBD5E1' }}>{i + 1}</span>
                      }
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: isCurrent ? '800' : '600', color: isCurrent ? '#0F172A' : isDone ? '#64748B' : '#94A3B8' }}>{phase.label}</div>
                      {isCurrent && <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px', whiteSpace: 'nowrap' }}>{phase.sub}</div>}
                    </div>
                  </div>
                  {i < PHASES.length - 1 && (
                    <div style={{ flex: 1, height: '2px', background: isDone ? '#22C55E' : '#E2E8F0', alignSelf: 'flex-start', marginTop: '18px', margin: '18px 4px 0' }} />
                  )}
                </div>
              );
            })}
          </div>
          {currentPhase < 5 && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#64748B' }}>
                <strong style={{ color: '#0F172A' }}>Next:</strong> {PHASES[currentPhase].sub}
              </span>
              <a href={PHASES[currentPhase].href} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '6px', background: '#3B82F6', color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: '700' }}>
                {PHASES[currentPhase].cta} <ArrowRight size={14} />
              </a>
            </div>
          )}
        </div>

        {ntrCount > 0 && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderLeft: '4px solid #D97706', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} color="#D97706" />
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#92400E' }}>{ntrCount} player{ntrCount !== 1 ? 's' : ''} flagged NTR — review in Player Pool before sending offers.</span>
          </div>
        )}

        {/* Top stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
          <StatCard label="Total Players" val={totalPlayers} icon={<Users size={20} color="#6366F1" />} color="#6366F1" />
          <StatCard label="In Pool" val={totalPool} icon={<Clock size={20} color="#94A3B8" />} color="#94A3B8" />
          <StatCard label="Placed in Teams" val={totalPlaced} icon={<Target size={20} color="#3B82F6" />} color="#3B82F6" />
          <StatCard label="Accepted Offers" val={totalAccepted} icon={<CheckCircle size={20} color="#22C55E" />} color="#22C55E" />
          <StatCard label="Cut" val={totalCut} icon={<XCircle size={20} color="#EF4444" />} color="#EF4444" />
        </div>

        {/* Age group breakdown */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '24px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>Placement by Age Group</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#0F172A' }}>
                  {['Age Group','Gender','Total','In Pool','Placed','Accepted','Cut','Progress'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px', borderBottom: 'none', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sortedAgs.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No players yet — add players in the Player Pool to see stats here.</td></tr>
                ) : sortedAgs.flatMap((ag, agIdx) => {
                  const s = agStats[ag];
                  const rows = [];
                  for (const [gLabel, gData] of [['Male', s.male], ['Female', s.female]] as ['Male'|'Female', typeof s.male][]) {
                    if (gData.total === 0) continue;
                    const pct = gData.total > 0 ? Math.round((gData.accepted / gData.total) * 100) : 0;
                    const isEvenRow = agIdx % 2 === 0;
                    rows.push(<tr key={`${ag}-${gLabel}`} style={{ borderBottom: '1px solid #F1F5F9', background: isEvenRow ? '#fff' : '#FAFBFC' }}>
                      <td style={{ padding: '11px 16px', fontWeight: '700', color: '#0F172A' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isEvenRow ? '#6366F1' : '#3B82F6', display: 'inline-block', flexShrink: 0 }} />
                          {ag}
                        </span>
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', background: gLabel === 'Male' ? '#EFF6FF' : '#FDF2F8', color: gLabel === 'Male' ? '#2563EB' : '#DB2777' }}>{gLabel === 'Male' ? '♂' : '♀'} {gLabel}</span>
                      </td>
                      <td style={{ padding: '11px 16px', color: '#0F172A', fontWeight: '700' }}>{gData.total}</td>
                      <td style={{ padding: '11px 16px', color: '#94A3B8' }}>{gData.pool}</td>
                      <td style={{ padding: '11px 16px' }}><span style={{ color: '#3B82F6', fontWeight: '700' }}>{gData.placed}</span></td>
                      <td style={{ padding: '11px 16px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#15803D', fontWeight: '700' }}>{gData.accepted > 0 && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />}{gData.accepted}</span></td>
                      <td style={{ padding: '11px 16px' }}><span style={{ color: gData.cut > 0 ? '#EF4444' : '#CBD5E1', fontWeight: gData.cut > 0 ? '700' : '400' }}>{gData.cut}</span></td>
                      <td style={{ padding: '11px 16px', minWidth: '130px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22C55E' : '#3B82F6', borderRadius: '4px' }} />
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B', minWidth: '32px' }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>);
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Team acceptance tracker */}
        {teamAcceptance.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>Team Roster Acceptance</span>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
              {teamAcceptance.map(t => {
                const pct = t.count > 0 ? Math.round((t.accepted / t.count) * 100) : 0;
                return (
                  <div key={t.id} style={{ minWidth: '200px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', borderLeft: `6px solid ${t.color}`, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{t.name}</span>
                      {t.age_group && <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>{t.age_group}</span>}
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: '900', color: '#0F172A', lineHeight: 1, marginBottom: '4px' }}>
                      {t.accepted} <span style={{ fontSize: '14px', fontWeight: '600', color: '#94A3B8' }}>/ {t.count}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600', marginBottom: '10px' }}>
                      accepted
                      {t.sent > t.accepted && <span style={{ marginLeft: '6px', color: '#3B82F6' }}>· {t.sent - t.accepted} pending</span>}
                    </div>
                    <div style={{ height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: t.color, borderRadius: '3px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
