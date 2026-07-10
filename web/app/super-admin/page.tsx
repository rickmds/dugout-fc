'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { PLAN_PRICING } from '@/lib/plans';
import type { User } from '@supabase/supabase-js';

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  pageBg: '#F8FAFC', cardBg: '#ffffff', border: '#E2E8F0', borderDark: '#CBD5E1',
  textDark: '#0F172A', textMid: '#374151', textLight: '#64748B', textMuted: '#94A3B8',
  selectedBg: '#F0FDF4', inputBg: '#F8FAFC', green: '#22C55E',
  shadow: '0 1px 4px rgba(0,0,0,0.06)',
};

// ── Types ──────────────────────────────────────────────────────────────────────
type Club = {
  id: string; name: string; slug: string;
  primary_color: string | null; logo_url: string | null;
  suspended_at: string | null; created_at: string;
  team_count: number; member_count: number; event_count: number;
  player_count: number; rsvp_count: number;
  plan: string | null; sub_status: string | null;
  last_active_at: string | null; contacted_at: string | null;
  health_score: number;
};

type Stats = {
  clubs: number; active: number; suspended: number;
  members: number; teams: number; events: number;
  messages: number; clubs30d: number; members30d: number;
};

type ActivityItem = {
  id: string; icon: string; text: string; club: string; ts: Date; isLive?: boolean;
};

type TeamRow = { id: string; name: string; age_group: string | null; season: string | null; gender: string | null; player_count: number; };
type MemberRow = { id: string; full_name: string | null; role: string | null; created_at: string; };
type RecentMember = MemberRow & { club_name: string | null };
type StaffWithEmail = MemberRow & { email: string | null };

// ── Helpers ────────────────────────────────────────────────────────────────────
const accentOf = (c: Club) =>
  (c.primary_color && c.primary_color !== '#000000' && c.primary_color !== '#ffffff')
    ? c.primary_color : C.green;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const fmtMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

const timeAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'today'; if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`; return `${Math.floor(d / 30)}mo ago`;
};

const lastActiveLabel = (iso: string | null) => {
  if (!iso) return 'no events yet';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'active today'; if (d === 1) return 'active 1d ago';
  if (d < 30) return `active ${d}d ago`; return `active ${Math.floor(d / 30)}mo ago`;
};

const healthOf = (c: Club): 'active' | 'quiet' | 'new' => {
  if (c.health_score >= 60) return 'active';
  if (Date.now() - new Date(c.created_at).getTime() < 7 * 86400000) return 'new';
  return 'quiet';
};

const scoreColor = (s: number) => s >= 80 ? '#16a34a' : s >= 40 ? '#d97706' : s > 0 ? '#dc2626' : '#94A3B8';
const scoreBg    = (s: number) => s >= 80 ? '#F0FDF4'  : s >= 40 ? '#FFFBEB'  : s > 0 ? '#FFF5F5'  : C.inputBg;

const HEALTH_COLOR: Record<string, string> = { active: '#22c55e', quiet: '#f59e0b', new: '#38bdf8' };
const ROLE_CLR: Record<string, string> = { org_admin: '#7c3aed', coach: '#0284c7', player: '#16a34a', app_admin: '#d97706' };

const PLAN_META: Record<string, { label: string; color: string; bg: string }> = {
  free:     { label: 'Free',     color: '#64748B', bg: '#F1F5F9' },
  team_pro: { label: 'Team Pro', color: '#0284c7', bg: '#EFF6FF' },
  starter:  { label: 'Starter',  color: '#16a34a', bg: '#F0FDF4' },
  club:     { label: 'Club',     color: '#7c3aed', bg: '#F5F3FF' },
  academy:  { label: 'Academy',  color: '#d97706', bg: '#FFFBEB' },
  trialing: { label: 'Trial',    color: '#d97706', bg: '#FFFBEB' },
};

const planMonthly = (plan: string | null): number => {
  if (!plan || plan === 'free' || plan === 'trialing') return 0;
  return (PLAN_PRICING as Record<string, { monthly: number }>)[plan]?.monthly ?? 0;
};

function effectivePlanKey(plan: string | null, status: string | null): string {
  if (status === 'trialing') return 'trialing';
  return plan ?? 'free';
}

function exportClubsCSV(clubs: Club[]) {
  const headers = ['Name', 'Slug', 'Plan', 'Status', 'Health Score', 'Members', 'Teams', 'Players', 'Events', 'RSVPs', 'Last Active', 'Contacted', 'Signed Up'];
  const rows = clubs.map(c => [
    c.name, c.slug, effectivePlanKey(c.plan, c.sub_status), c.suspended_at ? 'suspended' : 'active',
    c.health_score, c.member_count, c.team_count, c.player_count, c.event_count, c.rsvp_count,
    c.last_active_at ? new Date(c.last_active_at).toLocaleDateString('en-US') : '',
    c.contacted_at ? new Date(c.contacted_at).toLocaleDateString('en-US') : '',
    new Date(c.created_at).toLocaleDateString('en-US'),
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(v => JSON.stringify(v ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `pulse-fc-clubs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ── Shared UI ──────────────────────────────────────────────────────────────────
const card = { background: C.cardBg, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: C.shadow } as const;

function PlanBadge({ plan, status, size = 'sm' }: { plan: string | null; status: string | null; size?: 'sm' | 'md' }) {
  const key = effectivePlanKey(plan, status);
  const meta = PLAN_META[key] ?? PLAN_META.free;
  return <span style={{ fontSize: size === 'md' ? 11 : 10, fontWeight: 700, color: meta.color, background: meta.bg, borderRadius: 5, padding: size === 'md' ? '3px 10px' : '2px 7px', whiteSpace: 'nowrap' }}>{meta.label}</span>;
}

function RoleBadge({ role }: { role: string | null }) {
  const color = ROLE_CLR[role ?? ''] ?? C.textMuted;
  return <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}15`, borderRadius: 5, padding: '2px 8px' }}>{role}</span>;
}

function Spinner({ size = 28 }: { size?: number }) {
  return <div style={{ width: size, height: size, border: `${size > 18 ? 2 : 1.5}px solid ${C.green}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

// ── Entry ──────────────────────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const [user, setUser]       = useState<User | null>(null);
  const [role, setRole]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        const { data: p } = await supabase.from('profiles').select('role').eq('id', u.id).single();
        setRole((p as { role: string } | null)?.role ?? null);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.pageBg }}><Spinner /></div>;
  if (!user) return <AuthScreen />;
  if (role !== 'app_admin') return <Forbidden />;
  return <App user={user} />;
}

