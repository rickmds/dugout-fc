'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { ChevronRight, TrendingUp } from 'lucide-react';

type TeamAttendance = {
  id: string;
  name: string;
  age_group: string | null;
  eventCount: number;
  avgRate: number;
  playerCount: number;
};

const RANGE_OPTIONS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Full season',  days: 365 },
];

function rateColor(r: number) {
  if (r >= 80) return '#22C55E';
  if (r >= 60) return '#F59E0B';
  return '#EF4444';
}

function rateBg(r: number) {
  if (r >= 80) return '#F0FDF4';
  if (r >= 60) return '#FFFBEB';
  return '#FEF2F2';
}

export default function AttendancePage() {
  const { club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [stats,    setStats]    = useState<TeamAttendance[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [rangeIdx, setRangeIdx] = useState(0);

  const load = useCallback(async () => {
    if (!club || teams.length === 0) return;
    setLoading(true);

    const days  = RANGE_OPTIONS[rangeIdx].days;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const teamIds = teams.map(t => t.id);

    const [eventsRes, playersRes] = await Promise.all([
      supabase.from('events').select('id,team_id').in('team_id', teamIds)
        .gte('event_date', since).lte('event_date', today),
      supabase.from('players').select('id,team_id').in('team_id', teamIds),
    ]);

    const allEvents  = (eventsRes.data  ?? []) as { id: string; team_id: string }[];
    const allPlayers = (playersRes.data ?? []) as { id: string; team_id: string }[];

    if (allEvents.length === 0) {
      setStats(teams.map(t => ({ id: t.id, name: t.name, age_group: t.age_group, eventCount: 0, avgRate: 0, playerCount: allPlayers.filter(p => p.team_id === t.id).length })));
      setLoading(false);
      return;
    }

    const eventIds = allEvents.map(e => e.id);
    const { data: rsvps } = await supabase.from('event_rsvps').select('event_id,player_id,status').in('event_id', eventIds);
    const allRsvps = (rsvps ?? []) as { event_id: string; player_id: string; status: string }[];

    const result: TeamAttendance[] = teams.map(t => {
      const teamEvents  = allEvents.filter(e => e.team_id === t.id);
      const teamPlayers = allPlayers.filter(p => p.team_id === t.id);
      const teamRsvps   = allRsvps.filter(r => teamEvents.some(e => e.id === r.event_id));

      if (teamEvents.length === 0 || teamPlayers.length === 0) {
        return { id: t.id, name: t.name, age_group: t.age_group, eventCount: teamEvents.length, avgRate: 0, playerCount: teamPlayers.length };
      }

      const totalSlots   = teamEvents.length * teamPlayers.length;
      const totalAttended = teamRsvps.filter(r => r.status === 'attending').length;
      const avgRate = Math.round((totalAttended / totalSlots) * 100);

      return { id: t.id, name: t.name, age_group: t.age_group, eventCount: teamEvents.length, avgRate, playerCount: teamPlayers.length };
    });

    setStats(result);
    setLoading(false);
  }, [club, teams, rangeIdx]);

  useEffect(() => { load(); }, [load]);

  const teamsWithData = stats.filter(t => t.eventCount > 0);
  const clubAvg = teamsWithData.length > 0
    ? Math.round(teamsWithData.reduce((s, t) => s + t.avgRate, 0) / teamsWithData.length)
    : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Club</div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>Attendance</h1>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', borderRadius: '10px', padding: '4px' }}>
          {RANGE_OPTIONS.map((o, i) => (
            <button key={o.label} onClick={() => setRangeIdx(i)}
              style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer', background: rangeIdx === i ? '#fff' : 'transparent', color: rangeIdx === i ? '#0F172A' : '#64748B', boxShadow: rangeIdx === i ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', fontFamily: 'inherit' }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* Club average banner */}
        {!loading && teamsWithData.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '20px 24px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TrendingUp size={24} color={primary} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Club-wide average</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '32px', fontWeight: '900', color: rateColor(clubAvg), lineHeight: 1 }}>{clubAvg}%</span>
                <div style={{ flex: 1, height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden', maxWidth: '320px' }}>
                  <div style={{ width: `${clubAvg}%`, height: '100%', background: rateColor(clubAvg), borderRadius: '4px', transition: 'width 0.6s ease' }} />
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '13px', color: '#64748B' }}>{teamsWithData.length} team{teamsWithData.length !== 1 ? 's' : ''} with events</div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{RANGE_OPTIONS[rangeIdx].label.toLowerCase()}</div>
            </div>
          </div>
        )}

        {/* Team cards */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: '88px', borderRadius: '14px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite', border: '1px solid #E2E8F0' }} />
            ))}
          </div>
        ) : stats.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '64px 32px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <TrendingUp size={22} color="#94A3B8" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No teams found</div>
            <div style={{ fontSize: '13px', color: '#64748B' }}>Add teams to your club to start tracking attendance.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stats.sort((a, b) => b.avgRate - a.avgRate).map(t => (
              <Link key={t.id} href={`/dashboard/teams/${t.id}/attendance`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = '#CBD5E1'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; }}>

                  {/* Rate badge */}
                  <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: t.eventCount > 0 ? rateBg(t.avgRate) : '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '18px', fontWeight: '900', color: t.eventCount > 0 ? rateColor(t.avgRate) : '#CBD5E1', lineHeight: 1 }}>
                      {t.eventCount > 0 ? `${t.avgRate}%` : '—'}
                    </span>
                  </div>

                  {/* Team info + bar */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{t.name}</span>
                      {t.age_group && <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', background: '#F1F5F9', borderRadius: '5px', padding: '1px 7px' }}>{t.age_group}</span>}
                    </div>
                    <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: t.eventCount > 0 ? `${t.avgRate}%` : '0%', height: '100%', background: t.eventCount > 0 ? rateColor(t.avgRate) : '#E2E8F0', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>

                  {/* Meta */}
                  <div style={{ textAlign: 'right', flexShrink: 0, marginRight: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{t.playerCount} players</div>
                    <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '1px' }}>
                      {t.eventCount > 0 ? `${t.eventCount} event${t.eventCount !== 1 ? 's' : ''}` : 'No events yet'}
                    </div>
                  </div>

                  <ChevronRight size={16} color="#CBD5E1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>
    </div>
  );
}
