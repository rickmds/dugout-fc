'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { FlipBoard } from '@/components/FlipBoard';
import { seasonOptions } from '@/lib/ageGroup';
import { Plus, Trash2, X, DollarSign, Download, CreditCard, Copy, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrencyRounded } from '@/lib/formatCurrency';
import { symbolForCurrency } from '@/lib/countries';

type Player = { id: string };
type Assignment = { player_id: string; offer_status: string };
type TryoutTeam = { id: string; name: string; color: string };
type Expense = { id: string; category: string; description: string | null; amount: number; notes: string | null };
type InstallmentRow = {
  id: string; assignment_id: string; label: string; amount: number; due_date: string | null;
  paid_at: string | null; payment_token: string; charge_attempts: number; last_charge_error: string | null;
  tryout_assignments: { id: string; team: string | null; autopay_consent: boolean; tryout_players: { full_name: string } | null } | null;
};

const EXPENSE_CATEGORIES = [
  'Uniforms', 'Equipment', 'Field Rental', 'Referee Fees', 'Coaching Fees',
  'Tournament Fees', 'Travel', 'Admin', 'Marketing', 'Photography',
  'First Aid', 'Trophies / Awards', 'Training', 'Technology', 'Insurance', 'Other',
];

const REG_FEE_DEFAULT = 50;
const SEASONAL_FEE_DEFAULT = 1200;
const blankExp = (): Omit<Expense,'id'> => ({ category: EXPENSE_CATEGORIES[0], description: '', amount: 0, notes: null });

function StatCard({ label, val, sub, green }: { label: string; val: string; sub: string; green?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '20px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: '900', color: green === false ? '#EF4444' : green ? '#22C55E' : '#0F172A', lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '6px' }}>{sub}</div>
    </div>
  );
}

