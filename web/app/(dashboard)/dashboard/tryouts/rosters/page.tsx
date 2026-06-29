'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { calcAgeGroup, seasonLabelToYear, seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Send, CheckCircle, XCircle, Clock, Lock, ChevronDown } from 'lucide-react';

type Player = { id: string; first_name: string; last_name: string; dob: string | null; grade: string | null; gender: string | null; final_age_group: string | null; positions: string[] | null; email_primary: string | null };
type Assignment = { player_id: string; team: string | null; status: string; offer_status: string };
type TryoutTeam = { id: string; name: string; color: string; age_group: string | null; gender: string | null; format: string | null; roster_locked: boolean; head_coach_id: string | null };
type CoachMap = Record<string, string>;

const OFFER_STATUS_BADGE: Record<string, { bg: string; color: string; icon?: React.ReactNode }> = {
  NotSent: { bg: '#F1F5F9', color: '#94A3B8' },
  Sent:     { bg: '#EFF6FF', color: '#2563EB' },
  Accepted: { bg: '#F0FDF4', color: '#16A34A' },
  Declined: { bg: '#FEF2F2', color: '#DC2626' },
};

export default function TryoutRostersPage() {
  const { club } = useDashboard();
  const [season, setSeason] = useState(() => seasonOptions()[1] ?? '2026-27');
  const [players, setPlayers] = useState<Player[]>([]);
  const [assigns, setAssigns] = useState<Map<string, Assignment>>(new Map());
  const [teams, setTeams] = useState<TryoutTeam[]>([]);
  const [coaches, setCoaches] = useState<CoachMap>({});
  const [loading, setLoading] = useState(true);
  const [filterAg, setFilterAg] = useState('All');
  const [filterGender, setFG] = useState('All');
  const [sendingId, setSendId] = useState<string | null>(null);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const seasonYear = seasonLabelToYear(season);

  const getAg = (p: Player) => p.final_age_group || (p.dob ? calcAgeGroup(p.dob, seasonYear) : 'Unknown');

  async function load() {
    if (!club) return;
    const [{ data: ps }, { data: asgn }, { data: ts }, { data: cs }] = await Promise.all([
      supabase.from('tryout_players').select('id,first_name,last_name,dob,grade,gender,final_age_group,positions,email_primary').eq('club_id', club.id),
      supabase.from('tryout_assignments').select('player_id,team,status,offer_status').eq('club_id', club.id),
      supabase.from('tryout_teams').select('*').eq('club_id', club.id).eq('is_active', true).order('sort_order').order('name'),
      supabase.from('tryout_coaches').select('id,full_name').eq('club_id', club.id),
    ]);
    setPlayers((ps ?? []) as Player[]);
    setAssigns(new Map(((asgn ?? []) as Assignment[]).map(a => [a.player_id, a])));
    setTeams((ts ?? []) as TryoutTeam[]);
    setCoaches(Object.fromEntries(((cs ?? []) as { id: string; full_name: string }[]).map(c => [c.id, c.full_name])));
    setLoading(false);
  }
  useEffect(() => { load(); }, [club]);

  async function sendOffer(pid: string) {
    if (!club) return;
    setSending(prev => ({ ...prev, [pid]: true }));
    try {
      await fetch('/api/tryout/send-offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_id: pid, club_id: club.id }) });
      setAssigns(prev => { const next = new Map(prev); const ex = next.get(pid); if (ex) next.set(pid, { ...ex, offer_status: 'Sent' }); return next; });
    } finally { setSending(prev => ({ ...prev, [pid]: false })); }
  }

  async function sendAllOffers(teamName: string, playerIds: string[]) {
    if (!club) return;
    setSendId(teamName);
    for (const pid of playerIds) {
      const a = assigns.get(pid);
      if (a?.offer_status === 'NotSent' || !a?.offer_status) {
        await sendOffer(pid);
      }
    }
    setSendId(null);
  }

  // Group players by team
  const teamPlayerMap: Record<string, Player[]> = {};
  for (const p of players) {
    const a = assigns.get(p.id);
    const teamName = a?.team;
    if (!teamName || ['Unassigned','Cut','Declined'].includes(teamName)) continue;
    if (!teamPlayerMap[teamName]) teamPlayerMap[teamName] = [];
    teamPlayerMap[teamName].push(p);
  }

  // Filter teams
  const filteredTeams = teams.filter(t => {
    if (filterAg !== 'All' && t.age_group !== filterAg) return false;
    if (filterGender !== 'All' && t.gender !== filterGender) return false;
    return true;
  });

  const ageGroupsWithTeams = [...new Set(teams.map(t => t.age_group).filter(Boolean))].sort((a, b) => AGE_GROUPS.indexOf(a!) - AGE_GROUPS.indexOf(b!)) as string[];

  const OfferIcon = ({ status }: { status: string }) => {
    if (status === 'Accepted') return <CheckCircle size={13} color="#22C55E" />;
    if (status === 'Declined') return <XCircle size={13} color="#EF4444" />;
    if (status === 'Sent') return <Clock size={13} color="#3B82F6" />;
    return null;
  };

  if (loading) return <div style={{ padding: '40px', color: '#94A3B8' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tryout Module · {season}</div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: '2px 0 0' }}>Rosters</h1>
          </div>
          <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
            {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {['All', ...ageGroupsWithTeams].map(ag => (
            <button key={ag} onClick={() => setFilterAg(ag)} style={{ padding: '4px 11px', borderRadius: '6px', border: 'none', background: filterAg === ag ? '#0F172A' : '#F1F5F9', color: filterAg === ag ? '#fff' : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{ag}</button>
          ))}
          <div style={{ marginLeft: '8px', display: 'flex', gap: '4px' }}>
            {['All','Male','Female'].map(g => (
              <button key={g} onClick={() => setFG(g)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid', borderColor: filterGender === g ? '#22C55E' : '#E2E8F0', background: filterGender === g ? '#F0FDF4' : '#fff', color: filterGender === g ? '#16A34A' : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{g}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {filteredTeams.length === 0 && <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>No teams match filter.</div>}
        {filteredTeams.map(team => {
          const teamPlayers = (teamPlayerMap[team.name] ?? []).sort((a, b) => a.last_name.localeCompare(b.last_name));
          const accepted = teamPlayers.filter(p => assigns.get(p.id)?.offer_status === 'Accepted').length;
          const tbd = teamPlayers.filter(p => { const os = assigns.get(p.id)?.offer_status; return !os || os === 'NotSent'; }).length;
          const coachName = team.head_coach_id ? coaches[team.head_coach_id] : null;

          return (
            <div key={team.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', marginBottom: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              {/* Team header */}
              <div style={{ background: team.color, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#fff' }}>{team.name}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', marginTop: '1px' }}>
                    {[team.age_group, team.gender, team.format, coachName && `Coach: ${coachName}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{accepted}/{teamPlayers.length}</div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>accepted</div>
                  </div>
                  {team.roster_locked && <Lock size={14} color="rgba(255,255,255,0.7)" />}
                  {!team.roster_locked && tbd > 0 && (
                    <button onClick={() => sendAllOffers(team.name, teamPlayers.map(p => p.id))} disabled={sendingId === team.name}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '7px', padding: '5px 10px', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer' }}>
                      <Send size={11} />{sendingId === team.name ? 'Sending…' : `Send All Offers (${tbd})`}
                    </button>
                  )}
                </div>
              </div>

              {/* Roster table */}
              {teamPlayers.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#CBD5E1', fontSize: '12.5px' }}>No players assigned to this team yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['#','Name','Age Group','Grade','Positions','Email','Offer Status',''].map(h => <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {teamPlayers.map((p, i) => {
                      const a = assigns.get(p.id);
                      const offerStatus = a?.offer_status ?? 'NotSent';
                      const badge = OFFER_STATUS_BADGE[offerStatus] ?? OFFER_STATUS_BADGE.NotSent;
                      const canSend = offerStatus === 'NotSent' && !team.roster_locked;
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #F8FAFC', background: offerStatus === 'Accepted' ? '#F0FDF4' : offerStatus === 'Declined' ? '#FEF2F2' : '#fff' }}>
                          <td style={{ padding: '8px 12px', color: '#94A3B8', fontSize: '11px', fontWeight: '700' }}>{i + 1}</td>
                          <td style={{ padding: '8px 12px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap' }}>{p.first_name} {p.last_name}</td>
                          <td style={{ padding: '8px 12px' }}><span style={{ fontSize: '11px', background: '#EFF6FF', color: '#2563EB', borderRadius: '4px', padding: '2px 7px', fontWeight: '700' }}>{getAg(p)}</span></td>
                          <td style={{ padding: '8px 12px', color: '#64748B' }}>{p.grade ?? '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#64748B', fontSize: '12px' }}>{p.positions?.join(', ') ?? '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#94A3B8', fontSize: '11.5px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email_primary ?? '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: '600', background: badge.bg, color: badge.color, borderRadius: '5px', padding: '2px 8px' }}>
                              <OfferIcon status={offerStatus} />{offerStatus}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {canSend && (
                              <button onClick={() => sendOffer(p.id)} disabled={sending[p.id]}
                                style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontWeight: '600' }}>
                                <Send size={10} />{sending[p.id] ? '…' : 'Offer'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
