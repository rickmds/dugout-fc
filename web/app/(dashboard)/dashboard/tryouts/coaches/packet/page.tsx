'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type Coach = { id: string; full_name: string; email: string | null; phone: string | null; license: string | null };
type TryoutTeam = { id: string; name: string; age_group: string | null; gender: string | null; head_coach_id: string | null };
type SlotRow = { team: string | null; day_of_week: string; start_time: string | null; end_time: string | null; field_name: string | null; sub_zone: string | null };
type PlayerRow = { id: string; first_name: string; last_name: string; jersey_number: number | null; positions: string[] | null; dob: string | null; gender: string | null; town: string | null; parent_name: string | null; email_primary: string | null; email_secondary: string | null; phone: string | null };
type CoachAssignment = { coach_id: string; team: string; role: string };

const DAY_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_FULL: Record<string,string> = { Mon:'MONDAY',Tue:'TUESDAY',Wed:'WEDNESDAY',Thu:'THURSDAY',Fri:'FRIDAY',Sat:'SATURDAY',Sun:'SUNDAY' };

function fmt12(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m}${hr >= 12 ? 'pm' : 'am'}`;
}

function darken(hex: string, amount = 30): string {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

export default function CoachPacketPage() {
  const { club } = useDashboard();
  const searchParams = useSearchParams();
  const coachId   = searchParams.get('coachId') ?? '';
  const season    = searchParams.get('season') ?? '';
  const primary   = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const darker    = darken(primary);

  const [coach, setCoach]           = useState<Coach | null>(null);
  const [allTeams, setAllTeams]     = useState<TryoutTeam[]>([]);
  const [assignments, setAssign]    = useState<CoachAssignment[]>([]);
  const [slots, setSlots]           = useState<SlotRow[]>([]);
  const [rosters, setRosters]       = useState<Record<string, PlayerRow[]>>({});
  const [loading, setLoading]       = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!club || !coachId) return;
    async function load() {
      const [{ data: c }, { data: ts }, { data: as_ }, { data: sl }] = await Promise.all([
        supabase.from('tryout_coaches').select('*').eq('id', coachId).single(),
        supabase.from('tryout_teams').select('id,name,age_group,gender,head_coach_id').eq('club_id', club!.id),
        supabase.from('tryout_coach_assignments').select('coach_id,team,role').eq('club_id', club!.id).eq('coach_id', coachId),
        supabase.from('tryout_practice_slots').select('team,day_of_week,start_time,end_time,field_name,sub_zone').eq('club_id', club!.id).eq('season_label', season),
      ]);

      const coach = c as Coach;
      const teams = (ts ?? []) as TryoutTeam[];
      const assigns = (as_ ?? []) as CoachAssignment[];
      setCoach(coach);
      setAllTeams(teams);
      setAssign(assigns);
      setSlots((sl ?? []) as SlotRow[]);

      // Determine which teams this coach is on
      const headViaTeams = teams.filter(t => t.head_coach_id === coachId).map(t => t.name);
      const headViaAssign = assigns.filter(a => a.role === 'head').map(a => a.team);
      const assistNames = assigns.filter(a => a.role === 'assistant').map(a => a.team);
      const myTeams = [...new Set([...headViaTeams, ...headViaAssign, ...assistNames])];

      // Fetch rosters
      const rMap: Record<string, PlayerRow[]> = {};
      await Promise.all(myTeams.map(async tn => {
        const { data: assigned } = await supabase
          .from('tryout_assignments')
          .select('player_id')
          .eq('club_id', club!.id)
          .eq('team', tn)
          .in('status', ['Offer','Accepted']);
        const ids = (assigned ?? []).map(a => a.player_id);
        if (ids.length === 0) { rMap[tn] = []; return; }
        const { data: players } = await supabase
          .from('tryout_players')
          .select('id,first_name,last_name,jersey_number,positions,dob,gender,town,parent_name,email_primary,email_secondary,phone')
          .in('id', ids)
          .order('last_name');
        rMap[tn] = (players ?? []) as PlayerRow[];
      }));
      setRosters(rMap);
      setLoading(false);
    }
    load();
  }, [club, coachId, season]);

  if (!coachId) return <div style={{ padding: '40px', color: '#94A3B8' }}>No coach selected.</div>;
  if (loading) return <div style={{ padding: '40px', color: '#94A3B8', fontSize: '14px' }}>Loading packet…</div>;
  if (!coach) return <div style={{ padding: '40px', color: '#EF4444' }}>Coach not found.</div>;

  const headViaTeams  = allTeams.filter(t => t.head_coach_id === coachId).map(t => t.name);
  const headViaAssign = assignments.filter(a => a.role === 'head').map(a => a.team);
  const assistNames   = assignments.filter(a => a.role === 'assistant').map(a => a.team);
  const headNames     = [...new Set([...headViaTeams, ...headViaAssign])];
  const myTeamNames   = [...new Set([...headNames, ...assistNames])];
  const mySlots       = slots.filter(s => s.team && myTeamNames.includes(s.team));

  const daysToShow = DAY_ORDER.filter(d => {
    if (['Mon','Tue','Wed','Thu','Fri'].includes(d)) return true;
    return mySlots.some(s => s.day_of_week === d);
  });

  const colW = `${Math.floor(100 / daysToShow.length)}%`;

  function isHead(tn: string) { return headNames.includes(tn); }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #packet-root, #packet-root * { visibility: visible !important; }
          #packet-root { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        @page { margin: 16mm 14mm; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      {/* Print button bar */}
      <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999, background: '#0F172A', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/dashboard/tryouts/coaches" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94A3B8', textDecoration: 'none', fontSize: '13px' }}>
          <ArrowLeft size={14} /> Back to Coaches
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#64748B', fontSize: '12px' }}>{coach.full_name} — {season}</span>
          <button
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: primary, color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
            <Printer size={14} /> Print / Download PDF
          </button>
        </div>
      </div>

      {/* Packet content */}
      <div id="packet-root" ref={printRef} style={{ paddingTop: '52px', background: '#F0F2F5', minHeight: '100vh', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>

          {/* ── PAGE 1: Cover ── */}
          <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', marginBottom: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            {/* Hero header */}
            <div style={{ display: 'flex', background: primary, minHeight: '200px' }}>
              <div style={{ flex: 1, padding: '36px 40px 32px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '14px' }}>
                  {club?.name ?? ''} · Est.
                </div>
                <div style={{ fontSize: '52px', fontWeight: '900', color: '#fff', letterSpacing: '-1.5px', lineHeight: 1, marginBottom: '10px' }}>Coach Packet</div>
                <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.85)', marginBottom: '6px' }}>{season} Season</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>Everything you need to lead your team this season.</div>
              </div>
              {club?.logo_url && (
                <div style={{ width: '220px', flexShrink: 0, background: darker, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={club.logo_url} alt="" style={{ maxWidth: '140px', maxHeight: '140px', objectFit: 'contain', opacity: 0.9 }} />
                </div>
              )}
            </div>

            {/* Cover body */}
            <div style={{ padding: '36px 40px' }}>
              {/* Prepared For */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '22px 28px', marginBottom: '32px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>PREPARED FOR</div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.5px', marginBottom: '6px' }}>{coach.full_name}</div>
                {coach.email && <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '3px' }}>{coach.email}</div>}
                <div style={{ fontSize: '14px', color: '#64748B' }}>{myTeamNames.length} team{myTeamNames.length !== 1 ? 's' : ''} assigned</div>
              </div>

              {/* Your Teams */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ fontSize: '18px', fontWeight: '700', color: primary, marginBottom: '6px' }}>Your Teams</div>
                <div style={{ height: '2px', background: primary, width: '50px', marginBottom: '14px' }} />
                {myTeamNames.map(tn => (
                  <div key={tn} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F8FAFC' }}>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>• {tn}</span>
                    <span style={{ fontSize: '14px', color: '#94A3B8' }}>{isHead(tn) ? 'Head Coach' : 'Assistant Coach'}</span>
                  </div>
                ))}
              </div>

              {/* Contents */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ fontSize: '15px', fontWeight: '700', color: primary, marginBottom: '10px' }}>Contents of this packet</div>
                <ol style={{ margin: 0, paddingLeft: '20px', color: '#374151', fontSize: '14px', lineHeight: 2 }}>
                  <li>Team assignments and contact information for the season</li>
                  <li>Weekly practice schedule across all your teams</li>
                  <li>Full team rosters with player and parent contact details</li>
                </ol>
              </div>

              {/* Confidentiality */}
              <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                This packet contains private contact information for {club?.name ?? ''} families. Please keep it confidential and use it only for club-related communication.
              </div>
            </div>

            <div style={{ borderTop: '1px solid #F1F5F9', padding: '10px 40px', display: 'flex', justifyContent: 'space-between', background: '#F8FAFC' }}>
              <span style={{ fontSize: '11px', color: '#CBD5E1' }}>{club?.name ?? ''} — Confidential</span>
              <span style={{ fontSize: '11px', color: '#CBD5E1' }}>Page 1 of {1 + myTeamNames.length + 1}</span>
            </div>
          </div>

          {/* ── PAGE 2: Practice Schedule ── */}
          <div className="page-break" style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', marginBottom: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            {/* Header */}
            <div style={{ display: 'flex', background: primary }}>
              <div style={{ padding: '16px 24px', flex: 1 }}>
                {club?.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={club.logo_url} alt="" style={{ height: '36px', objectFit: 'contain', marginBottom: '8px', opacity: 0.9 }} />
                )}
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '2px' }}>
                  {club?.name ?? ''} · Practice Schedule
                </div>
                <div style={{ fontSize: '22px', fontWeight: '900', color: '#fff' }}>{coach.full_name}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '3px' }}>{myTeamNames.join(' • ')}</div>
              </div>
              <div style={{ background: darker, padding: '16px 24px', textAlign: 'right', minWidth: '180px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Season</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{season}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>Weekly view</div>
              </div>
            </div>

            {/* Day columns */}
            <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${daysToShow.length}, ${colW})`, gap: '10px' }}>
                {daysToShow.map(day => {
                  const daySlots = mySlots
                    .filter(s => s.day_of_week === day)
                    .sort((a,b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
                  return (
                    <div key={day}>
                      <div style={{ background: '#F8FAFC', borderRadius: '8px 8px 0 0', padding: '10px 12px 8px', borderBottom: `2px solid ${daySlots.length > 0 ? primary : '#E2E8F0'}` }}>
                        <div style={{ fontSize: '11px', fontWeight: '800', color: daySlots.length > 0 ? primary : '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>{DAY_FULL[day]}</div>
                        <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{daySlots.length > 0 ? `${daySlots.length} session${daySlots.length !== 1 ? 's' : ''}` : '—'}</div>
                      </div>
                      <div style={{ background: '#F8FAFC', borderRadius: '0 0 8px 8px', padding: '10px 12px', minHeight: '80px' }}>
                        {daySlots.length > 0 ? daySlots.map((s, si) => (
                          <div key={si} style={{ borderLeft: `3px solid ${primary}`, paddingLeft: '8px', marginBottom: si < daySlots.length - 1 ? '10px' : 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{fmt12(s.start_time)}–{fmt12(s.end_time)}</div>
                            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{s.team}</div>
                            {s.field_name && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>{[s.field_name, s.sub_zone].filter(Boolean).join(', ')}</div>}
                          </div>
                        )) : <div style={{ fontSize: '12px', color: '#CBD5E1', fontStyle: 'italic', paddingTop: '4px' }}>No practices</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #F1F5F9', padding: '10px 40px', display: 'flex', justifyContent: 'space-between', background: '#F8FAFC' }}>
              <span style={{ fontSize: '11px', color: '#CBD5E1' }}>{club?.name ?? ''} — Confidential</span>
              <span style={{ fontSize: '11px', color: '#CBD5E1' }}>Page 2 of {1 + myTeamNames.length + 1}</span>
            </div>
          </div>

          {/* ── PAGES 3+: Team Rosters ── */}
          {myTeamNames.map((tn, ti) => {
            const players = rosters[tn] ?? [];
            const role = isHead(tn) ? 'Head Coach' : 'Assistant Coach';
            const pairs: PlayerRow[][] = [];
            for (let i = 0; i < players.length; i += 2) pairs.push(players.slice(i, i+2));

            return (
              <div key={tn} className="page-break" style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', marginBottom: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                {/* Roster page header */}
                <div style={{ display: 'flex', background: primary }}>
                  <div style={{ padding: '16px 24px', flex: 1 }}>
                    {club?.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={club.logo_url} alt="" style={{ height: '30px', objectFit: 'contain', marginBottom: '6px', opacity: 0.9 }} />
                    )}
                    <div style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '2px' }}>
                      {club?.name ?? ''} · Team Roster
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#fff', letterSpacing: '-0.5px' }}>{tn}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>{season}</div>
                  </div>
                  <div style={{ background: darker, padding: '16px 24px', textAlign: 'right', minWidth: '180px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>{role.toUpperCase()}</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{coach.full_name}</div>
                  </div>
                </div>

                {/* Roster cards */}
                <div style={{ padding: '24px 28px' }}>
                  <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '16px' }}>{players.length} players</div>
                  {players.length === 0 ? (
                    <div style={{ color: '#CBD5E1', fontSize: '14px', fontStyle: 'italic', padding: '20px 0' }}>No roster assigned yet.</div>
                  ) : (
                    pairs.map((pair, pi) => (
                      <div key={pi} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        {pair.map((p, i) => {
                          const num = pi * 2 + i + 1;
                          const dob = p.dob ? new Date(p.dob).toISOString().split('T')[0] : null;
                          const meta = [p.gender, dob ? `DOB ${dob}` : null, p.town].filter(Boolean).join(' · ');
                          const emails = [p.email_primary, p.email_secondary].filter(Boolean).join(', ');
                          return (
                            <div key={p.id} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                              {/* Name row */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
                                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: primary, color: '#fff', fontSize: '12px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{num}</div>
                                <div>
                                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>{p.first_name} {p.last_name}</div>
                                  {meta && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{meta}</div>}
                                </div>
                              </div>
                              {/* Contact */}
                              <div style={{ padding: '10px 14px' }}>
                                <div style={{ fontSize: '9px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '2px' }}>PARENT</div>
                                <div style={{ fontSize: '13px', color: '#374151', marginBottom: '8px' }}>{p.parent_name ?? '—'}</div>
                                <div style={{ fontSize: '9px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '2px' }}>EMAIL</div>
                                <div style={{ fontSize: '12px', color: '#374151', marginBottom: '8px', wordBreak: 'break-all' }}>{emails || '—'}</div>
                                <div style={{ fontSize: '9px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '2px' }}>PHONE</div>
                                <div style={{ fontSize: '13px', color: '#374151' }}>{p.phone ?? '—'}</div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Fill empty slot in last row if odd count */}
                        {pair.length === 1 && <div />}
                      </div>
                    ))
                  )}
                </div>

                <div style={{ borderTop: '1px solid #F1F5F9', padding: '10px 40px', display: 'flex', justifyContent: 'space-between', background: '#F8FAFC' }}>
                  <span style={{ fontSize: '11px', color: '#CBD5E1' }}>{club?.name ?? ''} — Confidential</span>
                  <span style={{ fontSize: '11px', color: '#CBD5E1' }}>Page {3 + ti} of {1 + myTeamNames.length + 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
