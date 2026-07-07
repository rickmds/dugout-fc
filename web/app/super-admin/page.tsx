'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────────────────────

type Club = {
  id: string;
  name: string;
  slug: string;
  primary_color: string | null;
  logo_url: string | null;
  suspended_at: string | null;
  created_at: string;
  team_count: number;
  member_count: number;
  event_count: number;
};

type Stats = {
  clubs: number;
  active: number;
  suspended: number;
  members: number;
  teams: number;
  events: number;
  messages: number;
  clubs30d: number;
  members30d: number;
};

type TeamRow = {
  id: string;
  name: string;
  age_group: string | null;
  season: string | null;
  gender: string | null;
  player_count: number;
};

type MemberRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  created_at: string;
};

type RecentMember = MemberRow & { club_name: string | null };

// ── Helpers ────────────────────────────────────────────────────────────────────

function accentOf(c: Club) {
  return c.primary_color && c.primary_color !== '#000000' ? c.primary_color : '#22C55E';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function healthOf(c: Club): 'active' | 'quiet' | 'new' {
  if (c.team_count > 0 && c.member_count > 1) return 'active';
  if (Date.now() - new Date(c.created_at).getTime() < 7 * 86400000) return 'new';
  return 'quiet';
}

const HEALTH: Record<string, string> = { active: '#22c55e', quiet: '#f59e0b', new: '#38bdf8' };
const ROLE_CLR: Record<string, string> = {
  org_admin: '#a78bfa', coach: '#38bdf8', player: '#22c55e', app_admin: '#f59e0b',
};

// ── Entry point ────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [user, setUser]   = useState<User | null>(null);
  const [role, setRole]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        const { data: p } = await supabase.from('profiles').select('role').eq('id', u.id).single();
        setRole((p as { role: string | null } | null)?.role ?? null);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <FullSpinner />;
  if (!user)   return <AuthScreen />;
  if (role !== 'app_admin') return <Forbidden />;
  return <App user={user} />;
}

