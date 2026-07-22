'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, Layers, CalendarDays, MapPin, Clock, Plus, Megaphone,
  AlertTriangle, ArrowRight, Target, ChevronRight, XCircle, DollarSign,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import SetupWizard from '@/components/dashboard/SetupWizard';
import SetupProgressCard from '@/components/dashboard/SetupProgressCard';

type FieldClosure  = { id: string; field_name: string; reason: string | null; closed_from: string; closed_until: string | null; };
type EventRow      = { id: string; title: string; type: string; event_date: string; event_time: string | null; location: string | null; team_id: string; };
type RsvpCounts    = { attending: number; not_attending: number };
type FeeStats      = { outstanding: number; families: number; configured: boolean };
type TodayWeather  = { rain: number; code: number; tempC: number };

const TYPE_COLOR: Record<string, string> = { game: '#EF4444', training: '#22C55E', other: '#8B5CF6' };
const TYPE_BG:    Record<string, string> = { game: '#FEF2F2', training: '#F0FDF4', other: '#F5F3FF' };
const TYPE_LABEL: Record<string, string> = { game: 'Game',    training: 'Training', other: 'Other'  };

function fmtDate(iso: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function greeting(name: string): string {
  const h = new Date().getHours();
  return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${name}`;
}
function isActiveClosure(c: FieldClosure): boolean {
  const now = new Date();
  if (new Date(c.closed_from) > now) return false;
  if (!c.closed_until) return true;
  return new Date(c.closed_until) > now;
}
function fmtMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString()}`;
  }
}
function weatherEmoji(code: number): string {
  if (code === 0)  return '☀️';
  if (code <= 3)   return '⛅';
  if (code <= 48)  return '🌫️';
  if (code <= 67)  return '🌧️';
  if (code <= 77)  return '❄️';
  if (code <= 82)  return '🌦️';
  return '⛈️';
}
function weatherLabel(code: number): string {
  if (code === 0)  return 'Clear';
  if (code <= 3)   return 'Cloudy';
  if (code <= 48)  return 'Foggy';
  if (code <= 55)  return 'Drizzle';
  if (code <= 67)  return 'Rain';
  if (code <= 77)  return 'Snow';
  if (code <= 82)  return 'Showers';
  return 'Storm';
}

function Sk({ w = '100%', h = '16px', r = '6px' }: { w?: string; h?: string; r?: string }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />;
}