// ── Auth ───────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(false);
  const inp = { background: C.inputBg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', color: C.textDark, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' as const };
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setErr(error.message); setLoading(false); return; }
    window.location.reload();
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.pageBg }}>
      <div style={{ width: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
          <div style={{ width: 38, height: 38, background: C.green, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff' }}>D</div>
          <div><div style={{ color: C.textDark, fontWeight: 800, fontSize: 18 }}>Pulse FC</div><div style={{ color: C.textMuted, fontSize: 12 }}>Super Admin</div></div>
        </div>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={inp} />
          <input type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} required style={inp} />
          {err && <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>{err}</p>}
          <button type="submit" disabled={loading} style={{ background: C.green, color: '#fff', fontWeight: 700, padding: 12, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, opacity: loading ? 0.5 : 1 }}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

// ── Broadcast modal ────────────────────────────────────────────────────────────
function BroadcastModal({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState(''); const [body, setBody] = useState('');
  const [sending, setSending] = useState(false); const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const inp = { width: '100%', background: C.inputBg, border: `1.5px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', color: C.textDark, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/broadcast', {
      method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, html: body.replace(/\n/g, '<br>') }),
    });
    setSending(false); setResult(await res.json());
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 520, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.textDark }}>Broadcast email</div>
            <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>Sends to all org admins. Use <code style={{ background: C.inputBg, padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>{'{{name}}'}</code> to personalise.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {result ? (
          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 12, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#16a34a', marginBottom: 6 }}>{result.sent} sent</div>
            {result.failed > 0 && <div style={{ fontSize: 13, color: '#dc2626' }}>{result.failed} failed</div>}
            <div style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>{result.total} org admins total</div>
            <button onClick={onClose} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.cardBg, color: C.textMid, fontSize: 13, cursor: 'pointer' }}>Close</button>
          </div>
        ) : (
          <>
            <div><label style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What's new at Pulse FC" style={inp} /></div>
            <div><label style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Message</label><textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder={'Hi {{name}},\n\nWe\'ve just shipped something new…'} style={{ ...inp, resize: 'vertical', fontFamily: 'system-ui', lineHeight: 1.6 }} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.cardBg, color: C.textMid, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (sending || !subject.trim() || !body.trim()) ? 0.5 : 1 }}>{sending ? 'Sending…' : 'Send to all org admins'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
function App({ user }: { user: User }) {
  const [clubs, setClubs]       = useState<Club[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [recentMembers, setRecent] = useState<RecentMember[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Club | null>(null);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'active' | 'quiet' | 'suspended'>('all');
  const [sort, setSort]         = useState<'newest' | 'members' | 'teams' | 'score' | 'last active'>('newest');
  const [acting, setActing]     = useState<string | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const clubNameRef   = useRef<Record<string, string>>({});
  const teamToClubRef = useRef<Record<string, string>>({});
  const addActivityRef = useRef<(item: ActivityItem) => void>(() => {});
  addActivityRef.current = (item) => setActivityFeed(prev => [item, ...prev.filter(x => x.id !== item.id)].slice(0, 25));

  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

    const [
      { data: rawClubs }, { data: allProfiles }, { data: allTeams },
      { count: eventCount }, { count: msgCount }, { data: recentRows }, { data: allSubs },
    ] = await Promise.all([
      supabase.from('clubs').select('id, name, slug, primary_color, logo_url, suspended_at, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, club_id, role, full_name, created_at'),
      supabase.from('teams').select('id, club_id'),
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('id, full_name, role, created_at, club_id').order('created_at', { ascending: false }).limit(10),
      supabase.from('subscriptions').select('club_id, plan, status').order('created_at', { ascending: false }),
    ]);

    const teamMap: Record<string, number> = {};
    const memberMap: Record<string, number> = {};
    const teamToClub: Record<string, string> = {};
    const subMap: Record<string, { plan: string | null; status: string | null }> = {};

    for (const t of allTeams ?? []) {
      if (t.club_id) { teamMap[t.club_id] = (teamMap[t.club_id] ?? 0) + 1; teamToClub[t.id] = t.club_id; }
    }
    for (const p of allProfiles ?? []) {
      const cid = (p as { club_id: string | null }).club_id;
      if (cid) memberMap[cid] = (memberMap[cid] ?? 0) + 1;
    }
    for (const s of allSubs ?? []) {
      if (s.club_id && !subMap[s.club_id]) subMap[s.club_id] = { plan: s.plan, status: s.status };
    }

    const { data: allEvents } = await supabase.from('events').select('id, team_id, created_at');
    const eventMap: Record<string, number> = {};
    const lastActiveMap: Record<string, string> = {};
    const eventToClub: Record<string, string> = {};
    for (const ev of allEvents ?? []) {
      const cid = teamToClub[ev.team_id];
      if (cid) {
        eventMap[cid] = (eventMap[cid] ?? 0) + 1;
        if (!lastActiveMap[cid] || ev.created_at > lastActiveMap[cid]) lastActiveMap[cid] = ev.created_at;
        eventToClub[ev.id] = cid;
      }
    }

    const [{ data: allPlayers }, { data: allRsvps }, { data: allNotes }] = await Promise.all([
      supabase.from('players').select('team_id'),
      supabase.from('event_rsvps').select('event_id'),
      supabase.from('admin_club_notes').select('club_id, contacted_at'),
    ]);

    const playerMap: Record<string, number> = {};
    for (const p of allPlayers ?? []) {
      const cid = teamToClub[p.team_id];
      if (cid) playerMap[cid] = (playerMap[cid] ?? 0) + 1;
    }
    const rsvpMap: Record<string, number> = {};
    for (const r of allRsvps ?? []) {
      const cid = eventToClub[r.event_id];
      if (cid) rsvpMap[cid] = (rsvpMap[cid] ?? 0) + 1;
    }
    const contactedMap: Record<string, string | null> = {};
    for (const n of allNotes ?? []) {
      if (n.club_id) contactedMap[n.club_id] = (n as { club_id: string; contacted_at: string | null }).contacted_at ?? null;
    }

    const clubNameMap: Record<string, string> = {};
    for (const c of rawClubs ?? []) clubNameMap[(c as { id: string; name: string }).id] = (c as { id: string; name: string }).name;
    clubNameRef.current   = clubNameMap;
    teamToClubRef.current = teamToClub;

    const processed: Club[] = (rawClubs ?? []).map((c: Record<string, unknown>) => {
      const tc = teamMap[c.id as string]   ?? 0;
      const pc = playerMap[c.id as string] ?? 0;
      const ec = eventMap[c.id as string]  ?? 0;
      const mc = memberMap[c.id as string] ?? 0;
      const rc = rsvpMap[c.id as string]   ?? 0;
      const hs = (tc > 0 ? 20 : 0) + (pc > 0 ? 20 : 0) + (ec > 0 ? 20 : 0) + (mc > 1 ? 20 : 0) + (rc > 0 ? 20 : 0);
      return {
        ...(c as Omit<Club, 'team_count'|'member_count'|'event_count'|'player_count'|'rsvp_count'|'plan'|'sub_status'|'last_active_at'|'contacted_at'|'health_score'>),
        team_count: tc, member_count: mc, event_count: ec, player_count: pc, rsvp_count: rc,
        plan: subMap[c.id as string]?.plan ?? null, sub_status: subMap[c.id as string]?.status ?? null,
        last_active_at: lastActiveMap[c.id as string] ?? null,
        contacted_at: contactedMap[c.id as string] ?? null,
        health_score: hs,
      };
    });

    const profWithClub = (allProfiles ?? []).filter((p: { club_id: string | null }) => p.club_id);
    setClubs(processed);
    setStats({
      clubs: processed.length, active: processed.filter(c => !c.suspended_at).length,
      suspended: processed.filter(c => !!c.suspended_at).length,
      members: profWithClub.length, teams: allTeams?.length ?? 0,
      events: eventCount ?? 0, messages: msgCount ?? 0,
      clubs30d:   processed.filter(c => c.created_at > cutoff).length,
      members30d: profWithClub.filter((p: { created_at: string }) => p.created_at > cutoff).length,
    });
    setRecent(
      (recentRows ?? []).filter((p: { club_id: string | null }) => p.club_id)
        .map((p: { id: string; full_name: string | null; role: string | null; created_at: string; club_id: string | null }) => ({
          id: p.id, full_name: p.full_name, role: p.role, created_at: p.created_at,
          club_name: p.club_id ? (clubNameMap[p.club_id] ?? null) : null,
        }))
    );

    // Seed activity feed
    const [{ data: recentEv }, { data: recentPr }] = await Promise.all([
      supabase.from('events').select('id, title, type, created_at, team_id').order('created_at', { ascending: false }).limit(10),
      supabase.from('profiles').select('id, full_name, role, created_at, club_id').not('club_id', 'is', null).order('created_at', { ascending: false }).limit(10),
    ]);
    const seedItems: ActivityItem[] = [];
    for (const ev of recentEv ?? []) {
      const cid = teamToClub[ev.team_id];
      if (!cid) continue;
      seedItems.push({ id: `ev-${ev.id}`, icon: ev.type === 'game' ? '⚽' : ev.type === 'training' ? '🏃' : '📅', text: `${ev.type === 'game' ? 'Game' : ev.type === 'training' ? 'Training' : 'Event'}: ${ev.title}`, club: clubNameMap[cid] ?? '?', ts: new Date(ev.created_at) });
    }
    for (const p of recentPr ?? []) {
      const club = p.club_id ? (clubNameMap[p.club_id] ?? '?') : '?';
      seedItems.push({ id: `pr-${p.id}`, icon: p.role === 'org_admin' ? '🏢' : p.role === 'coach' ? '📋' : '👤', text: `${p.full_name ?? 'New user'} joined as ${p.role}`, club, ts: new Date(p.created_at) });
    }
    seedItems.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    setActivityFeed(seedItems.slice(0, 20));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('admin-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, payload => {
        const ev = payload.new as { id: string; team_id: string; title: string; type: string; created_at: string };
        const cid = teamToClubRef.current[ev.team_id];
        addActivityRef.current({ id: `ev-${ev.id}`, icon: ev.type === 'game' ? '⚽' : '🏃', text: `New ${ev.type}: ${ev.title}`, club: cid ? (clubNameRef.current[cid] ?? '?') : '?', ts: new Date(), isLive: true });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, payload => {
        const p = payload.new as { id: string; club_id: string | null; full_name: string | null; role: string | null };
        if (!p.club_id) return;
        addActivityRef.current({ id: `pr-${p.id}`, icon: p.role === 'org_admin' ? '🏢' : '👤', text: `${p.full_name ?? 'New user'} joined as ${p.role}`, club: clubNameRef.current[p.club_id] ?? '?', ts: new Date(), isLive: true });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' }, payload => {
        const p = payload.new as { id: string; team_id: string; full_name: string };
        const cid = teamToClubRef.current[p.team_id];
        addActivityRef.current({ id: `pl-${p.id}`, icon: '🎽', text: `${p.full_name} added to roster`, club: cid ? (clubNameRef.current[cid] ?? '?') : '?', ts: new Date(), isLive: true });
      })
      .subscribe(status => setLiveConnected(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleSuspend(club: Club) {
    if (!confirm(`${club.suspended_at ? 'Unsuspend' : 'Suspend'} "${club.name}"?`)) return;
    setActing(club.id);
    await supabase.from('clubs').update({ suspended_at: club.suspended_at ? null : new Date().toISOString() }).eq('id', club.id);
    setActing(null); load();
    if (selected?.id === club.id) setSelected(s => s ? { ...s, suspended_at: s.suspended_at ? null : new Date().toISOString() } : s);
  }

  async function handleMarkContacted(clubId: string) {
    const ts = new Date().toISOString();
    await supabase.from('admin_club_notes').upsert({ club_id: clubId, contacted_at: ts, updated_at: ts });
    setClubs(prev => prev.map(c => c.id === clubId ? { ...c, contacted_at: ts } : c));
    if (selected?.id === clubId) setSelected(s => s ? { ...s, contacted_at: ts } : s);
  }

  function handleDelete() { setSelected(null); load(); }

  const filtered = clubs.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.slug.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'active')    return !c.suspended_at;
    if (filter === 'suspended') return !!c.suspended_at;
    if (filter === 'quiet')     return healthOf(c) === 'quiet';
    return true;
  }).sort((a, b) => {
    if (sort === 'members')     return b.member_count - a.member_count;
    if (sort === 'teams')       return b.team_count   - a.team_count;
    if (sort === 'score')       return b.health_score - a.health_score;
    if (sort === 'last active') {
      if (!a.last_active_at && !b.last_active_at) return 0;
      if (!a.last_active_at) return 1; if (!b.last_active_at) return -1;
      return new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime();
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const quietCount = clubs.filter(c => healthOf(c) === 'quiet').length;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.pageBg, fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
      {showBroadcast && <BroadcastModal onClose={() => setShowBroadcast(false)} />}

      <header style={{ height: 56, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', paddingInline: 24, gap: 20, flexShrink: 0, background: C.cardBg, boxShadow: C.shadow }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: C.green, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#fff' }}>D</div>
          <span style={{ fontWeight: 800, fontSize: 15, color: C.textDark }}>Pulse FC</span>
          <span style={{ color: C.border }}>·</span>
          <span style={{ color: C.textLight, fontSize: 13 }}>Super Admin</span>
        </div>
        {stats && !loading && (
          <div style={{ display: 'flex', gap: 18, paddingLeft: 16, borderLeft: `1px solid ${C.border}` }}>
            {([{ v: stats.clubs, l: 'clubs' }, { v: stats.members, l: 'members' }, { v: stats.teams, l: 'teams' }, { v: stats.events, l: 'events' }] as { v: number; l: string }[]).map(({ v, l }) => (
              <span key={l} style={{ fontSize: 12, color: C.textLight }}><span style={{ color: C.textDark, fontWeight: 700 }}>{v.toLocaleString()}</span> {l}</span>
            ))}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowBroadcast(true)} style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: C.green, border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer' }}>Broadcast email</button>
          {!loading && clubs.length > 0 && <button onClick={() => exportClubsCSV(clubs)} style={{ fontSize: 12, fontWeight: 600, color: C.textMid, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>Export CSV</button>}
          <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 4 }}>{user.email}</span>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} style={{ fontSize: 12, color: C.textLight, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>Sign out</button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 320, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, background: C.cardBg }}>
          <div style={{ padding: '12px 12px 0' }}>
            <input placeholder="Search clubs…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: C.inputBg, border: `1.5px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', color: C.textDark, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ padding: '8px 12px 5px', display: 'flex', gap: 5 }}>
            {(['all', 'active', 'quiet', 'suspended'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', textTransform: 'capitalize', background: filter === f ? C.green : C.inputBg, color: filter === f ? '#fff' : C.textLight }}>
                {f}{f === 'quiet' && quietCount > 0 ? ` ${quietCount}` : ''}
              </button>
            ))}
          </div>
          <div style={{ padding: '2px 12px 10px', display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: C.textMuted, marginRight: 2 }}>Sort:</span>
            {(['newest', 'score', 'members', 'teams', 'last active'] as const).map(s => (
              <button key={s} onClick={() => setSort(s)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: `1px solid ${sort === s ? C.borderDark : C.border}`, cursor: 'pointer', background: sort === s ? C.inputBg : 'transparent', color: sort === s ? C.textMid : C.textMuted, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{s}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
              : filtered.length === 0 ? <p style={{ color: C.textMuted, textAlign: 'center', padding: 40, fontSize: 13 }}>No clubs found</p>
              : filtered.map(club => (
                <ClubListItem key={club.id} club={club} selected={selected?.id === club.id} acting={acting === club.id}
                  onClick={() => setSelected(selected?.id === club.id ? null : club)}
                  onMarkContacted={() => handleMarkContacted(club.id)} />
              ))}
          </div>
          <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted }}>{filtered.length} of {clubs.length} clubs</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {selected ? (
            <ClubDetailView club={selected} acting={acting === selected.id}
              onClose={() => setSelected(null)} onSuspend={() => handleSuspend(selected)}
              onMarkContacted={() => handleMarkContacted(selected.id)} onDelete={handleDelete} />
          ) : (
            <PlatformOverview stats={stats} recentMembers={recentMembers} clubs={clubs} loading={loading} activityFeed={activityFeed} liveConnected={liveConnected} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Club list item ─────────────────────────────────────────────────────────────
function ClubListItem({ club, selected, acting, onClick, onMarkContacted }: {
  club: Club; selected: boolean; acting: boolean;
  onClick: () => void; onMarkContacted: () => void;
}) {
  const col = accentOf(club);
  const s   = club.health_score;
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, background: selected ? C.selectedBg : C.cardBg, borderLeft: `3px solid ${selected ? C.green : 'transparent'}` }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
        {club.logo_url ? <img src={club.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : club.name.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: club.suspended_at ? C.textMuted : C.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</span>
          {club.suspended_at && <span style={{ fontSize: 9, fontWeight: 700, background: '#FEE2E2', color: '#dc2626', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>SUSP</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>{club.team_count}t · {club.member_count}m · {club.player_count}p</span>
          <PlanBadge plan={club.plan} status={club.sub_status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ fontSize: 10, color: club.last_active_at ? '#16a34a' : C.textMuted }}>{lastActiveLabel(club.last_active_at)}</span>
          {club.contacted_at && <span style={{ fontSize: 10, color: '#0284c7' }}>· contacted {timeAgo(club.contacted_at)}</span>}
          {!club.contacted_at && (
            <button onClick={e => { e.stopPropagation(); onMarkContacted(); }}
              style={{ fontSize: 10, color: C.textMuted, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 6px', cursor: 'pointer', fontFamily: 'inherit' }}>
              + contacted
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor(s), background: scoreBg(s), borderRadius: 6, padding: '2px 7px', minWidth: 28, textAlign: 'center' }}>{s}</span>
        {acting && <Spinner size={14} />}
      </div>
    </div>
  );
}

// ── Activation funnel ──────────────────────────────────────────────────────────
function ActivationFunnel({ club }: { club: Club }) {
  const steps = [
    { label: 'Team created',    done: club.team_count > 0,   detail: club.team_count > 0 ? `${club.team_count} team${club.team_count !== 1 ? 's' : ''}` : 'No teams yet' },
    { label: 'Players added',   done: club.player_count > 0, detail: club.player_count > 0 ? `${club.player_count} player${club.player_count !== 1 ? 's' : ''}` : 'Roster empty' },
    { label: 'Event scheduled', done: club.event_count > 0,  detail: club.event_count > 0 ? `${club.event_count} event${club.event_count !== 1 ? 's' : ''}` : 'No events yet' },
    { label: 'Parent joined',   done: club.member_count > 1, detail: club.member_count > 1 ? `${club.member_count} members` : 'Only admin so far' },
    { label: 'First RSVP',      done: club.rsvp_count > 0,   detail: club.rsvp_count > 0 ? `${club.rsvp_count} RSVP${club.rsvp_count !== 1 ? 's' : ''}` : 'No RSVPs yet' },
  ];
  const complete = steps.filter(s => s.done).length;
  const stuck    = steps.findIndex(s => !s.done);

  return (
    <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textDark }}>Activation funnel</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ height: 6, width: 120, background: C.inputBg, borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${(complete / 5) * 100}%`, background: complete === 5 ? '#16a34a' : complete >= 3 ? '#d97706' : '#dc2626', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: complete === 5 ? '#16a34a' : C.textLight }}>{complete}/5</span>
        </div>
      </div>
      <div style={{ padding: '8px 16px' }}>
        {steps.map((step, i) => (
          <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 4px', borderBottom: i < steps.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: step.done ? '#F0FDF4' : (stuck === i ? '#FFFBEB' : C.inputBg), border: `2px solid ${step.done ? '#16a34a' : stuck === i ? '#d97706' : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, color: step.done ? '#16a34a' : stuck === i ? '#d97706' : C.textMuted }}>
              {step.done ? '✓' : i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: step.done ? 500 : 600, color: step.done ? C.textLight : C.textDark }}>{step.label}</div>
            </div>
            <div style={{ fontSize: 12, color: step.done ? '#16a34a' : stuck === i ? '#d97706' : C.textMuted, fontWeight: step.done ? 600 : 400 }}>{step.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Growth chart ───────────────────────────────────────────────────────────────
function GrowthChart({ clubs }: { clubs: Club[] }) {
  const monthMap: Record<string, number> = {};
  for (const c of clubs) {
    const d = new Date(c.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap[key] = (monthMap[key] ?? 0) + 1;
  }
  const sorted = Object.entries(monthMap).sort();
  let cum = 0;
  const data = sorted.map(([month, n]) => { cum += n; return { month, n, total: cum }; });
  if (data.length < 2) return <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>More data soon</p>;

  const W = 500, H = 80, pL = 6, pR = 6, pT = 16, pB = 18;
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const max = data[data.length - 1].total;
  const x = (i: number) => pL + (i / (data.length - 1)) * plotW;
  const y = (v: number) => pT + plotH - (v / max) * plotH;
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.total).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(data.length - 1).toFixed(1)} ${H - pB} L ${x(0).toFixed(1)} ${H - pB} Z`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity="0.2" /><stop offset="100%" stopColor={C.green} stopOpacity="0" /></linearGradient></defs>
      <path d={areaPath} fill="url(#ga)" /><path d={linePath} fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => {
        const show = i === 0 || i === data.length - 1 || (data.length > 4 && i === Math.floor(data.length / 2));
        const anchor = i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle';
        return (
          <g key={d.month}>
            <circle cx={x(i)} cy={y(d.total)} r={3} fill={C.green} />
            {show && (<>
              <text x={x(i)} y={H - 3} textAnchor={anchor} fill={C.textMuted} fontSize="9" fontFamily="system-ui">{d.month.slice(5)}/{d.month.slice(2, 4)}</text>
              <text x={x(i)} y={y(d.total) - 7} textAnchor={anchor} fill="#16a34a" fontSize="10" fontWeight="700" fontFamily="system-ui">{d.total}</text>
            </>)}
          </g>
        );
      })}
    </svg>
  );
}

// ── Cohort table ───────────────────────────────────────────────────────────────
function CohortTable({ clubs }: { clubs: Club[] }) {
  const byMonth: Record<string, Club[]> = {};
  for (const c of clubs) {
    const key = c.created_at.slice(0, 7);
    (byMonth[key] = byMonth[key] ?? []).push(c);
  }
  const months = Object.keys(byMonth).sort().reverse();
  if (months.length === 0) return null;

  const pct = (n: number, total: number) => total === 0 ? 0 : Math.round((n / total) * 100);
  const cell = (n: number, total: number) => {
    const p = pct(n, total);
    const bg = p >= 75 ? '#F0FDF4' : p >= 40 ? '#FFFBEB' : p > 0 ? '#FFF5F5' : C.inputBg;
    const color = p >= 75 ? '#16a34a' : p >= 40 ? '#d97706' : p > 0 ? '#dc2626' : C.textMuted;
    return { p, bg, color };
  };

  const cols = [
    { key: 'teams',   label: 'Team',    fn: (c: Club) => c.team_count > 0 },
    { key: 'players', label: 'Players', fn: (c: Club) => c.player_count > 0 },
    { key: 'events',  label: 'Event',   fn: (c: Club) => c.event_count > 0 },
    { key: 'members', label: 'Member',  fn: (c: Club) => c.member_count > 1 },
    { key: 'rsvps',   label: '100%',    fn: (c: Club) => c.health_score === 100 },
  ];

  return (
    <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textDark }}>Cohort activation</div>
        <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>% of clubs in each signup cohort that completed each onboarding step</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.inputBg }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}` }}>Cohort</th>
              <th style={{ padding: '10px 12px', color: C.textMuted, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>Clubs</th>
              {cols.map(col => <th key={col.key} style={{ padding: '10px 12px', color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {months.map((month, mi) => {
              const cohort = byMonth[month];
              return (
                <tr key={month} style={{ borderBottom: mi < months.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '10px 16px', color: C.textDark, fontWeight: 600 }}>{fmtMonth(month + '-01')}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: C.textLight, fontWeight: 700 }}>{cohort.length}</td>
                  {cols.map(col => {
                    const n = cohort.filter(col.fn).length;
                    const { p, bg, color } = cell(n, cohort.length);
                    return <td key={col.key} style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color, background: bg, borderRadius: 6, padding: '3px 8px', display: 'inline-block', minWidth: 36 }}>{p}%</span>
                    </td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Activity feed ──────────────────────────────────────────────────────────────
function ActivityFeed({ items, liveConnected }: { items: ActivityItem[]; liveConnected: boolean }) {
  return (
    <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textDark }}>Activity feed</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: liveConnected ? '#22c55e' : C.textMuted, animation: liveConnected ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ fontSize: 11, color: liveConnected ? '#16a34a' : C.textMuted, fontWeight: 600 }}>{liveConnected ? 'Live' : 'Connecting…'}</span>
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No recent activity</div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {items.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 20px', borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none', background: item.isLive ? '#F0FDF4' : 'transparent', transition: 'background 2s' }}>
              <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: C.textDark }}>{item.text}</span>
                <span style={{ fontSize: 12, color: C.textMuted }}> · {item.club}</span>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {item.isLive ? <span style={{ color: '#16a34a', fontWeight: 600 }}>just now</span> : timeAgo(item.ts.toISOString())}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Income calculator ──────────────────────────────────────────────────────────
function IncomeCalculator({ clubs }: { clubs: Club[] }) {
  const paidPlans = ['team_pro', 'starter', 'club', 'academy'] as const;
  const [projPlan, setProjPlan] = useState<typeof paidPlans[number]>('starter');
  const [projClubs, setProjClubs] = useState(1);
  const currentMRR = clubs.filter(c => c.sub_status === 'active' && c.plan && paidPlans.includes(c.plan as typeof paidPlans[number])).reduce((sum, c) => sum + planMonthly(c.plan), 0);
  const freeCount = clubs.filter(c => ['free', 'trialing'].includes(effectivePlanKey(c.plan, c.sub_status))).length;
  const projPrice = PLAN_PRICING[projPlan].monthly;
  const projMRR = projClubs * projPrice;
  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Income</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, background: C.pageBg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.textLight, marginBottom: 4 }}>Current MRR</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: currentMRR > 0 ? '#16a34a' : C.textMuted, letterSpacing: -0.5 }}>${currentMRR.toFixed(0)}<span style={{ fontSize: 13, fontWeight: 400, color: C.textMuted }}>/mo</span></div>
          {currentMRR > 0 && <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>ARR: ${(currentMRR * 12).toFixed(0)}</div>}
        </div>
        <div style={{ flex: 1, background: C.pageBg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.textLight, marginBottom: 4 }}>Unpaid clubs</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706', letterSpacing: -0.5 }}>{freeCount}</div>
          <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>revenue opportunity</div>
        </div>
      </div>
      <div style={{ background: C.pageBg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.textLight, marginBottom: 10, fontWeight: 600 }}>Projection</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.textLight }}>If</span>
          <input type="number" min={1} max={clubs.length || 99} value={projClubs} onChange={e => setProjClubs(Math.max(1, Number(e.target.value)))}
            style={{ width: 48, background: C.cardBg, border: `1.5px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', color: C.textDark, fontSize: 13, fontWeight: 700, textAlign: 'center', outline: 'none' }} />
          <span style={{ fontSize: 12, color: C.textLight }}>club{projClubs !== 1 ? 's' : ''} upgrade to</span>
          <select value={projPlan} onChange={e => setProjPlan(e.target.value as typeof paidPlans[number])} style={{ background: C.cardBg, border: `1.5px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', color: C.textDark, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {paidPlans.map(p => <option key={p} value={p}>{PLAN_META[p].label} — ${PLAN_PRICING[p].monthly}/mo</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div><div style={{ fontSize: 11, color: C.textLight }}>MRR</div><div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>${projMRR.toFixed(0)}<span style={{ fontSize: 11, color: C.textMuted }}>/mo</span></div></div>
          <div style={{ width: 1, background: C.border }} />
          <div><div style={{ fontSize: 11, color: C.textLight }}>ARR</div><div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>${(projMRR * 12).toFixed(0)}<span style={{ fontSize: 11, color: C.textMuted }}>/yr</span></div></div>
          <div style={{ width: 1, background: C.border }} />
          <div><div style={{ fontSize: 11, color: C.textLight }}>Per club</div><div style={{ fontSize: 20, fontWeight: 800, color: C.textMid }}>${projPrice}<span style={{ fontSize: 11, color: C.textMuted }}>/mo</span></div></div>
        </div>
      </div>
    </div>
  );
}

// ── Platform overview ──────────────────────────────────────────────────────────
function PlatformOverview({ stats, recentMembers, clubs, loading, activityFeed, liveConnected }: {
  stats: Stats | null; recentMembers: RecentMember[]; clubs: Club[]; loading: boolean;
  activityFeed: ActivityItem[]; liveConnected: boolean;
}) {
  if (loading || !stats) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner /></div>;
  const topClubs   = [...clubs].sort((a, b) => b.member_count - a.member_count).slice(0, 6);
  const quietCount = clubs.filter(c => healthOf(c) === 'quiet').length;
  const avgScore   = clubs.length > 0 ? Math.round(clubs.reduce((s, c) => s + c.health_score, 0) / clubs.length) : 0;

  return (
    <div style={{ padding: 32, maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: C.textDark, margin: 0, letterSpacing: -0.5 }}>Platform Overview</h2>
        <p style={{ color: C.textLight, fontSize: 13, margin: '4px 0 0' }}>Live stats across all clubs on Pulse FC</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total clubs',    val: stats.clubs,    sub: `+${stats.clubs30d} this month`,   color: '#16a34a' },
          { label: 'Active clubs',   val: stats.active,   sub: `${stats.suspended} suspended`,    color: '#16a34a' },
          { label: 'Total members',  val: stats.members,  sub: `+${stats.members30d} this month`, color: '#0284c7' },
          { label: 'Teams',          val: stats.teams,    sub: 'across all clubs',                color: '#7c3aed' },
          { label: 'Events',         val: stats.events,   sub: 'all time',                        color: '#d97706' },
          { label: 'Avg health',     val: `${avgScore}`,  sub: 'activation score /100',           color: scoreColor(avgScore) },
        ].map(({ label, val, sub, color }) => (
          <div key={label} style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: -1 }}>{val.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: C.textMid, marginTop: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Growth chart */}
      <div style={{ ...card, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Club growth</div>
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>{stats.clubs} total</div>
        </div>
        <GrowthChart clubs={clubs} />
      </div>

      {quietCount > 0 && (
        <div style={{ marginBottom: 16, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>{quietCount} quiet club{quietCount !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 12, color: '#b45309' }}>— signed up 7d+ ago with no teams or members. Click "Quiet" filter to focus them.</span>
        </div>
      )}

      {/* Activity feed */}
      <ActivityFeed items={activityFeed} liveConnected={liveConnected} />

      {/* Income + Health */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <IncomeCalculator clubs={clubs} />
        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Health breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 20, 40, 60, 80, 100].map(threshold => {
              const count = threshold === 100 ? clubs.filter(c => c.health_score === 100).length : threshold === 0 ? clubs.filter(c => c.health_score === 0).length : clubs.filter(c => c.health_score === threshold).length;
              if (count === 0) return null;
              const labels: Record<number, string> = { 0: 'Not started', 20: '1 step done', 40: '2 steps done', 60: '3 steps done', 80: '4 steps done', 100: 'Fully activated' };
              return (
                <div key={threshold} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor(threshold), background: scoreBg(threshold), borderRadius: 5, padding: '2px 7px', minWidth: 28, textAlign: 'center', flexShrink: 0 }}>{threshold}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: C.textMid }}>{labels[threshold]}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.textLight }}>{count}</span>
                    </div>
                    <div style={{ height: 4, background: C.inputBg, borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${(count / clubs.length) * 100}%`, background: scoreColor(threshold), borderRadius: 2, opacity: 0.5 }} />
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 4, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: C.textLight }}>Average score</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(avgScore) }}>{avgScore}/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cohort table */}
      <CohortTable clubs={clubs} />

      {/* Top clubs + recent */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Top clubs · members</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topClubs.map((c, i) => {
              const pct = topClubs[0].member_count > 0 ? (c.member_count / topClubs[0].member_count) * 100 : 0;
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: accentOf(c), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                    {c.logo_url ? <img src={c.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: C.textDark, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor(c.health_score), background: scoreBg(c.health_score), borderRadius: 5, padding: '1px 6px' }}>{c.health_score}</span>
                        <span style={{ fontSize: 12, color: C.textLight }}>{c.member_count}</span>
                      </div>
                    </div>
                    <div style={{ height: 4, background: C.inputBg, borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: accentOf(c), borderRadius: 2, opacity: 0.8 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Recent signups</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentMembers.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, background: C.inputBg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: C.textLight, fontWeight: 700, flexShrink: 0 }}>{(m.full_name ?? '?').slice(0, 1).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.textDark, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name ?? '—'}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{m.club_name ?? '—'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <RoleBadge role={m.role} />
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{timeAgo(m.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Club detail ────────────────────────────────────────────────────────────────
function ClubDetailView({ club, acting, onClose, onSuspend, onMarkContacted, onDelete }: {
  club: Club; acting: boolean;
  onClose: () => void; onSuspend: () => void; onMarkContacted: () => void; onDelete: () => void;
}) {
  const [teams, setTeams]                 = useState<TeamRow[]>([]);
  const [staff, setStaff]                 = useState<StaffWithEmail[]>([]);
  const [recent, setRecent]               = useState<MemberRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [copied, setCopied]               = useState(false);
  const [notes, setNotes]                 = useState('');
  const [notesSaving, setNotesSaving]     = useState(false);
  const [notesSaved, setNotesSaved]       = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const col = accentOf(club);

  useEffect(() => {
    setDeleteConfirm(false); setNotes('');
    let cancelled = false;
    async function load() {
      setDetailLoading(true);
      const { data: rawTeams } = await supabase.from('teams').select('id, name, age_group, season, gender').eq('club_id', club.id).order('name');
      const teamIds = (rawTeams ?? []).map((t: { id: string }) => t.id);
      const { data: rawPlayers } = teamIds.length > 0 ? await supabase.from('players').select('team_id').in('team_id', teamIds) : { data: [] };
      const playerMap: Record<string, number> = {};
      for (const p of rawPlayers ?? []) if (p.team_id) playerMap[p.team_id] = (playerMap[p.team_id] ?? 0) + 1;
      const { data: rawRecent } = await supabase.from('profiles').select('id, full_name, role, created_at').eq('club_id', club.id).order('created_at', { ascending: false }).limit(12);
      const { data: noteRow } = await supabase.from('admin_club_notes').select('notes').eq('club_id', club.id).maybeSingle();
      if (cancelled) return;
      setTeams((rawTeams ?? []).map((t: { id: string; name: string; age_group: string | null; season: string | null; gender: string | null }) => ({ ...t, player_count: playerMap[t.id] ?? 0 })));
      setRecent(rawRecent ?? []);
      setNotes((noteRow as { notes: string } | null)?.notes ?? '');
      setDetailLoading(false);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const res = await fetch(`/api/admin/club-staff?clubId=${club.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok && !cancelled) { const json = await res.json(); setStaff(json.staff ?? []); }
    }
    load();
    return () => { cancelled = true; };
  }, [club.id]);

  async function saveNotes(value: string) {
    setNotesSaving(true);
    await supabase.from('admin_club_notes').upsert({ club_id: club.id, notes: value, updated_at: new Date().toISOString() });
    setNotesSaving(false); setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  function handleNotesChange(value: string) {
    setNotes(value); setNotesSaved(false);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => saveNotes(value), 1200);
  }

  async function handleDelete() {
    setDeleting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/delete-club', { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ clubId: club.id }) });
    const json = await res.json();
    if (json.error) { alert(`Delete failed: ${json.error}`); setDeleting(false); return; }
    setDeleting(false); onDelete();
  }

  function copySlug() { navigator.clipboard.writeText(club.slug); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  const planKey  = effectivePlanKey(club.plan, club.sub_status);
  const planMeta = PLAN_META[planKey] ?? PLAN_META.free;
  const sc       = { ...card, overflow: 'hidden' as const, marginBottom: 16 };

  return (
    <div style={{ padding: 32, background: C.pageBg, minHeight: '100%' }}>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textLight, fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>← Back to overview</button>

      {/* Header card */}
      <div style={sc}>
        <div style={{ height: 5, background: col }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '20px 24px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
            {club.logo_url ? <img src={club.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : club.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: C.textDark, margin: 0 }}>{club.name}</h2>
              <PlanBadge plan={club.plan} status={club.sub_status} size="md" />
              <span style={{ fontSize: 12, fontWeight: 800, color: scoreColor(club.health_score), background: scoreBg(club.health_score), borderRadius: 7, padding: '3px 10px' }}>Score {club.health_score}/100</span>
              {club.suspended_at && <span style={{ fontSize: 10, fontWeight: 700, background: '#FEE2E2', color: '#dc2626', borderRadius: 6, padding: '3px 8px' }}>SUSPENDED</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: C.textLight, fontFamily: 'monospace' }}>/{club.slug}</span>
              <button onClick={copySlug} style={{ fontSize: 11, color: copied ? '#16a34a' : C.textLight, background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>{copied ? 'Copied!' : 'Copy'}</button>
              <span style={{ fontSize: 12, color: C.textMuted }}>Joined {fmtDate(club.created_at)}</span>
              <span style={{ fontSize: 12, color: club.last_active_at ? '#16a34a' : C.textMuted }}>{lastActiveLabel(club.last_active_at)}</span>
              {club.contacted_at
                ? <span style={{ fontSize: 12, color: '#0284c7' }}>· contacted {timeAgo(club.contacted_at)}</span>
                : <button onClick={onMarkContacted} style={{ fontSize: 11, color: '#0284c7', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>+ Mark contacted</button>
              }
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderTop: `1px solid ${C.border}` }}>
          {[
            { label: 'Teams',   val: club.team_count,   color: '#7c3aed' },
            { label: 'Members', val: club.member_count,  color: '#0284c7' },
            { label: 'Players', val: club.player_count,  color: '#0284c7' },
            { label: 'Events',  val: club.event_count,   color: '#d97706' },
            { label: 'RSVPs',   val: club.rsvp_count,    color: '#16a34a' },
            { label: 'Plan',    val: planMeta.label,     color: planMeta.color },
          ].map(({ label, val, color }, i, arr) => (
            <div key={label} style={{ padding: '12px 16px', borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Activation funnel */}
      <ActivationFunnel club={club} />

      {detailLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={sc}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}><div style={{ fontSize: 13, fontWeight: 700, color: C.textDark }}>Teams ({teams.length})</div></div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teams.length === 0 ? <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>No teams yet</p> : teams.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: C.pageBg, borderRadius: 8 }}>
                    <div><div style={{ fontSize: 13, color: C.textDark, fontWeight: 500 }}>{t.name}</div><div style={{ fontSize: 11, color: C.textMuted }}>{[t.age_group, t.gender, t.season].filter(Boolean).join(' · ')}</div></div>
                    <span style={{ fontSize: 12, color: C.textLight }}>{t.player_count}p</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={sc}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}><div style={{ fontSize: 13, fontWeight: 700, color: C.textDark }}>Staff ({staff.length})</div></div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {staff.length === 0 ? <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>No staff yet</p> : staff.map(m => (
                  <div key={m.id} style={{ padding: '8px 12px', background: C.pageBg, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: m.email ? 4 : 0 }}>
                      <span style={{ fontSize: 13, color: C.textDark, fontWeight: 500 }}>{m.full_name ?? '—'}</span>
                      <RoleBadge role={m.role} />
                    </div>
                    {m.email && <a href={`mailto:${m.email}`} style={{ fontSize: 12, color: C.textLight, textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.color = '#16a34a')} onMouseLeave={e => (e.currentTarget.style.color = C.textLight)}>{m.email}</a>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={sc}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}><div style={{ fontSize: 13, fontWeight: 700, color: C.textDark }}>Recent members</div></div>
            <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {recent.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: C.pageBg, borderRadius: 8 }}>
                  <div><div style={{ fontSize: 13, color: C.textDark, fontWeight: 500 }}>{m.full_name ?? '—'}</div><div style={{ fontSize: 11, color: C.textMuted }}>{fmtDate(m.created_at)}</div></div>
                  <RoleBadge role={m.role} />
                </div>
              ))}
            </div>
          </div>

          <div style={sc}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.textDark }}>Private notes</div>
              <div style={{ fontSize: 11, color: notesSaving ? C.textMuted : notesSaved ? '#16a34a' : C.textMuted }}>{notesSaving ? 'Saving…' : notesSaved ? '✓ Saved' : 'Auto-saves'}</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <textarea value={notes} onChange={e => handleNotesChange(e.target.value)}
                placeholder={'Internal notes — only visible to you.\ne.g. "Called Jane 7 Jul — interested in Club plan in September."'}
                rows={4}
                style={{ width: '100%', background: C.inputBg, border: `1.5px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', color: C.textDark, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'system-ui', lineHeight: 1.6 }} />
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <button onClick={onSuspend} disabled={acting} style={{ padding: '9px 18px', borderRadius: 9, border: `1px solid ${club.suspended_at ? '#86EFAC' : '#FCA5A5'}`, background: club.suspended_at ? '#F0FDF4' : '#FFF5F5', color: club.suspended_at ? '#15803d' : '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: acting ? 0.5 : 1 }}>
          {acting ? '…' : club.suspended_at ? 'Unsuspend club' : 'Suspend club'}
        </button>
        <button
          onClick={() => setDeleteConfirm(true)}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#b91c1c'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#dc2626'; }}
          style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.01em' }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>🗑</span> Delete club
        </button>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(false); }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            {/* Red header bar */}
            <div style={{ background: '#dc2626', padding: '20px 24px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Delete "{club.name}"?</div>
              <div style={{ fontSize: 13, color: '#FECACA' }}>This is permanent and cannot be undone.</div>
            </div>

            {/* What gets deleted */}
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>What will be deleted</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Teams', count: club.team_count, desc: 'and all their configuration' },
                  { label: 'Players', count: club.player_count, desc: 'roster entries and profiles' },
                  { label: 'Members', count: club.member_count, desc: 'coaches, parents, and staff accounts will be unlinked' },
                  { label: 'Events', count: club.event_count, desc: 'games, training sessions, and all RSVPs' },
                  { label: 'Lineups', count: null, desc: 'all saved lineups and sub plans' },
                  { label: 'Chat & messages', count: null, desc: 'all conversations and announcements' },
                  { label: 'Invites & notes', count: null, desc: 'pending invites and your private notes' },
                ].map(({ label, count, desc }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: '#FFF5F5', borderRadius: 8, border: '1px solid #FEE2E2' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', minWidth: 28, textAlign: 'right', flexShrink: 0, paddingTop: 1 }}>
                      {count !== null ? count : '—'}
                    </span>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.textDark }}>{label}</span>
                      <span style={{ fontSize: 12, color: C.textLight }}> — {desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: C.textMuted, margin: '16px 0 0', lineHeight: 1.5 }}>
                User accounts are <strong>not</strong> deleted — members keep their logins but lose access to this club.
              </p>
            </div>

            {/* Actions */}
            <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10 }}>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: deleting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting…' : 'Yes, delete permanently'}
              </button>
              <button onClick={() => setDeleteConfirm(false)} disabled={deleting}
                style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.cardBg, color: C.textMid, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Misc ───────────────────────────────────────────────────────────────────────
function Forbidden() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.pageBg, fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <h2 style={{ color: C.textDark, marginBottom: 8 }}>Access denied</h2>
        <p style={{ color: C.textLight, fontSize: 14 }}>You need app_admin role to view this page.</p>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} style={{ marginTop: 20, color: C.green, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Sign out</button>
      </div>
    </div>
  );
}
