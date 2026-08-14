'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

// ── Types ────────────────────────────────────────────────────────────────────
type MonthData = {
  label: string;   // "Jan", "Feb" …
  invoiced: number;
  collected: number;
};

type CategoryData = {
  name: string;
  invoiced: number;
  collected: number;
  count: number;
};

type AgeingData = {
  label: string;
  amount: number;
  probability: number;
  color: string;
};

type FeeRow = {
  id: string;
  description: string | null;
  amount_due: number;
  amount_paid: number;
  discount: number | null;
  status: string;
  due_date: string | null;
  created_at: string | null;
};

type PaymentRow = { player_fee_id: string; amount: number; paid_at: string | null };

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtK(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Monthly bar chart (pure SVG, no deps) ────────────────────────────────────
function MonthlyChart({ data, primary }: { data: MonthData[]; primary: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxVal = Math.max(...data.flatMap(d => [d.invoiced, d.collected]), 1);
  const W = 700, H = 180;
  const pad = { top: 14, bottom: 36, left: 46, right: 12 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const slotW = cW / data.length;
  const bW = Math.min(slotW * 0.32, 18);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', fontFamily: 'inherit', minWidth: '500px' }}>
        {/* Grid lines */}
        {yTicks.map(pct => {
          const y = pad.top + cH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="#F1F5F9" strokeWidth="1" />
              <text x={pad.left - 5} y={y + 3.5} textAnchor="end" fontSize="9" fill="#94A3B8">{fmtK(maxVal * pct)}</text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const cx        = pad.left + i * slotW + slotW / 2;
          const invH      = d.invoiced  > 0 ? Math.max((d.invoiced  / maxVal) * cH, 2) : 0;
          const colH      = d.collected > 0 ? Math.max((d.collected / maxVal) * cH, 2) : 0;
          const isHov     = hovered === i;
          const colPct    = d.invoiced > 0 ? Math.round((d.collected / d.invoiced) * 100) : 0;
          return (
            <g key={d.label}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}>
              {/* Invoiced (grey background) */}
              <rect x={cx - bW - 1} y={pad.top + cH - invH} width={bW} height={invH} rx={2} fill={isHov ? '#CBD5E1' : '#E2E8F0'} />
              {/* Collected (primary colour) */}
              <rect x={cx + 1} y={pad.top + cH - colH} width={bW} height={colH} rx={2} fill={isHov ? primary : `${primary}CC`} />
              {/* Month label */}
              <text x={cx} y={H - pad.bottom + 16} textAnchor="middle" fontSize="9.5" fill="#94A3B8">{d.label}</text>
              {/* Tooltip */}
              {isHov && (
                <g>
                  <rect x={cx - 46} y={pad.top} width={92} height={48} rx={5} fill="#0F172A" />
                  <text x={cx} y={pad.top + 13} textAnchor="middle" fontSize="9.5" fill="#fff" fontWeight="700">{d.label}</text>
                  <text x={cx} y={pad.top + 25} textAnchor="middle" fontSize="8.5" fill={primary}>Collected: ${fmt(d.collected)}</text>
                  <text x={cx} y={pad.top + 35} textAnchor="middle" fontSize="8.5" fill="#94A3B8">Invoiced: ${fmt(d.invoiced)}</text>
                  <text x={cx} y={pad.top + 45} textAnchor="middle" fontSize="8.5" fill="#64748B">{colPct}% rate</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '2px' }}>
        {[{ color: '#E2E8F0', label: 'Invoiced' }, { color: primary, label: 'Collected' }].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color }} />
            <span style={{ fontSize: '11px', color: '#94A3B8' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Horizontal bar for categories ─────────────────────────────────────────────
function CategoryBar({ name, invoiced, collected, maxInvoiced, primary }: {
  name: string; invoiced: number; collected: number; maxInvoiced: number; primary: string;
}) {
  const pctWidth  = maxInvoiced > 0 ? (invoiced / maxInvoiced) * 100 : 0;
  const colPct    = invoiced   > 0 ? Math.round((collected / invoiced) * 100) : 0;
  const barColor  = colPct >= 80 ? '#22C55E' : colPct >= 50 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 60px 48px', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
      <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
      <div style={{ position: 'relative', height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pctWidth}%`, background: '#E2E8F0', borderRadius: '4px' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pctWidth * (colPct / 100)}%`, background: primary, borderRadius: '4px' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151', textAlign: 'right' }}>${fmt(invoiced)}</span>
      <span style={{ fontSize: '11px', fontWeight: '700', color: barColor, textAlign: 'right' }}>{colPct}%</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FeeAnalytics() {
  const { club } = useDashboard();
  const primary  = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [loading,    setLoading]    = useState(true);
  const [monthly,    setMonthly]    = useState<MonthData[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [ageing,     setAgeing]     = useState<AgeingData[]>([]);
  const [totalInv,   setTotalInv]   = useState(0);
  const [totalCol,   setTotalCol]   = useState(0);
  const [totalOut,   setTotalOut]   = useState(0);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!club) return;
    setLoading(true);

    // Get all teams
    const { data: teamsData } = await supabase.from('teams').select('id').eq('club_id', club.id);
    const teamIds = (teamsData ?? []).map(t => t.id);
    if (!teamIds.length) { setLoading(false); return; }

    // Fetch all fees (lightweight)
    const { data: feesData } = await supabase
      .from('player_fees')
      .select('id,description,amount_due,amount_paid,discount,status,due_date,created_at')
      .in('team_id', teamIds)
      .returns<FeeRow[]>();
    const fees = (feesData ?? []).map(f => ({
      ...f,
      amount_due:  +f.amount_due,
      amount_paid: +f.amount_paid,
      discount:    +(f.discount ?? 0),
      status: f.status !== 'paid' && f.status !== 'waived' && f.due_date && f.due_date < today
        ? 'overdue' : f.status,
    }));

    // Fetch all payments
    const feeIds = fees.map(f => f.id);
    let payments: PaymentRow[] = [];
    if (feeIds.length > 0) {
      const { data: pmtsData } = await supabase
        .from('fee_payments').select('player_fee_id,amount,paid_at').in('player_fee_id', feeIds)
        .returns<PaymentRow[]>();
      payments = pmtsData ?? [];
    }

    // ── Monthly data (last 12 months) ────────────────────────────────────────
    const now = new Date();
    const months: MonthData[] = Array.from({ length: 12 }, (_, i) => {
      const d     = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = MONTH_NAMES[d.getMonth()];
      // Invoiced = fees created this month
      const invoiced = fees
        .filter(f => (f.created_at ?? '').slice(0, 7) === key)
        .reduce((s, f) => s + (f.amount_due - f.discount), 0);
      // Collected = payments received this month
      const collected = payments
        .filter(p => (p.paid_at ?? '').slice(0, 7) === key)
        .reduce((s, p) => s + +p.amount, 0);
      return { label, invoiced, collected };
    });

    // ── Category breakdown ───────────────────────────────────────────────────
    const catMap: Record<string, CategoryData> = {};
    for (const fee of fees) {
      const name = fee.description ?? 'Other';
      // Normalise — group common fee descriptions
      const key  = name.slice(0, 32);
      if (!catMap[key]) catMap[key] = { name: key, invoiced: 0, collected: 0, count: 0 };
      catMap[key].invoiced  += fee.amount_due - fee.discount;
      catMap[key].collected += fee.amount_paid;
      catMap[key].count++;
    }
    const cats = Object.values(catMap).sort((a, b) => b.invoiced - a.invoiced).slice(0, 8);

    // ── Totals ───────────────────────────────────────────────────────────────
    const inv = fees.reduce((s, f) => s + (f.amount_due - f.discount), 0);
    const col = fees.reduce((s, f) => s + f.amount_paid, 0);
    const out = fees.filter(f => !['paid','waived'].includes(f.status))
                    .reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);

    // ── Ageing + projected collection ───────────────────────────────────────
    function daysDiff(a: string, b: string) { return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }
    const unpaid = fees.filter(f => !['paid','waived'].includes(f.status));
    const current = unpaid.filter(f => f.status !== 'overdue');
    const d30    = unpaid.filter(f => f.status === 'overdue' && f.due_date && daysDiff(f.due_date, today) <= 30);
    const d60    = unpaid.filter(f => f.status === 'overdue' && f.due_date && daysDiff(f.due_date, today) > 30 && daysDiff(f.due_date, today) <= 60);
    const d60p   = unpaid.filter(f => f.status === 'overdue' && f.due_date && daysDiff(f.due_date, today) > 60);
    const sumOwed = (arr: typeof unpaid) => arr.reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);
    const ageingData: AgeingData[] = [
      { label: 'Not yet due',   amount: sumOwed(current), probability: 0.90, color: '#22C55E' },
      { label: '1–30d overdue', amount: sumOwed(d30),     probability: 0.70, color: '#F59E0B' },
      { label: '31–60d overdue',amount: sumOwed(d60),     probability: 0.40, color: '#EF4444' },
      { label: '60d+ overdue',  amount: sumOwed(d60p),    probability: 0.15, color: '#7F1D1D' },
    ];

    setMonthly(months);
    setCategories(cats);
    setAgeing(ageingData);
    setTotalInv(inv);
    setTotalCol(col);
    setTotalOut(out);
    setLoading(false);
  }, [club, today]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { load(); }, [load]);

  const projectedCollection = useMemo(() =>
    ageing.reduce((s, a) => s + a.amount * a.probability, 0),
  [ageing]);

  const collectionPct = totalInv > 0 ? Math.round((totalCol / totalInv) * 100) : 0;
  const maxCatInv     = Math.max(...categories.map(c => c.invoiced), 1);

  const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
  const shimmer: React.CSSProperties = { background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite', borderRadius: '8px' };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1240px' }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* ── Top summary row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Total Invoiced',    value: loading ? '—' : `$${fmt(totalInv)}`,             color: '#64748B', icon: '📄' },
          { label: 'Total Collected',   value: loading ? '—' : `$${fmt(totalCol)}`,             color: '#22C55E', icon: '✅' },
          { label: 'Collection Rate',   value: loading ? '—' : `${collectionPct}%`,             color: collectionPct >= 80 ? '#22C55E' : collectionPct >= 50 ? '#F59E0B' : '#EF4444', icon: '📈' },
          { label: 'Projected Further', value: loading ? '—' : `$${fmt(projectedCollection)}`, color: '#3B82F6', icon: '🔮' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{ ...card, display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
            <div style={{ fontSize: '24px', flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '19px', fontWeight: '800', color, letterSpacing: '-0.4px' }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Monthly Revenue Chart ── */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>Monthly Revenue</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>Last 12 months — invoiced vs collected</div>
          </div>
          {!loading && monthly.length > 0 && (() => {
            const last  = monthly[monthly.length - 1]?.collected ?? 0;
            const prev  = monthly[monthly.length - 2]?.collected ?? 0;
            const diff  = last - prev;
            return diff !== 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600', color: diff > 0 ? '#22C55E' : '#EF4444' }}>
                {diff > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {diff > 0 ? '+' : ''}{fmt(Math.abs(diff))} vs prev month
              </div>
            ) : null;
          })()}
        </div>
        {loading
          ? <div style={{ height: '180px', ...shimmer }} />
          : <MonthlyChart data={monthly} primary={primary} />
        }
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* ── Category breakdown ── */}
        <div style={card}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>Revenue by Fee Type</div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>Top fee categories by invoiced amount</div>
          {loading
            ? <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{[1,2,3,4].map(i => <div key={i} style={{ height: '24px', ...shimmer }} />)}</div>
            : categories.length === 0
              ? <div style={{ fontSize: '13px', color: '#CBD5E1', textAlign: 'center', padding: '20px 0' }}>No fee data yet</div>
              : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 60px 48px', gap: '12px', marginBottom: '8px' }}>
                    {['Fee Type','','Invoiced','Rate'].map(h => (
                      <div key={h} style={{ fontSize: '9.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h === 'Rate' || h === 'Invoiced' ? 'right' : 'left' }}>{h}</div>
                    ))}
                  </div>
                  {categories.map(cat => (
                    <CategoryBar key={cat.name} name={cat.name} invoiced={cat.invoiced} collected={cat.collected} maxInvoiced={maxCatInv} primary={primary} />
                  ))}
                </>
              )
          }
        </div>

        {/* ── Projected collection ── */}
        <div style={card}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>Projected Collection</div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>Expected recovery based on aging bracket probability</div>
          {loading
            ? <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{[1,2,3,4].map(i => <div key={i} style={{ height: '52px', ...shimmer }} />)}</div>
            : (
              <>
                {ageing.map(a => {
                  const proj = a.amount * a.probability;
                  return (
                    <div key={a.label} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <div>
                          <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#374151' }}>{a.label}</span>
                          <span style={{ fontSize: '11px', color: '#94A3B8', marginLeft: '6px' }}>{Math.round(a.probability * 100)}% likely</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>${fmt(a.amount)}</div>
                          <div style={{ fontSize: '10.5px', color: a.color, fontWeight: '600' }}>→ ${fmt(proj)}</div>
                        </div>
                      </div>
                      <div style={{ height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${a.probability * 100}%`, height: '100%', background: a.color, borderRadius: '3px' }} />
                      </div>
                    </div>
                  );
                })}

                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '2px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>Projected total recovery</span>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: primary, letterSpacing: '-0.3px' }}>${fmt(projectedCollection)}</span>
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#94A3B8' }}>
                  Out of ${fmt(totalOut)} outstanding ({totalOut > 0 ? Math.round((projectedCollection / totalOut) * 100) : 0}% expected recovery)
                </div>
              </>
            )
          }
        </div>
      </div>

      {/* ── Outstanding status breakdown ── */}
      {!loading && totalOut > 0 && (
        <div style={{ ...card }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>Outstanding Breakdown</div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>Where unpaid money sits right now</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
            {ageing.map(a => (
              <div key={a.label} style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: '700', color: a.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{a.label}</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: a.color, letterSpacing: '-0.3px' }}>${fmt(a.amount)}</div>
                <div style={{ marginTop: '8px', height: '3px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${totalOut > 0 ? (a.amount / totalOut) * 100 : 0}%`, height: '100%', background: a.color }} />
                </div>
                <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px' }}>
                  {totalOut > 0 ? Math.round((a.amount / totalOut) * 100) : 0}% of outstanding
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
