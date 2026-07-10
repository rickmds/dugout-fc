'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, CalendarDays, CalendarCheck, ArrowRight, MapPin, Clock, Plus, Mail, LayoutGrid, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import SetupWizard from '@/components/dashboard/SetupWizard';
import SetupProgressCard from '@/components/dashboard/SetupProgressCard';

type TeamStat = {
  id: string;
  name: string;
  age_group: string | null;
  player_count: number;
  next_event: {
    id: string;
    title: string;
    type: string;
    event_date: string;
    event_time: string | null;
    location: string | null;
  } | null;
  rsvp_attending: number;
  rsvp_not_attending: number;
};

type EventRow  = { id: string; title: string; type: string; event_date: string; event_time: string | null; location: string | null; team_id: string };
type PlayerRow = { team_id: string };
type RsvpRow   = { event_id: string; status: string };

const TYPE_COLOR: Record<string, string> = { game: '#EF4444', training: '#22C55E', other: '#8B5CF6' };
const TYPE_BG:    Record<string, string> = { game: '#FEF2F2', training: '#F0FDF4', other: '#F5F3FF' };
const TYPE_LABEL: Record<string, string> = { game: 'Game',    training: 'Training', other: 'Other'  };

function fmtDate(iso: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function greeting(name: string): string {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${g}, ${name}`;
}

function teamInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = '16px', r = '6px' }: { w?: string; h?: string; r?: string }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, sub }: { icon: React.ElementType; label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${color}, ${color}80)` }} />
      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={22} color={color} />
        </div>
        <div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: '#0F172A', lineHeight: 1, letterSpacing: '-0.6px' }}>{value}</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>{label}</div>
          {sub && <div style={{ fontSize: '11px', color: color, fontWeight: '600', marginTop: '2px' }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Team card ─────────────────────────────────────────────────────────────────
function TeamCard({ team, primary }: { team: TeamStat; primary: string }) {
  const [hover, setHover] = useState(false);
  const hasEvent = team.next_event !== null;
  const accentColor = hasEvent ? TYPE_COLOR[team.next_event!.type] ?? primary : '#E2E8F0';

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff',
        borderRadius: '16px',
        border: `1px solid ${hover ? '#CBD5E1' : '#E2E8F0'}`,
        overflow: 'hidden',
        boxShadow: hover ? '0 6px 20px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
        transform: hover ? 'translateY(-1px)' : 'none',
        display: 'flex',
        cursor: 'pointer',
      }}
    >
      {/* Left accent strip */}
      <div style={{ width: '4px', flexShrink: 0, background: hasEvent ? `linear-gradient(180deg, ${accentColor}, ${accentColor}60)` : '#F1F5F9', transition: 'background 0.2s' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 14px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #F8FAFC' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px', fontWeight: '800', color: primary }}>
            {teamInitials(team.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {team.name}
            </div>
            {team.age_group && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>{team.age_group}</div>}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '22px', fontWeight: '800', color: primary, lineHeight: 1, letterSpacing: '-0.3px' }}>{team.player_count}</div>
            <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>players</div>
          </div>
        </div>

        {/* Next event */}
        <div style={{ padding: '12px 18px 14px' }}>
          {team.next_event ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Next Event</span>
                <span style={{ fontSize: '10px', fontWeight: '700', color: TYPE_COLOR[team.next_event.type] ?? '#64748B', background: TYPE_BG[team.next_event.type] ?? '#F1F5F9', borderRadius: '4px', padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {TYPE_LABEL[team.next_event.type] ?? team.next_event.type}
                </span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', marginBottom: '6px' }}>{team.next_event.title}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748B' }}>
                  <Clock size={11} color="#94A3B8" />
                  {fmtDate(team.next_event.event_date)}{team.next_event.event_time ? ` · ${fmtTime(team.next_event.event_time)}` : ''}
                </span>
                {team.next_event.location && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748B', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                    <MapPin size={11} color="#94A3B8" />
                    {team.next_event.location}
                  </span>
                )}
              </div>
              {team.player_count > 0 && (() => {
                const total       = team.player_count;
                const going       = team.rsvp_attending;
                const cant        = team.rsvp_not_attending;
                const pending     = total - going - cant;
                const goingPct    = Math.min(100, Math.round((going   / total) * 100));
                const cantPct     = Math.min(100 - goingPct, Math.round((cant    / total) * 100));
                const pendingPct  = 100 - goingPct - cantPct;
                return (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', display: 'flex', background: '#E2E8F0' }}>
                      {goingPct   > 0 && <div style={{ flex: goingPct,   background: '#22C55E' }} />}
                      {cantPct    > 0 && <div style={{ flex: cantPct,    background: '#EF4444' }} />}
                      {pendingPct > 0 && <div style={{ flex: pendingPct, background: '#E2E8F0' }} />}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                      <span style={{ fontSize: '10px', color: '#16A34A', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
                        {going} going
                      </span>
                      <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
                        {cant} can&apos;t
                      </span>
                      <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#CBD5E1', display: 'inline-block' }} />
                        {pending} pending
                      </span>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <CalendarDays size={14} color="#CBD5E1" />
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>No upcoming events</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const { profile, club, teams } = useDashboard();
  const [stats, setStats]     = useState<TeamStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [coachCounts, setCoachCounts] = useState<Record<string, number>>({});

  const [wizardOpen, setWizardOpen]     = useState(false);
  const [wizardStep, setWizardStep]     = useState(0);

  const primary  = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const today    = new Date().toISOString().split('T')[0];
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Coach';

  function openWizard(step: number) { setWizardStep(step); setWizardOpen(true); }

  useEffect(() => {
    if (!teams.length) { setLoading(false); return; }
    loadStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  async function loadStats() {
    setLoading(true);
    const teamIds = teams.map((t) => t.id);

    const [playerRes, eventRes, coachRes] = await Promise.all([
      supabase.from('players').select('team_id').in('team_id', teamIds),
      supabase.from('events').select('id,title,type,event_date,event_time,location,team_id').in('team_id', teamIds).gte('event_date', today).order('event_date').order('event_time').limit(teamIds.length * 3),
      supabase.from('team_members').select('team_id').in('team_id', teamIds).in('role', ['coach', 'org_admin']),
    ]);
    const cMap: Record<string, number> = {};
    for (const c of coachRes.data ?? []) cMap[c.team_id] = (cMap[c.team_id] ?? 0) + 1;
    setCoachCounts(cMap);

    const playerMap: Record<string, number> = {};
    for (const p of (playerRes.data ?? []) as PlayerRow[]) {
      if (p.team_id) playerMap[p.team_id] = (playerMap[p.team_id] ?? 0) + 1;
    }

    const nextEventMap: Record<string, EventRow> = {};
    for (const ev of (eventRes.data ?? []) as EventRow[]) {
      if (!nextEventMap[ev.team_id]) nextEventMap[ev.team_id] = ev;
    }

    const allEventIds = Object.values(nextEventMap).map((e) => e.id);
    const attendingMap: Record<string, number>    = {};
    const notAttendingMap: Record<string, number> = {};
    if (allEventIds.length) {
      const { data: rsvps } = await supabase.from('event_rsvps').select('event_id,status').in('event_id', allEventIds);
      for (const r of (rsvps ?? []) as RsvpRow[]) {
        if (r.status === 'attending')     attendingMap[r.event_id]    = (attendingMap[r.event_id]    ?? 0) + 1;
        if (r.status === 'not_attending') notAttendingMap[r.event_id] = (notAttendingMap[r.event_id] ?? 0) + 1;
      }
    }

    setStats(teams.map((t) => ({
      ...t,
      player_count:        playerMap[t.id] ?? 0,
      next_event:          nextEventMap[t.id] ?? null,
      rsvp_attending:      nextEventMap[t.id] ? (attendingMap[nextEventMap[t.id].id]    ?? 0) : 0,
      rsvp_not_attending:  nextEventMap[t.id] ? (notAttendingMap[nextEventMap[t.id].id] ?? 0) : 0,
    })));
    setLoading(false);
  }

  const totalPlayers  = stats.reduce((s, t) => s + t.player_count, 0);
  const totalUpcoming = stats.filter((t) => t.next_event !== null).length;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @media (max-width: 768px) {
          .ovw-header { padding: 12px 16px !important; flex-wrap: wrap !important; gap: 8px !important; }
          .ovw-header-actions { display: none !important; }
          .ovw-content { padding: 14px 16px !important; }
          .ovw-stat-cards { grid-template-columns: 1fr !important; gap: 10px !important; }
          .ovw-team-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Sticky header ── */}
      <div className="ovw-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '20px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Club</div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>
            {greeting(firstName)} 👋
          </h1>
          <p style={{ fontSize: '13px', color: '#94A3B8', margin: '3px 0 0' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Quick actions */}
        <div className="ovw-header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link href="/dashboard/schedule" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '9px', padding: '8px 14px', fontSize: '13px', fontWeight: '600', color: '#374151', textDecoration: 'none' }}>
            <CalendarDays size={14} color="#64748B" /> Schedule
          </Link>
          <Link href="/dashboard/email" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '9px', padding: '8px 14px', fontSize: '13px', fontWeight: '600', color: '#374151', textDecoration: 'none' }}>
            <Mail size={14} color="#64748B" /> Email team
          </Link>
          <Link href="/dashboard/roster" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: primary, borderRadius: '9px', padding: '9px 16px', fontSize: '13px', fontWeight: '700', color: '#fff', textDecoration: 'none', border: 'none' }}>
            <Plus size={14} /> Add player
          </Link>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="ovw-content" style={{ padding: '24px 32px' }}>

      {/* ── Setup progress card (org_admin only, disappears when complete) ── */}
      {!loading && (profile?.role === 'org_admin' || profile?.role === 'app_admin') && (
        <SetupProgressCard onOpen={openWizard} />
      )}

      {/* ── Stat cards ── */}
      <div className="ovw-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {loading ? (
          [0, 1, 2].map((i) => (
            <div key={i} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <div style={{ height: '3px', background: '#F1F5F9' }} />
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Sk w="48px" h="48px" r="12px" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Sk w="50px" h="30px" />
                  <Sk w="100px" h="13px" />
                </div>
              </div>
            </div>
          ))
        ) : (
          <>
            <StatCard icon={Users}         label="Total players"     value={totalPlayers}  color={primary}    sub={teams.length > 0 ? `across ${teams.length} team${teams.length !== 1 ? 's' : ''}` : undefined} />
            <StatCard icon={LayoutGrid}    label="Teams"             value={teams.length}  color="#8B5CF6" />
            <StatCard icon={CalendarCheck} label="Teams with events" value={totalUpcoming} color="#F59E0B"    sub={totalUpcoming > 0 ? 'upcoming this week' : 'no scheduled events'} />
          </>
        )}
      </div>

      {/* ── Attention warnings (org_admin only) ── */}
      {!loading && profile?.role === 'org_admin' && (() => {
        const noCoach    = stats.filter((t) => !coachCounts[t.id]).map((t) => t.name);
        const noPlayers  = stats.filter((t) => t.player_count === 0).map((t) => t.name);
        const noSchedule = stats.filter((t) => !t.next_event).map((t) => t.name);
        if (!noCoach.length && !noPlayers.length && !noSchedule.length) return null;
        const items = [
          ...(noCoach.length    ? [{ msg: `${noCoach.length} team${noCoach.length !== 1 ? 's have' : ' has'} no coach assigned`,        teams: noCoach }]    : []),
          ...(noPlayers.length  ? [{ msg: `${noPlayers.length} team${noPlayers.length !== 1 ? 's have' : ' has'} no players on the roster`, teams: noPlayers }] : []),
          ...(noSchedule.length ? [{ msg: `${noSchedule.length} team${noSchedule.length !== 1 ? 's have' : ' has'} no upcoming events`,     teams: noSchedule }] : []),
        ];
        return (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '14px', padding: '14px 18px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400E', marginBottom: '6px' }}>Needs attention</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {items.map((item) => (
                  <div key={item.msg} style={{ fontSize: '13px', color: '#78350F' }}>
                    {item.msg} — <span style={{ color: '#92400E', fontWeight: '500' }}>{item.teams.slice(0, 3).join(', ')}{item.teams.length > 3 ? ` +${item.teams.length - 3} more` : ''}</span>
                  </div>
                ))}
              </div>
              <Link href="/dashboard/teams" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '700', color: '#D97706', textDecoration: 'none', marginTop: '10px' }}>
                View Teams page <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        );
      })()}

      {/* ── Teams section ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>Your Teams</h2>
        <Link href="/dashboard/roster" style={{ fontSize: '13px', color: primary, textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
          Manage roster <ArrowRight size={13} />
        </Link>
      </div>

      {loading ? (
        <div className="ovw-team-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: '4px', background: '#F1F5F9' }} />
              <div style={{ flex: 1 }}>
                <div style={{ padding: '16px 18px 14px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #F8FAFC' }}>
                  <Sk w="40px" h="40px" r="10px" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <Sk w="120px" h="14px" />
                    <Sk w="60px" h="11px" />
                  </div>
                  <Sk w="28px" h="22px" />
                </div>
                <div style={{ padding: '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <Sk w="80px" h="10px" />
                  <Sk w="140px" h="13px" />
                  <Sk w="110px" h="11px" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : stats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 40px', background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '22px' }}>
            ⚽
          </div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#64748B', marginBottom: '6px' }}>No teams yet</div>
          <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '20px' }}>Teams you manage will appear here</div>
          <Link href="/dashboard/roster" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: primary, color: '#fff', fontWeight: '700', fontSize: '13px', padding: '10px 20px', borderRadius: '10px', textDecoration: 'none' }}>
            Set up your roster <ArrowRight size={13} />
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
          {stats.map((team) => (
            <Link key={team.id} href={`/dashboard/teams/${team.id}`} style={{ textDecoration: 'none', display: 'block' }}>
              <TeamCard team={team} primary={primary} />
            </Link>
          ))}
        </div>
      )}
      </div> {/* end scrollable content */}

      {wizardOpen && <SetupWizard initialStep={wizardStep} onClose={() => { setWizardOpen(false); loadStats(); }} />}
    </div>
  );
}
