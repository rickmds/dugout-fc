'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, Layers, CalendarDays, MapPin, Clock, Plus, Megaphone,
  AlertTriangle, ArrowRight, ChevronRight, XCircle, DollarSign, Target,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import SetupWizard from '@/components/dashboard/SetupWizard';
import SetupProgressCard from '@/components/dashboard/SetupProgressCard';

type FieldClosure = { id: string; field_name: string; reason: string | null; closed_from: string; closed_until: string | null };
type EventRow     = { id: string; title: string; type: string; event_date: string; event_time: string | null; location: string | null; team_id: string };
type RsvpCounts  = { attending: number; not_attending: number };
type FeeStats    = { outstanding: number; families: number; configured: boolean };
type Weather     = { rain: number; condition: string; tempC: number };

const TYPE_COLOR: Record<string, string> = { game: '#EF4444', training: '#22C55E', other: '#8B5CF6' };
const TYPE_BG:   Record<string, string>  = { game: '#FEF2F2', training: '#F0FDF4', other: '#F5F3FF' };
const TYPE_LABEL: Record<string, string> = { game: 'Game', training: 'Training', other: 'Other' };

function fmtDate(iso: string): { label: string; isToday: boolean; isTomorrow: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: 'Today',    isToday: true,  isTomorrow: false };
  if (diff === 1) return { label: 'Tomorrow', isToday: false, isTomorrow: true  };
  if (diff <= 6)  return { label: d.toLocaleDateString('en-US', { weekday: 'long' }), isToday: false, isTomorrow: false };
  return              { label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), isToday: false, isTomorrow: false };
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
function fmtMoney(n: number, currency = 'USD'): string {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `$${Math.round(n).toLocaleString()}`; }
}
function weatherEmoji(cond: string): string {
  const c = cond.toLowerCase();
  if (c.includes('sunny') || c.includes('clear'))  return '☀️';
  if (c.includes('partly'))  return '⛅';
  if (c.includes('overcast') || c.includes('cloudy')) return '☁️';
  if (c.includes('fog') || c.includes('mist'))  return '🌫️';
  if (c.includes('drizzle') || c.includes('light rain')) return '🌦️';
  if (c.includes('thunder') || c.includes('storm')) return '⛈️';
  if (c.includes('snow') || c.includes('sleet') || c.includes('ice')) return '❄️';
  if (c.includes('rain')) return '🌧️';
  return '🌤️';
}

function Sk({ w = '100%', h = '14px', r = '6px' }: { w?: string; h?: string; r?: string }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />;
}