function StatTile({ value, label, sub, color, icon: Icon }: { value: number | string; label: string; sub?: string; color: string; icon: React.ElementType }) {
  return (
    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ height: '3px', background: color }} />
      <div style={{ padding: '18px 20px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '7px', background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
          <Icon size={16} color={color} />
        </div>
        <div style={{ fontSize: '28px', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.5px', lineHeight: 1, marginBottom: '4px' }}>{value}</div>
        <div style={{ fontSize: '12px', color: '#64748B' }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color, fontWeight: '600', marginTop: '2px' }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { profile, club, teams } = useDashboard();
  const primary       = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const tryoutsActive = club?.tryouts_active ?? false;
  const firstName     = profile?.full_name?.split(' ')[0] ?? 'Coach';
  const today         = new Date().toISOString().split('T')[0];
  const weekLater     = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const teamMap       = new Map(teams.map(t => [t.id, t.name]));

  const [loading,        setLoading]        = useState(true);
  const [playerCount,    setPlayerCount]    = useState(0);
  const [eventsThisWeek, setEventsThisWeek] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<EventRow[]>([]);
  const [rsvpMap,        setRsvpMap]        = useState<Record<string, RsvpCounts>>({});
  const [teamPlayerCounts, setTeamPlayerCounts] = useState<Record<string, number>>({});
  const [closures,       setClosures]       = useState<FieldClosure[]>([]);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [teamsNoCoach,   setTeamsNoCoach]   = useState<string[]>([]);
  const [teamsNoPlayers, setTeamsNoPlayers] = useState<string[]>([]);
  const [feeStats,       setFeeStats]       = useState<FeeStats | null>(null);
  const [todayWeather,   setTodayWeather]   = useState<TodayWeather | null>(null);
  const [tryoutRegs,     setTryoutRegs]     = useState(0);
  const [tryoutOffers,   setTryoutOffers]   = useState({ total: 0, accepted: 0, pending: 0 });
  const [wizardOpen,     setWizardOpen]     = useState(false);
  const [wizardStep,     setWizardStep]     = useState(0);

  // Weather — separate effect, only when location is set
  useEffect(() => {
    if (!club?.latitude || !club?.longitude) return;
    const tz = club.timezone ?? 'America/New_York';
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${club.latitude}&longitude=${club.longitude}&hourly=precipitation_probability,weathercode,temperature_2m&timezone=${encodeURIComponent(tz)}&forecast_days=2`)
      .then(r => r.json())
      .then(d => {
        const now = new Date();
        const nowHour = now.getHours();
        const todayStr = now.toISOString().split('T')[0];
        type HourEntry = { t: string; rain: number; code: number; temp: number };
        const hours: HourEntry[] = (d.hourly?.time ?? []).map((t: string, i: number) => ({
          t, rain: d.hourly.precipitation_probability[i], code: d.hourly.weathercode[i], temp: d.hourly.temperature_2m[i],
        }));
        // Find current hour first, then next upcoming hour, then any hour today
        const current = hours.find(h => h.t.startsWith(todayStr) && new Date(h.t).getHours() === nowHour);
        const upcoming = hours.find(h => h.t.startsWith(todayStr) && new Date(h.t).getHours() > nowHour);
        const pick = current ?? upcoming ?? hours.find(h => h.t.startsWith(todayStr));
        if (pick) setTodayWeather({ rain: pick.rain, code: pick.code, tempC: Math.round(pick.temp) });
      }).catch(() => {});
  }, [club?.latitude, club?.longitude, club?.timezone]);

  useEffect(() => {
    if (!club) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id, teams.length]);

  async function load() {
    if (!club) return;
    setLoading(true);
    const teamIds = teams.map(t => t.id);

    if (!teamIds.length) {
      const { data: cls } = await supabase.from('field_closures').select('id,field_name,reason,closed_from,closed_until').eq('club_id', club.id).limit(20);
      setClosures((cls ?? []) as FieldClosure[]);
      setLoading(false);
      return;
    }

    // All independent queries in one round-trip
    const [playerRes, weekRes, upcomingRes, closureRes, inviteRes, coachRes, allPlayerRes, feeRes] = await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }).in('team_id', teamIds),
      supabase.from('events').select('id', { count: 'exact', head: true }).in('team_id', teamIds).gte('event_date', today).lte('event_date', weekLater),
      supabase.from('events').select('id,title,type,event_date,event_time,location,team_id').in('team_id', teamIds).gte('event_date', today).order('event_date').order('event_time').limit(5),
      supabase.from('field_closures').select('id,field_name,reason,closed_from,closed_until').eq('club_id', club.id).order('closed_from', { ascending: false }).limit(20),
      supabase.from('invites').select('id', { count: 'exact', head: true }).in('team_id', teamIds).is('accepted_at', null),
      supabase.from('team_members').select('team_id').in('team_id', teamIds).in('role', ['coach', 'org_admin']),
      supabase.from('players').select('team_id').in('team_id', teamIds),
      supabase.from('player_fees').select('player_id,amount_due,amount_paid,discount,status').in('team_id', teamIds),
    ]);

    setPlayerCount(playerRes.count ?? 0);
    setEventsThisWeek(weekRes.count ?? 0);
    setClosures((closureRes.data ?? []) as FieldClosure[]);
    setPendingInvites(inviteRes.count ?? 0);

    const teamsWithCoach   = new Set((coachRes.data   ?? []).map((r: { team_id: string }) => r.team_id));
    const allPlayerRows    = (allPlayerRes.data ?? []) as { team_id: string }[];
    const teamsWithPlayers = new Set(allPlayerRows.map(r => r.team_id));
    setTeamsNoCoach(teams.filter(t => !teamsWithCoach.has(t.id)).map(t => t.name));
    setTeamsNoPlayers(teams.filter(t => !teamsWithPlayers.has(t.id)).map(t => t.name));
    const tpCounts: Record<string, number> = {};
    for (const r of allPlayerRows) tpCounts[r.team_id] = (tpCounts[r.team_id] ?? 0) + 1;
    setTeamPlayerCounts(tpCounts);

    // Fee stats
    type FeeRow = { player_id: string; amount_due: number; amount_paid: number; discount: number; status: string };
    const feeRows = (feeRes.data ?? []) as FeeRow[];
    if (feeRows.length > 0) {
      const outstanding = feeRows.filter(f => !['paid', 'waived'].includes(f.status));
      const outstandingTotal = outstanding.reduce((s, f) => s + Math.max(+f.amount_due - +f.discount - +f.amount_paid, 0), 0);
      const outstandingFamilies = new Set(outstanding.map(f => f.player_id)).size;
      setFeeStats({ outstanding: outstandingTotal, families: outstandingFamilies, configured: true });
    } else {
      setFeeStats(null);
    }

    // Upcoming events + RSVPs (sequential — needs event IDs first)
    const eventList = (upcomingRes.data ?? []) as EventRow[];
    setUpcomingEvents(eventList);

    if (eventList.length > 0) {
      const { data: rsvps } = await supabase
        .from('event_rsvps')
        .select('event_id,status')
        .in('event_id', eventList.map(e => e.id));
      const map: Record<string, RsvpCounts> = {};
      for (const r of rsvps ?? []) {
        if (!map[r.event_id]) map[r.event_id] = { attending: 0, not_attending: 0 };
        if (r.status === 'attending')     map[r.event_id].attending++;
        if (r.status === 'not_attending') map[r.event_id].not_attending++;
      }
      setRsvpMap(map);
    }

    // Tryout data (conditional)
    if (tryoutsActive) {
      const [regRes, offerRes] = await Promise.all([
        supabase.from('tryout_players').select('id', { count: 'exact', head: true }).eq('club_id', club.id),
        supabase.from('tryout_assignments').select('offer_status').eq('club_id', club.id),
      ]);
      setTryoutRegs(regRes.count ?? 0);
      const offers = (offerRes.data ?? []) as { offer_status: string }[];
      setTryoutOffers({
        total:    offers.filter(o => ['Sent','Accepted','Declined'].includes(o.offer_status ?? '')).length,
        accepted: offers.filter(o => o.offer_status === 'Accepted').length,
        pending:  offers.filter(o => o.offer_status === 'Sent').length,
      });
    }

    setLoading(false);
  }

  const activeClosures = closures.filter(isActiveClosure);
  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  const attentionItems: { msg: string; link: string }[] = [];
  if (!loading && isAdmin) {
    if (pendingInvites > 0)      attentionItems.push({ msg: `${pendingInvites} parent invite${pendingInvites !== 1 ? 's' : ''} awaiting acceptance`, link: '/dashboard/players' });
    if (teamsNoCoach.length > 0)   attentionItems.push({ msg: `${teamsNoCoach.length} team${teamsNoCoach.length !== 1 ? 's' : ''} without a coach assigned`, link: '/dashboard/teams' });
    if (teamsNoPlayers.length > 0) attentionItems.push({ msg: `${teamsNoPlayers.length} team${teamsNoPlayers.length !== 1 ? 's' : ''} with no players on the roster`, link: '/dashboard/teams' });
    if (feeStats && feeStats.outstanding > 0) attentionItems.push({ msg: `${fmtMoney(feeStats.outstanding, club?.currency ?? 'USD')} outstanding across ${feeStats.families} ${feeStats.families !== 1 ? 'families' : 'family'}`, link: '/dashboard/fees' });
  }

  const statTileCount = feeStats?.configured ? 5 : 4;

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes pulse   { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
      `}</style>

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '3px' }}>Club Overview</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>{greeting(firstName)}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '3px' }}>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            {todayWeather && (
              <span style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '12px', borderLeft: '1px solid #E2E8F0' }}>
                {weatherEmoji(todayWeather.code)} Now: {weatherLabel(todayWeather.code)} · {todayWeather.rain}% rain · {todayWeather.tempC}°C
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link href="/dashboard/fields" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '7px', padding: '8px 13px', fontSize: '12.5px', fontWeight: '700', color: '#EF4444', textDecoration: 'none' }}>
            <XCircle size={13}/> Close Field
          </Link>
          <Link href="/dashboard/announcements" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '7px', padding: '8px 13px', fontSize: '12.5px', fontWeight: '700', color: '#374151', textDecoration: 'none' }}>
            <Megaphone size={13}/> Announce
          </Link>
          <Link href="/dashboard/schedule" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '7px', padding: '8px 13px', fontSize: '12.5px', fontWeight: '700', color: '#374151', textDecoration: 'none' }}>
            <CalendarDays size={13}/> Add Event
          </Link>
          {tryoutsActive ? (
            <Link href="/dashboard/tryouts/rosters" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: primary, borderRadius: '7px', padding: '8px 14px', fontSize: '12.5px', fontWeight: '700', color: '#fff', textDecoration: 'none' }}>
              <Target size={13}/> Send Offer
            </Link>
          ) : (
            <Link href="/dashboard/players" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: primary, borderRadius: '7px', padding: '8px 14px', fontSize: '12.5px', fontWeight: '700', color: '#fff', textDecoration: 'none' }}>
              <Plus size={13}/> Add Player
            </Link>
          )}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 32px' }}>

        {/* Setup card */}
        {!loading && isAdmin && <SetupProgressCard onOpen={(step) => { setWizardStep(step); setWizardOpen(true); }} />}

        {/* Field closure alert */}
        {!loading && activeClosures.length > 0 && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '10px', padding: '13px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#EF4444' }}>
                  {activeClosures.length} field{activeClosures.length !== 1 ? 's' : ''} currently closed
                </span>
                <span style={{ fontSize: '13px', color: '#B91C1C', marginLeft: '8px' }}>
                  {activeClosures.map(c => c.field_name).join(', ')}
                </span>
              </div>
            </div>
            <Link href="/dashboard/fields" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '700', color: '#EF4444', textDecoration: 'none', flexShrink: 0 }}>
              Manage <ArrowRight size={12}/>
            </Link>
          </div>
        )}

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${statTileCount}, 1fr)`, gap: '14px', marginBottom: '24px' }}>
          {loading ? (
            [0,1,2,3].map(i => (
              <div key={i} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{ height: '3px', background: '#F1F5F9' }} />
                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Sk w="32px" h="32px" r="7px" />
                  <Sk w="40px" h="28px" r="5px" />
                  <Sk w="90px" h="12px" />
                </div>
              </div>
            ))
          ) : (
            <>
              <StatTile value={playerCount}    label="Total players"    sub={`across ${teams.length} team${teams.length !== 1 ? 's' : ''}`} color={primary}    icon={Users} />
              <StatTile value={teams.length}   label="Teams"            color="#8B5CF6" icon={Layers} />
              <StatTile value={eventsThisWeek} label="Events this week" color="#F59E0B" icon={CalendarDays} />
              <StatTile
                value={activeClosures.length === 0 ? 'All open' : `${activeClosures.length} closed`}
                label="Field status"
                color={activeClosures.length > 0 ? '#EF4444' : '#16A34A'}
                icon={MapPin}
              />
              {feeStats?.configured && (
                <StatTile
                  value={feeStats.outstanding > 0 ? fmtMoney(feeStats.outstanding, club?.currency ?? 'USD') : 'All clear'}
                  label="Outstanding fees"
                  sub={feeStats.outstanding > 0 ? `${feeStats.families} ${feeStats.families !== 1 ? 'families' : 'family'} with balance` : 'All fees collected'}
                  color={feeStats.outstanding > 0 ? '#F59E0B' : '#16A34A'}
                  icon={DollarSign}
                />
              )}
            </>
          )}
        </div>

        {/* Needs attention */}
        {attentionItems.length > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '16px 18px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <AlertTriangle size={14} color="#D97706" />
              <span style={{ fontSize: '12px', fontWeight: '800', color: '#92400E', textTransform: 'uppercase', letterSpacing: '1px' }}>Needs attention</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {attentionItems.map(item => (
                <Link key={item.msg} href={item.link} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none', padding: '8px 12px', background: '#FFF7ED', borderRadius: '7px', border: '1px solid #FDE68A' }}>
                  <span style={{ fontSize: '12.5px', color: '#78350F' }}>{item.msg}</span>
                  <ChevronRight size={12} color="#D97706" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: tryoutsActive ? '1fr 300px' : '1fr', gap: '20px', alignItems: 'start' }}>

          {/* ── Upcoming events ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Upcoming Events</h2>
              <Link href="/dashboard/schedule" style={{ fontSize: '12.5px', color: primary, textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Full schedule <ArrowRight size={12}/>
              </Link>
            </div>

            {loading ? (
              <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{ padding: '14px 18px', borderBottom: i < 4 ? '1px solid #F1F5F9' : 'none', display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <Sk w="3px" h="40px" r="2px" />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <Sk w="55%" h="14px" />
                      <Sk w="35%" h="11px" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-end' }}>
                      <Sk w="60px" h="12px" />
                      <Sk w="40px" h="10px" />
                    </div>
                  </div>
                ))}
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '48px 32px', textAlign: 'center' }}>
                <CalendarDays size={36} color="#E2E8F0" style={{ margin: '0 auto 12px', display: 'block' }} />
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#94A3B8', marginBottom: '4px' }}>No upcoming events</div>
                <div style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '16px' }}>Add events from the Schedule page</div>
                <Link href="/dashboard/schedule" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: primary, color: '#fff', fontWeight: '700', fontSize: '12.5px', padding: '8px 16px', borderRadius: '7px', textDecoration: 'none' }}>
                  <Plus size={13}/> Add event
                </Link>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                {upcomingEvents.map((ev, i) => {
                  const teamName = teamMap.get(ev.team_id) ?? '';
                  const isToday  = ev.event_date === today;
                  const rsvp     = rsvpMap[ev.id];
                  return (
                    <div key={ev.id} style={{ padding: '14px 18px', borderBottom: i < upcomingEvents.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'flex-start', gap: '14px', background: isToday ? `${primary}06` : '#fff' }}>
                      {/* Type stripe */}
                      <div style={{ width: '3px', borderRadius: '2px', background: TYPE_COLOR[ev.type] ?? '#94A3B8', flexShrink: 0, alignSelf: 'stretch', minHeight: '38px' }} />

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>
                          {ev.title}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: rsvp ? '7px' : 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: TYPE_COLOR[ev.type] ?? '#64748B', background: TYPE_BG[ev.type] ?? '#F1F5F9', padding: '1px 7px', borderRadius: '4px' }}>
                            {TYPE_LABEL[ev.type] ?? ev.type}
                          </span>
                          {teamName && <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>{teamName}</span>}
                          {ev.location && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11.5px', color: '#94A3B8', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                              <MapPin size={10}/>{ev.location}
                            </span>
                          )}
                        </div>

                        {/* RSVP counts */}
                        {rsvp !== undefined && (
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E', display: 'inline-block' }}/>
                              {rsvp.attending} going
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }}/>
                              {rsvp.not_attending} can&apos;t
                            </span>
                            <span style={{ fontSize: '11px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#CBD5E1', display: 'inline-block' }}/>
                              {teamPlayerCounts[ev.team_id] != null ? Math.max(0, teamPlayerCounts[ev.team_id] - rsvp.attending - rsvp.not_attending) : '—'} pending
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Date + time */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: isToday ? primary : '#374151' }}>{fmtDate(ev.event_date)}</div>
                        {ev.event_time && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#94A3B8', marginTop: '2px', justifyContent: 'flex-end' }}>
                            <Clock size={10}/>{fmtTime(ev.event_time)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Tryout snapshot ── */}
          {tryoutsActive && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Tryouts</h2>
                <Link href="/dashboard/tryouts" style={{ fontSize: '12.5px', color: primary, textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Full view <ArrowRight size={12}/>
                </Link>
              </div>
              {loading ? (
                <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                  <div style={{ height: '3px', background: '#F1F5F9' }} />
                  <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[0,1,2,3].map(i => <Sk key={i} h="64px" r="8px" />)}
                  </div>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                  <div style={{ height: '3px', background: `linear-gradient(90deg, ${primary}, ${primary}60)` }} />
                  <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Registered', value: tryoutRegs,            color: '#0F172A' },
                      { label: 'Offers sent', value: tryoutOffers.total,   color: '#3B82F6' },
                      { label: 'Accepted',    value: tryoutOffers.accepted, color: '#16A34A' },
                      { label: 'Awaiting',    value: tryoutOffers.pending,  color: '#F59E0B' },
                    ].map(item => (
                      <div key={item.label} style={{ textAlign: 'center', padding: '12px 8px', background: '#F8FAFC', borderRadius: '8px' }}>
                        <div style={{ fontSize: '30px', fontWeight: '900', color: item.color, letterSpacing: '-0.5px', lineHeight: 1 }}>{item.value}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600', marginTop: '5px' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '0 16px 16px', display: 'flex', gap: '8px' }}>
                    <Link href="/dashboard/tryouts/players" style={{ flex: 1, textAlign: 'center', padding: '9px', borderRadius: '7px', background: '#F1F5F9', color: '#374151', fontSize: '12px', fontWeight: '700', textDecoration: 'none' }}>
                      Player Pool
                    </Link>
                    <Link href="/dashboard/tryouts/rosters" style={{ flex: 1, textAlign: 'center', padding: '9px', borderRadius: '7px', background: primary, color: '#fff', fontSize: '12px', fontWeight: '700', textDecoration: 'none' }}>
                      Send Offers
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {wizardOpen && <SetupWizard initialStep={wizardStep} onClose={() => { setWizardOpen(false); load(); }} />}
    </div>
  );
}
