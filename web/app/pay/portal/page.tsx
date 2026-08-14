'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Fee = {
  id: string;
  payment_token: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  discount: number;
  due_date: string | null;
  status: string;
  player_name: string;
  team_name: string;
  club_name: string;
  club_color: string;
  club_logo: string | null;
};

function fmt(n: number) { return `$${n.toFixed(2)}`; }
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_COLOR: Record<string, string> = {
  paid: '#22C55E', waived: '#22C55E', partial: '#F59E0B',
  outstanding: '#F59E0B', overdue: '#EF4444',
};

export default function PayPortal() {
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  async function loadFees(userId: string) {
    setLoading(true);
    // Find all player records linked to this profile
    const { data: players } = await supabase
      .from('players')
      .select('id')
      .eq('profile_id', userId);

    const playerIds = (players ?? []).map(p => p.id);
    if (!playerIds.length) { setLoggedIn(true); setLoading(false); return; }

    const { data: feeRows } = await supabase
      .from('player_fees')
      .select(`
        id, payment_token, description, amount_due, amount_paid, discount, due_date, status,
        players!inner(full_name),
        teams!inner(name, clubs!inner(name, logo_url, primary_color))
      `)
      .in('player_id', playerIds)
      .order('due_date', { ascending: true, nullsFirst: false });

    type FeeRow = {
      id: string; payment_token: string | null; description: string; amount_due: number; amount_paid: number;
      discount: number | null; due_date: string | null; status: string;
      players: { full_name: string } | null;
      teams: { name: string; clubs: { name: string; logo_url: string | null; primary_color: string | null } | null } | null;
    };
    setFees(((feeRows ?? []) as unknown as FeeRow[]).map(f => ({
      id:           f.id,
      payment_token: f.payment_token ?? '',
      description:  f.description,
      amount_due:   f.amount_due,
      amount_paid:  f.amount_paid,
      discount:     f.discount ?? 0,
      due_date:     f.due_date,
      status:       f.status,
      player_name:  f.players?.full_name ?? '',
      team_name:    f.teams?.name ?? '',
      club_name:    f.teams?.clubs?.name ?? '',
      club_color:   f.teams?.clubs?.primary_color ?? '#22C55E',
      club_logo:    f.teams?.clubs?.logo_url ?? null,
    })));
    setLoggedIn(true);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { loadFees(session.user.id); } else { setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) { loadFees(session.user.id); } else { setLoggedIn(false); setFees([]); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    setAuthLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const outstanding = fees.filter(f => !['paid', 'waived'].includes(f.status));
  const settled     = fees.filter(f => ['paid', 'waived'].includes(f.status));
  const totalOwed   = outstanding.reduce((s, f) => s + Math.max(0, f.amount_due - f.discount - f.amount_paid), 0);

  if (loading) return (
    <div style={styles.page}><div style={{ color: '#9CA3AF', fontSize: '14px' }}>Loading…</div></div>
  );

  if (!loggedIn) return (
    <div style={styles.page}>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>💳</div>
        <div style={{ fontSize: '22px', fontWeight: '800', color: '#F9FAFB' }}>My Fees</div>
        <div style={{ fontSize: '14px', color: '#9CA3AF', marginTop: '4px' }}>Sign in to view and pay your outstanding fees</div>
      </div>
      <div style={styles.card}>
        <div style={{ height: '3px', background: '#22C55E' }} />
        <form onSubmit={handleLogin} style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>Email</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1px solid #374151', background: '#1C1C1E', color: '#F9FAFB', fontSize: '14px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>Password</label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1px solid #374151', background: '#1C1C1E', color: '#F9FAFB', fontSize: '14px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          {authError && <div style={{ fontSize: '13px', color: '#EF4444' }}>{authError}</div>}
          <button
            type="submit" disabled={authLoading}
            style={{ padding: '13px', borderRadius: '10px', border: 'none', background: '#22C55E', color: '#fff', fontSize: '15px', fontWeight: '800', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {authLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
      <div style={{ marginTop: '16px', fontSize: '12px', color: '#4B5563', textAlign: 'center' }}>
        Powered by <a href="https://pulse-fc.app" style={{ color: '#9CA3AF', textDecoration: 'none', fontWeight: '600' }}>Pulse FC</a>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: '560px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#F9FAFB' }}>My Fees</div>
          <div style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '2px' }}>All fees across your players</div>
        </div>
        <button onClick={handleLogout} style={{ fontSize: '12px', color: '#9CA3AF', background: 'none', border: '1px solid #374151', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
      </div>

      {/* Summary banner */}
      {totalOwed > 0 && (
        <div style={{ width: '100%', maxWidth: '560px', background: '#1C1C1E', border: '1px solid #374151', borderLeft: '4px solid #EF4444', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Total outstanding</div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#EF4444', letterSpacing: '-1px' }}>{fmt(totalOwed)}</div>
          </div>
          <div style={{ fontSize: '13px', color: '#6B7280' }}>{outstanding.length} unpaid {outstanding.length === 1 ? 'fee' : 'fees'}</div>
        </div>
      )}

      {!fees.length && (
        <div style={{ ...styles.card, textAlign: 'center', padding: '48px 32px', width: '100%', maxWidth: '560px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
          <div style={{ fontSize: '17px', fontWeight: '700', color: '#F9FAFB' }}>All clear!</div>
          <div style={{ fontSize: '14px', color: '#9CA3AF', marginTop: '6px' }}>No fees found for your players.</div>
        </div>
      )}

      {/* Outstanding fees */}
      {outstanding.length > 0 && (
        <div style={{ width: '100%', maxWidth: '560px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Outstanding</div>
          {outstanding.map(f => {
            const balance  = Math.max(0, f.amount_due - f.discount - f.amount_paid);
            const isOverdue = f.due_date ? new Date(f.due_date) < new Date() : false;
            return (
              <div key={f.id} style={{ background: '#111', border: `1px solid ${isOverdue ? '#7F1D1D' : '#222'}`, borderRadius: '14px', overflow: 'hidden', marginBottom: '10px' }}>
                <div style={{ height: '2px', background: STATUS_COLOR[f.status] ?? '#F59E0B' }} />
                <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#F9FAFB', marginBottom: '3px' }}>{f.description}</div>
                    <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{f.player_name} · {f.team_name}</div>
                    {f.due_date && (
                      <div style={{ fontSize: '12px', color: isOverdue ? '#EF4444' : '#9CA3AF', marginTop: '3px', fontWeight: isOverdue ? '700' : '400' }}>
                        {isOverdue ? 'OVERDUE · was due ' : 'Due '}{fmtDate(f.due_date)}
                      </div>
                    )}
                    {f.amount_paid > 0 && (
                      <div style={{ fontSize: '12px', color: '#22C55E', marginTop: '3px' }}>{fmt(f.amount_paid)} already paid</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                    <div style={{ fontSize: '20px', fontWeight: '900', color: isOverdue ? '#EF4444' : '#F59E0B', letterSpacing: '-0.5px' }}>{fmt(balance)}</div>
                    <a
                      href={`/pay/${f.payment_token}`}
                      style={{ padding: '8px 16px', borderRadius: '8px', background: f.club_color || '#22C55E', color: '#fff', fontSize: '13px', fontWeight: '700', textDecoration: 'none', whiteSpace: 'nowrap' as const }}
                    >
                      Pay now →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Settled fees */}
      {settled.length > 0 && (
        <div style={{ width: '100%', maxWidth: '560px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Settled</div>
          {settled.map(f => (
            <div key={f.id} style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: '14px', overflow: 'hidden', marginBottom: '8px', opacity: 0.7 }}>
              <div style={{ height: '2px', background: '#22C55E' }} />
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#D1D5DB' }}>{f.description}</div>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>{f.player_name} · {f.team_name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#22C55E' }}>{f.status === 'waived' ? 'Waived' : `${fmt(f.amount_paid)} paid`}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '24px', fontSize: '12px', color: '#4B5563', textAlign: 'center' }}>
        Powered by <a href="https://pulse-fc.app" style={{ color: '#9CA3AF', textDecoration: 'none', fontWeight: '600' }}>Pulse FC</a>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0A0A0A',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-start' as const,
    padding: '48px 20px 64px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  },
  card: {
    background: '#111111',
    border: '1px solid #222222',
    borderRadius: '20px',
    overflow: 'hidden' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    width: '100%',
    maxWidth: '480px',
  },
};
