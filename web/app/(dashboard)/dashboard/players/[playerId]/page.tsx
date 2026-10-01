'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TrendingUp, Calendar, Target, Footprints, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type EventRow = { id: string; title: string; type: string; event_date: string };
type HistoryRow = { title: string; type: string; event_date: string; rsvp: 'attending' | 'not_attending' | 'pending'; actual: 'present' | 'absent' | 'late' | null };
type SeasonStats = {
  attendancePct: number | null;
  attended: number; totalMarkedOrRsvpd: number;
  gamesPlayed: number; gamesStarted: number; totalGames: number;
  goals: number; assists: number; yellowCards: number; redCards: number; minutesPlayed: number | null;
};

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PlayerOverviewPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SeasonStats | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [registeredAt, setRegisteredAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);

    const { data: playerRow } = await supabase.from('players').select('team_id').eq('id', playerId).single();
    if (!playerRow) { setLoading(false); return; }
    const teamId = playerRow.team_id;

    const [eventsRes, rsvpRes, attRes, lineupRes, statsRes, regRes] = await Promise.all([
      supabase.from('events').select('id,title,type,event_date').eq('team_id', teamId).not('cancelled_before_start', 'is', true).order('event_date', { ascending: false }).limit(500),
      supabase.from('event_rsvps').select('event_id,status').eq('player_id', playerId),
      supabase.from('event_attendance').select('event_id,status').eq('player_id', playerId),
      supabase.from('lineup_positions').select('lineup_id, lineups(event_id, events(type))').eq('player_id', playerId),
      supabase.from('event_player_stats').select('goals,assists,yellow_cards,red_cards,minutes_played').eq('player_id', playerId),
      supabase.from('registration_submissions').select('created_at').eq('roster_player_id', playerId).maybeSingle(),
    ]);

    const events = (eventsRes.data ?? []) as EventRow[];

    const rsvpMap = new Map<string, string>();
    for (const r of rsvpRes.data ?? []) rsvpMap.set(r.event_id, r.status);
    const attMap = new Map<string, string>();
    for (const a of attRes.data ?? []) attMap.set(a.event_id, a.status);

    // Coach-marked attendance wins per event; RSVP only fills in events that
    // haven't been marked yet — same precedence PlayerPanel already uses.
    let attended = 0, totalMarkedOrRsvpd = 0;
    let gamesPlayed = 0, totalGames = 0;
    for (const e of events) {
      const att = attMap.get(e.id);
      const rsvp = rsvpMap.get(e.id);
      const isGame = e.type === 'game';
      if (isGame) totalGames++;
      if (att) {
        totalMarkedOrRsvpd++;
        if (att === 'present' || att === 'late') { attended++; if (isGame) gamesPlayed++; }
      } else if (rsvp) {
        totalMarkedOrRsvpd++;
        if (rsvp === 'attending') { attended++; if (isGame) gamesPlayed++; }
      }
    }

    const startedEventIds = new Set<string>();
    for (const lp of (lineupRes.data ?? []) as unknown as { lineup_id: string; lineups: { event_id: string; events: { type: string } | null } | null }[]) {
      const ev = lp.lineups?.events;
      const eventId = lp.lineups?.event_id;
      if (eventId && ev?.type === 'game') startedEventIds.add(eventId);
    }

    const playerStats = (statsRes.data ?? []) as { goals: number; assists: number; yellow_cards: number; red_cards: number; minutes_played: number | null }[];
    const hasStats = playerStats.length > 0;

    setStats({
      attendancePct: totalMarkedOrRsvpd > 0 ? Math.round((attended / totalMarkedOrRsvpd) * 100) : null,
      attended, totalMarkedOrRsvpd,
      gamesPlayed, gamesStarted: startedEventIds.size, totalGames,
      goals: playerStats.reduce((s, r) => s + (r.goals ?? 0), 0),
      assists: playerStats.reduce((s, r) => s + (r.assists ?? 0), 0),
      yellowCards: playerStats.reduce((s, r) => s + (r.yellow_cards ?? 0), 0),
      redCards: playerStats.reduce((s, r) => s + (r.red_cards ?? 0), 0),
      minutesPlayed: hasStats ? playerStats.reduce((s, r) => s + (r.minutes_played ?? 0), 0) : null,
    });

    setHistory(events.slice(0, 20).map((e) => ({
      title: e.title, type: e.type, event_date: e.event_date,
      rsvp: (rsvpMap.get(e.id) ?? 'pending') as HistoryRow['rsvp'],
      actual: (attMap.get(e.id) ?? null) as HistoryRow['actual'],
    })));
    setRegisteredAt(regRes.data?.created_at ?? null);
    setLoading(false);
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from a real network call, not derivable at render time
  useEffect(() => { load(); }, [load]);

  const pctColor = stats?.attendancePct == null ? '#94A3B8' : stats.attendancePct >= 80 ? '#16A34A' : stats.attendancePct >= 60 ? '#D97706' : '#DC2626';
  const pctBg    = stats?.attendancePct == null ? '#F8FAFC' : stats.attendancePct >= 80 ? '#F0FDF4' : stats.attendancePct >= 60 ? '#FFFBEB' : '#FEF2F2';

  const card: React.CSSProperties = { background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', marginBottom: '16px' };
  const sectionTitle: React.CSSProperties = { fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div style={{ width: '22px', height: '22px', border: `2.5px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>;
  }

  return (
    <div style={{ maxWidth: '760px' }}>
      {/* Stat line */}
      <div style={card}>
        <div style={sectionTitle}>Season overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '14px' }}>
          <div style={{ padding: '14px', borderRadius: '12px', background: pctBg }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: pctColor, lineHeight: 1 }}>{stats?.attendancePct ?? '—'}{stats?.attendancePct != null ? '%' : ''}</div>
            <div style={{ fontSize: '11px', color: pctColor, opacity: 0.8, fontWeight: '700', marginTop: '4px' }}>Attendance</div>
          </div>
          <div style={{ padding: '14px', borderRadius: '12px', background: '#F8FAFC' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', lineHeight: 1 }}>{stats?.gamesPlayed ?? 0}<span style={{ fontSize: '14px', color: '#94A3B8', fontWeight: '700' }}>/{stats?.totalGames ?? 0}</span></div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '700', marginTop: '4px' }}>Games played</div>
          </div>
          <div style={{ padding: '14px', borderRadius: '12px', background: '#F8FAFC' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', lineHeight: 1 }}>{stats?.gamesStarted ?? 0}</div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '700', marginTop: '4px' }}>Games started</div>
          </div>
          {stats?.minutesPlayed != null && (
            <div style={{ padding: '14px', borderRadius: '12px', background: '#F8FAFC' }}>
              <div style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', lineHeight: 1 }}>{stats.minutesPlayed}</div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '700', marginTop: '4px' }}>Minutes</div>
            </div>
          )}
        </div>
        {(stats?.goals ?? 0) + (stats?.assists ?? 0) + (stats?.yellowCards ?? 0) + (stats?.redCards ?? 0) > 0 && (
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
            <StatPill icon={<Target size={12} />} label="Goals" value={stats!.goals} />
            <StatPill icon={<Footprints size={12} />} label="Assists" value={stats!.assists} />
            {stats!.yellowCards > 0 && <StatPill icon={<div style={{ width: 9, height: 12, background: '#EAB308', borderRadius: 2 }} />} label="Yellow" value={stats!.yellowCards} />}
            {stats!.redCards > 0 && <StatPill icon={<div style={{ width: 9, height: 12, background: '#DC2626', borderRadius: 2 }} />} label="Red" value={stats!.redCards} />}
          </div>
        )}
        {registeredAt && (
          <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '14px' }}>
            Joined the roster via registration on {fmtDate(registeredAt.slice(0, 10))}
          </div>
        )}
      </div>

      {/* Recent events */}
      <div style={card}>
        <div style={sectionTitle}>Recent events</div>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <TrendingUp size={22} color="#CBD5E1" style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No events yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: i < history.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                <Calendar size={13} color="#CBD5E1" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{h.title}</div>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>{fmtDate(h.event_date)} · {h.type}</div>
                </div>
                <StatusBadge actual={h.actual} rsvp={h.rsvp} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>{icon}</div>
      <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>{value}</span>
      <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>{label}</span>
    </div>
  );
}

function StatusBadge({ actual, rsvp }: { actual: HistoryRow['actual']; rsvp: HistoryRow['rsvp'] }) {
  if (actual === 'present') return <Badge color="#16A34A" bg="#F0FDF4" label="Present" />;
  if (actual === 'late')    return <Badge color="#D97706" bg="#FFFBEB" label="Late" />;
  if (actual === 'absent')  return <Badge color="#DC2626" bg="#FEF2F2" label="Absent" />;
  if (rsvp === 'attending')     return <Badge color="#64748B" bg="#F8FAFC" label="RSVP'd" />;
  if (rsvp === 'not_attending') return <Badge color="#94A3B8" bg="#F8FAFC" label="Declined" />;
  return <Badge color="#CBD5E1" bg="#F8FAFC" label="No RSVP" />;
}

function Badge({ color, bg, label }: { color: string; bg: string; label: string }) {
  return <span style={{ fontSize: '10.5px', fontWeight: '700', color, background: bg, borderRadius: '20px', padding: '3px 9px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
    <Clock size={9} />{label}
  </span>;
}