function StatTile({ value, label, sub, color, icon: Icon }: { value: number | string; label: string; sub?: string; color: string; icon: React.ElementType }) {
  const isText = typeof value === 'string';
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ height: '3px', background: color }} />
      <div style={{ padding: '18px 20px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
          <Icon size={15} color={color} />
        </div>
        <div style={{ fontSize: isText ? '20px' : '28px', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.5px', lineHeight: 1, marginBottom: '4px' }}>{value}</div>
        <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: '500' }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color, fontWeight: '700', marginTop: '2px' }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function SimpleDashboard({ onUpgrade }: { onUpgrade: () => void }) {
  const { profile, club, teams } = useDashboard();
  const primary       = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const tryoutsActive = club?.tryouts_active ?? false;
  const firstName     = profile?.full_name?.split(' ')[0] ?? 'Coach';
  const currency      = club?.currency ?? 'USD';
  const today         = new Date().toISOString().split('T')[0];
  const weekLater     = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const teamMap       = new Map(teams.map(t => [t.id, t.name]));

  const [loading,         setLoading]         = useState(true);
  const [weather,         setWeather]         = useState<Weather | null>(null);
  const [closures,        setClosures]        = useState<FieldClosure[]>([]);
  const [playerCount,     setPlayerCount]     = useState(0);
  const [eventsThisWeek,  setEventsThisWeek]  = useState(0);
  const [upcomingEvents,  setUpcomingEvents]  = useState<EventRow[]>([]);
  const [rsvpMap,         setRsvpMap]         = useState<Record<string, RsvpCounts>>({});
  const [teamPlayerCounts, setTeamPlayerCounts] = useState<Record<string, number>>({});
  const [pendingInvites,  setPendingInvites]  = useState(0);
  const [teamsNoCoach,    setTeamsNoCoach]    = useState<string[]>([]);
  const [teamsNoPlayers,  setTeamsNoPlayers]  = useState<string[]>([]);
  const [feeStats,        setFeeStats]        = useState<FeeStats | null>(null);
  const [wizardOpen,      setWizardOpen]      = useState(false);
  const [wizardStep,      setWizardStep]      = useState(0);

  useEffect(() => {
    if (!club?.latitude || !club?.longitude) return;
    fetch(`/api/weather?lat=${club.latitude}&lng=${club.longitude}`)
      .then(r => r.json())
      .then(d => {
        const cur = d.current;
        const day = d.forecast?.forecastday?.[0]?.day;
        if (cur) setWeather({ rain: day?.daily_chance_of_rain ?? 0, condition: cur.condition?.text ?? '', tempC: Math.round(cur.temp_c) });
      }).catch(() => {});
  }, [club?.latitude, club?.longitude]);

  useEffect(() => {
    if (!club) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id, teams.length]);

  async function load() {
    if (!club) return;
    setLoading(true);
    const teamIds = teams.map(t => t.id);

    const { data: cls } = await supabase.from('field_closures').select('id,field_name,reason,closed_from,closed_until').eq('club_id', club.id).limit(20);
    setClosures((cls ?? []) as FieldClosure[]);

    if (!teamIds.length) { setLoading(false); return; }

    const [playerRes, weekRes, upcomingRes, inviteRes, coachRes, allPlayerRes, feeRes] = await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }).in('team_id', teamIds),
      supabase.from('events').select('id', { count: 'exact', head: true }).in('team_id', teamIds).gte('event_date', today).lte('event_date', weekLater),
      supabase.from('events').select('id,title,type,event_date,event_time,location,team_id').in('team_id', teamIds).gte('event_date', today).order('event_date').order('event_time').limit(6),
      supabase.from('invites').select('id', { count: 'exact', head: true }).in('team_id', teamIds).is('accepted_at', null),
      supabase.from('team_members').select('team_id').in('team_id', teamIds).in('role', ['coach', 'org_admin']),
      supabase.from('players').select('team_id').in('team_id', teamIds),
      supabase.from('player_fees').select('player_id,amount_due,amount_paid,discount,status').in('team_id', teamIds),
    ]);

    setPlayerCount(playerRes.count ?? 0);
    setEventsThisWeek(weekRes.count ?? 0);
    setPendingInvites(inviteRes.count ?? 0);

    const teamsWithCoach   = new Set((coachRes.data ?? []).map((r: { team_id: string }) => r.team_id));
    const allPlayerRows    = (allPlayerRes.data ?? []) as { team_id: string }[];
    const teamsWithPlayers = new Set(allPlayerRows.map(r => r.team_id));
    setTeamsNoCoach(teams.filter(t => !teamsWithCoach.has(t.id)).map(t => t.name));
    setTeamsNoPlayers(teams.filter(t => !teamsWithPlayers.has(t.id)).map(t => t.name));
    const tpc: Record<string, number> = {};
    for (const r of allPlayerRows) tpc[r.team_id] = (tpc[r.team_id] ?? 0) + 1;
    setTeamPlayerCounts(tpc);

    type FeeRow = { player_id: string; amount_due: number; amount_paid: number; discount: number; status: string };
    const feeRows = (feeRes.data ?? []) as FeeRow[];
    if (feeRows.length > 0) {
      const outstanding = feeRows.filter(f => !['paid', 'waived'].includes(f.status));
      const total       = outstanding.reduce((s, f) => s + Math.max(+f.amount_due - +f.discount - +f.amount_paid, 0), 0);
      const families    = new Set(outstanding.map(f => f.player_id)).size;
      setFeeStats({ outstanding: total, families, configured: true });
    } else {
      setFeeStats(null);
    }

    const eventList = (upcomingRes.data ?? []) as EventRow[];
    setUpcomingEvents(eventList);

    if (eventList.length > 0) {
      const { data: rsvps } = await supabase.from('event_rsvps').select('event_id,status').in('event_id', eventList.map(e => e.id));
      const map: Record<string, RsvpCounts> = {};
      for (const r of rsvps ?? []) {
        if (!map[r.event_id]) map[r.event_id] = { attending: 0, not_attending: 0 };
        if (r.status === 'attending')     map[r.event_id].attending++;
        if (r.status === 'not_attending') map[r.event_id].not_attending++;
      }
      setRsvpMap(map);
    }

    setLoading(false);
  }

  const activeClosures = closures.filter(isActiveClosure);
  const isAdmin        = profile?.role === 'org_admin' || profile?.role === 'app_admin';
  const statCount      = feeStats?.configured ? 5 : 4;

  const attentionItems: { msg: string; link: string }[] = [];
  if (!loading && isAdmin) {
    if (pendingInvites > 0)        attentionItems.push({ msg: `${pendingInvites} parent invite${pendingInvites !== 1 ? 's' : ''} awaiting acceptance`, link: '/dashboard/players' });
    if (teamsNoCoach.length > 0)   attentionItems.push({ msg: `${teamsNoCoach.length} team${teamsNoCoach.length !== 1 ? 's' : ''} without a coach assigned`, link: '/dashboard/teams' });
    if (teamsNoPlayers.length > 0) attentionItems.push({ msg: `${teamsNoPlayers.length} team${teamsNoPlayers.length !== 1 ? 's' : ''} with no players on the roster`, link: '/dashboard/teams' });
    if (feeStats && feeStats.outstanding > 0) attentionItems.push({ msg: `${fmtMoney(feeStats.outstanding, currency)} outstanding across ${feeStats.families} ${feeStats.families !== 1 ? 'families' : 'family'}`, link: '/dashboard/fees' });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes pulse   { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        .hr:hover { background: #F8FAFC !important; }
      `}</style>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '2px' }}>Club Overview</div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>{greeting(firstName)}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px' }}>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            {weather && (
              <span style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: '10px', borderLeft: '1px solid #E2E8F0' }}>
                {weatherEmoji(weather.condition)} {weather.condition} · {weather.rain}% rain · {weather.tempC}°C
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Link href="/dashboard/fields" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '8px', padding: '8px 13px', fontSize: '12.5px', fontWeight: '700', color: '#EF4444', textDecoration: 'none' }}>
            <XCircle size={13}/> Close Field
          </Link>
          <Link href="/dashboard/announcements" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '8px 13px', fontSize: '12.5px', fontWeight: '700', color: '#374151', textDecoration: 'none' }}>
            <Megaphone size={13}/> Announce
          </Link>
          <Link href="/dashboard/schedule" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '8px 13px', fontSize: '12.5px', fontWeight: '700', color: '#374151', textDecoration: 'none' }}>
            <CalendarDays size={13}/> Add Event
          </Link>
          {tryoutsActive ? (
            <Link href="/dashboard/tryouts/rosters" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: primary, borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: '700', color: '#fff', textDecoration: 'none' }}>
              <Target size={13}/> Send Offer
            </Link>
          ) : (
            <Link href="/dashboard/players" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: primary, borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: '700', color: '#fff', textDecoration: 'none' }}>
              <Plus size={13}/> Add Player
            </Link>
          )}
          <button onClick={onUpgrade} style={{ background: 'none', border: 'none', fontSize: '11px', color: '#CBD5E1', cursor: 'pointer', padding: '8px 4px', fontWeight: '600' }}>
            Pro view
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {!loading && isAdmin && <SetupProgressCard onOpen={step => { setWizardStep(step); setWizardOpen(true); }} />}

        {/* Field closure alert */}
        {!loading && activeClosures.length > 0 && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '10px', padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#EF4444' }}>{activeClosures.length} field{activeClosures.length !== 1 ? 's' : ''} currently closed</span>
              <span style={{ fontSize: '13px', color: '#B91C1C' }}>{activeClosures.map(c => c.field_name).join(', ')}</span>
            </div>
            <Link href="/dashboard/fields" style={{ fontSize: '12px', fontWeight: '700', color: '#EF4444', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              Manage <ArrowRight size={12}/>
            </Link>
          </div>
        )}

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${statCount}, 1fr)`, gap: '14px' }}>
          {loading ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <div style={{ height: '3px', background: '#F1F5F9' }} />
              <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Sk w="32px" h="32px" r="8px" /><Sk w="44px" h="26px" r="4px" /><Sk w="70px" h="10px" />
              </div>
            </div>
          )) : (
            <>
              <StatTile value={playerCount}   label="Total players"    sub={`across ${teams.length} team${teams.length !== 1 ? 's' : ''}`} color={primary}    icon={Users} />
              <StatTile value={teams.length}  label="Teams"            color="#8B5CF6" icon={Layers} />
              <StatTile value={eventsThisWeek} label="Events this week" color="#F59E0B" icon={CalendarDays} />
              <StatTile
                value={activeClosures.length === 0 ? 'All open' : `${activeClosures.length} closed`}
                label="Field status"
                sub={activeClosures.length === 0 ? 'No closures' : activeClosures.map(c => c.field_name).join(', ')}
                color={activeClosures.length > 0 ? '#EF4444' : '#16A34A'}
                icon={MapPin}
              />
              {feeStats?.configured && (
                <StatTile
                  value={feeStats.outstanding > 0 ? fmtMoney(feeStats.outstanding, currency) : 'All clear'}
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
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #F8FAFC', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: '#FFFBEB', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={11} color="#D97706" />
              </div>
              <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Needs attention</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '700', color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '20px', padding: '1px 8px' }}>{attentionItems.length}</span>
            </div>
            {attentionItems.map((item, i) => (
              <Link key={item.msg} href={item.link} className="hr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none', padding: '11px 18px', borderBottom: i < attentionItems.length - 1 ? '1px solid #F8FAFC' : 'none', background: '#fff', transition: 'background 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: '#374151' }}>{item.msg}</span>
                </div>
                <ChevronRight size={13} color="#D97706" />
              </Link>
            ))}
          </div>
        )}

        {/* Upcoming events */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>Upcoming Events</span>
            <Link href="/dashboard/schedule" style={{ fontSize: '11.5px', color: primary, textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>
              Full schedule <ArrowRight size={11}/>
            </Link>
          </div>
          {loading ? (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ padding: '14px 20px', borderBottom: i < 4 ? '1px solid #F8FAFC' : 'none', display: 'flex', gap: '14px', alignItems: 'center' }}>
                  <Sk w="3px" h="44px" r="2px" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px' }}><Sk w="50%" h="14px" /><Sk w="30%" h="11px" /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-end' }}><Sk w="56px" h="12px" /><Sk w="40px" h="10px" /></div>
                </div>
              ))}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '48px 32px', textAlign: 'center' }}>
              <CalendarDays size={36} color="#E2E8F0" style={{ margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#94A3B8', marginBottom: '4px' }}>No upcoming events</div>
              <div style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '16px' }}>Add events from the Schedule page</div>
              <Link href="/dashboard/schedule" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: primary, color: '#fff', fontWeight: '700', fontSize: '12.5px', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none' }}>
                <Plus size={13}/> Add event
              </Link>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              {upcomingEvents.map((ev, i) => {
                const teamName = teamMap.get(ev.team_id) ?? '';
                const dateInfo = fmtDate(ev.event_date);
                const rsvp     = rsvpMap[ev.id];
                const pending  = rsvp != null && teamPlayerCounts[ev.team_id] != null
                  ? Math.max(0, teamPlayerCounts[ev.team_id] - rsvp.attending - rsvp.not_attending)
                  : null;
                return (
                  <div key={ev.id} className="hr" style={{ padding: '14px 20px', borderBottom: i < upcomingEvents.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: '14px', background: '#fff', transition: 'background 0.15s' }}>
                    <div style={{ width: '3px', borderRadius: '2px', background: TYPE_COLOR[ev.type] ?? '#94A3B8', flexShrink: 0, alignSelf: 'stretch', minHeight: '40px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '5px' }}>{ev.title}</div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: '700', color: TYPE_COLOR[ev.type], background: TYPE_BG[ev.type], padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>{TYPE_LABEL[ev.type] ?? ev.type}</span>
                        {teamName && <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>{teamName}</span>}
                      </div>
                      {rsvp !== undefined && (
                        <div style={{ display: 'flex', gap: '12px', marginTop: '7px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22C55E', display: 'inline-block' }}/>{rsvp.attending} going
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }}/>{rsvp.not_attending} can&apos;t
                          </span>
                          {pending !== null && (
                            <span style={{ fontSize: '11px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#CBD5E1', display: 'inline-block' }}/>{pending} pending
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '72px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: dateInfo.isToday ? primary : dateInfo.isTomorrow ? '#F59E0B' : '#374151', marginBottom: '2px' }}>{dateInfo.label}</div>
                      {ev.event_time && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#94A3B8', justifyContent: 'flex-end' }}>
                          <Clock size={9}/>{fmtTime(ev.event_time)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {wizardOpen && <SetupWizard initialStep={wizardStep} onClose={() => { setWizardOpen(false); load(); }} />}
    </div>
  );
}
