'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type PlayerStat = {
  id: string; full_name: string; position: string | null; jersey_number: number | null;
  attended: number; total: number; rate: number;
};
type EventSummary = {
  id: string; title: string; event_date: string; type: string;
  attending: number; not_attending: number; pending: number; total: number;
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

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TeamAttendancePage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { club }   = useDashboard();
  const [players,  setPlayers]  = useState<PlayerStat[]>([]);
  const [events,   setEvents]   = useState<EventSummary[]>([]);
  const [rangeIdx, setRangeIdx] = useState(0);
  const [tab,      setTab]      = useState<'players'|'events'>('players');
  const [loading,  setLoading]  = useState(true);
  const [sortBy,   setSortBy]   = useState<'name'|'rate'>('rate');

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const days    = RANGE_OPTIONS[rangeIdx].days;

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0,10);

    const [playersRes, eventsRes] = await Promise.all([
      supabase.from('players').select('id,full_name,position,jersey_number').eq('team_id', teamId).order('full_name'),
      supabase.from('events').select('id,title,event_date,type').eq('team_id', teamId)
        .gte('event_date', since).lte('event_date', new Date().toISOString().slice(0,10)).order('event_date', { ascending: false }),
    ]);

    const allPlayers = (playersRes.data ?? []) as any[];
    const allEvents  = (eventsRes.data ?? []) as any[];

    if (allEvents.length === 0) {
      setPlayers(allPlayers.map(p => ({ ...p, attended: 0, total: 0, rate: 0 })));
      setEvents([]);
      setLoading(false);
      return;
    }

    const eventIds = allEvents.map((e: any) => e.id);
    const { data: rsvps } = await supabase.from('event_rsvps').select('event_id,player_id,status').in('event_id', eventIds);
    const allRsvps = (rsvps ?? []) as any[];

    // Per-player stats
    const playerStats: PlayerStat[] = allPlayers.map((p: any) => {
      const mine    = allRsvps.filter(r => r.player_id === p.id);
      const attended = mine.filter(r => r.status === 'attending').length;
      const total    = allEvents.length;
      return { ...p, attended, total, rate: total > 0 ? Math.round((attended / total) * 100) : 0 };
    });

    // Per-event stats
    const eventSummaries: EventSummary[] = allEvents.map((e: any) => {
      const er        = allRsvps.filter(r => r.event_id === e.id);
      const attending = er.filter(r => r.status === 'attending').length;
      const notAtt    = er.filter(r => r.status === 'not_attending').length;
      return { ...e, attending, not_attending: notAtt, pending: allPlayers.length - er.length, total: allPlayers.length };
    });

    setPlayers(playerStats);
    setEvents(eventSummaries);
    setLoading(false);
  }, [teamId, days]);

  useEffect(() => { load(); }, [load]);

  const sorted = [...players].sort((a, b) =>
    sortBy === 'rate' ? b.rate - a.rate : a.full_name.localeCompare(b.full_name)
  );

  const avgRate = players.length > 0
    ? Math.round(players.reduce((s, p) => s + p.rate, 0) / players.length)
    : 0;

  return (
    <div style={{ maxWidth: '900px' }}>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px' }}>
          {['players','events'].map(t => (
            <button key={t} onClick={() => setTab(t as any)} style={{
              padding: '6px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#0F172A' : '#64748B',
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {tab === 'players' && (
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ fontSize: '13px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', color: '#374151', background: '#fff', cursor: 'pointer' }}>
              <option value="rate">Sort by rate</option>
              <option value="name">Sort by name</option>
            </select>
          )}
          <div style={{ display: 'flex', gap: '4px' }}>
            {RANGE_OPTIONS.map((o, i) => (
              <button key={i} onClick={() => setRangeIdx(i)} style={{
                padding: '6px 12px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                borderColor: rangeIdx === i ? primary : '#E2E8F0',
                background: rangeIdx === i ? `${primary}12` : '#fff',
                color: rangeIdx === i ? primary : '#64748B',
              }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary banner */}
      {!loading && tab === 'players' && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', marginBottom: '16px', display: 'flex', gap: '32px' }}>
          <div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: rateColor(avgRate), letterSpacing: '-0.5px' }}>{avgRate}%</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>Team avg attendance</div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.5px' }}>{events.length}</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>Events in period</div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.5px' }}>{players.length}</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>Players tracked</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1,2,3,4,5].map(i => <div key={i} style={{ height: '60px', borderRadius: '10px', background: '#E2E8F0' }} />)}
        </div>
      ) : tab === 'players' ? (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Player','Position','Attended','Rate',''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < sorted.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: primary }}>
                        {p.jersey_number ?? p.full_name[0]}
                      </div>
                      <span style={{ fontSize: '13.5px', fontWeight: '600', color: '#0F172A' }}>{p.full_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>{p.position ?? '—'}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '13px', color: '#374151' }}>{p.attended} / {p.total}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, maxWidth: '100px', height: '6px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${p.rate}%`, height: '100%', background: rateColor(p.rate), borderRadius: '3px', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: rateColor(p.rate), width: '36px' }}>{p.rate}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {p.rate >= 80 ? <TrendingUp size={14} color="#22C55E" /> : p.rate >= 60 ? <Minus size={14} color="#F59E0B" /> : <TrendingDown size={14} color="#EF4444" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          {events.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>No events in this period</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Event','Date','Attending','Declined','Pending','Rate'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => {
                  const rate = e.total > 0 ? Math.round((e.attending / e.total) * 100) : 0;
                  return (
                    <tr key={e.id} style={{ borderBottom: i < events.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: e.type === 'game' ? '#EF4444' : e.type === 'training' ? '#22C55E' : '#8B5CF6', flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{e.title}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748B' }}>{fmtDate(e.event_date)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#22C55E' }}>{e.attending}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#EF4444' }}>{e.not_attending}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#94A3B8' }}>{e.pending}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: rateColor(rate) }}>{rate}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
