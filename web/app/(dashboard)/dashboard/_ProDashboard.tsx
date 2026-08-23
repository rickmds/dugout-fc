'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, Layers, CalendarDays, Plus, Megaphone, AlertTriangle, ArrowRight,
  ChevronRight, XCircle, DollarSign, ShieldCheck, TrendingUp, TrendingDown,
  Target, CheckCircle, UserCheck, Award, Calendar,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import SetupWizard from '@/components/dashboard/SetupWizard';
import SetupProgressCard from '@/components/dashboard/SetupProgressCard';
import { formatCurrencyRounded } from '@/lib/formatCurrency';

// ── Types ─────────────────────────────────────────────────────────────────────
type FieldClosure  = { id: string; field_name: string; reason: string | null; closed_from: string; closed_until: string | null };
type TodayWeather  = { rain: number; condition: string; tempC: number };
type FeeRow        = { player_id: string; team_id: string; amount_due: number; amount_paid: number; discount: number; status: string };
type PlayerRow     = { id: string; team_id: string; jersey_number: number | null; position: string | null; profile_id: string | null };
type InviteRow     = { id: string; team_id: string; player_id: string | null; accepted_at: string | null };
type AnnRow        = { id: string; team_id: string; created_by: string | null; created_at: string };
type ProfileRow    = { id: string; created_at: string };

type TeamHealth = {
  id: string; name: string; age_group: string | null;
  player_count: number; has_coach: boolean;
  with_parent: number;
  outstanding: number; last_activity: string | null;
  roster_tier: RosterTier;
  risk_score: number; risk_reasons: string[];
};

type ProfileEmbed = { full_name: string | null; avatar_url: string | null };
type CoachRow = {
  profile_id: string; team_id: string; role: string;
  // Postgrest's join-cardinality inference isn't guaranteed to stay a
  // single object vs. an array — same ambiguity normalizeClub() works
  // around in TeamContext.tsx.
  profiles: ProfileEmbed | ProfileEmbed[] | null;
};

function normalizeProfileEmbed(p: CoachRow['profiles']): ProfileEmbed | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

type AgeGroupFee = { age_group: string; outstanding: number; total_due: number; rate: number };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = formatCurrencyRounded;
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
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
// No explicit "format" field exists on teams yet — inferred from age_group
// via the standard youth-soccer age progression (U9-10 -> 7v7, U11-12 -> 9v9,
// U13+ -> 11v11). Falls back to 11v11 for anything unparseable, since that's
// the format least likely to falsely flag a small-sided team as short.
type RosterFormat = '7v7' | '9v9' | '11v11';
function rosterFormat(ageGroup: string | null): RosterFormat {
  const n = ageGroup ? parseInt(ageGroup.replace(/\D/g, ''), 10) : NaN;
  if (!isNaN(n) && n <= 10) return '7v7';
  if (!isNaN(n) && n <= 12) return '9v9';
  return '11v11';
}
// Red = at or below the format's actual on-field minimum (real risk of not
// being able to field a team at all). Orange = exactly one spare (enough to
// play, but no cushion). Green = comfortably staffed.
const ROSTER_MIN: Record<RosterFormat, number> = { '7v7': 7, '9v9': 9, '11v11': 11 };
type RosterTier = 'red' | 'orange' | 'green';
function rosterTier(playerCount: number, format: RosterFormat): RosterTier {
  const min = ROSTER_MIN[format];
  if (playerCount <= min) return 'red';
  if (playerCount === min + 1) return 'orange';
  return 'green';
}

function weatherEmoji(cond: string): string {
  const c = cond.toLowerCase();
  if (c.includes('sunny') || c.includes('clear')) return '☀️';
  if (c.includes('partly')) return '⛅';
  if (c.includes('overcast') || c.includes('cloudy')) return '☁️';
  if (c.includes('fog') || c.includes('mist')) return '🌫️';
  if (c.includes('drizzle') || c.includes('light rain')) return '🌦️';
  if (c.includes('thunder') || c.includes('storm')) return '⛈️';
  if (c.includes('snow') || c.includes('sleet') || c.includes('ice')) return '❄️';
  if (c.includes('rain')) return '🌧️';
  return '🌤️';
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = '14px', r = '6px' }: { w?: string; h?: string; r?: string }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
      <span style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</span>
      {action}
    </div>
  );
}

