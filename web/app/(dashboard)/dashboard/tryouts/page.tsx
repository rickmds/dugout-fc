'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { calcAgeGroup, seasonLabelToYear, seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Users, Target, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

type Player = { id: string; dob: string | null; gender: string | null; final_age_group: string | null };
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
      supabase.from('tryout_players').select('id,dob,gender,final_age_group').eq('club_id', club.id),
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

  const getAg = (p: Player) => p.final_age_group || (p.dob ? calcAgeGroup(p.dob, seasonYear) : 'Unknown');

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

  const teamAcceptance = teams.map(t => {
    const inTeam = players.filter(p => assigns.get(p.id)?.team === t.name);
    const accepted = inTeam.filter(p => assigns.get(p.id)?.offer_status === 'Accepted').length;
    const sent = inTeam.filter(p => ['Sent','Accepted','Declined'].includes(assigns.get(p.id)?.offer_status ?? '')).length;
    return { ...t, count: inTeam.length, accepted, sent };
  }).filter(t => t.count > 0);

  const StatCard = ({ label, val, icon, color }: { label: string; val: number | string; icon: React.ReactNode; color: string }) => (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{val}</div>
        <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: '600', marginTop: '2px' }}>{label}</div>
      </div>
    </div>
  );

  if (loading) return <div style={{ padding: '40px', color: '#94A3B8' }}>Loading…</div>;

  return (
    <div style={{ padding: '24px 28px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tryout Module</div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: '2px 0 0' }}>Overview — {season}</h1>
        </div>
        <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '7px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
          {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {ntrCount > 0 && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '10px', padding: '10px 14px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={16} color="#D97706" />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#92400E' }}>{ntrCount} player{ntrCount !== 1 ? 's' : ''} flagged NTR — review in Player Pool before sending offers.</span>
        </div>
      )}

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
        <StatCard label="Total Players" val={totalPlayers} icon={<Users size={18} color="#6366F1" />} color="#6366F1" />
        <StatCard label="In Pool" val={totalPool} icon={<Clock size={18} color="#94A3B8" />} color="#94A3B8" />
        <StatCard label="Placed in Teams" val={totalPlaced} icon={<Target size={18} color="#3B82F6" />} color="#3B82F6" />
        <StatCard label="Accepted Offers" val={totalAccepted} icon={<CheckCircle size={18} color="#22C55E" />} color="#22C55E" />
        <StatCard label="Cut" val={totalCut} icon={<XCircle size={18} color="#EF4444" />} color="#EF4444" />
      </div>

      {/* Age group breakdown */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', marginBottom: '24px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>Placement by Age Group</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Age Group','Gender','Total','In Pool','Placed','Accepted','Cut','Progress'].map(h => <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sortedAgs.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>No players yet.</td></tr>
              ) : sortedAgs.flatMap(ag => {
                const s = agStats[ag];
                const rows = [];
                for (const [gLabel, gData] of [['Male', s.male], ['Female', s.female]] as ['Male'|'Female', typeof s.male][]) {
                  if (gData.total === 0) continue;
                  const pct = gData.total > 0 ? Math.round((gData.accepted / gData.total) * 100) : 0;
                  rows.push(<tr key={`${ag}-${gLabel}`} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td style={{ padding: '9px 14px', fontWeight: '700', color: '#0F172A' }}>{ag}</td>
                    <td style={{ padding: '9px 14px', color: '#64748B' }}>{gLabel}</td>
                    <td style={{ padding: '9px 14px', color: '#0F172A', fontWeight: '600' }}>{gData.total}</td>
                    <td style={{ padding: '9px 14px', color: '#94A3B8' }}>{gData.pool}</td>
                    <td style={{ padding: '9px 14px', color: '#3B82F6', fontWeight: '600' }}>{gData.placed}</td>
                    <td style={{ padding: '9px 14px', color: '#22C55E', fontWeight: '700' }}>{gData.accepted}</td>
                    <td style={{ padding: '9px 14px', color: '#EF4444' }}>{gData.cut}</td>
                    <td style={{ padding: '9px 14px', minWidth: '120px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#22C55E' : '#3B82F6', borderRadius: '3px' }} />
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
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>Team Roster Acceptance</span>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {teamAcceptance.map(t => {
              const pct = t.count > 0 ? Math.round((t.accepted / t.count) * 100) : 0;
              return (
                <div key={t.id} style={{ minWidth: '180px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A' }}>{t.name}</span>
                    {t.age_group && <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>{t.age_group}</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '700', color: '#22C55E' }}>{t.accepted}</span> accepted / {t.count} placed
                    {t.sent > t.accepted && <span style={{ marginLeft: '6px', color: '#3B82F6' }}>({t.sent - t.accepted} pending)</span>}
                  </div>
                  <div style={{ height: '5px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: t.color, borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
