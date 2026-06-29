'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

type Club = {
  id: string;
  name: string;
  slug: string;
  primary_color: string | null;
  logo_url: string | null;
  tagline: string | null;
  suspended_at: string | null;
  created_at: string;
  team_count: number;
  member_count: number;
};

// ─── Auth gate ────────────────────────────────────────────────────────────────

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
        setRole((p as any)?.role ?? null);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner />;
  if (!user) return <AuthScreen />;
  if (role !== 'app_admin') return <Forbidden />;
  return <Dashboard />;
}

// ─── Auth screen ─────────────────────────────────────────────────────────────

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setLoading(false);
    window.location.reload();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-2">Super Admin</h1>
        <p className="text-[#888] text-sm mb-8">Sign in with your app_admin account</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#22C55E]"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#22C55E]"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#22C55E] text-black font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const [clubs, setClubs]     = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<'all' | 'active' | 'suspended'>('all');
  const [acting, setActing]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    // Fetch clubs
    const { data: rawClubs } = await supabase
      .from('clubs')
      .select('id, name, slug, primary_color, logo_url, tagline, suspended_at, created_at')
      .order('created_at', { ascending: false });

    if (!rawClubs) { setLoading(false); return; }

    // Count teams per club
    const { data: teamCounts } = await supabase
      .from('teams')
      .select('club_id');

    // Count members per club via profiles
    const { data: memberCounts } = await supabase
      .from('profiles')
      .select('club_id');

    const teamMap: Record<string, number> = {};
    for (const t of teamCounts ?? []) {
      if (t.club_id) teamMap[t.club_id] = (teamMap[t.club_id] ?? 0) + 1;
    }

    const memberMap: Record<string, number> = {};
    for (const m of memberCounts ?? []) {
      if ((m as any).club_id) {
        const cid = (m as any).club_id;
        memberMap[cid] = (memberMap[cid] ?? 0) + 1;
      }
    }

    setClubs(rawClubs.map((c: any) => ({
      ...c,
      team_count: teamMap[c.id] ?? 0,
      member_count: memberMap[c.id] ?? 0,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSuspend(club: Club) {
    if (!confirm(`${club.suspended_at ? 'Unsuspend' : 'Suspend'} "${club.name}"?`)) return;
    setActing(club.id);
    if (club.suspended_at) {
      await supabase.from('clubs').update({ suspended_at: null }).eq('id', club.id);
    } else {
      await supabase.from('clubs').update({ suspended_at: new Date().toISOString() }).eq('id', club.id);
    }
    setActing(null);
    load();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  const filtered = clubs.filter((c) => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.slug.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'suspended' ? !!c.suspended_at : !c.suspended_at);
    return matchSearch && matchFilter;
  });

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Super Admin</h1>
          <p className="text-[#888] text-sm mt-1">{clubs.length} club{clubs.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-[#888] border border-[#2a2a2a] rounded-lg px-4 py-2 hover:border-[#444] transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total clubs" value={clubs.length} />
        <StatCard label="Active" value={clubs.filter((c) => !c.suspended_at).length} color="#22C55E" />
        <StatCard label="Suspended" value={clubs.filter((c) => !!c.suspended_at).length} color="#EF4444" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search clubs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-white placeholder-[#555] text-sm focus:outline-none focus:border-[#22C55E]"
        />
        {(['all', 'active', 'suspended'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold capitalize transition-colors ${
              filter === f ? 'bg-[#22C55E] text-black' : 'bg-[#141414] text-[#888] border border-[#2a2a2a] hover:border-[#444]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <p className="text-[#555] text-center py-20">No clubs found</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((club) => (
            <ClubRow
              key={club.id}
              club={club}
              acting={acting === club.id}
              onSuspend={() => handleSuspend(club)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Club row ─────────────────────────────────────────────────────────────────

function ClubRow({ club, acting, onSuspend }: { club: Club; acting: boolean; onSuspend: () => void }) {
  const isSuspended = !!club.suspended_at;
  const accent = club.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors ${
      isSuspended ? 'bg-[#100808] border-[#3a1a1a]' : 'bg-[#0f0f0f] border-[#1e1e1e] hover:border-[#2a2a2a]'
    }`}>
      {/* Logo / initials */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-extrabold text-black"
        style={{ backgroundColor: accent }}
      >
        {club.logo_url
          ? <img src={club.logo_url} alt={club.name} className="w-10 h-10 rounded-xl object-cover" />
          : club.name.slice(0, 2).toUpperCase()}
      </div>

      {/* Club info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white truncate">{club.name}</span>
          {isSuspended && (
            <span className="text-[10px] font-bold bg-red-900/40 text-red-400 rounded-full px-2 py-0.5">SUSPENDED</span>
          )}
        </div>
        <div className="text-xs text-[#666] mt-0.5">
          /{club.slug} · {club.team_count} team{club.team_count !== 1 ? 's' : ''} · {club.member_count} member{club.member_count !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Signup date */}
      <div className="text-xs text-[#555] hidden sm:block shrink-0">
        {new Date(club.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>

      {/* Action */}
      <button
        onClick={onSuspend}
        disabled={acting}
        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
          isSuspended
            ? 'border-[#22C55E] text-[#22C55E] hover:bg-[#22C55E]/10'
            : 'border-[#EF4444]/40 text-[#EF4444] hover:bg-red-900/20'
        } disabled:opacity-40`}
      >
        {acting ? '…' : isSuspended ? 'Unsuspend' : 'Suspend'}
      </button>
    </div>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-2xl p-4">
      <div className="text-3xl font-extrabold" style={{ color: color ?? '#f0f0f0' }}>{value}</div>
      <div className="text-xs text-[#666] mt-1">{label}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-[#22C55E] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Forbidden() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">🚫</div>
        <h2 className="text-xl font-bold text-white mb-2">Access denied</h2>
        <p className="text-[#888] text-sm">You don&apos;t have permission to view this page.</p>
        <button
          onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
          className="mt-6 text-sm text-[#22C55E] underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