export default function TryoutFinancesPage() {
  const { club } = useDashboard();
  const [season, setSeason] = useState(() => seasonOptions()[1] ?? '2026-27');
  const [players, setPlayers] = useState<Player[]>([]);
  const [assigns, setAssigns] = useState<Assignment[]>([]);
  const [_teams, setTeams] = useState<TryoutTeam[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddExp, setShowAddExp] = useState(false);
  const [editExp, setEditExp] = useState<Expense | null>(null);
  const [delExpId, setDelExpId] = useState<string | null>(null);
  const [regFee, setRegFee] = useState(REG_FEE_DEFAULT);
  const [seasonFee, setSeasonFee] = useState(SEASONAL_FEE_DEFAULT);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [stoppingAutopayId, setStoppingAutopayId] = useState<string | null>(null);

  async function load() {
    if (!club) return;
    const [{ data: ps }, { data: asgn }, { data: ts }, { data: exps }, { data: insts }] = await Promise.all([
      supabase.from('tryout_players').select('id').eq('club_id', club.id),
      supabase.from('tryout_assignments').select('player_id,offer_status').eq('club_id', club.id),
      supabase.from('tryout_teams').select('id,name,color').eq('club_id', club.id).eq('is_active', true),
      supabase.from('tryout_expenses').select('*').eq('club_id', club.id).eq('season_label', season).order('category'),
      supabase.from('tryout_installments')
        .select('id, assignment_id, label, amount, due_date, paid_at, payment_token, charge_attempts, last_charge_error, tryout_assignments!inner(id, team, autopay_consent, club_id, tryout_players(full_name))')
        .eq('tryout_assignments.club_id', club.id)
        .order('due_date', { ascending: true }),
    ]);
    setPlayers((ps ?? []) as Player[]);
    setAssigns((asgn ?? []) as Assignment[]);
    setTeams((ts ?? []) as TryoutTeam[]);
    setExpenses((exps ?? []) as Expense[]);
    setInstallments((insts ?? []) as unknown as InstallmentRow[]);
    setLoading(false);
  }

  function copyPayLink(inst: InstallmentRow) {
    const url = `${window.location.origin}/pay-tryout/${inst.payment_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(inst.id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  }

  async function stopAutopay(assignmentId: string) {
    setStoppingAutopayId(assignmentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/tryout/stop-autopay', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId }),
      });
      if (res.ok) load();
    } finally {
      setStoppingAutopayId(null);
    }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- fetch-on-mount effect; load is a plain function whose real reactive inputs are already listed here
  useEffect(() => { load(); }, [club, season]);

  const placed = assigns.filter(a => a.offer_status === 'Accepted' || a.offer_status === 'Sent').length;
  const accepted = assigns.filter(a => a.offer_status === 'Accepted').length;
  const totalReg = players.length * regFee;
  const estRevenue = placed * seasonFee + totalReg;
  const actualRevenue = accepted * seasonFee + totalReg;
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const estProfit = estRevenue - totalExpenses;
  const actualProfit = actualRevenue - totalExpenses;

  const byCategory = expenses.reduce((acc, e) => { if (!acc[e.category]) acc[e.category] = 0; acc[e.category] += e.amount; return acc; }, {} as Record<string, number>);
  const chartData = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, total]) => ({ name, total }));

  const fmt = (n: number) => formatCurrencyRounded(n, club?.currency);
  const currencySymbol = symbolForCurrency(club?.currency);

  function exportCsv() {
    const rows = [['Category','Description','Amount','Notes'], ...expenses.map(e => [e.category, e.description ?? '', String(e.amount), e.notes ?? ''])];
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `tryout-finances-${season}.csv`; a.click();
  }

  if (loading) return (
    <FlipBoard title="Loading finances…" rows={[
      { label: 'Expenses', pad: 2 },
      { label: 'Teams',    pad: 2 },
      { label: 'Coaches',  pad: 2 },
      { label: 'Seasons',  pad: 2 },
    ]} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '14px 32px', background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Tryout Module · {season}</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: '2px 0 0', letterSpacing: '-0.5px' }}>Finances</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
            {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151', fontWeight: '600' }}><Download size={13} /> Export</button>
          <button onClick={() => { setEditExp(null); setShowAddExp(true); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}><Plus size={13} /> Add Expense</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#F0F2F5' }}>
        {/* Fee config */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '14px 20px', marginBottom: '20px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', borderLeft: '4px solid #6366F1' }}>
          <span style={{ fontSize: '11px', fontWeight: '800', color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fee Config</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
            Tryout Reg Fee {currencySymbol}
            <input type="number" value={regFee} onChange={e => setRegFee(Number(e.target.value))} style={{ width: '80px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '13px', outline: 'none' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
            Seasonal Tuition {currencySymbol}
            <input type="number" value={seasonFee} onChange={e => setSeasonFee(Number(e.target.value))} style={{ width: '90px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '13px', outline: 'none' }} />
          </label>
          <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>{players.length} registered · {placed} placed · {accepted} accepted</span>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '22px' }}>
          <StatCard label="Reg Fees Collected" val={fmt(totalReg)} sub={`${players.length} players × ${fmt(regFee)}`} />
          <StatCard label="Estimated Revenue" val={fmt(estRevenue)} sub={`If all ${placed} placed accept`} />
          <StatCard label="Actual Revenue" val={fmt(actualRevenue)} sub={`${accepted} accepted × ${fmt(seasonFee)}`} green />
          <StatCard label={`Est. Profit / Loss`} val={fmt(estProfit)} sub={`Estimated − ${fmt(totalExpenses)} expenses`} green={estProfit >= 0 ? true : false} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '16px', marginBottom: '22px' }}>
          {/* Actual P&L */}
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#0F172A', marginBottom: '14px' }}>Actual P & L</div>
            {[
              { label: 'Registration fees', val: totalReg, positive: true },
              { label: `Seasonal tuition (${accepted} accepted)`, val: accepted * seasonFee, positive: true },
              { label: 'Total expenses', val: totalExpenses, positive: false },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F1F5F9', fontSize: '13px' }}>
                <span style={{ color: '#64748B' }}>{row.label}</span>
                <span style={{ fontWeight: '700', color: row.positive ? '#22C55E' : '#EF4444' }}>{row.positive ? '+' : '-'}{fmt(row.val)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '2px solid #E2E8F0', fontSize: '14.5px', fontWeight: '800' }}>
              <span>Net</span>
              <span style={{ color: actualProfit >= 0 ? '#22C55E' : '#EF4444' }}>{fmt(actualProfit)}</span>
            </div>
          </div>

          {/* Expense chart */}
          {chartData.length > 0 && (
            <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#0F172A', marginBottom: '10px' }}>Expenses by Category</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={0} angle={-20} textAnchor="end" height={36} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={(v: number) => `${currencySymbol}${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={['#3B82F6','#6366F1','#8B5CF6','#EC4899','#F59E0B','#22C55E','#14B8A6','#EF4444'][i % 8]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Real payment status — actual tryout_installments rows, distinct
            from the estimated Reg Fee / Seasonal Tuition config above */}
        {installments.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', marginBottom: '22px' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CreditCard size={15} color="#64748B" />
              <span style={{ fontWeight: '700', fontSize: '13.5px', color: '#0F172A' }}>Payment Status</span>
              <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                ({installments.filter(i => !i.paid_at).length} outstanding of {installments.length})
              </span>
            </div>
            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {installments.map(inst => {
                const isPaid = !!inst.paid_at;
                const playerName = inst.tryout_assignments?.tryout_players?.full_name ?? 'Player';
                const team = inst.tryout_assignments?.team ?? 'Unassigned';
                return (
                  <div key={inst.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                    padding: '10px 18px', borderBottom: '1px solid #F1F5F9',
                    background: isPaid ? '#F0FDF4' : '#fff',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{playerName} <span style={{ fontWeight: 500, color: '#94A3B8' }}>· {team}</span></div>
                      <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                        {inst.label} · {fmt(inst.amount)} · {isPaid ? `Paid ${new Date(inst.paid_at!).toLocaleDateString()}` : `Due ${inst.due_date ? new Date(inst.due_date).toLocaleDateString() : 'TBD'}`}
                      </div>
                      {!isPaid && inst.charge_attempts > 0 && (
                        <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>
                          {inst.charge_attempts} failed auto-charge attempt{inst.charge_attempts === 1 ? '' : 's'}{inst.last_charge_error ? ` — ${inst.last_charge_error}` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {inst.tryout_assignments?.autopay_consent && (
                        <button onClick={() => stopAutopay(inst.tryout_assignments!.id)} disabled={stoppingAutopayId === inst.tryout_assignments?.id}
                          style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                          {stoppingAutopayId === inst.tryout_assignments?.id ? 'Stopping…' : 'Stop autopay'}
                        </button>
                      )}
                      {isPaid ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 700, color: '#16A34A' }}>
                          <CheckCircle size={13} /> Paid
                        </span>
                      ) : (
                        <button onClick={() => copyPayLink(inst)}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', background: '#fff', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#374151' }}>
                          <Copy size={12} /> {copiedId === inst.id ? 'Copied!' : 'Copy link'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Expenses table */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: '700', fontSize: '13.5px', color: '#0F172A' }}>Expenses ({expenses.length})</span>
            <span style={{ fontWeight: '700', fontSize: '13.5px', color: '#EF4444' }}>{fmt(totalExpenses)} total</span>
          </div>
          {expenses.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <DollarSign size={20} color="#94A3B8" />
              </div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>No expenses yet</div>
              <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>Add your first expense to start tracking costs.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#0F172A', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Category','Description','Amount','Notes',''].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px', borderBottom: 'none', background: '#0F172A' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group by category for visual grouping
                  const grouped: { category: string; items: typeof expenses }[] = [];
                  for (const e of expenses) {
                    const last = grouped[grouped.length - 1];
                    if (last && last.category === e.category) last.items.push(e);
                    else grouped.push({ category: e.category, items: [e] });
                  }
                  return grouped.flatMap((g, gi) => [
                    <tr key={`cat-${gi}`} style={{ background: '#F8FAFC' }}>
                      <td colSpan={5} style={{ padding: '7px 14px 5px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{g.category}</span>
                        <span style={{ fontSize: '10px', color: '#94A3B8', marginLeft: '6px' }}>({g.items.length})</span>
                      </td>
                    </tr>,
                    ...g.items.map((e) => (
                      <tr key={e.id} style={{ borderBottom: '1px solid #F1F5F9', background: '#fff' }}>
                        <td style={{ padding: '8px 14px 8px 20px', fontWeight: '500', color: '#64748B', fontSize: '12px', width: '150px' }} />
                        <td style={{ padding: '8px 14px', color: '#374151', fontWeight: '500' }}>{e.description ?? <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                        <td style={{ padding: '8px 14px', fontWeight: '800', color: '#EF4444' }}>{fmt(e.amount)}</td>
                        <td style={{ padding: '8px 14px', color: '#94A3B8', fontSize: '12px' }}>{e.notes ?? '—'}</td>
                        <td style={{ padding: '8px 14px' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setEditExp(e); setShowAddExp(true); }} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '11.5px', color: '#64748B', padding: '3px 8px', borderRadius: '5px', fontWeight: '600' }}>Edit</button>
                            <button onClick={() => setDelExpId(e.id)} style={{ background: '#FEF2F2', border: '1px solid #FECACA', cursor: 'pointer', color: '#EF4444', padding: '3px 6px', borderRadius: '5px', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    )),
                  ]);
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAddExp && <ExpenseModal club={club as { id: string } | null} season={season} expense={editExp} currencySymbol={currencySymbol} onClose={() => { setShowAddExp(false); setEditExp(null); }} onSaved={load} />}

      {delExpId && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '340px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A', marginBottom: '16px' }}>Delete expense?</div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => setDelExpId(null)} style={{ padding: '9px 20px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
            <button onClick={async () => { await supabase.from('tryout_expenses').delete().eq('id', delExpId); setDelExpId(null); load(); }} style={{ padding: '9px 20px', borderRadius: '9px', background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Delete</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

function ExpenseModal({ club, season, expense, currencySymbol, onClose, onSaved }: { club: { id: string } | null; season: string; expense: Expense | null; currencySymbol: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Omit<Expense,'id'>>(expense ? { category: expense.category, description: expense.description, amount: expense.amount, notes: expense.notes } : blankExp());
  const [saving, setSaving] = useState(false);
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lbl = (t: string) => <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>{t}</label>;

  async function save() {
    if (!club) return; setSaving(true);
    const payload = { ...form, club_id: club.id, season_label: season, amount: form.amount };
    if (expense) { await supabase.from('tryout_expenses').update(payload).eq('id', expense.id); }
    else { await supabase.from('tryout_expenses').insert(payload); }
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '8px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A' }}>{expense ? 'Edit Expense' : 'Add Expense'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>{lbl('Category')}<select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inp}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div>{lbl('Description')}<input value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} placeholder="Optional" style={inp} /></div>
          <div>{lbl(`Amount (${currencySymbol})`)}<input type="number" min={0} step={0.01} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} style={inp} /></div>
          <div>{lbl('Notes')}<input value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} placeholder="Optional" style={inp} /></div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: '9px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
