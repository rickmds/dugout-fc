'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { FlipBoard } from '@/components/FlipBoard';
import { calcAgeGroup, seasonLabelToYear, seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { CheckCircle, XCircle, Clock, Lock, Send, ChevronDown, ChevronUp, Users } from 'lucide-react';

type Player = { id: string; first_name: string; last_name: string; date_of_birth: string | null; grade: string | null; gender: string | null; final_age_group: string | null; positions: string[] | null; email_primary: string | null };
type Assignment = { player_id: string; team: string | null; status: string; offer_status: string };
type TryoutTeam = { id: string; name: string; color: string; age_group: string | null; gender: string | null; format: string | null; roster_locked: boolean; head_coach_id: string | null };
type CoachMap = Record<string, string>;

export default function TryoutRostersPage() {
  const { club } = useDashboard();
  const [season, setSeason]         = useState(() => seasonOptions()[1] ?? '2026-27');
  const [players, setPlayers]       = useState<Player[]>([]);
  const [assigns, setAssigns]       = useState<Map<string, Assignment>>(new Map());
  const [teams, setTeams]           = useState<TryoutTeam[]>([]);
  const [coaches, setCoaches]       = useState<CoachMap>({});
  const [loading, setLoading]       = useState(true);
  const [filterAg, setFilterAg]     = useState('All');
  const [filterGender, setFG]       = useState('All');
  const [filterTeam, setFilterTeam] = useState('All');
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [sending, setSending]       = useState<Record<string, boolean>>({});
  const seasonYear = seasonLabelToYear(season);

  const getAg = (p: Player) =>
    p.final_age_group || (p.date_of_birth ? calcAgeGroup(p.date_of_birth, seasonYear) : 'Unknown');

  async function load() {
    if (!club) return;
    const [{ data: ps }, { data: asgn }, { data: ts }, { data: cs }] = await Promise.all([
      supabase.from('tryout_players').select('id,first_name,last_name,date_of_birth,grade,gender,final_age_group,positions,email_primary').eq('club_id', club.id),
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

  function toggleExpanded(teamId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      return next;
    });
  }

  async function sendOffer(pid: string) {
    if (!club) return;
    setSending(prev => ({ ...prev, [pid]: true }));
    try {
      await fetch('/api/tryout/send-offer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: pid, club_id: club.id }),
      });
      setAssigns(prev => {
        const next = new Map(prev);
        const ex = next.get(pid);
        if (ex) next.set(pid, { ...ex, offer_status: 'Sent' });
        return next;
      });
    } finally { setSending(prev => ({ ...prev, [pid]: false })); }
  }

  async function sendAllForTeam(playerIds: string[]) {
    for (const pid of playerIds) {
      const os = assigns.get(pid)?.offer_status;
      if (!os || os === 'NotSent') await sendOffer(pid);
    }
  }

  // Build team → sorted player list (placed players only)
  const teamPlayerMap: Record<string, Player[]> = {};
  for (const p of players) {
    const teamName = assigns.get(p.id)?.team;
    if (!teamName || ['Unassigned', 'Cut', 'Declined'].includes(teamName)) continue;
    if (!teamPlayerMap[teamName]) teamPlayerMap[teamName] = [];
    teamPlayerMap[teamName].push(p);
  }

  const activeAgs = AGE_GROUPS.filter(ag =>
    teams.some(t => t.age_group === ag && (teamPlayerMap[t.name]?.length ?? 0) > 0)
  );
  const allTeamNames = [...new Set(
    teams.filter(t => (teamPlayerMap[t.name]?.length ?? 0) > 0).map(t => t.name)
  )].sort();

  function agTotal(ag: string) {
    return teams.filter(t => t.age_group === ag)
      .reduce((s, t) => s + (teamPlayerMap[t.name]?.length ?? 0), 0);
  }

  function teamsForSection(ag: string, gender: string) {
    return teams.filter(t => {
      if (t.age_group !== ag) return false;
      if ((t.gender ?? 'Male') !== gender) return false;
      if (filterTeam !== 'All' && t.name !== filterTeam) return false;
      return (teamPlayerMap[t.name]?.length ?? 0) > 0;
    });
  }

  if (loading) return (
    <FlipBoard title="Loading rosters…" rows={[
      { label: 'Prospects', pad: 3 },
      { label: 'Teams',     pad: 2 },
      { label: 'Offers',    pad: 2 },
      { label: 'Accepted',  pad: 2 },
    ]} />
  );

  const filteredAgs = filterAg === 'All' ? activeAgs : activeAgs.filter(ag => ag === filterAg);
  const genders = filterGender === 'All' ? ['Male', 'Female'] : [filterGender];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#F0F2F5' }}>

      {/* ── HEADER ── */}
      <div style={{ padding: '14px 32px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Tryout Module · {season}</div>
            <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: '2px 0 0', letterSpacing: '-0.5px' }}>Rosters</h1>
          </div>
          <select value={season} onChange={e => setSeason(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
            {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterGroup label="AGE">
            {['All', ...activeAgs].map(ag => (
              <Chip key={ag} active={filterAg === ag} onClick={() => setFilterAg(ag)}>{ag}</Chip>
            ))}
          </FilterGroup>

          <div style={{ width: '1px', height: '20px', background: '#E2E8F0' }} />

          <FilterGroup label="GENDER">
            <Chip active={filterGender === 'All'} onClick={() => setFG('All')}>All</Chip>
            <Chip active={filterGender === 'Male'} onClick={() => setFG('Male')} variant="male">♂ Male</Chip>
            <Chip active={filterGender === 'Female'} onClick={() => setFG('Female')} variant="female">♀ Female</Chip>
          </FilterGroup>

          {allTeamNames.length > 1 && (
            <>
              <div style={{ width: '1px', height: '20px', background: '#E2E8F0' }} />
              <FilterGroup label="TEAM">
                {['All', ...allTeamNames].map(tn => (
                  <Chip key={tn} active={filterTeam === tn} onClick={() => setFilterTeam(tn)}>{tn}</Chip>
                ))}
              </FilterGroup>
            </>
          )}
        </div>
      </div>

      {/* ── OFFER SUMMARY BANNER ── */}
      {players.length > 0 && (() => {
        const placed = players.filter(p => { const t = assigns.get(p.id)?.team; return t && !['Unassigned','Cut','Declined'].includes(t); });
        const notSent  = placed.filter(p => { const os = assigns.get(p.id)?.offer_status; return !os || os === 'NotSent'; }).length;
        const pending  = placed.filter(p => assigns.get(p.id)?.offer_status === 'Sent').length;
        const accepted = placed.filter(p => assigns.get(p.id)?.offer_status === 'Accepted').length;
        const declined = placed.filter(p => assigns.get(p.id)?.offer_status === 'Declined').length;
        const total = placed.length;
        const pct = total > 0 ? Math.round((accepted / total) * 100) : 0;
        return (
          <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '0', flexShrink: 0 }}>
            {[
              { label: 'Not Sent',  value: notSent,  color: '#94A3B8', bg: '#F8FAFC' },
              { label: 'Pending',   value: pending,  color: '#3B82F6', bg: '#EFF6FF' },
              { label: 'Accepted',  value: accepted, color: '#16A34A', bg: '#F0FDF4' },
              { label: 'Declined',  value: declined, color: '#DC2626', bg: '#FEF2F2' },
            ].map((s, i) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '20px', marginRight: '20px', borderRight: i < 3 ? '1px solid #E2E8F0' : 'none' }}>
                <div style={{ background: s.bg, borderRadius: '8px', padding: '4px 10px', minWidth: '36px', textAlign: 'center' }}>
                  <span style={{ fontSize: '17px', fontWeight: '900', color: s.color, lineHeight: 1 }}>{s.value}</span>
                </div>
                <span style={{ fontSize: '11.5px', fontWeight: '600', color: '#64748B', whiteSpace: 'nowrap' }}>{s.label}</span>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '120px', height: '6px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#22C55E', borderRadius: '4px', transition: 'width 0.4s' }} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap' }}>{pct}% accepted</span>
            </div>
          </div>
        );
      })()}

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {filteredAgs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 48px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Users size={24} color="#94A3B8" />
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No rosters yet</div>
            <div style={{ fontSize: '13px', color: '#94A3B8', maxWidth: '280px', margin: '0 auto' }}>Drag players into teams in the Team Builder to see rosters here.</div>
          </div>
        )}

        {filteredAgs.map(ag => {
          const total = agTotal(ag);
          if (total === 0) return null;

          return (
            <div key={ag} style={{ marginBottom: '36px' }}>
              {/* Age group heading */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '2px solid #E2E8F0' }}>
                <span style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A' }}>{ag}</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#94A3B8' }}>{total}</span>
              </div>

              {genders.map(gender => {
                const gTeams = teamsForSection(ag, gender);
                const gTotal = gTeams.reduce((s, t) => s + (teamPlayerMap[t.name]?.length ?? 0), 0);
                if (gTeams.length === 0) return null;

                return (
                  <div key={gender} style={{ marginBottom: '20px' }}>
                    {/* Gender sub-header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: '800', letterSpacing: '0.07em',
                          color: gender === 'Male' ? '#2563EB' : '#DB2777',
                          background: gender === 'Male' ? '#EFF6FF' : '#FDF2F8',
                          borderRadius: '6px', padding: '3px 10px',
                        }}>
                          {gender === 'Male' ? '♂' : '♀'} {gender.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8' }}>{ag}</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', letterSpacing: '0.04em' }}>
                        {gTotal} PLAYERS
                      </span>
                    </div>

                    {/* Team card grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '12px' }}>
                      {gTeams.map(team => {
                        const tp       = (teamPlayerMap[team.name] ?? []).sort((a, b) => a.last_name.localeCompare(b.last_name));
                        const accepted = tp.filter(p => assigns.get(p.id)?.offer_status === 'Accepted').length;
                        const tbd      = tp.filter(p => { const os = assigns.get(p.id)?.offer_status; return !os || os === 'NotSent'; }).length;
                        const pct      = tp.length > 0 ? (accepted / tp.length) * 100 : 0;
                        const allGood  = accepted === tp.length && tp.length > 0;
                        const coachName = team.head_coach_id ? coaches[team.head_coach_id] : null;
                        const isOpen   = expanded.has(team.id);
                        const unsent   = tp.filter(p => { const os = assigns.get(p.id)?.offer_status; return !os || os === 'NotSent'; });

                        return (
                          <div key={team.id} style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>

                            {/* Colored header band */}
                            <div style={{ background: team.color, padding: '14px 16px 0' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                                {/* Logo circle + name */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.22)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px', fontWeight: '900', color: '#fff' }}>
                                    {team.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <span style={{ fontSize: '15px', fontWeight: '800', color: '#fff' }}>{team.name}</span>
                                      {allGood && <span style={{ color: '#4ADE80', fontSize: '14px' }}>✓</span>}
                                      {team.roster_locked && <Lock size={12} color="rgba(255,255,255,0.6)" />}
                                    </div>
                                    <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.65)', marginTop: '1px' }}>
                                      {[team.age_group, team.gender, team.format].filter(Boolean).join(' · ')}
                                    </div>
                                  </div>
                                </div>
                                {/* Accepted fraction */}
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontSize: '18px', fontWeight: '900', color: '#fff', lineHeight: 1 }}>{accepted}/{tp.length}</div>
                                  <div style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.6)', marginTop: '2px', letterSpacing: '0.04em' }}>ACCEPTED</div>
                                </div>
                              </div>

                              {/* Stats line */}
                              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: '600' }}>{tp.length} PLAYERS</span>
                                <span>·</span>
                                <span>✓ {accepted}/{tp.length} ACCEPTED</span>
                                {tbd > 0 && <><span>·</span><span style={{ color: '#FDE68A', fontWeight: '700' }}>{tbd} TBD</span></>}
                                {coachName && <><span>·</span><span>Coach {coachName}</span></>}
                              </div>

                              {/* Progress bar */}
                              <div style={{ height: '5px', background: 'rgba(255,255,255,0.18)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: '#4ADE80', borderRadius: '3px', transition: 'width 0.4s' }} />
                              </div>
                            </div>

                            {/* Action bar */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: isOpen ? '1px solid #F1F5F9' : 'none' }}>
                              {unsent.length > 0 && !team.roster_locked ? (
                                <button onClick={() => sendAllForTeam(unsent.map(p => p.id))}
                                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '700', background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(29,78,216,0.3)' }}>
                                  <Send size={11} /> Send {unsent.length} Offer{unsent.length !== 1 ? 's' : ''}
                                </button>
                              ) : <div />}
                              <button onClick={() => toggleExpanded(team.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: '600', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>
                                {isOpen ? <><ChevronUp size={13} />Hide</> : <><ChevronDown size={13} />Show Players</>}
                              </button>
                            </div>

                            {/* Expandable player list */}
                            {isOpen && (
                              <div>
                                {tp.map((p, i) => {
                                  const os = assigns.get(p.id)?.offer_status ?? 'NotSent';
                                  const badgeStyle: React.CSSProperties =
                                    os === 'Accepted' ? { background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }
                                    : os === 'Declined' ? { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }
                                    : os === 'Sent'     ? { background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }
                                    : { background: '#F1F5F9', color: '#94A3B8', border: '1px solid #E2E8F0' };
                                  return (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: i < tp.length - 1 ? '1px solid #F8FAFC' : 'none', background: os === 'Accepted' ? '#F0FDF430' : os === 'Declined' ? '#FEF2F230' : '#fff' }}>
                                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#CBD5E1', minWidth: '24px' }}>{i + 1}</span>
                                      <span style={{ flex: 1, fontSize: '13.5px', fontWeight: '600', color: '#0F172A' }}>{p.first_name} {p.last_name}</span>
                                      {os !== 'NotSent' && (
                                        <span style={{ fontSize: '11px', fontWeight: '700', borderRadius: '20px', padding: '3px 10px', whiteSpace: 'nowrap', ...badgeStyle }}>
                                          {os === 'Accepted' ? '✓ Accepted' : os === 'Declined' ? '✕ Declined' : '● Pending'}
                                        </span>
                                      )}
                                      {os === 'NotSent' && !team.roster_locked && (
                                        <button onClick={() => sendOffer(p.id)} disabled={sending[p.id]}
                                          style={{ fontSize: '11px', fontWeight: '700', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: '20px', padding: '3px 12px', cursor: 'pointer' }}>
                                          {sending[p.id] ? '…' : 'Send Offer'}
                                        </button>
                                      )}
                                      {os === 'NotSent' && team.roster_locked && (
                                        <span style={{ fontSize: '11px', fontWeight: '600', ...badgeStyle, borderRadius: '20px', padding: '3px 10px' }}>Not Sent</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      <span style={{ fontSize: '9.5px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: '5px', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children, variant }: { active: boolean; onClick: () => void; children: React.ReactNode; variant?: 'male' | 'female' }) {
  const isGender = variant === 'male' || variant === 'female';
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
      border: isGender ? `1px solid ${active ? (variant === 'male' ? '#2563EB' : '#DB2777') : '#E2E8F0'}` : 'none',
      background: active
        ? (variant === 'male' ? '#EFF6FF' : variant === 'female' ? '#FDF2F8' : '#0F172A')
        : (isGender ? '#fff' : '#F1F5F9'),
      color: active
        ? (variant === 'male' ? '#2563EB' : variant === 'female' ? '#DB2777' : '#fff')
        : '#64748B',
    }}>
      {children}
    </button>
  );
}