function RatePill({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color = rate >= 0.8 ? '#16A34A' : rate >= 0.5 ? '#D97706' : '#DC2626';
  const bg    = rate >= 0.8 ? '#F0FDF4'  : rate >= 0.5 ? '#FFFBEB'  : '#FEF2F2';
  return <span style={{ fontSize: '11px', fontWeight: '700', color, background: bg, padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap' }}>{pct}%</span>;
}

function ProgressBar({ rate, color }: { rate: number; color?: string }) {
  const fill = color ?? (rate >= 0.8 ? '#22C55E' : rate >= 0.5 ? '#F59E0B' : '#EF4444');
  return (
    <div style={{ height: '5px', borderRadius: '3px', background: '#F1F5F9', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(rate * 100, 100)}%`, background: fill, borderRadius: '3px', transition: 'width 0.5s ease' }} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProDashboard({ onSwitch }: { onSwitch: () => void }) {
  const { profile, club, teams } = useDashboard();
  const primary       = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const tryoutsActive = club?.tryouts_active ?? false;
  const firstName     = profile?.full_name?.split(' ')[0] ?? 'Admin';
  const currency      = club?.currency ?? 'USD';
  const today         = new Date().toISOString().split('T')[0];
  const weekLater     = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  // State
  const [loading,           setLoading]           = useState(true);
  const [todayWeather,      setTodayWeather]      = useState<TodayWeather | null>(null);
  const [closures,          setClosures]          = useState<FieldClosure[]>([]);
  const [eventsThisWeek,    setEventsThisWeek]    = useState(0);
  const [wizardOpen,        setWizardOpen]        = useState(false);
  const [wizardStep,        setWizardStep]        = useState(0);

  // Metrics
  const [playerCount,       setPlayerCount]       = useState(0);
  const [coachCoverage,     setCoachCoverage]     = useState(0);
  const [parentAdoption,    setParentAdoption]    = useState(0);
  const [feeCollectionRate, setFeeCollectionRate] = useState(0);
  const [rosterTierCounts, setRosterTierCounts]   = useState({ red: 0, orange: 0, green: 0 });
  const [totalOutstanding,  setTotalOutstanding]  = useState(0);
  const [healthScore,       setHealthScore]       = useState(0);

  // Panels
  const [teamHealthList,    setTeamHealthList]    = useState<TeamHealth[]>([]);
  const [coachActivity,     setCoachActivity]     = useState<{ profile_id: string; full_name: string; avatar_url: string | null; teams: string[]; last_active: string | null }[]>([]);
  const [ageGroupFees,      setAgeGroupFees]      = useState<AgeGroupFee[]>([]);
  const [yoyGrowth,         setYoyGrowth]         = useState<{ thisYear: number; lastYear: number } | null>(null);
  const [tryoutRegs,        setTryoutRegs]        = useState(0);
  const [tryoutOffers,      setTryoutOffers]      = useState({ total: 0, accepted: 0, pending: 0 });

  // Weather
  useEffect(() => {
    if (!club?.latitude || !club?.longitude) return;
    fetch(`/api/weather?lat=${club.latitude}&lng=${club.longitude}`)
      .then(r => r.json())
      .then(d => {
        const cur = d.current;
        const day = d.forecast?.forecastday?.[0]?.day;
        if (cur) setTodayWeather({ rain: day?.daily_chance_of_rain ?? 0, condition: cur.condition?.text ?? '', tempC: Math.round(cur.temp_c) });
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
    const teamIds     = teams.map(t => t.id);
    const teamMap     = new Map(teams.map(t => [t.id, t]));
    const oneYearAgo  = new Date(Date.now() - 365 * 86400000).toISOString();
    const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString();

    // Field closures + weekly events (club-level, no teamIds needed)
    const [clsRes, weekRes] = await Promise.all([
      supabase.from('field_closures').select('id,field_name,reason,closed_from,closed_until').eq('club_id', club.id).order('closed_from', { ascending: false }).limit(20),
      supabase.from('events').select('id', { count: 'exact', head: true }).in('team_id', teamIds.length ? teamIds : ['_']).gte('event_date', today).lte('event_date', weekLater),
    ]);
    setClosures((clsRes.data ?? []) as FieldClosure[]);
    setEventsThisWeek(weekRes.count ?? 0);

    if (!teamIds.length) { setLoading(false); return; }

    const [playerRes, inviteRes, coachRes, feeRes, annRes, profileRes, teamConvRes] = await Promise.all([
      supabase.from('players').select('id,team_id,jersey_number,position,profile_id').in('team_id', teamIds),
      supabase.from('invites').select('id,team_id,player_id,accepted_at').in('team_id', teamIds),
      supabase.from('team_members').select('profile_id,team_id,role,profiles(full_name,avatar_url)').in('team_id', teamIds).in('role', ['coach', 'org_admin']),
      supabase.from('player_fees').select('player_id,team_id,amount_due,amount_paid,discount,status').in('team_id', teamIds),
      supabase.from('announcements').select('id,team_id,created_by,created_at').in('team_id', teamIds).order('created_at', { ascending: false }).limit(500),
      supabase.from('profiles').select('id,created_at').eq('club_id', club.id).eq('role', 'player').gte('created_at', twoYearsAgo),
      supabase.from('conversations').select('id,team_id').in('team_id', teamIds).eq('type', 'team_group'),
    ]);
    const teamIdByConv = new Map((teamConvRes.data ?? []).map((c: { id: string; team_id: string }) => [c.id, c.team_id]));

    // Messages — fetched after coaches so we can filter by coach profile IDs.
    // Team Chat is used more than the formal Announcements feature in
    // practice, so a coach actively chatting with the team shouldn't be
    // flagged as if they'd gone silent — conversation_id lets each message
    // be attributed back to its team the same way announcements already are.
    const coachProfileIds = [...new Set((coachRes.data ?? []).map((c: { profile_id: string }) => c.profile_id))];
    const { data: msgData } = coachProfileIds.length
      ? await supabase.from('messages').select('sender_id,conversation_id,created_at').in('sender_id', coachProfileIds).order('created_at', { ascending: false }).limit(500)
      : { data: [] };

    const players       = (playerRes.data   ?? []) as PlayerRow[];
    const invites       = (inviteRes.data   ?? []) as InviteRow[];
    const coaches       = (coachRes.data    ?? []) as CoachRow[];
    const feeRows       = (feeRes.data      ?? []) as FeeRow[];
    const announcements = (annRes.data      ?? []) as AnnRow[];
    const profileRows   = (profileRes.data  ?? []) as ProfileRow[];

    setPlayerCount(players.length);

    // ── Adoption ─────────────────────────────────────────────────────────────
    // Only "does this player have at least one parent in the app" matters —
    // a second/third guardian invite that never gets claimed (e.g. a co-parent
    // who never signs up) shouldn't drag this down when the player already
    // has one. profile_id covers the primary guardian; an accepted invite
    // covers any guardian (primary or additional) who's actually signed up.
    const playersWithParent = new Set<string>();
    for (const p of players) if (p.profile_id) playersWithParent.add(p.id);
    for (const inv of invites) if (inv.accepted_at && inv.player_id) playersWithParent.add(inv.player_id);
    const adoptionRate = players.length > 0 ? playersWithParent.size / players.length : 1;
    setParentAdoption(adoptionRate);

    // ── Coach coverage ────────────────────────────────────────────────────────
    const teamsWithCoach = new Set(coaches.map(c => c.team_id));
    const coverageRate   = teams.length > 0 ? teamsWithCoach.size / teams.length : 1;
    setCoachCoverage(coverageRate);

    // ── Fees ─────────────────────────────────────────────────────────────────
    const totalDue   = feeRows.reduce((s, f) => s + Math.max(+f.amount_due - +f.discount, 0), 0);
    const totalPaid  = feeRows.reduce((s, f) => s + +f.amount_paid, 0);
    const collRate   = totalDue > 0 ? Math.min(totalPaid / totalDue, 1) : 1;
    const outstanding = Math.max(totalDue - totalPaid, 0);
    setFeeCollectionRate(collRate);
    setTotalOutstanding(outstanding);

    // ── Lookup maps ───────────────────────────────────────────────────────────
    const withParentByTeam: Record<string, number> = {};
    for (const p of players) {
      if (playersWithParent.has(p.id)) withParentByTeam[p.team_id] = (withParentByTeam[p.team_id] ?? 0) + 1;
    }

    const feeByTeam: Record<string, { outstanding: number; total_due: number }> = {};
    for (const f of feeRows) {
      if (!feeByTeam[f.team_id]) feeByTeam[f.team_id] = { outstanding: 0, total_due: 0 };
      const due = Math.max(+f.amount_due - +f.discount, 0);
      feeByTeam[f.team_id].total_due += due;
      feeByTeam[f.team_id].outstanding += Math.max(due - +f.amount_paid, 0);
    }

    const lastAnnByTeam: Record<string, string> = {};
    for (const ann of announcements) {
      if (!lastAnnByTeam[ann.team_id]) lastAnnByTeam[ann.team_id] = ann.created_at;
    }

    // Team Chat counts the same as an announcement for "has the coach been
    // communicating" — messages are already ordered newest-first, so the
    // first one seen per team is its most recent.
    const lastChatByTeam: Record<string, string> = {};
    for (const msg of (msgData ?? []) as { sender_id: string; conversation_id: string; created_at: string }[]) {
      const tid = teamIdByConv.get(msg.conversation_id);
      if (tid && !lastChatByTeam[tid]) lastChatByTeam[tid] = msg.created_at;
    }

    const playersByTeam: Record<string, number> = {};
    for (const p of players) playersByTeam[p.team_id] = (playersByTeam[p.team_id] ?? 0) + 1;

    // ── Team health list ──────────────────────────────────────────────────────
    const healthList: TeamHealth[] = teams.map(team => {
      const player_count = playersByTeam[team.id] ?? 0;
      const has_coach    = teamsWithCoach.has(team.id);
      const with_parent  = withParentByTeam[team.id] ?? 0;
      const fees         = feeByTeam[team.id] ?? { outstanding: 0, total_due: 0 };
      const last_ann     = lastAnnByTeam[team.id] ?? null;
      const last_chat    = lastChatByTeam[team.id] ?? null;
      const last_activity = last_ann && last_chat ? (last_ann > last_chat ? last_ann : last_chat) : (last_ann ?? last_chat);
      const format       = rosterFormat(team.age_group);
      const roster_tier  = rosterTier(player_count, format);

      const risk_reasons: string[] = [];
      let risk_score = 0;
      if (!has_coach)          { risk_reasons.push('No coach assigned');       risk_score += 40; }
      if (player_count === 0)  { risk_reasons.push('No players on roster');    risk_score += 35; }
      else if (roster_tier === 'red')    { risk_reasons.push(`Only ${player_count} players — ${format} needs ${ROSTER_MIN[format] + 1}+`); risk_score += 30; }
      else if (roster_tier === 'orange') { risk_reasons.push(`${player_count} players — ${format} runs best with ${ROSTER_MIN[format] + 2}+`); risk_score += 10; }
      if (player_count > 0 && with_parent === 0) { risk_reasons.push('No parents in app'); risk_score += 20; }
      else if (player_count > 0 && with_parent < player_count) { risk_reasons.push(`${with_parent}/${player_count} players have a parent in app`); risk_score += 10; }
      if (fees.outstanding > 500) { risk_reasons.push(`${fmtMoney(fees.outstanding, currency)} outstanding`); risk_score += 10; }
      if (last_activity) {
        const days = daysSince(last_activity);
        if (days > 21) { risk_reasons.push(`Silent ${days}d`); risk_score += 15; }
      } else if (player_count > 0) {
        risk_reasons.push('No coach activity yet'); risk_score += 10;
      }

      return { id: team.id, name: team.name, age_group: team.age_group, player_count, has_coach, with_parent, outstanding: fees.outstanding, last_activity, roster_tier, risk_score, risk_reasons };
    }).sort((a, b) => b.risk_score - a.risk_score);
    setTeamHealthList(healthList);

    // ── Roster size (traffic light) ───────────────────────────────────────────
    const tierCounts = { red: 0, orange: 0, green: 0 };
    for (const t of healthList) tierCounts[t.roster_tier]++;
    setRosterTierCounts(tierCounts);
    // Orange still counts as "enough to play" toward the overall score —
    // only red (at/below the format's bare minimum) drags it down.
    const rosterHealthRate = (tierCounts.orange + tierCounts.green) / teams.length;

    // ── Health score ──────────────────────────────────────────────────────────
    setHealthScore(Math.round((rosterHealthRate * 25) + (adoptionRate * 25) + (coverageRate * 25) + (collRate * 25)));

    // ── Coach activity — most recent of: announcement, chat message ──────────
    const lastActivityByCoach: Record<string, string> = {};
    const updateIfNewer = (pid: string, ts: string) => {
      if (!lastActivityByCoach[pid] || ts > lastActivityByCoach[pid]) lastActivityByCoach[pid] = ts;
    };
    for (const ann of announcements) {
      if (ann.created_by) updateIfNewer(ann.created_by, ann.created_at);
    }
    for (const msg of (msgData ?? []) as { sender_id: string; created_at: string }[]) {
      updateIfNewer(msg.sender_id, msg.created_at);
    }

    const coachTeams: Record<string, string[]> = {};
    const coachNames: Record<string, string>   = {};
    const coachAvatars: Record<string, string | null> = {};
    for (const c of coaches) {
      const profile = normalizeProfileEmbed(c.profiles);
      const name = profile?.full_name ?? 'Unknown';
      if (!coachTeams[c.profile_id]) { coachTeams[c.profile_id] = []; coachNames[c.profile_id] = name; coachAvatars[c.profile_id] = profile?.avatar_url ?? null; }
      const tm = teamMap.get(c.team_id);
      if (tm && !coachTeams[c.profile_id].includes(tm.name)) coachTeams[c.profile_id].push(tm.name);
    }
    const activityList = Object.keys(coachTeams).map(pid => ({
      profile_id:  pid,
      full_name:   coachNames[pid],
      avatar_url:  coachAvatars[pid],
      teams:       coachTeams[pid],
      last_active: lastActivityByCoach[pid] ?? null,
    })).sort((a, b) => {
      if (!a.last_active && !b.last_active) return 0;
      if (!a.last_active) return -1;
      if (!b.last_active) return 1;
      return a.last_active < b.last_active ? -1 : 1;
    });
    setCoachActivity(activityList);

    // ── Fees by age group ─────────────────────────────────────────────────────
    const ageMap: Record<string, { outstanding: number; total_due: number }> = {};
    for (const f of feeRows) {
      const ag = teamMap.get(f.team_id)?.age_group ?? 'Other';
      if (!ageMap[ag]) ageMap[ag] = { outstanding: 0, total_due: 0 };
      const due = Math.max(+f.amount_due - +f.discount, 0);
      ageMap[ag].total_due += due;
      ageMap[ag].outstanding += Math.max(due - +f.amount_paid, 0);
    }
    setAgeGroupFees(
      Object.entries(ageMap)
        .map(([age_group, v]) => ({ age_group, ...v, rate: v.total_due > 0 ? Math.min((v.total_due - v.outstanding) / v.total_due, 1) : 1 }))
        .sort((a, b) => b.outstanding - a.outstanding)
    );

    // ── YoY growth ────────────────────────────────────────────────────────────
    setYoyGrowth({
      thisYear: profileRows.filter(p => p.created_at >= oneYearAgo).length,
      lastYear: profileRows.filter(p => p.created_at < oneYearAgo).length,
    });

    // ── Tryouts ───────────────────────────────────────────────────────────────
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

  const activeClosures  = closures.filter(isActiveClosure);
  const isAdmin         = profile?.role === 'org_admin' || profile?.role === 'app_admin';
  const teamsAtRisk     = teamHealthList.filter(t => t.risk_score > 0);
  const healthStatus    = healthScore >= 80
    ? { label: 'Club Healthy',    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' }
    : healthScore >= 60
    ? { label: 'Needs Attention', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
    : { label: 'Action Required', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' };

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes pulse   { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        .hr:hover { background: #F8FAFC !important; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '2px' }}>Club Overview</div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>{greeting(firstName)}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px' }}>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            {todayWeather && (
              <span style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: '10px', borderLeft: '1px solid #E2E8F0' }}>
                {weatherEmoji(todayWeather.condition)} {todayWeather.condition} · {todayWeather.rain}% rain · {todayWeather.tempC}°C
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
          <button onClick={onSwitch} style={{ background: 'none', border: 'none', fontSize: '11px', color: '#CBD5E1', cursor: 'pointer', padding: '8px 4px', fontWeight: '600' }}>
            Simple view
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {!loading && isAdmin && <SetupProgressCard onOpen={step => { setWizardStep(step); setWizardOpen(true); }} />}

        {/* ── Health banner ───────────────────────────────────────────────── */}
        {!loading && (
          <div style={{ background: healthStatus.bg, border: `1px solid ${healthStatus.border}`, borderRadius: '14px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            {/* Score */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '16px', background: healthStatus.color, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '24px', fontWeight: '900', color: '#fff', lineHeight: 1 }}>{healthScore}</span>
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: healthStatus.color, marginBottom: '2px' }}>{healthStatus.label}</div>
                <div style={{ fontSize: '11.5px', color: '#64748B' }}>Club health · out of 100</div>
              </div>
            </div>

            <div style={{ width: '1px', height: '44px', background: healthStatus.border, flexShrink: 0 }} />

            {/* Component bars */}
            <div style={{ display: 'flex', gap: '24px', flex: 1, flexWrap: 'wrap' }}>
              {[
                { label: 'Coach coverage',  value: coachCoverage },
                { label: 'Parent adoption', value: parentAdoption },
                { label: 'Fee collection',  value: feeCollectionRate },
              ].map(c => (
                <div key={c.label} style={{ minWidth: '110px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>{c.label}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: healthStatus.color }}>{Math.round(c.value * 100)}%</span>
                  </div>
                  <div style={{ height: '4px', borderRadius: '2px', background: `${healthStatus.border}`, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(c.value * 100, 100)}%`, background: healthStatus.color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              ))}

              {/* Roster size — a segmented bar rather than a single %, since a
                  team either has enough players or it doesn't per its own
                  format's minimum, not a blended average worth collapsing.
                  Segments keep the same label-then-bar rhythm as the other
                  three so it reads as one family instead of a bolted-on
                  widget. */}
              <div style={{ minWidth: '110px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>Roster size</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: healthStatus.color }}>
                    {rosterTierCounts.green + rosterTierCounts.orange}/{teams.length} ready
                  </span>
                </div>
                <div style={{ height: '4px', borderRadius: '2px', overflow: 'hidden', display: 'flex', gap: '2px' }}>
                  {([
                    ['red', '#DC2626', rosterTierCounts.red],
                    ['orange', '#D97706', rosterTierCounts.orange],
                    ['green', '#16A34A', rosterTierCounts.green],
                  ] as const).map(([tier, color, count]) => count > 0 && (
                    <div key={tier} style={{ flex: count, background: color, borderRadius: '2px' }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Active closure in banner */}
            {activeClosures.length > 0 && (
              <>
                <div style={{ width: '1px', height: '44px', background: healthStatus.border, flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', animation: 'pulse 1.5s infinite' }} />
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#EF4444' }}>{activeClosures.length} field{activeClosures.length !== 1 ? 's' : ''} closed</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>{activeClosures.map(c => c.field_name).join(', ')}</div>
                  </div>
                  <Link href="/dashboard/fields" style={{ fontSize: '11.5px', fontWeight: '700', color: '#EF4444', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>Manage <ArrowRight size={11}/></Link>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── KPI tiles (6-up) ────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          {loading ? Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} style={{ padding: '18px' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <Sk w="44px" h="44px" r="12px" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Sk w="50px" h="24px" r="4px" />
                  <Sk w="80px" h="10px" />
                </div>
              </div>
            </Card>
          )) : [
            // Coach coverage / Parent adoption are already shown in the
            // health banner above — repeating them here as tiles too was
            // the same two numbers twice in two different visual
            // treatments on the same screen.
            { icon: Users,       color: primary,    value: playerCount,                              label: 'Total players',    sub: `across ${teams.length} teams` },
            { icon: DollarSign,  color: totalOutstanding > 0 ? '#F59E0B' : '#16A34A', value: fmtMoney(totalOutstanding, currency), label: 'Outstanding fees', sub: `${Math.round(feeCollectionRate * 100)}% collected` },
            { icon: Layers,      color: teamsAtRisk.length > 0 ? '#EF4444' : '#16A34A', value: teamsAtRisk.length > 0 ? teamsAtRisk.length : '✓', label: 'Teams at risk', sub: teamsAtRisk.length > 0 ? 'need intervention' : 'all teams healthy' },
            { icon: CalendarDays, color: '#F59E0B', value: eventsThisWeek,                           label: 'Events this week',  sub: null },
          ].map(({ icon: Icon, color, value, label, sub }) => (
            <Card key={label} style={{ overflow: 'hidden' }}>
              <div style={{ height: '3px', background: color }} />
              <div style={{ padding: '18px', display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} color={color} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: typeof value === 'string' && value.length > 5 ? '20px' : '26px', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.5px', lineHeight: 1.15 }}>{value}</div>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: '500', marginTop: '3px' }}>{label}</div>
                  {sub && <div style={{ fontSize: '11px', color, fontWeight: '600', marginTop: '2px' }}>{sub}</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Main grid ────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', alignItems: 'start' }}>

          {/* LEFT ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Teams needing intervention */}
            <div>
              <SectionLabel
                title={`Teams Needing Intervention${!loading && teamsAtRisk.length > 0 ? ` · ${teamsAtRisk.length}` : ''}`}
                action={<Link href="/dashboard/teams" style={{ fontSize: '11.5px', color: primary, textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>All teams <ArrowRight size={11}/></Link>}
              />
              {loading ? (
                <Card>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ padding: '14px 18px', borderBottom: i < 3 ? '1px solid #F8FAFC' : 'none', display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <Sk w="36px" h="36px" r="9px" />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}><Sk w="40%" h="13px" /><Sk w="65%" h="10px" /></div>
                      <Sk w="56px" h="22px" r="20px" />
                    </div>
                  ))}
                </Card>
              ) : teamsAtRisk.length === 0 ? (
                <Card>
                  <div style={{ padding: '36px', textAlign: 'center' }}>
                    <CheckCircle size={36} color="#22C55E" style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#16A34A', marginBottom: '4px' }}>All teams are healthy</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8' }}>No intervention needed right now</div>
                  </div>
                </Card>
              ) : (
                <Card>
                  {teamsAtRisk.slice(0, 10).map((team, i) => {
                    const riskColor = team.risk_score >= 60 ? '#DC2626' : team.risk_score >= 30 ? '#D97706' : '#64748B';
                    const riskBg    = team.risk_score >= 60 ? '#FEF2F2' : team.risk_score >= 30 ? '#FFFBEB' : '#F8FAFC';
                    const riskLabel = team.risk_score >= 60 ? 'Critical' : team.risk_score >= 30 ? 'High' : 'Medium';
                    const isLast    = i === Math.min(teamsAtRisk.length, 10) - 1;
                    return (
                      <Link key={team.id} href={`/dashboard/teams/${team.id}`} className="hr" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 18px', borderBottom: !isLast ? '1px solid #F8FAFC' : 'none', textDecoration: 'none', background: '#fff', transition: 'background 0.15s' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: riskBg, border: `1.5px solid ${riskColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <AlertTriangle size={15} color={riskColor} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>
                            {team.name}
                            {team.age_group && <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '400', marginLeft: '6px' }}>{team.age_group}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {team.risk_reasons.map(r => (
                              <span key={r} style={{ fontSize: '10.5px', color: '#64748B', background: '#F1F5F9', padding: '1px 7px', borderRadius: '4px' }}>{r}</span>
                            ))}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: riskColor, background: riskBg, padding: '3px 10px', borderRadius: '20px' }}>{riskLabel}</span>
                          <ChevronRight size={13} color="#CBD5E1" />
                        </div>
                      </Link>
                    );
                  })}
                </Card>
              )}
            </div>

            {/* Coach activity */}
            <div>
              <SectionLabel
                title="Coach Activity"
                action={<Link href="/dashboard/staff" style={{ fontSize: '11.5px', color: primary, textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>All staff <ArrowRight size={11}/></Link>}
              />
              {loading ? (
                <Card>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ padding: '12px 18px', borderBottom: i < 4 ? '1px solid #F8FAFC' : 'none', display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <Sk w="32px" h="32px" r="50%" />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}><Sk w="35%" h="13px" /><Sk w="55%" h="10px" /></div>
                      <Sk w="60px" h="22px" r="20px" />
                    </div>
                  ))}
                </Card>
              ) : coachActivity.length === 0 ? (
                <Card>
                  <div style={{ padding: '32px', textAlign: 'center' }}>
                    <UserCheck size={32} color="#E2E8F0" style={{ margin: '0 auto 10px', display: 'block' }} />
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#94A3B8', marginBottom: '12px' }}>No coaches assigned yet</div>
                    <Link href="/dashboard/staff" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '700', color: primary, textDecoration: 'none' }}>
                      <Plus size={12}/> Add staff
                    </Link>
                  </div>
                </Card>
              ) : (
                <Card>
                  {coachActivity.map((coach, i) => {
                    const days = coach.last_active ? daysSince(coach.last_active) : null;
                    const actColor = days === null ? '#DC2626' : days <= 7 ? '#16A34A' : days <= 14 ? '#D97706' : '#DC2626';
                    const actBg    = days === null ? '#FEF2F2' : days <= 7 ? '#F0FDF4' : days <= 14 ? '#FFFBEB' : '#FEF2F2';
                    const actLabel = days === null ? 'Never posted' : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`;
                    return (
                      <div key={coach.profile_id} className="hr" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 18px', borderBottom: i < coachActivity.length - 1 ? '1px solid #F8FAFC' : 'none', background: '#fff', transition: 'background 0.15s' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: `${primary}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px', fontWeight: '800', color: primary, overflow: 'hidden' }}>
                          {coach.avatar_url
                            ? <img src={coach.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : coach.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{coach.full_name}</div>
                          <div style={{ fontSize: '11px', color: '#94A3B8', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{coach.teams.join(' · ')}</div>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: actColor, background: actBg, padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{actLabel}</span>
                      </div>
                    );
                  })}
                </Card>
              )}
            </div>

            {/* Fee collection by age group */}
            {(ageGroupFees.length > 0 || loading) && (
              <div>
                <SectionLabel
                  title="Fee Collection by Age Group"
                  action={<Link href="/dashboard/fees" style={{ fontSize: '11.5px', color: primary, textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>View all <ArrowRight size={11}/></Link>}
                />
                <Card>
                  {loading ? (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><Sk w="40%" h="12px" /><Sk h="6px" r="3px" /></div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '4px 0' }}>
                      {ageGroupFees.map((ag, i) => (
                        <div key={ag.age_group} style={{ padding: '11px 18px', borderBottom: i < ageGroupFees.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{ag.age_group}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              {ag.outstanding > 0 && <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: '700' }}>{fmtMoney(ag.outstanding, currency)} owed</span>}
                              <RatePill rate={ag.rate} />
                            </div>
                          </div>
                          <ProgressBar rate={ag.rate} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* Parent app adoption by team */}
            <div>
              <SectionLabel title="Parent App Adoption by Team" />
              <Card>
                {loading ? (
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <Sk w="130px" h="12px" />
                        <div style={{ flex: 1 }}><Sk h="6px" r="3px" /></div>
                        <Sk w="40px" h="10px" />
                        <Sk w="44px" h="22px" r="20px" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 64px', gap: '8px', padding: '9px 18px', borderBottom: '1px solid #F1F5F9' }}>
                      {['Team', 'Progress', 'Players', 'Rate'].map((h, idx) => (
                        <div key={h} style={{ fontSize: '10px', fontWeight: '800', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: idx > 0 ? 'right' : 'left' }}>{h}</div>
                      ))}
                    </div>
                    {teamHealthList.map((team, i) => {
                      const rate = team.player_count > 0 ? team.with_parent / team.player_count : 1;
                      return (
                        <div key={team.id} className="hr" style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 64px', gap: '8px', padding: '9px 18px', borderBottom: i < teamHealthList.length - 1 ? '1px solid #F8FAFC' : 'none', alignItems: 'center', background: '#fff', transition: 'background 0.15s' }}>
                          <div>
                            <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
                            {team.age_group && <div style={{ fontSize: '10.5px', color: '#CBD5E1' }}>{team.age_group}</div>}
                          </div>
                          <ProgressBar rate={rate} />
                          <div style={{ fontSize: '11.5px', color: '#64748B', textAlign: 'right' }}>{team.with_parent} / {team.player_count}</div>
                          <div style={{ textAlign: 'right' }}><RatePill rate={rate} /></div>
                        </div>
                      );
                    })}
                  </>
                )}
              </Card>
            </div>

          </div>

          {/* RIGHT ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* YoY growth */}
            <div>
              <SectionLabel title="Year-on-Year Growth" />
              <Card>
                <div style={{ padding: '20px' }}>
                  {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}><Sk h="56px" r="10px" /><Sk w="70%" h="12px" /></div>
                  ) : yoyGrowth ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                        {[
                          { label: 'This year', value: yoyGrowth.thisYear, highlight: true },
                          { label: 'Last year',  value: yoyGrowth.lastYear, highlight: false },
                        ].map(item => (
                          <div key={item.label} style={{ padding: '14px', background: item.highlight ? `${primary}10` : '#F8FAFC', borderRadius: '10px', border: `1.5px solid ${item.highlight ? `${primary}25` : '#F1F5F9'}` }}>
                            <div style={{ fontSize: '30px', fontWeight: '900', color: item.highlight ? primary : '#0F172A', letterSpacing: '-0.5px', lineHeight: 1, marginBottom: '4px' }}>{item.value}</div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '500' }}>{item.label}</div>
                          </div>
                        ))}
                      </div>
                      {(() => {
                        if (yoyGrowth.lastYear === 0 && yoyGrowth.thisYear > 0) {
                          return <div style={{ padding: '10px 12px', background: '#F0FDF4', borderRadius: '8px', fontSize: '12.5px', fontWeight: '700', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '6px' }}><TrendingUp size={13}/> New families this year</div>;
                        }
                        if (yoyGrowth.lastYear === 0) return null;
                        const g = ((yoyGrowth.thisYear - yoyGrowth.lastYear) / yoyGrowth.lastYear * 100);
                        const isUp = g >= 0;
                        const Icon = isUp ? TrendingUp : TrendingDown;
                        return (
                          <div style={{ padding: '10px 12px', background: isUp ? '#F0FDF4' : '#FEF2F2', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icon size={13} color={isUp ? '#16A34A' : '#DC2626'} />
                            <span style={{ fontSize: '12.5px', fontWeight: '700', color: isUp ? '#16A34A' : '#DC2626' }}>
                              {isUp ? '+' : ''}{Math.round(g)}% {isUp ? 'growth' : 'decline'} vs last year
                            </span>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '12px 0', fontSize: '12px', color: '#94A3B8' }}>No historical data yet</div>
                  )}
                </div>
              </Card>
            </div>

            {/* Staff certifications */}
            <div>
              <SectionLabel title="Staff Certifications" />
              <Card>
                <div style={{ padding: '28px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck size={22} color="#94A3B8" />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '4px' }}>Track certifications</div>
                    <div style={{ fontSize: '11.5px', color: '#94A3B8', lineHeight: '1.6', maxWidth: '210px', margin: '0 auto' }}>Background checks, coaching licenses, and first aid certs — expiry alerts before it becomes a problem</div>
                  </div>
                  <Link href="/dashboard/staff" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '4px', background: primary, color: '#fff', fontWeight: '700', fontSize: '12px', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none' }}>
                    <Award size={12}/> Set up certifications
                  </Link>
                </div>
              </Card>
            </div>

            {/* Season deadlines */}
            <div>
              <SectionLabel title="Season Deadlines" />
              <Card>
                <div style={{ padding: '28px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Calendar size={22} color="#94A3B8" />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '4px' }}>No deadlines set</div>
                    <div style={{ fontSize: '11.5px', color: '#94A3B8', lineHeight: '1.6', maxWidth: '210px', margin: '0 auto' }}>League registration cutoffs, player card submissions, and tournament entry dates</div>
                  </div>
                  <Link href="/dashboard/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '4px', background: '#F1F5F9', color: '#374151', fontWeight: '700', fontSize: '12px', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none' }}>
                    <Plus size={12}/> Add deadline
                  </Link>
                </div>
              </Card>
            </div>

            {/* Communication analytics */}
            <div>
              <SectionLabel
                title="Team Communications"
                action={<Link href="/dashboard/announcements" style={{ fontSize: '11.5px', color: primary, textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>Post <Plus size={11}/></Link>}
              />
              <Card>
                {loading ? (
                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><Sk w="7px" h="7px" r="50%" /><Sk w="45%" h="12px" /><div style={{ flex: 1 }} /><Sk w="50px" h="10px" /></div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '4px 0' }}>
                    {teamHealthList.map((team, i) => {
                      const days       = team.last_activity ? daysSince(team.last_activity) : null;
                      const dotColor   = days === null ? '#CBD5E1' : days <= 7 ? '#22C55E' : days <= 14 ? '#F59E0B' : '#EF4444';
                      const labelColor = days === null ? '#94A3B8' : days <= 7 ? '#16A34A' : days <= 14 ? '#D97706' : '#DC2626';
                      const labelText  = days === null ? 'Never' : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`;
                      return (
                        <div key={team.id} className="hr" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', borderBottom: i < teamHealthList.length - 1 ? '1px solid #F8FAFC' : 'none', background: '#fff', transition: 'background 0.15s' }}>
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#0F172A', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{team.name}</div>
                            {team.age_group && <div style={{ fontSize: '10px', color: '#CBD5E1' }}>{team.age_group}</div>}
                          </div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: labelColor, flexShrink: 0 }}>{labelText}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Tryouts (if active) */}
            {tryoutsActive && (
              <div>
                <SectionLabel
                  title="Tryouts"
                  action={<Link href="/dashboard/tryouts" style={{ fontSize: '11.5px', color: primary, textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>Full view <ArrowRight size={11}/></Link>}
                />
                <Card>
                  <div style={{ height: '3px', background: `linear-gradient(90deg, ${primary}, ${primary}60)` }} />
                  <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Registered',  value: tryoutRegs,             color: '#0F172A' },
                      { label: 'Offers sent', value: tryoutOffers.total,    color: '#3B82F6' },
                      { label: 'Accepted',    value: tryoutOffers.accepted,  color: '#16A34A' },
                      { label: 'Awaiting',    value: tryoutOffers.pending,   color: '#F59E0B' },
                    ].map(item => (
                      <div key={item.label} style={{ textAlign: 'center', padding: '12px 8px', background: '#F8FAFC', borderRadius: '8px' }}>
                        <div style={{ fontSize: '28px', fontWeight: '900', color: item.color, letterSpacing: '-0.5px', lineHeight: 1 }}>{item.value}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600', marginTop: '4px' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '0 16px 16px', display: 'flex', gap: '8px' }}>
                    <Link href="/dashboard/tryouts/players" style={{ flex: 1, textAlign: 'center', padding: '9px', borderRadius: '8px', background: '#F1F5F9', color: '#374151', fontSize: '12px', fontWeight: '700', textDecoration: 'none' }}>Player Pool</Link>
                    <Link href="/dashboard/tryouts/rosters" style={{ flex: 1, textAlign: 'center', padding: '9px', borderRadius: '8px', background: primary, color: '#fff', fontSize: '12px', fontWeight: '700', textDecoration: 'none' }}>Send Offers</Link>
                  </div>
                </Card>
              </div>
            )}

          </div>
        </div>
      </div>

      {wizardOpen && <SetupWizard initialStep={wizardStep} onClose={() => { setWizardOpen(false); load(); }} />}
    </div>
  );
}