// ── Auth screen ────────────────────────────────────────────────────────────────

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [pw, setPw]       = useState('');
  const [err, setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setErr(error.message); setLoading(false); return; }
    window.location.reload();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080808' }}>
      <div style={{ width: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
          <div style={{ width: 36, height: 36, background: '#22C55E', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#000' }}>D</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>Dugout FC</div>
            <div style={{ color: '#555', fontSize: 12 }}>Super Admin</div>
          </div>
        </div>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
            style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          <input type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} required
            style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{err}</p>}
          <button type="submit" disabled={loading}
            style={{ background: '#22C55E', color: '#000', fontWeight: 700, padding: 12, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, opacity: loading ? 0.5 : 1 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

function App({ user }: { user: User }) {
  const [clubs, setClubs]               = useState<Club[]>([]);
  const [stats, setStats]               = useState<Stats | null>(null);
  const [recentMembers, setRecentMembers] = useState<RecentMember[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState<Club | null>(null);
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState<'all' | 'active' | 'quiet' | 'suspended'>('all');
  const [sort, setSort]                 = useState<'newest' | 'members' | 'teams'>('newest');
  const [acting, setActing]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

    const [
      { data: rawClubs },
      { data: allProfiles },
      { data: allTeams },
      { count: eventCount },
      { count: msgCount },
      { data: recentRows },
    ] = await Promise.all([
      supabase.from('clubs').select('id, name, slug, primary_color, logo_url, suspended_at, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, club_id, role, full_name, created_at'),
      supabase.from('teams').select('id, club_id'),
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('messages').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('id, full_name, role, created_at, club_id').order('created_at', { ascending: false }).limit(10),
    ]);

    const teamMap: Record<string, number>   = {};
    const memberMap: Record<string, number> = {};
    const teamToClub: Record<string, string> = {};

    for (const t of allTeams ?? []) {
      if (t.club_id) { teamMap[t.club_id] = (teamMap[t.club_id] ?? 0) + 1; teamToClub[t.id] = t.club_id; }
    }
    for (const p of allProfiles ?? []) {
      const cid = (p as { club_id: string | null }).club_id;
      if (cid) memberMap[cid] = (memberMap[cid] ?? 0) + 1;
    }

    const { data: allEvents } = await supabase.from('events').select('team_id');
    const eventMap: Record<string, number> = {};
    for (const e of allEvents ?? []) {
      const cid = teamToClub[e.team_id];
      if (cid) eventMap[cid] = (eventMap[cid] ?? 0) + 1;
    }

    const clubNameMap: Record<string, string> = {};
    for (const c of rawClubs ?? []) clubNameMap[c.id] = c.name;

    const processed: Club[] = (rawClubs ?? []).map((c: Record<string, unknown>) => ({
      ...(c as Omit<Club, 'team_count' | 'member_count' | 'event_count'>),
      team_count:   teamMap[c.id as string]   ?? 0,
      member_count: memberMap[c.id as string] ?? 0,
      event_count:  eventMap[c.id as string]  ?? 0,
    }));

    const profilesWithClub = (allProfiles ?? []).filter((p: { club_id: string | null }) => p.club_id);

    setClubs(processed);
    setStats({
      clubs:      processed.length,
      active:     processed.filter(c => !c.suspended_at).length,
      suspended:  processed.filter(c => !!c.suspended_at).length,
      members:    profilesWithClub.length,
      teams:      allTeams?.length ?? 0,
      events:     eventCount ?? 0,
      messages:   msgCount   ?? 0,
      clubs30d:   processed.filter(c => c.created_at > cutoff).length,
      members30d: profilesWithClub.filter((p: { created_at: string }) => p.created_at > cutoff).length,
    });
    setRecentMembers(
      (recentRows ?? [])
        .filter((p: { club_id: string | null }) => p.club_id)
        .map((p: { id: string; full_name: string | null; role: string | null; created_at: string; club_id: string | null }) => ({
          id: p.id, full_name: p.full_name, role: p.role, created_at: p.created_at,
          club_name: p.club_id ? (clubNameMap[p.club_id] ?? null) : null,
        }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSuspend(club: Club) {
    if (!confirm(`${club.suspended_at ? 'Unsuspend' : 'Suspend'} "${club.name}"?`)) return;
    setActing(club.id);
    await supabase.from('clubs').update({
      suspended_at: club.suspended_at ? null : new Date().toISOString(),
    }).eq('id', club.id);
    setActing(null);
    load();
    if (selected?.id === club.id) {
      setSelected(s => s ? { ...s, suspended_at: s.suspended_at ? null : new Date().toISOString() } : s);
    }
  }

  const filtered = clubs
    .filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.slug.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === 'active')    return !c.suspended_at;
      if (filter === 'suspended') return !!c.suspended_at;
      if (filter === 'quiet')     return healthOf(c) === 'quiet';
      return true;
    })
    .sort((a, b) => {
      if (sort === 'members') return b.member_count - a.member_count;
      if (sort === 'teams')   return b.team_count   - a.team_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const quietCount = clubs.filter(c => healthOf(c) === 'quiet').length;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#080808', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <header style={{ height: 52, borderBottom: '1px solid #141414', display: 'flex', alignItems: 'center', paddingInline: 20, gap: 20, flexShrink: 0, background: '#0a0a0a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, background: '#22C55E', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#000' }}>D</div>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>Dugout FC</span>
          <span style={{ color: '#2a2a2a' }}>·</span>
          <span style={{ color: '#444', fontSize: 13 }}>Super Admin</span>
        </div>

        {stats && !loading && (
          <div style={{ display: 'flex', gap: 20, paddingLeft: 12, borderLeft: '1px solid #1e1e1e' }}>
            {([
              { v: stats.clubs,   l: 'clubs'    },
              { v: stats.members, l: 'members'  },
              { v: stats.teams,   l: 'teams'    },
              { v: stats.events,  l: 'events'   },
            ] as { v: number; l: string }[]).map(({ v, l }) => (
              <span key={l} style={{ fontSize: 12, color: '#444' }}>
                <span style={{ color: '#888', fontWeight: 600 }}>{v.toLocaleString()}</span> {l}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 12, color: '#3a3a3a' }}>{user.email}</span>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
            style={{ fontSize: 12, color: '#555', background: 'transparent', border: '1px solid #1e1e1e', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left panel: clubs list ── */}
        <div style={{ width: 360, borderRight: '1px solid #141414', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

          {/* Search + filters */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #111', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              placeholder="Search clubs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '7px 12px', color: '#fff', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {(['all', 'active', 'quiet', 'suspended'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 5, border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                    background: filter === f ? '#22C55E' : '#141414', color: filter === f ? '#000' : '#555' }}>
                  {f}{f === 'quiet' && quietCount > 0 ? ` ${quietCount}` : ''}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {(['newest', 'members', 'teams'] as const).map(s => (
                  <button key={s} onClick={() => setSort(s)}
                    style={{ fontSize: 10, padding: '3px 7px', borderRadius: 5, border: '1px solid #1e1e1e', cursor: 'pointer', textTransform: 'capitalize',
                      background: sort === s ? '#1a1a1a' : 'transparent', color: sort === s ? '#999' : '#3a3a3a' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
            ) : filtered.length === 0 ? (
              <p style={{ color: '#333', textAlign: 'center', padding: 40, fontSize: 13 }}>No clubs found</p>
            ) : filtered.map(club => (
              <ClubListItem
                key={club.id}
                club={club}
                selected={selected?.id === club.id}
                acting={acting === club.id}
                onClick={() => setSelected(selected?.id === club.id ? null : club)}
                onSuspend={e => { e.stopPropagation(); handleSuspend(club); }}
              />
            ))}
          </div>

          <div style={{ padding: '8px 14px', borderTop: '1px solid #111', fontSize: 11, color: '#2a2a2a' }}>
            {filtered.length} of {clubs.length} clubs
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {selected ? (
            <ClubDetailView
              club={selected}
              acting={acting === selected.id}
              onClose={() => setSelected(null)}
              onSuspend={() => handleSuspend(selected)}
            />
          ) : (
            <PlatformOverview stats={stats} recentMembers={recentMembers} clubs={clubs} loading={loading} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Club list item ─────────────────────────────────────────────────────────────

function ClubListItem({ club, selected, acting, onClick, onSuspend }: {
  club: Club; selected: boolean; acting: boolean;
  onClick: () => void; onSuspend: (e: React.MouseEvent) => void;
}) {
  const h   = healthOf(club);
  const col = accentOf(club);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        cursor: 'pointer', borderBottom: '1px solid #0e0e0e',
        background: selected ? '#0c1a0c' : 'transparent',
        borderLeft: `2px solid ${selected ? '#22C55E' : 'transparent'}`,
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 7, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#000', flexShrink: 0, overflow: 'hidden' }}>
        {club.logo_url
          ? <img src={club.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          : club.name.slice(0, 2).toUpperCase()}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: club.suspended_at ? '#555' : '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {club.name}
          </span>
          {club.suspended_at && (
            <span style={{ fontSize: 8, fontWeight: 700, background: '#3a0f0f', color: '#f87171', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>SUSP</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#3a3a3a', marginTop: 1 }}>
          {club.team_count}t · {club.member_count}m · {club.event_count}e · {timeAgo(club.created_at)}
        </div>
      </div>

      <div style={{ width: 7, height: 7, borderRadius: '50%', background: HEALTH[h], flexShrink: 0, opacity: 0.85 }} title={h} />
    </div>
  );
}

// ── Platform overview ──────────────────────────────────────────────────────────

function PlatformOverview({ stats, recentMembers, clubs, loading }: {
  stats: Stats | null; recentMembers: RecentMember[]; clubs: Club[]; loading: boolean;
}) {
  if (loading || !stats) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner /></div>;
  }

  const topClubs  = [...clubs].sort((a, b) => b.member_count - a.member_count).slice(0, 6);
  const quietCount = clubs.filter(c => healthOf(c) === 'quiet').length;

  const statCards = [
    { label: 'Total clubs',    val: stats.clubs,    sub: `+${stats.clubs30d} this month`,   color: '#22c55e' },
    { label: 'Active clubs',   val: stats.active,   sub: `${stats.suspended} suspended`,    color: '#22c55e' },
    { label: 'Total members',  val: stats.members,  sub: `+${stats.members30d} this month`, color: '#38bdf8' },
    { label: 'Teams',          val: stats.teams,    sub: 'across all clubs',                color: '#a78bfa' },
    { label: 'Events created', val: stats.events,   sub: 'all time',                        color: '#f59e0b' },
    { label: 'Messages sent',  val: stats.messages, sub: 'all time',                        color: '#ec4899' },
  ];

  return (
    <div style={{ padding: 32, maxWidth: 960, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: -0.5 }}>Platform Overview</h2>
        <p style={{ color: '#444', fontSize: 13, marginTop: 4 }}>Live stats across all clubs on Dugout FC</p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {statCards.map(({ label, val, sub, color }) => (
          <div key={label} style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 30, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>
              {val.toLocaleString()}
            </div>
            <div style={{ fontSize: 13, color: '#ccc', marginTop: 3 }}>{label}</div>
            <div style={{ fontSize: 11, color: '#3a3a3a', marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Quiet clubs alert */}
      {quietCount > 0 && (
        <div style={{ marginBottom: 24, background: '#12100a', border: '1px solid #2a2000', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#d97706', fontWeight: 600 }}>{quietCount} club{quietCount !== 1 ? 's' : ''} look quiet</span>
          <span style={{ fontSize: 12, color: '#555' }}>— signed up over 7 days ago with no teams or members. Filter by "quiet" to investigate.</span>
        </div>
      )}

      {/* Two-col bottom */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Top clubs */}
        <div style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#444', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Top clubs · members</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topClubs.map((c, i) => {
              const pct = topClubs[0].member_count > 0 ? (c.member_count / topClubs[0].member_count) * 100 : 0;
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: '#2a2a2a', width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ width: 24, height: 24, borderRadius: 5, background: accentOf(c), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#000', overflow: 'hidden', flexShrink: 0 }}>
                    {c.logo_url ? <img src={c.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <span style={{ fontSize: 12, color: '#444', flexShrink: 0, marginLeft: 8 }}>{c.member_count}</span>
                    </div>
                    <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: accentOf(c), borderRadius: 2, opacity: 0.7 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent signups */}
        <div style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#444', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Recent signups</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentMembers.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#555', fontWeight: 700, flexShrink: 0 }}>
                  {(m.full_name ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name ?? '—'}</div>
                  <div style={{ fontSize: 11, color: '#3a3a3a' }}>{m.club_name ?? '—'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_CLR[m.role ?? ''] ?? '#555', background: `${ROLE_CLR[m.role ?? ''] ?? '#555'}18`, borderRadius: 4, padding: '2px 6px' }}>
                    {m.role}
                  </span>
                  <div style={{ fontSize: 10, color: '#2a2a2a', marginTop: 2 }}>{timeAgo(m.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Health breakdown */}
        <div style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 12, padding: 20, gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 11, color: '#444', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Club health</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {([
              { key: 'active', label: 'Active',  desc: 'Has teams + members' },
              { key: 'new',    label: 'New',     desc: 'Joined in last 7 days' },
              { key: 'quiet',  label: 'Quiet',   desc: '7d+ old, no teams/members' },
            ] as const).map(({ key, label, desc }) => {
              const count = clubs.filter(c => healthOf(c) === key).length;
              const pct   = clubs.length > 0 ? Math.round((count / clubs.length) * 100) : 0;
              return (
                <div key={key} style={{ flex: 1, background: '#111', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: HEALTH[key] }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>{label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 800, color: HEALTH[key] }}>{count}</span>
                  </div>
                  <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: HEALTH[key], borderRadius: 2, opacity: 0.6 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#3a3a3a' }}>{desc}</div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Club detail view ───────────────────────────────────────────────────────────

function ClubDetailView({ club, acting, onClose, onSuspend }: {
  club: Club; acting: boolean; onClose: () => void; onSuspend: () => void;
}) {
  const [teams, setTeams]           = useState<TeamRow[]>([]);
  const [staff, setStaff]           = useState<MemberRow[]>([]);
  const [recent, setRecent]         = useState<MemberRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(true);

  const col = accentOf(club);
  const h   = healthOf(club);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDetailLoading(true);

      const { data: rawTeams } = await supabase
        .from('teams').select('id, name, age_group, season, gender').eq('club_id', club.id).order('name');

      const teamIds = (rawTeams ?? []).map((t: { id: string }) => t.id);
      const { data: rawPlayers } = teamIds.length > 0
        ? await supabase.from('players').select('team_id').in('team_id', teamIds)
        : { data: [] };

      const playerMap: Record<string, number> = {};
      for (const p of rawPlayers ?? []) {
        if (p.team_id) playerMap[p.team_id] = (playerMap[p.team_id] ?? 0) + 1;
      }

      const [{ data: rawStaff }, { data: rawRecent }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, created_at').eq('club_id', club.id).in('role', ['org_admin', 'coach']).order('role'),
        supabase.from('profiles').select('id, full_name, role, created_at').eq('club_id', club.id).order('created_at', { ascending: false }).limit(12),
      ]);

      if (cancelled) return;
      setTeams((rawTeams ?? []).map((t: { id: string; name: string; age_group: string | null; season: string | null; gender: string | null }) => ({ ...t, player_count: playerMap[t.id] ?? 0 })));
      setStaff(rawStaff ?? []);
      setRecent(rawRecent ?? []);
      setDetailLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [club.id]);

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      <button onClick={onClose}
        style={{ background: 'none', border: 'none', color: '#444', fontSize: 13, cursor: 'pointer', marginBottom: 24, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        ← Back to overview
      </button>

      {/* Club header card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24, padding: '20px 24px', background: '#0d0d0d', border: '1px solid #181818', borderRadius: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#000', overflow: 'hidden', flexShrink: 0 }}>
          {club.logo_url ? <img src={club.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : club.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: -0.5 }}>{club.name}</h2>
            {club.suspended_at && (
              <span style={{ fontSize: 10, fontWeight: 700, background: '#3a0f0f', color: '#f87171', borderRadius: 6, padding: '3px 8px' }}>SUSPENDED</span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: HEALTH[h] }} />
              <span style={{ fontSize: 12, color: '#555', textTransform: 'capitalize' }}>{h}</span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#444', marginTop: 4 }}>/{club.slug} · Joined {fmtDate(club.created_at)}</div>
          {club.primary_color && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: club.primary_color, border: '1px solid #2a2a2a' }} />
              <span style={{ fontSize: 11, color: '#3a3a3a', fontFamily: 'monospace' }}>{club.primary_color}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Teams',   val: club.team_count },
          { label: 'Members', val: club.member_count },
          { label: 'Events',  val: club.event_count },
          { label: 'Status',  val: club.suspended_at ? 'Suspended' : 'Active' },
        ].map(({ label, val }) => (
          <div key={label} style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#444', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: label === 'Status' ? (club.suspended_at ? '#f87171' : '#22c55e') : '#ddd' }}>{val}</div>
          </div>
        ))}
      </div>

      {detailLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Teams */}
          <div style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#444', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Teams ({teams.length})
            </div>
            {teams.length === 0 ? (
              <p style={{ color: '#2a2a2a', fontSize: 13 }}>No teams yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teams.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#111', borderRadius: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#ccc' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: '#3a3a3a' }}>{[t.age_group, t.gender, t.season].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span style={{ fontSize: 12, color: '#444' }}>{t.player_count}p</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Staff */}
          <div style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#444', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Staff ({staff.length})
            </div>
            {staff.length === 0 ? (
              <p style={{ color: '#2a2a2a', fontSize: 13 }}>No staff yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {staff.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#111', borderRadius: 8 }}>
                    <span style={{ fontSize: 13, color: '#ccc' }}>{m.full_name ?? '—'}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_CLR[m.role ?? ''] ?? '#555', background: `${ROLE_CLR[m.role ?? ''] ?? '#555'}18`, borderRadius: 5, padding: '2px 8px' }}>
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent members — full width */}
          <div style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 12, padding: 20, gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 11, color: '#444', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Recent members
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {recent.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#111', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#ccc' }}>{m.full_name ?? '—'}</div>
                    <div style={{ fontSize: 11, color: '#3a3a3a' }}>{fmtDate(m.created_at)}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_CLR[m.role ?? ''] ?? '#555', background: `${ROLE_CLR[m.role ?? ''] ?? '#555'}18`, borderRadius: 5, padding: '2px 8px' }}>
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Suspend */}
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #141414' }}>
        <button
          onClick={onSuspend}
          disabled={acting}
          style={{
            padding: '10px 22px', borderRadius: 10,
            border: `1px solid ${club.suspended_at ? '#22C55E40' : '#ef444440'}`,
            background: 'transparent', color: club.suspended_at ? '#22c55e' : '#ef4444',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: acting ? 0.4 : 1,
          }}
        >
          {acting ? '…' : club.suspended_at ? 'Unsuspend club' : 'Suspend club'}
        </button>
      </div>
    </div>
  );
}

// ── Misc ───────────────────────────────────────────────────────────────────────

function FullSpinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080808' }}>
      <Spinner />
    </div>
  );
}

function Spinner() {
  return <div className="animate-spin" style={{ width: 28, height: 28, border: '2px solid #22C55E', borderTopColor: 'transparent', borderRadius: '50%' }} />;
}

function Forbidden() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080808', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <h2 style={{ color: '#fff', marginBottom: 8 }}>Access denied</h2>
        <p style={{ color: '#555', fontSize: 14 }}>You need app_admin role to view this page.</p>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
          style={{ marginTop: 20, color: '#22C55E', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
