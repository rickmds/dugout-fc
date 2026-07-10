'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Users, CalendarDays, DollarSign, CheckCircle, AlertCircle, Clock, MapPin, ChevronRight, TrendingUp, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { FlipBoard } from '@/components/FlipBoard';

type Event = {
  id: string; title: string; type: string;
  event_date: string; event_time: string | null; location: string | null;
};
type Announcement = { id: string; title: string; body: string; created_at: string; pinned: boolean };
type Summary = {
  playerCount: number;
  nextEvent: Event | null;
  rsvpAttending: number; rsvpTotal: number;
  attendanceRate: number;
  outstandingFees: number;
  outstandingCount: number;
  recentAnnouncements: Announcement[];
};

function fmtDate(iso: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return ` · ${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const TYPE_COLOR: Record<string,string> = { game:'#EF4444', training:'#22C55E', other:'#8B5CF6' };

export default function TeamSummaryPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { club }   = useDashboard();
  const [data, setData]     = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const base = `/dashboard/teams/${teamId}`;

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);

    const today = new Date().toISOString().slice(0,10);

    const [playersRes, nextEventsRes, announcementsRes, rsvpRes, feesRes] = await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('events').select('id,title,type,event_date,event_time,location')
        .eq('team_id', teamId).gte('event_date', today).order('event_date').limit(1),
      supabase.from('announcements').select('id,title,body,created_at,pinned')
        .eq('team_id', teamId).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3),
      supabase.from('event_rsvps').select('event_id,status').in('event_id',
        await supabase.from('events').select('id').eq('team_id', teamId)
          .gte('event_date', new Date(Date.now() - 30*86400000).toISOString().slice(0,10))
          .then(r => (r.data ?? []).map((e: any) => e.id))
      ),
      supabase.from('player_fees').select('amount_due,amount_paid,status').eq('team_id', teamId),
    ]);

    const nextEvent = (nextEventsRes.data ?? [])[0] ?? null;

    // RSVP for next event
    let rsvpAttending = 0, rsvpTotal = 0;
    if (nextEvent) {
      const { data: nr } = await supabase.from('event_rsvps').select('status').eq('event_id', nextEvent.id);
      rsvpAttending = (nr ?? []).filter((r: any) => r.status === 'attending').length;
      rsvpTotal     = (nr ?? []).length;
    }

    // Attendance rate (last 30 days)
    const rsvps = rsvpRes.data ?? [];
    const attended = rsvps.filter((r: any) => r.status === 'attending').length;
    const attendanceRate = rsvps.length > 0 ? Math.round((attended / rsvps.length) * 100) : 0;

    // Outstanding fees
    const fees = feesRes.data ?? [];
    const outstandingFees  = fees.filter((f: any) => f.status !== 'paid' && f.status !== 'waived')
      .reduce((sum: number, f: any) => sum + (f.amount_due - f.amount_paid - 0), 0);
    const outstandingCount = fees.filter((f: any) => f.status !== 'paid' && f.status !== 'waived').length;

    setData({
      playerCount: playersRes.count ?? 0,
      nextEvent,
      rsvpAttending, rsvpTotal,
      attendanceRate,
      outstandingFees,
      outstandingCount,
      recentAnnouncements: (announcementsRes.data ?? []) as Announcement[],
    });
    setLoading(false);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <FlipBoard title="Loading team…" rows={[
      { label: 'Players', pad: 2 },
      { label: 'Events',  pad: 2 },
      { label: 'Parents', pad: 2 },
      { label: 'Matches', pad: 2 },
    ]} />
  );

  return (
    <div style={{ maxWidth: '960px' }}>

      {/* Breadcrumb */}
      <Link href="/dashboard/teams" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '600', color: '#94A3B8', textDecoration: 'none', marginBottom: '20px' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = primary}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94A3B8'}
      >
        <ArrowLeft size={13} /> All teams
      </Link>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { icon: Users,       label: 'Players',          value: data?.playerCount ?? 0, color: primary,    href: `${base}/roster`,     sub: 'on roster' },
          { icon: TrendingUp,  label: 'Attendance Rate',  value: `${data?.attendanceRate ?? 0}%`, color: '#22C55E', href: `${base}/attendance`, sub: 'last 30 days' },
          { icon: DollarSign,  label: 'Outstanding Fees', value: data?.outstandingCount ?? 0, color: '#F59E0B', href: `${base}/fees`,       sub: data?.outstandingFees ? `$${data.outstandingFees.toFixed(0)} owed` : 'all clear' },
          { icon: CalendarDays,label: 'Next Event',       value: data?.nextEvent ? fmtDate(data.nextEvent.event_date) : '—', color: '#8B5CF6', href: `${base}/schedule`, sub: data?.nextEvent?.title ?? 'No upcoming events' },
        ].map(({ icon: Icon, label, value, color, href, sub }) => (
          <Link key={label} href={href} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}
            >
              <div style={{ height: '3px', background: color }} />
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={17} color={color} />
                  </div>
                  <ChevronRight size={13} color="#CBD5E1" />
                </div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                {sub && <div style={{ fontSize: '11px', color: color, marginTop: '2px' }}>{sub}</div>}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Next event card */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Next Event</div>
            <Link href={`${base}/schedule`} style={{ fontSize: '12px', color: primary, textDecoration: 'none', fontWeight: '600' }}>View all →</Link>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {data?.nextEvent ? (
              <Link
                href={`${base}/schedule?event=${data.nextEvent.id}`}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  style={{ borderRadius: '10px', padding: '4px', margin: '-4px', cursor: 'pointer', transition: 'background 0.15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: TYPE_COLOR[data.nextEvent.type] ?? '#94A3B8', flexShrink: 0 }} />
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>{data.nextEvent.title}</div>
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '4px' }}>
                    {fmtDate(data.nextEvent.event_date)}{fmtTime(data.nextEvent.event_time)}
                  </div>
                  {data.nextEvent.location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#94A3B8' }}>
                      <MapPin size={11} /> {data.nextEvent.location}
                    </div>
                  )}
                  <div style={{ marginTop: '14px', padding: '12px', background: '#F1F5F9', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>RSVP Status</div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <CheckCircle size={13} color="#22C55E" />
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#22C55E' }}>{data.rsvpAttending}</span>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>attending</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={13} color="#94A3B8" />
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748B' }}>{data.rsvpTotal - data.rsvpAttending}</span>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>pending</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: '13px' }}>
                No upcoming events
              </div>
            )}
          </div>
        </div>

        {/* Recent announcements */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Recent Announcements</div>
            <Link href={`${base}/contact`} style={{ fontSize: '12px', color: primary, textDecoration: 'none', fontWeight: '600' }}>View all →</Link>
          </div>
          <div>
            {(data?.recentAnnouncements ?? []).length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No announcements yet</div>
            ) : (
              data!.recentAnnouncements.map((a, i) => (
                <div key={a.id} style={{ padding: '14px 20px', borderBottom: i < data!.recentAnnouncements.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    {a.pinned && <div style={{ background: `${primary}20`, color: primary, fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', flexShrink: 0, marginTop: '1px' }}>PINNED</div>}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', marginBottom: '2px' }}>{a.title}</div>
                      <div style={{ fontSize: '12px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>{a.body}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
