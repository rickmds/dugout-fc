'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { seasonOptions } from '@/lib/ageGroup';
import { Plus, Trash2, X, TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type Player = { id: string };
type Assignment = { player_id: string; offer_status: string };
type TryoutTeam = { id: string; name: string; color: string };
type Expense = { id: string; category: string; description: string | null; amount: number; notes: string | null };

const EXPENSE_CATEGORIES = [
  'Uniforms', 'Equipment', 'Field Rental', 'Referee Fees', 'Coaching Fees',
  'Tournament Fees', 'Travel', 'Admin', 'Marketing', 'Photography',
  'First Aid', 'Trophies / Awards', 'Training', 'Technology', 'Insurance', 'Other',
];

const REG_FEE_DEFAULT = 50;
const SEASONAL_FEE_DEFAULT = 1200;
const blankExp = (): Omit<Expense,'id'> => ({ category: EXPENSE_CATEGORIES[0], description: '', amount: 0, notes: null });

export default function TryoutFinancesPage() {
  const { club } = useDashboard();
  const [season, setSeason] = useState(() => seasonOptions()[1] ?? '2026-27');
  const [players, setPlayers] = useState<Player[]>([]);
  const [assigns, setAssigns] = useState<Assignment[]>([]);
  const [teams, setTeams] = useState<TryoutTeam[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddExp, setShowAddExp] = useState(false);
  const [editExp, setEditExp] = useState<Expense | null>(null);
  const [delExpId, setDelExpId] = useState<string | null>(null);
  const [regFee, setRegFee] = useState(REG_FEE_DEFAULT);
  const [seasonFee, setSeasonFee] = useState(SEASONAL_FEE_DEFAULT);

  async function load() {
    if (!club) return;
    const [{ data: ps }, { data: asgn }, { data: ts }, { data: exps }] = await Promise.all([
      supabase.from('tryout_players').select('id').eq('club_id', club.id),
      supabase.from('tryout_assignments').select('player_id,offer_status').eq('club_id', club.id),
      supabase.from('tryout_teams').select('id,name,color').eq('club_id', club.id).eq('is_active', true),
      supabase.from('tryout_expenses').select('*').eq('club_id', club.id).eq('season_label', season).order('category'),
    ]);
    setPlayers((ps ?? []) as Player[]);
    setAssigns((asgn ?? []) as Assignment[]);
    setTeams((ts ?? []) as TryoutTeam[]);
    setExpenses((exps ?? []) as Expense[]);
    setLoading(false);
  }
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

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  function exportCsv() {
    const rows = [['Category','Description','Amount','Notes'], ...expenses.map(e => [e.category, e.description ?? '', String(e.amount), e.notes ?? ''])];
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `tryout-finances-${season}.csv`; a.click();
  }

  const StatCard = ({ label, val, sub, green }: { label: string; val: string; sub: string; green?: boolean }) => (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: '800', color: green === false ? '#EF4444' : green ? '#22C55E' : '#0F172A' }}>{val}</div>
      <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>{sub}</div>
    </div>
  );

  if (loading) return <div style={{ padding: '40px', color: '#94A3B8' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tryout Module · {season}</div>
          <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: '2px 0 0' }}>Finances</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}>
            {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151', fontWeight: '600' }}><Download size={13} /> Export</button>
          <button onClick={() => { setEditExp(null); setShowAddExp(true); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}><Plus size={13} /> Add Expense</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {/* Fee config */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fee Config</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
            Tryout Reg Fee $
            <input type="number" value={regFee} onChange={e => setRegFee(Number(e.target.value))} style={{ width: '80px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '13px', outline: 'none' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
            Seasonal Tuition $
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
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#0F172A', marginBottom: '10px' }}>Expenses by Category</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={0} angle={-20} textAnchor="end" height={36} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={['#3B82F6','#6366F1','#8B5CF6','#EC4899','#F59E0B','#22C55E','#14B8A6','#EF4444'][i % 8]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Expenses table */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: '700', fontSize: '13.5px', color: '#0F172A' }}>Expenses ({expenses.length})</span>
            <span style={{ fontWeight: '700', fontSize: '13.5px', color: '#EF4444' }}>{fmt(totalExpenses)} total</span>
          </div>
          {expenses.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No expenses recorded. Add your first expense above.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Category','Description','Amount','Notes',''].map(h => <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E2E8F0' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, i) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #F8FAFC', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '8px 14px', fontWeight: '600', color: '#374151' }}>{e.category}</td>
                    <td style={{ padding: '8px 14px', color: '#64748B' }}>{e.description ?? '—'}</td>
                    <td style={{ padding: '8px 14px', fontWeight: '700', color: '#EF4444' }}>{fmt(e.amount)}</td>
                    <td style={{ padding: '8px 14px', color: '#94A3B8', fontSize: '12px' }}>{e.notes ?? '—'}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => { setEditExp(e); setShowAddExp(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11.5px', color: '#64748B', padding: '2px 6px', borderRadius: '4px' }}>Edit</button>
                        <button onClick={() => setDelExpId(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '2px 4px' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAddExp && <ExpenseModal club={club as { id: string } | null} season={season} expense={editExp} onClose={() => { setShowAddExp(false); setEditExp(null); }} onSaved={load} />}

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

function ExpenseModal({ club, season, expense, onClose, onSaved }: { club: { id: string } | null; season: string; expense: Expense | null; onClose: () => void; onSaved: () => void }) {
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
      <div style={{ background: '#fff', borderRadius: '16px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A' }}>{expense ? 'Edit Expense' : 'Add Expense'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>{lbl('Category')}<select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inp}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div>{lbl('Description')}<input value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} placeholder="Optional" style={inp} /></div>
          <div>{lbl('Amount ($)')}<input type="number" min={0} step={0.01} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} style={inp} /></div>
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
