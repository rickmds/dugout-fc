'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DollarSign, Plus, X, Send, Download, ChevronDown, ChevronUp,
  TrendingUp, AlertCircle, Clock, CheckCircle, CreditCard, Search,
  ChevronRight, Banknote, Tag, MoreHorizontal, ArrowUpDown,
  ArrowUp, ArrowDown, Zap, Calendar, Users, BarChart3, UserPlus, QrCode, Printer,
} from 'lucide-react';
import FamiliesTab  from './_components/FamiliesTab';
import FeeAnalytics from './_components/FeeAnalytics';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

// ── Types ──────────────────────────────────────────────────────────────────────
type PageTab     = 'ledger' | 'families' | 'analytics';
type Team        = { id: string; name: string };
type FeeCategory = { id: string; name: string; amount: number; description: string | null };
type ClubFee     = {
  id: string; player_id: string; player_name: string;
  team_id: string; team_name: string;
  description: string; amount_due: number; amount_paid: number;
  discount: number; discount_reason: string | null;
  due_date: string | null; status: string;
  plan_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  last_reminded_at: string | null;
  payment_token: string | null;
};
type Payment = { id: string; player_fee_id: string; amount: number; paid_at: string; method: string | null; reference: string | null; recorder_name: string | null };
type ReminderLog = { id: string; sent_at: string; reminder_type: string; player_fee_id: string };

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  outstanding: { label: 'Outstanding', color: '#F59E0B', bg: '#FFFBEB' },
  partial:     { label: 'Partial',     color: '#3B82F6', bg: '#EFF6FF' },
  paid:        { label: 'Paid',        color: '#22C55E', bg: '#F0FDF4' },
  waived:      { label: 'Waived',      color: '#8B5CF6', bg: '#F5F3FF' },
  overdue:     { label: 'Overdue',     color: '#EF4444', bg: '#FEF2F2' },
};
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Online', 'Other'];
const SORT_COLS = ['player','team','description','invoiced','paid','owed','due','status'] as const;
type SortCol = typeof SORT_COLS[number];

// ── Helpers ────────────────────────────────────────────────────────────────────
function daysDiff(a: string, b: string) { return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }
function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function initials(name: string) { return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2); }

// ── Tiny sparkline SVG ─────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const W = 80, H = 28, gap = 4;
  const barW = (W - gap * (data.length - 1)) / data.length;
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {data.map((v, i) => {
        const h = Math.max(3, (v / max) * H);
        return <rect key={i} x={i * (barW + gap)} y={H - h} width={barW} height={h} rx={2} fill={v > 0 ? color : '#E2E8F0'} />;
      })}
    </svg>
  );
}

// ── Row action menu ────────────────────────────────────────────────────────────
type RowMenuProps = {
  onPay?: () => void;
  onWaive?: () => void;
  onUndo?: () => void;
  onEdit?: () => void;
  onResendReceipt?: () => void;
  onQR?: () => void;
  isPaid?: boolean;
  hasPayments?: boolean;
  primary: string;
};
function RowMenu({ onPay, onWaive, onUndo, onEdit, onResendReceipt, onQR, isPaid, hasPayments, primary }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const item = (onClick: () => void, color: string, hoverBg: string, icon: React.ReactNode, label: string) => (
    <button onClick={() => { setOpen(false); onClick(); }}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 14px', border: 'none', background: 'none', fontSize: '12.5px', fontWeight: '600', color, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = hoverBg}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
    >{icon} {label}</button>
  );
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '26px', height: '26px', borderRadius: '6px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
      >
        <MoreHorizontal size={14} color="#94A3B8" />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '30px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, minWidth: '160px', overflow: 'hidden' }}>
          {onPay  && <>{item(onPay,  '#374151', '#F8FAFC', <CreditCard size={13} color={primary} />,   'Record Payment')}<div style={{ height: '1px', background: '#F1F5F9' }} /></>}
          {onEdit && item(onEdit, '#374151', '#F8FAFC', <Calendar size={13} color="#64748B" />, 'Edit Fee')}
          {onQR   && item(onQR,   '#374151', '#F8FAFC', <QrCode size={13} color="#64748B" />, 'Payment QR Code')}
          {onWaive && <>{item(onWaive, '#8B5CF6', '#F5F3FF', <CheckCircle size={13} color="#8B5CF6" />, 'Waive Fee')}</>}
          {(onEdit || onWaive) && (onUndo || onResendReceipt) && <div style={{ height: '1px', background: '#F1F5F9' }} />}
          {onUndo && item(onUndo, '#EF4444', '#FEF2F2', <X size={13} color="#EF4444" />, 'Undo Last Payment')}
          {onResendReceipt && item(onResendReceipt, '#3B82F6', '#EFF6FF', <Send size={13} color="#3B82F6" />, 'Resend Receipt')}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ClubFeesPage() {
  const { club, profile } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const today   = new Date().toISOString().slice(0, 10);

  if (profile && profile.role === 'coach') {
    return (
      <div style={{ padding: '80px 32px', textAlign: 'center', color: '#64748B', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>Access restricted</div>
        <div style={{ fontSize: '14px' }}>Fee management is available to DOCs and club admins only.</div>
      </div>
    );
  }

  // ── Core data state ──────────────────────────────────────────────────────────
  const [teams,           setTeams]           = useState<Team[]>([]);
  const [fees,            setFees]            = useState<ClubFee[]>([]);
  const [categories,      setCategories]      = useState<FeeCategory[]>([]);
  const [allPayments,     setAllPayments]     = useState<Payment[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [hardshipBalance, setHardshipBalance] = useState<number | null>(null);
  const [hardshipEnabled, setHardshipEnabled] = useState(false);

  // ── Filters + sort ────────────────────────────────────────────────────────────
  const [teamFilter,    setTeamFilter]    = useState('all');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [search,        setSearch]        = useState('');
  const [sortCol,       setSortCol]       = useState<SortCol>('due');
  const [sortDir,       setSortDir]       = useState<'asc'|'desc'>('asc');

  // ── UI toggles ────────────────────────────────────────────────────────────────
  const [pageTab,       setPageTab]       = useState<PageTab>('ledger');
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [showCategories,setShowCategories]= useState(false);

  // ── Reminder log (loaded per-player when panel opens) ─────────────────────
  const [reminderLog,        setReminderLog]        = useState<ReminderLog[]>([]);
  const [reminderLogLoading, setReminderLogLoading] = useState(false);

  // ── Individual player fee assignment ──────────────────────────────────────
  const [showIndivAssign, setShowIndivAssign] = useState(false);
  const [indivSaving,     setIndivSaving]     = useState(false);
  const [indivForm,       setIndivForm]       = useState({
    description: '', amount_due: '', due_date: '', discount_amount: '', discount_reason: '',
  });
  function resetIndivForm() { setIndivForm({ description: '', amount_due: '', due_date: '', discount_amount: '', discount_reason: '' }); }

  // ── Standalone "assign to any player" modal ────────────────────────────────
  type RosterPlayer = { id: string; full_name: string; team_id: string; team_name: string };
  const [showPlayerAssign, setShowPlayerAssign] = useState(false);
  const [rosterPlayers,    setRosterPlayers]    = useState<RosterPlayer[]>([]);
  const [rosterLoading,    setRosterLoading]    = useState(false);
  const [playerSearch,     setPlayerSearch]     = useState('');
  const [selectedPlayer,   setSelectedPlayer]   = useState<RosterPlayer | null>(null);
  const [playerAssignForm, setPlayerAssignForm] = useState({ description: '', amount_due: '', due_date: '' });
  const [playerAssignSaving, setPlayerAssignSaving] = useState(false);

  async function openPlayerAssign() {
    setShowPlayerAssign(true);
    setPlayerSearch(''); setSelectedPlayer(null);
    setPlayerAssignForm({ description: '', amount_due: '', due_date: '' });
    if (rosterPlayers.length > 0) return; // already loaded
    setRosterLoading(true);
    const { data } = await supabase
      .from('players').select('id,full_name,team_id,teams(name)')
      .in('team_id', teams.map(t => t.id)).order('full_name');
    setRosterPlayers(
      (data ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name, team_id: p.team_id, team_name: p.teams?.name ?? '' }))
    );
    setRosterLoading(false);
  }

  async function handlePlayerAssign() {
    if (!profile || !selectedPlayer || !playerAssignForm.description || !playerAssignForm.amount_due) return;
    setPlayerAssignSaving(true);
    try {
      const { data: inserted, error } = await supabase.from('player_fees').insert({
        player_id:   selectedPlayer.id,
        team_id:     selectedPlayer.team_id,
        description: playerAssignForm.description,
        amount_due:  parseFloat(playerAssignForm.amount_due) || 0,
        due_date:    playerAssignForm.due_date || null,
        created_by:  profile.id,
      }).select('id').single();
      if (error) { alert(`Could not assign fee: ${error.message}`); return; }
      if (inserted?.id) {
        fetch('/api/send-fee-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_fee_id: inserted.id }) }).catch(() => {});
      }
      setShowPlayerAssign(false);
      load();
    } finally {
      setPlayerAssignSaving(false);
    }
  }

  const filteredRoster = rosterPlayers.filter(p =>
    p.full_name.toLowerCase().includes(playerSearch.toLowerCase()) ||
    p.team_name.toLowerCase().includes(playerSearch.toLowerCase())
  );

  // ── Selection + bulk ─────────────────────────────────────────────────────────
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [bulkReminding, setBulkReminding] = useState(false);

  // ── Undo payment ─────────────────────────────────────────────────────────────
  const [showUndoConfirm, setShowUndoConfirm] = useState<{ fee: ClubFee; payment: Payment } | null>(null);
  const [undoSaving,      setUndoSaving]      = useState(false);

  // ── Edit fee ─────────────────────────────────────────────────────────────────
  const [showEditFee,   setShowEditFee]   = useState<ClubFee | null>(null);
  const [editFeeForm,   setEditFeeForm]   = useState({ description: '', amount_due: '', due_date: '' });
  const [editFeeSaving, setEditFeeSaving] = useState(false);

  // ── Bulk waive ────────────────────────────────────────────────────────────────
  const [showBulkWaive,   setShowBulkWaive]   = useState(false);
  const [bulkWaiveReason, setBulkWaiveReason] = useState('');
  const [bulkWaiving,     setBulkWaiving]     = useState(false);

  // ── QR code modal ─────────────────────────────────────────────────────────────
  const [qrFee, setQrFee] = useState<ClubFee | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  async function openQr(fee: ClubFee) {
    setQrFee(fee);
    setQrDataUrl(null);
    const QRCode = (await import('qrcode')).default;
    const payUrl = `https://pulse-fc.app/pay/${fee.payment_token}`;
    const url = await QRCode.toDataURL(payUrl, { width: 300, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
    setQrDataUrl(url);
  }

  // ── Reminder state ────────────────────────────────────────────────────────────
  const [reminding,      setReminding]      = useState(false);
  const [reminderResult, setReminderResult] = useState<string | null>(null);

  // ── Modals ────────────────────────────────────────────────────────────────────
  const [showAssign,     setShowAssign]     = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [saveProgress,   setSaveProgress]   = useState('');

  const [showPayment,   setShowPayment]   = useState<ClubFee | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'Bank Transfer', reference: '', notes: '' });

  const [showWaive,   setShowWaive]   = useState<ClubFee | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveSaving, setWaiveSaving] = useState(false);

  const [playerPanel,  setPlayerPanel]  = useState<string | null>(null); // player_id
  const [showCashMode,   setShowCashMode]   = useState(false);
  const [cashMethod,     setCashMethod]     = useState<'Cash' | 'Check' | 'Card'>('Cash');
  const [cashCollected,  setCashCollected]  = useState<{ id: string; name: string; description: string; amount: number; method: string }[]>([]);
  const cashPaidIds = new Set(cashCollected.map(c => c.id));

  // ── Category CRUD ─────────────────────────────────────────────────────────────
  const [editCatId,  setEditCatId]  = useState<string | null>(null);
  const [catForm,    setCatForm]    = useState({ name: '', amount: '', description: '' });
  const [catSaving,  setCatSaving]  = useState(false);
  const [showCatForm,setShowCatForm]= useState(false);

  // ── Assign form ───────────────────────────────────────────────────────────────
  const [aForm, setAForm] = useState({
    category_id: '', description: '', amount_due: '', due_date: '', notes: '',
    discount_amount: '', discount_reason: '',
    apply_to: 'all' as 'all' | 'select',
    selected_teams: [] as string[], team_search: '',
    use_plan: false, plan_count: '3', plan_dates: ['','',''] as string[],
  });
  const resetForm = () => setAForm({
    category_id: '', description: '', amount_due: '', due_date: '', notes: '',
    discount_amount: '', discount_reason: '',
    apply_to: 'all', selected_teams: [], team_search: '',
    use_plan: false, plan_count: '3', plan_dates: ['','',''],
  });
  function setPlanCount(val: string) {
    const n = Math.max(2, Math.min(24, parseInt(val) || 3));
    setAForm(f => ({ ...f, plan_count: String(n), plan_dates: Array.from({ length: n }, (_, i) => f.plan_dates[i] ?? '') }));
  }

  // ── Load ──────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const [teamsRes, catsRes] = await Promise.all([
      supabase.from('teams').select('id,name').eq('club_id', club.id).order('name'),
      supabase.from('fee_categories').select('id,name,amount,description').eq('club_id', club.id).order('name'),
    ]);
    // Hardship fund
    const { data: clubRow } = await supabase.from('clubs').select('hardship_fund_enabled').eq('id', club.id).single();
    if ((clubRow as any)?.hardship_fund_enabled) {
      setHardshipEnabled(true);
      const { data: contribs } = await supabase.from('hardship_contributions').select('amount').eq('club_id', club.id);
      setHardshipBalance((contribs ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0));
    } else {
      setHardshipEnabled(false);
      setHardshipBalance(null);
    }
    const tList = (teamsRes.data ?? []) as Team[];
    setTeams(tList);
    setCategories((catsRes.data ?? []) as FeeCategory[]);
    if (!tList.length) { setLoading(false); return; }
    const tMap = Object.fromEntries(tList.map(t => [t.id, t.name]));

    const { data: fd } = await supabase
      .from('player_fees')
      .select('id,player_id,team_id,description,amount_due,amount_paid,discount,discount_reason,due_date,status,plan_group_id,installment_number,installment_total,last_reminded_at,payment_token,players(full_name)')
      .in('team_id', tList.map(t => t.id))
      .order('due_date', { ascending: true, nullsFirst: false });

    const mapped: ClubFee[] = (fd ?? []).map((f: any) => ({
      id: f.id, player_id: f.player_id,
      player_name: f.players?.full_name ?? 'Unknown',
      team_id: f.team_id, team_name: tMap[f.team_id] ?? 'Unknown',
      description: f.description,
      amount_due: +f.amount_due, amount_paid: +f.amount_paid, discount: +f.discount,
      discount_reason: f.discount_reason, due_date: f.due_date,
      status: f.status !== 'paid' && f.status !== 'waived' && f.due_date && f.due_date < today
        ? 'overdue' : f.status,
      plan_group_id: f.plan_group_id,
      installment_number: f.installment_number,
      installment_total: f.installment_total,
      last_reminded_at: f.last_reminded_at ?? null,
      payment_token: f.payment_token ?? null,
    }));
    setFees(mapped);

    if (mapped.length > 0) {
      const { data: pmts } = await supabase
        .from('fee_payments')
        .select('id,player_fee_id,amount,paid_at,method,reference,profiles!fee_payments_recorded_by_fkey(full_name)')
        .in('player_fee_id', mapped.map(f => f.id))
        .order('paid_at', { ascending: false });
      setAllPayments((pmts ?? []).map((p: any) => ({
        id: p.id, player_fee_id: p.player_fee_id,
        amount: +p.amount, paid_at: p.paid_at,
        method: p.method ?? null,
        reference: p.reference ?? null,
        recorder_name: (p.profiles as any)?.full_name ?? null,
      })) as Payment[]);
    }
    setLoading(false);
  }, [club, today]);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats ──────────────────────────────────────────────────────────────
  const totalInvoiced    = fees.reduce((s, f) => s + f.amount_due - f.discount, 0);
  const totalCollected   = fees.reduce((s, f) => s + f.amount_paid, 0);
  const totalOutstanding = fees.filter(f => !['paid','waived'].includes(f.status))
                               .reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);
  const overdueTotal     = fees.filter(f => f.status === 'overdue')
                               .reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);
  const overdueFees      = fees.filter(f => f.status === 'overdue');
  const collectionPct    = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;

  const thisMonthStr = today.slice(0, 7);
  const dueThisMonthTotal = fees
    .filter(f => !['paid','waived'].includes(f.status) && f.due_date?.startsWith(thisMonthStr))
    .reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);

  const dueSoonFees = fees.filter(f =>
    !['paid','waived'].includes(f.status) && f.due_date && f.due_date > today &&
    daysDiff(today, f.due_date) <= 7
  );
  const dueSoonTotal = dueSoonFees.reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);

  // Aging buckets
  const aging = useMemo(() => ({
    current: fees.filter(f => !['paid','waived'].includes(f.status) && f.status !== 'overdue'),
    d30:  fees.filter(f => f.status === 'overdue' && f.due_date && daysDiff(f.due_date, today) <= 30),
    d60:  fees.filter(f => f.status === 'overdue' && f.due_date && daysDiff(f.due_date, today) > 30 && daysDiff(f.due_date, today) <= 60),
    d60p: fees.filter(f => f.status === 'overdue' && f.due_date && daysDiff(f.due_date, today) > 60),
  }), [fees, today]);
  const agSum = (arr: ClubFee[]) => arr.reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);

  // Collection by team
  const teamStats = useMemo(() =>
    teams.map(t => {
      const tf  = fees.filter(f => f.team_id === t.id);
      const inv = tf.reduce((s, f) => s + f.amount_due - f.discount, 0);
      const col = tf.reduce((s, f) => s + f.amount_paid, 0);
      const out = tf.filter(f => !['paid','waived'].includes(f.status))
                    .reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);
      return { ...t, inv, col, out, pct: inv > 0 ? Math.round((col / inv) * 100) : 0, count: tf.length };
    }).filter(t => t.count > 0).sort((a, b) => a.pct - b.pct),
  [teams, fees]);

  // Weekly sparkline — last 8 weeks
  const weeklySparkline = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - (7 * (7 - i)));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const ws = weekStart.toISOString().slice(0, 10);
      const we = weekEnd.toISOString().slice(0, 10);
      return allPayments.filter(p => p.paid_at >= ws && p.paid_at < we).reduce((s, p) => s + p.amount, 0);
    });
  }, [allPayments, today]);

  // Smart insights
  const insights = useMemo(() => {
    const items: { type: 'error'|'warn'|'info'; msg: string; action?: string; filter?: () => void }[] = [];
    if (aging.d60p.length > 0) items.push({ type: 'error', msg: `${aging.d60p.length} fee${aging.d60p.length !== 1 ? 's' : ''} are 60+ days overdue — $${fmt(agSum(aging.d60p))} at risk`, action: 'View', filter: () => setStatusFilter('overdue') });
    if (overdueFees.length > 0 && aging.d60p.length === 0) items.push({ type: 'warn', msg: `${overdueFees.length} overdue fee${overdueFees.length !== 1 ? 's' : ''} — $${fmt(overdueTotal)} outstanding`, action: 'Filter', filter: () => setStatusFilter('overdue') });
    if (dueSoonFees.length > 0) items.push({ type: 'info', msg: `$${fmt(dueSoonTotal)} due in the next 7 days across ${dueSoonFees.length} fee${dueSoonFees.length !== 1 ? 's' : ''}` });
    return items;
  }, [aging, overdueFees, dueSoonFees, overdueTotal, dueSoonTotal]);

  // Filtered + sorted table
  const filtered = useMemo(() => {
    let f = fees;
    if (teamFilter   !== 'all') f = f.filter(x => x.team_id === teamFilter);
    if (statusFilter !== 'all') f = f.filter(x => x.status  === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter(x => x.player_name.toLowerCase().includes(q) || x.team_name.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
    }
    return [...f].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      switch (sortCol) {
        case 'player':      return mul * a.player_name.localeCompare(b.player_name);
        case 'team':        return mul * a.team_name.localeCompare(b.team_name);
        case 'description': return mul * a.description.localeCompare(b.description);
        case 'invoiced':    return mul * ((a.amount_due - a.discount) - (b.amount_due - b.discount));
        case 'paid':        return mul * (a.amount_paid - b.amount_paid);
        case 'owed':        return mul * (Math.max(a.amount_due - a.discount - a.amount_paid, 0) - Math.max(b.amount_due - b.discount - b.amount_paid, 0));
        case 'due':         return mul * (a.due_date ?? '').localeCompare(b.due_date ?? '');
        case 'status': {
          const order = ['overdue','outstanding','partial','paid','waived'];
          return mul * (order.indexOf(a.status) - order.indexOf(b.status));
        }
        default: return 0;
      }
    });
  }, [fees, teamFilter, statusFilter, search, sortCol, sortDir]);

  const allVisibleSelected = filtered.length > 0 && filtered.every(f => selectedIds.has(f.id));

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }
  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ArrowUpDown size={11} color="#CBD5E1" />;
    return sortDir === 'asc' ? <ArrowUp size={11} color={primary} /> : <ArrowDown size={11} color={primary} />;
  }

  // Player panel data
  const panelFees = useMemo(() =>
    fees.filter(f => f.player_id === playerPanel)
        .sort((a, b) => {
          const order = ['overdue','outstanding','partial','paid','waived'];
          return order.indexOf(a.status) - order.indexOf(b.status);
        }),
  [fees, playerPanel]);
  const panelName = panelFees[0]?.player_name ?? '';
  const panelOwed = panelFees.reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);

  // Cash mode fees
  const cashFees = useMemo(() =>
    fees.filter(f => !['paid','waived'].includes(f.status) && !cashPaidIds.has(f.id))
        .sort((a, b) => {
          const order = ['overdue','outstanding','partial'];
          return order.indexOf(a.status) - order.indexOf(b.status);
        }),
  [fees, cashPaidIds]);

  // Instalment preview
  const instPrev = useMemo(() => {
    if (!aForm.use_plan) return [];
    const n     = Math.max(2, parseInt(aForm.plan_count) || 3);
    const total = parseFloat(aForm.amount_due) || 0;
    if (!total) return [];
    const each = Math.floor((total / n) * 100) / 100;
    const last = Math.round((total - each * (n - 1)) * 100) / 100;
    return Array.from({ length: n }, (_, i) => ({ num: i + 1, amount: i === n - 1 ? last : each, due: aForm.plan_dates[i] ?? '' }));
  }, [aForm.use_plan, aForm.plan_count, aForm.amount_due, aForm.plan_dates]);

  // ── Action handlers ────────────────────────────────────────────────────────────
  function openPayment(fee: ClubFee) {
    const owed = Math.max(fee.amount_due - fee.discount - fee.amount_paid, 0);
    setShowPayment(fee);
    setPayForm({ amount: fmt(owed).replace(/,/g,''), method: 'Bank Transfer', reference: '', notes: '' });
  }

  async function handleRecordPayment() {
    if (!showPayment || !profile) return;
    const owed   = Math.max(showPayment.amount_due - showPayment.discount - showPayment.amount_paid, 0);
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0 || amount > owed + 0.01) return;
    setPaymentSaving(true);
    try {
      const newPaid   = showPayment.amount_paid + amount;
      const newStatus = newPaid >= showPayment.amount_due - showPayment.discount ? 'paid' : 'partial';
      const { error: insertErr } = await supabase.from('fee_payments').insert({ player_fee_id: showPayment.id, amount, method: payForm.method, reference: payForm.reference || null, notes: payForm.notes || null, recorded_by: profile.id });
      if (insertErr) { alert(`Could not record payment: ${insertErr.message}`); return; }
      const { error: updateErr } = await supabase.from('player_fees').update({ amount_paid: newPaid, status: newStatus }).eq('id', showPayment.id);
      if (updateErr) { alert(`Payment recorded but balance update failed: ${updateErr.message}`); return; }
      fetch('/api/send-payment-confirmation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_fee_id: showPayment.id, amount_paid: amount }) }).catch(() => {});
      setShowPayment(null);
      setPayForm({ amount: '', method: 'Bank Transfer', reference: '', notes: '' });
      load();
    } finally {
      setPaymentSaving(false);
    }
  }

  async function handleWaive() {
    if (!showWaive || !profile) return;
    setWaiveSaving(true);
    try {
      const { error } = await supabase.from('player_fees').update({ status: 'waived', discount_reason: waiveReason || 'Waived by admin' }).eq('id', showWaive.id);
      if (error) { alert(`Could not waive fee: ${error.message}`); return; }
      setShowWaive(null);
      setWaiveReason('');
      load();
    } finally {
      setWaiveSaving(false);
    }
  }

  async function handleUndoPayment() {
    if (!showUndoConfirm) return;
    const { fee, payment } = showUndoConfirm;
    setUndoSaving(true);
    try {
      const { error: delErr } = await supabase.from('fee_payments').delete().eq('id', payment.id);
      if (delErr) { alert(`Could not undo payment: ${delErr.message}`); return; }
      const newPaid = Math.max(fee.amount_paid - payment.amount, 0);
      const newStatus = newPaid <= 0 ? 'outstanding' : 'partial';
      await supabase.from('player_fees').update({ amount_paid: newPaid, status: newStatus }).eq('id', fee.id);
      setShowUndoConfirm(null);
      load();
    } finally {
      setUndoSaving(false);
    }
  }

  async function handleUndoCollect(item: { id: string; name: string; description: string; amount: number; method: string }) {
    const fee = fees.find(f => f.id === item.id);
    if (!fee) return;
    const pmt = allPayments.find(p => p.player_fee_id === item.id);
    if (!pmt) {
      setCashCollected(s => s.filter(c => c.id !== item.id));
      load();
      return;
    }
    const { error: delErr } = await supabase.from('fee_payments').delete().eq('id', pmt.id);
    if (delErr) { alert(`Could not undo: ${delErr.message}`); return; }
    const newPaid = Math.max(fee.amount_paid - pmt.amount, 0);
    const newStatus = newPaid <= 0 ? 'outstanding' : 'partial';
    await supabase.from('player_fees').update({ amount_paid: newPaid, status: newStatus }).eq('id', fee.id);
    setCashCollected(s => s.filter(c => c.id !== item.id));
    load();
  }

  async function handleEditFee() {
    if (!showEditFee) return;
    setEditFeeSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (editFeeForm.description)  updates.description = editFeeForm.description;
      if (editFeeForm.amount_due)   updates.amount_due  = parseFloat(editFeeForm.amount_due);
      if (editFeeForm.due_date !== undefined) updates.due_date = editFeeForm.due_date || null;
      const { error } = await supabase.from('player_fees').update(updates).eq('id', showEditFee.id);
      if (error) { alert(`Could not update fee: ${error.message}`); return; }
      setShowEditFee(null);
      load();
    } finally {
      setEditFeeSaving(false);
    }
  }

  function handleResendReceipt(fee: ClubFee) {
    fetch('/api/send-payment-confirmation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_fee_id: fee.id, amount_paid: fee.amount_paid }) }).catch(() => {});
    setReminderResult('Receipt resent.');
    setTimeout(() => setReminderResult(null), 4000);
  }

  async function handleBulkWaive() {
    const targets = filtered.filter(f => !['paid','waived'].includes(f.status) && selectedIds.has(f.id));
    if (!targets.length) return;
    setBulkWaiving(true);
    try {
      const { error } = await supabase.from('player_fees')
        .update({ status: 'waived', discount_reason: bulkWaiveReason || 'Waived by admin' })
        .in('id', targets.map(f => f.id));
      if (error) { alert(`Could not waive fees: ${error.message}`); return; }
      setShowBulkWaive(false);
      setBulkWaiveReason('');
      setSelectedIds(new Set());
      load();
    } finally {
      setBulkWaiving(false);
    }
  }

  async function handleCashRecord(fee: ClubFee) {
    if (!profile) return;
    const owed = Math.max(fee.amount_due - fee.discount - fee.amount_paid, 0);
    if (owed <= 0) return;
    const newPaid  = fee.amount_paid + owed;
    const method   = cashMethod.toLowerCase();
    const { error: insertErr } = await supabase.from('fee_payments').insert({ player_fee_id: fee.id, amount: owed, method, recorded_by: profile.id });
    if (insertErr) { alert(`Could not record payment: ${insertErr.message}`); return; }
    const { error: updateErr } = await supabase.from('player_fees').update({ amount_paid: newPaid, status: 'paid' }).eq('id', fee.id);
    if (updateErr) { alert(`Payment recorded but balance update failed: ${updateErr.message}`); return; }
    setCashCollected(s => [...s, { id: fee.id, name: fee.player_name, description: fee.description, amount: owed, method: cashMethod }]);
    fetch('/api/send-payment-confirmation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_fee_id: fee.id, amount_paid: owed }) }).catch(() => {});
  }

  async function handleBulkRemind() {
    const targets = filtered.filter(f => f.status === 'overdue' && selectedIds.has(f.id));
    if (!targets.length) return;
    setBulkReminding(true);
    for (const fee of targets) {
      await fetch('/api/send-fee-reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_fee_id: fee.id }) });
    }
    setBulkReminding(false);
    setSelectedIds(new Set());
    setReminderResult(`Sent ${targets.length} reminder${targets.length !== 1 ? 's' : ''}.`);
    setTimeout(() => setReminderResult(null), 6000);
  }

  async function handleBulkReminder() {
    setReminding(true); setReminderResult(null);
    let sent = 0, skipped = 0;
    for (const fee of overdueFees) {
      const r = await fetch('/api/send-fee-reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_fee_id: fee.id }) });
      const j = await r.json();
      if (j.skipped) skipped++; else sent++;
    }
    setReminding(false);
    setReminderResult(`Sent ${sent} reminder${sent !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} skipped` : ''}.`);
    setTimeout(() => setReminderResult(null), 7000);
  }

  async function handleAssign() {
    if (!club || !profile) return;
    setSaving(true);
    try {
    const targets = aForm.apply_to === 'all' ? teams : teams.filter(t => aForm.selected_teams.includes(t.id));
    const { data: playersData } = await supabase.from('players').select('id,team_id').in('team_id', targets.map(t => t.id));
    const players = (playersData ?? []) as { id: string; team_id: string }[];
    const planGroupId = aForm.use_plan ? crypto.randomUUID() : null;
    const rows: any[] = [];
    for (const p of players) {
      if (aForm.use_plan && instPrev.length > 0) {
        for (const inst of instPrev) {
          rows.push({ player_id: p.id, team_id: p.team_id, description: aForm.description || 'Club Fee', amount_due: inst.amount, due_date: inst.due || null, notes: aForm.notes || null, created_by: profile.id, plan_group_id: planGroupId, installment_number: inst.num, installment_total: instPrev.length, discount: parseFloat(aForm.discount_amount) || 0, discount_reason: aForm.discount_reason || null });
        }
      } else {
        rows.push({ player_id: p.id, team_id: p.team_id, description: aForm.description || 'Club Fee', amount_due: parseFloat(aForm.amount_due) || 0, due_date: aForm.due_date || null, notes: aForm.notes || null, created_by: profile.id, discount: parseFloat(aForm.discount_amount) || 0, discount_reason: aForm.discount_reason || null });
      }
    }
    const insertedIds: string[] = [];
    for (let i = 0; i < rows.length; i += 100) {
      setSaveProgress(`Saving ${Math.min(i + 100, rows.length)} of ${rows.length}…`);
      const { data: ins } = await supabase.from('player_fees').insert(rows.slice(i, i + 100)).select('id,installment_number');
      for (const r of ins ?? []) { if (!r.installment_number || r.installment_number === 1) insertedIds.push(r.id); }
    }
    setSaveProgress(`Notifying ${insertedIds.length} parents…`);
    for (let i = 0; i < insertedIds.length; i += 10) {
      await Promise.allSettled(insertedIds.slice(i, i + 10).map(id => fetch('/api/send-fee-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_fee_id: id }) })));
    }
      setSaveProgress(''); setShowAssign(false); resetForm(); load();
    } catch (e) {
      alert(`Fee assignment failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
      setSaveProgress('');
    }
  }

  // Load reminder log when player panel opens
  useEffect(() => {
    if (!playerPanel) { setReminderLog([]); return; }
    const feeIds = fees.filter(f => f.player_id === playerPanel).map(f => f.id);
    if (!feeIds.length) return;
    setReminderLogLoading(true);
    supabase
      .from('fee_reminder_log')
      .select('id,sent_at,reminder_type,player_fee_id')
      .in('player_fee_id', feeIds)
      .order('sent_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setReminderLog((data ?? []) as ReminderLog[]); setReminderLogLoading(false); });
  }, [playerPanel, fees]);

  async function handleIndivAssign() {
    if (!profile || !playerPanel || !indivForm.description || !indivForm.amount_due) return;
    const targetFee = fees.find(f => f.player_id === playerPanel);
    if (!targetFee) return;
    setIndivSaving(true);
    try {
      const { data: inserted, error } = await supabase.from('player_fees').insert({
        player_id:      playerPanel,
        team_id:        targetFee.team_id,
        description:    indivForm.description,
        amount_due:     parseFloat(indivForm.amount_due) || 0,
        due_date:       indivForm.due_date || null,
        discount:       parseFloat(indivForm.discount_amount) || 0,
        discount_reason: indivForm.discount_reason || null,
        created_by:     profile.id,
      }).select('id').single();
      if (error) { alert(`Could not assign fee: ${error.message}`); return; }
      if (inserted?.id) {
        fetch('/api/send-fee-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_fee_id: inserted.id }) }).catch(() => {});
      }
      setShowIndivAssign(false);
      resetIndivForm();
      load();
    } finally {
      setIndivSaving(false);
    }
  }

  async function handleSaveCategory() {
    if (!club || !catForm.name || !catForm.amount) return;
    setCatSaving(true);
    try {
      const { error } = editCatId
        ? await supabase.from('fee_categories').update({ name: catForm.name, amount: parseFloat(catForm.amount), description: catForm.description || null }).eq('id', editCatId)
        : await supabase.from('fee_categories').insert({ club_id: club.id, name: catForm.name, amount: parseFloat(catForm.amount), description: catForm.description || null });
      if (error) { alert(`Could not save category: ${error.message}`); return; }
      setEditCatId(null); setShowCatForm(false); setCatForm({ name: '', amount: '', description: '' }); load();
    } finally {
      setCatSaving(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('Delete this category? Existing fees using it will not be affected.')) return;
    await supabase.from('fee_categories').delete().eq('id', id); load();
  }

  function exportCSV() {
    const header = ['Team','Player','Description','Invoiced','Discount','Paid','Owed','Status','Due Date','Instalment'];
    const rows = filtered.map(f => [f.team_name, f.player_name, f.description, (f.amount_due - f.discount).toFixed(2), f.discount.toFixed(2), f.amount_paid.toFixed(2), Math.max(f.amount_due - f.discount - f.amount_paid, 0).toFixed(2), f.status, f.due_date ?? '', f.installment_number && f.installment_total ? `${f.installment_number}/${f.installment_total}` : '']);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `fees-${today}.csv`; a.click();
  }

  // ── Shared styles ──────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
  const lbl: React.CSSProperties = { fontSize: '10px', fontWeight: 800, color: '#94A3B8', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '1.5px' };
  const card: React.CSSProperties = { background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
  const shimmerStyle: React.CSSProperties = { background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite', borderRadius: '8px' };

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes popIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
        .fee-row:hover { background: #F8FAFC !important; }
        .filter-sel { appearance:none; -webkit-appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394A3B8'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; padding-right:28px !important; }
        .th-btn { background:none; border:none; cursor:pointer; font-family:inherit; font-size:10px; font-weight:800; color:rgba(255,255,255,0.55); letter-spacing:1.5px; text-transform:uppercase; display:flex; align-items:center; gap:4px; padding:0; }
        .th-btn:hover { color:rgba(255,255,255,0.9); }

        /* ── Mobile responsive ──────────────────────────────────────── */
        @media (max-width: 768px) {
          .fees-header { padding: 12px 16px !important; flex-wrap: wrap !important; gap: 8px !important; }
          .fees-header-btns { flex-wrap: wrap !important; gap: 6px !important; }
          .fees-content { padding: 14px 16px !important; }
          .stat-cards { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .aging-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .fees-action-bar { flex-direction: column !important; align-items: stretch !important; }
          .fees-action-bar-left { flex-wrap: wrap !important; }
          .fees-action-bar-right { justify-content: flex-end !important; flex-wrap: wrap !important; }
          .fee-table-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; }
          .fee-table-card { min-width: 700px !important; }
        }
        @media (max-width: 480px) {
          .stat-cards { grid-template-columns: 1fr 1fr !important; }
          .aging-grid { grid-template-columns: 1fr 1fr !important; }
          .fees-header h1 { font-size: 18px !important; }
          .fees-header p { display: none !important; }
        }
      `}</style>

      {/* ── Sticky header ──────────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: `3px solid ${primary}` }}>
        <div className="fees-header" style={{ padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Fees</h1>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '3px 0 0' }}>Club-wide fee tracking, collection, and payment recording.</p>
          </div>
          <div className="fees-header-btns" style={{ display: 'flex', gap: '8px' }}>
            {pageTab === 'ledger' && <>
              <button onClick={() => { setShowCashMode(true); setCashCollected([]); setCashMethod('Cash'); }}
                style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
                <Banknote size={14} /> Collect Payment
              </button>
              <button onClick={openPlayerAssign}
                style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
                <UserPlus size={14} /> Assign to Player
              </button>
              <button onClick={() => setShowAssign(true)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
                <Plus size={14} /> Assign Club-Wide
              </button>
            </>}
          </div>
        </div>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '2px', padding: '0 32px' }}>
          {([
            { id: 'ledger',    label: 'Ledger',    icon: <DollarSign size={13} /> },
            { id: 'families',  label: 'Families',  icon: <Users size={13} /> },
            { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={13} /> },
          ] as { id: PageTab; label: string; icon: React.ReactNode }[]).map(t => (
            <button key={t.id} onClick={() => setPageTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', border: 'none', background: 'none', borderBottom: `2px solid ${pageTab === t.id ? '#0F172A' : 'transparent'}`, fontSize: '12.5px', fontWeight: pageTab === t.id ? '700' : '500', color: pageTab === t.id ? '#0F172A' : '#64748B', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Non-ledger tabs ───────────────────────────────────────────────────── */}
      {pageTab === 'families'  && <FamiliesTab />}
      {pageTab === 'analytics' && <FeeAnalytics />}

      {/* ── Ledger tab content ─────────────────────────────────────────────────── */}
      {pageTab === 'ledger' && <div className="fees-content" style={{ padding: '24px 32px', maxWidth: '1240px' }}>

        {/* 1. Smart insights banner */}
        {!loading && insights.length > 0 && (
          <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {insights.map((ins, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderRadius: '10px', background: ins.type === 'error' ? '#FEF2F2' : ins.type === 'warn' ? '#FFFBEB' : '#EFF6FF', border: `1px solid ${ins.type === 'error' ? '#FECACA' : ins.type === 'warn' ? '#FDE68A' : '#BFDBFE'}` }}>
                <AlertCircle size={14} color={ins.type === 'error' ? '#EF4444' : ins.type === 'warn' ? '#F59E0B' : '#3B82F6'} />
                <span style={{ fontSize: '13px', fontWeight: '500', color: '#374151', flex: 1 }}>{ins.msg}</span>
                {ins.action && ins.filter && (
                  <button onClick={ins.filter} style={{ fontSize: '12px', fontWeight: '700', color: ins.type === 'error' ? '#EF4444' : ins.type === 'warn' ? '#F59E0B' : '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    {ins.action} →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 2. Stat cards */}
        <div className="stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '14px', marginBottom: '20px' }}>
          {[
            { label: 'Total Invoiced',  value: `$${fmt(totalInvoiced)}`,       color: '#64748B', icon: DollarSign,   iconBg: '#F1F5F9', extra: null },
            { label: 'Collected',       value: `$${fmt(totalCollected)}`,      color: '#22C55E', icon: CheckCircle,  iconBg: '#F0FDF4', extra: <Sparkline data={weeklySparkline} color="#22C55E" /> },
            { label: 'Outstanding',     value: `$${fmt(totalOutstanding)}`,    color: '#F59E0B', icon: Clock,        iconBg: '#FFFBEB', extra: null },
            { label: 'Overdue',         value: `$${fmt(overdueTotal)}`,        color: '#EF4444', icon: AlertCircle,  iconBg: '#FEF2F2', extra: null },
            { label: 'Due This Month',  value: `$${fmt(dueThisMonthTotal)}`,   color: '#8B5CF6', icon: Calendar,     iconBg: '#F5F3FF', extra: null },
          ].map(({ label, value, color, icon: Icon, iconBg, extra }) => (
            <div key={label} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: extra ? '10px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} color={color} strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>{label}</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: loading ? '#E2E8F0' : color, letterSpacing: '-0.5px', lineHeight: 1 }}>{loading ? '——' : value}</div>
                  </div>
                </div>
              </div>
              {extra && !loading && <div style={{ marginTop: '4px' }}>{extra}</div>}
            </div>
          ))}
        </div>

        {/* Hardship fund balance */}
        {hardshipEnabled && hardshipBalance !== null && (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '14px 20px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>❤️</span>
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#15803D' }}>Hardship Fund</div>
                <div style={{ fontSize: '11.5px', color: '#166534', marginTop: '1px' }}>Available to waive fees for families in need</div>
              </div>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#15803D', letterSpacing: '-0.5px' }}>${fmt(hardshipBalance)}</div>
          </div>
        )}

        {/* 3. Collection progress */}
        {(totalInvoiced > 0 || loading) && (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '16px 20px', marginBottom: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <TrendingUp size={13} color="#64748B" />
                <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#374151' }}>Club-wide collection progress</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>${fmt(totalCollected)} collected of ${fmt(totalInvoiced)}</span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: primary }}>{collectionPct}%</span>
              </div>
            </div>
            <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(collectionPct, 100)}%`, height: '100%', background: primary, borderRadius: '4px', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )}

        {/* 4. Due this week */}
        {!loading && dueSoonFees.length > 0 && (
          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap size={16} color="#16A34A" />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#15803D' }}>Due this week: </span>
              <span style={{ fontSize: '13px', color: '#166534' }}>${fmt(dueSoonTotal)} across {dueSoonFees.length} fee{dueSoonFees.length !== 1 ? 's' : ''}</span>
            </div>
            <button
              onClick={async () => {
                setReminding(true);
                for (const f of dueSoonFees) await fetch('/api/send-fee-reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player_fee_id: f.id }) });
                setReminding(false);
                setReminderResult(`Sent ${dueSoonFees.length} upcoming-due reminder${dueSoonFees.length !== 1 ? 's' : ''}.`);
                setTimeout(() => setReminderResult(null), 6000);
              }}
              style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', background: '#16A34A', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              Remind all
            </button>
          </div>
        )}

        {/* 5. Aging buckets */}
        <div className="aging-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Current', sublabel: 'Not yet due',   arr: aging.current, color: '#475569', bg: '#F8FAFC', border: '#E2E8F0',  dot: '#64748B' },
            { label: '1–30 days', sublabel: 'Overdue',     arr: aging.d30,     color: '#B45309', bg: '#FFFBEB', border: '#FDE68A', dot: '#F59E0B' },
            { label: '31–60 days', sublabel: 'Overdue',    arr: aging.d60,     color: '#B91C1C', bg: '#FFF5F5', border: '#FECACA', dot: '#EF4444' },
            { label: '60+ days', sublabel: 'Overdue',      arr: aging.d60p,    color: '#7F1D1D', bg: '#FEF2F2', border: '#FCA5A5', dot: '#991B1B' },
          ].map(({ label, sublabel, arr, color, bg, border, dot }) => (
            <div key={label} style={{ background: bg, borderRadius: '8px', border: `1px solid ${border}`, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: dot }} />
                <span style={{ fontSize: '10.5px', fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>· {sublabel}</span>
              </div>
              <div style={{ fontSize: '21px', fontWeight: '800', color, letterSpacing: '-0.5px', lineHeight: 1 }}>{loading ? '—' : `$${fmt(agSum(arr))}`}</div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '5px' }}>{arr.length} fee{arr.length !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>

        {/* 6. Collection by team */}
        <div style={{ ...card, marginBottom: '16px' }}>
          <button onClick={() => setShowBreakdown(b => !b)} style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Collection rate by team</span>
              {teamStats.length > 0 && <span style={{ fontSize: '11px', color: '#94A3B8', background: '#F1F5F9', padding: '2px 7px', borderRadius: '20px' }}>{teamStats.length} team{teamStats.length !== 1 ? 's' : ''}</span>}
            </div>
            {showBreakdown ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
          </button>
          {showBreakdown && (
            <div style={{ borderTop: '1px solid #F1F5F9', padding: '16px 20px' }}>
              {loading ? <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{[1,2,3].map(i => <div key={i} style={{ height: '36px', ...shimmerStyle }} />)}</div>
                : teamStats.length === 0 ? <div style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>No fee data yet</div>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {teamStats.map(t => {
                      const barColor = t.pct >= 80 ? '#22C55E' : t.pct >= 50 ? '#F59E0B' : '#EF4444';
                      return (
                        <div key={t.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                            <button onClick={() => { setTeamFilter(t.id); setShowBreakdown(false); }} style={{ fontSize: '12.5px', fontWeight: '600', color: '#374151', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>{t.name}</button>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', color: '#94A3B8' }}>${fmt(t.col)} / ${fmt(t.inv)}</span>
                              {t.out > 0 && <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: '600', background: '#FEF2F2', padding: '2px 7px', borderRadius: '5px' }}>${fmt(t.out)} owed</span>}
                              <span style={{ fontSize: '13px', fontWeight: '800', color: barColor, minWidth: '34px', textAlign: 'right' }}>{t.pct}%</span>
                            </div>
                          </div>
                          <div style={{ height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${t.pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* 7. Fee categories */}
        <div style={{ ...card, marginBottom: '20px' }}>
          <button onClick={() => setShowCategories(c => !c)} style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={14} color="#64748B" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Fee Categories</span>
              <span style={{ fontSize: '11px', color: '#94A3B8', background: '#F1F5F9', padding: '2px 7px', borderRadius: '20px' }}>{categories.length}</span>
            </div>
            {showCategories ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
          </button>
          {showCategories && (
            <div style={{ borderTop: '1px solid #F1F5F9', padding: '16px 20px' }}>
              {categories.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                  {categories.map(cat => (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #F1F5F9' }}>
                      {editCatId === cat.id ? (
                        <>
                          <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} style={{ ...inp, flex: 2, padding: '5px 8px', fontSize: '12px' }} placeholder="Name" />
                          <input type="number" value={catForm.amount} onChange={e => setCatForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inp, width: '80px', padding: '5px 8px', fontSize: '12px' }} placeholder="Amount" />
                          <input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} style={{ ...inp, flex: 3, padding: '5px 8px', fontSize: '12px' }} placeholder="Description" />
                          <button onClick={handleSaveCategory} disabled={catSaving} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: primary, color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{catSaving ? '…' : 'Save'}</button>
                          <button onClick={() => { setEditCatId(null); setCatForm({ name: '', amount: '', description: '' }); }} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', flex: 2 }}>{cat.name}</span>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: primary }}>${cat.amount.toFixed(2)}</span>
                          {cat.description && <span style={{ fontSize: '12px', color: '#94A3B8', flex: 3 }}>{cat.description}</span>}
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                            <button onClick={() => { setEditCatId(cat.id); setCatForm({ name: cat.name, amount: String(cat.amount), description: cat.description ?? '' }); }} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>Edit</button>
                            <button onClick={() => handleDeleteCategory(cat.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #FECACA', background: '#FEF2F2', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', color: '#EF4444' }}>Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {showCatForm && !editCatId ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} style={{ ...inp, flex: 2, padding: '6px 10px', fontSize: '13px' }} placeholder="Category name *" autoFocus />
                  <input type="number" value={catForm.amount} onChange={e => setCatForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inp, width: '100px', padding: '6px 10px', fontSize: '13px' }} placeholder="Amount *" />
                  <input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} style={{ ...inp, flex: 3, padding: '6px 10px', fontSize: '13px' }} placeholder="Description" />
                  <button onClick={handleSaveCategory} disabled={catSaving || !catForm.name || !catForm.amount} style={{ padding: '7px 14px', borderRadius: '7px', border: 'none', background: primary, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: (!catForm.name || !catForm.amount) ? 0.5 : 1 }}>{catSaving ? '…' : 'Add'}</button>
                  <button onClick={() => { setShowCatForm(false); setCatForm({ name: '', amount: '', description: '' }); }} style={{ padding: '7px 12px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              ) : (
                !editCatId && <button onClick={() => setShowCatForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: `1px dashed ${primary}`, background: `${primary}08`, color: primary, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Plus size={13} /> Add Category
                </button>
              )}
            </div>
          )}
        </div>

        {/* 8. Action bar */}
        <div className="fees-action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: selectedIds.size > 0 ? '8px' : '12px', gap: '10px', flexWrap: 'wrap' }}>
          <div className="fees-action-bar-left" style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <div style={{ position: 'relative', minWidth: '200px' }}>
              <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search player, team, fee…"
                style={{ ...inp, paddingLeft: '30px', width: '100%', fontSize: '12.5px' }}
              />
            </div>
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="filter-sel"
              style={{ padding: '7px 28px 7px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#374151', background: '#fff', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500' }}>
              <option value="all">All teams</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-sel"
              style={{ padding: '7px 28px 7px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#374151', background: '#fff', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500' }}>
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {(teamFilter !== 'all' || statusFilter !== 'all' || search) && (
              <button onClick={() => { setTeamFilter('all'); setStatusFilter('all'); setSearch(''); }} style={{ fontSize: '12px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Clear</button>
            )}
          </div>
          <div className="fees-action-bar-right" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            {reminderResult && <span style={{ fontSize: '12px', color: '#22C55E', fontWeight: '600', background: '#F0FDF4', padding: '5px 10px', borderRadius: '6px', border: '1px solid #BBF7D0' }}>{reminderResult}</span>}
            <button onClick={exportCSV} style={{ padding: '7px 13px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12.5px', fontWeight: '600', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit' }}>
              <Download size={13} /> Export
            </button>
            <button onClick={handleBulkReminder} disabled={reminding || overdueFees.length === 0}
              style={{ padding: '7px 13px', borderRadius: '8px', border: '1px solid #FECACA', background: overdueFees.length === 0 ? '#fff' : '#FEF2F2', fontSize: '12.5px', fontWeight: '600', color: overdueFees.length === 0 ? '#CBD5E1' : '#EF4444', cursor: overdueFees.length === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit' }}>
              <Send size={13} /> {reminding ? 'Sending…' : `Remind (${overdueFees.length})`}
            </button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (() => {
          const waivable = filtered.filter(f => !['paid','waived'].includes(f.status) && selectedIds.has(f.id));
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: `${primary}10`, border: `1px solid ${primary}30`, borderRadius: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: primary }}>{selectedIds.size} fee{selectedIds.size !== 1 ? 's' : ''} selected</span>
              <button onClick={handleBulkRemind} disabled={bulkReminding}
                style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', background: '#EF4444', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Send size={12} /> {bulkReminding ? 'Sending…' : 'Remind selected overdue'}
              </button>
              {waivable.length > 0 && (
                <button onClick={() => { setBulkWaiveReason(''); setShowBulkWaive(true); }}
                  style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', background: '#8B5CF6', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <CheckCircle size={12} /> Waive {waivable.length} fee{waivable.length !== 1 ? 's' : ''}
                </button>
              )}
              <button onClick={() => setSelectedIds(new Set())}
                style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>
                Clear selection
              </button>
            </div>
          );
        })()}

        {/* 9. Fee table */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[1,2,3,4,5].map(i => <div key={i} style={{ height: '52px', ...shimmerStyle }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="fee-table-card" style={{ ...card, padding: '56px 40px', textAlign: 'center' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '13px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <DollarSign size={24} color="#94A3B8" />
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>
              {search || teamFilter !== 'all' || statusFilter !== 'all' ? 'No fees match your filters' : 'No fees yet'}
            </div>
            <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>
              {search || teamFilter !== 'all' || statusFilter !== 'all' ? 'Try clearing your search or filters.' : 'Click "Assign Club-Wide" to create fees for all players.'}
            </div>
            {!(search || teamFilter !== 'all' || statusFilter !== 'all') && (
              <button onClick={() => setShowAssign(true)} style={{ padding: '9px 22px', borderRadius: '9px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Assign Club-Wide</button>
            )}
          </div>
        ) : (
          <div className="fee-table-scroll"><div className="fee-table-card" style={card}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '36px 160px 130px 1fr 80px 70px 80px 100px 52px', padding: '9px 16px', borderBottom: 'none', background: '#0F172A', alignItems: 'center' }}>
              <input type="checkbox" checked={allVisibleSelected} onChange={e => { if (e.target.checked) setSelectedIds(new Set(filtered.map(f => f.id))); else setSelectedIds(new Set()); }} style={{ width: '14px', height: '14px', accentColor: primary, cursor: 'pointer' }} />
              {(['Player','Team','Description','Invoiced','Paid','Owed','Status',''] as const).map((h, i) => {
                const colMap: Record<string, SortCol> = { Player: 'player', Team: 'team', Description: 'description', Invoiced: 'invoiced', Paid: 'paid', Owed: 'owed', Status: 'status' };
                const col = colMap[h];
                return col ? (
                  <button key={h} onClick={() => toggleSort(col)} className="th-btn">
                    {h} <SortIcon col={col} />
                  </button>
                ) : <div key={i} />;
              })}
            </div>

            {filtered.map(fee => {
              const owed   = Math.max(fee.amount_due - fee.discount - fee.amount_paid, 0);
              const cfg    = STATUS_CONFIG[fee.status] ?? STATUS_CONFIG.outstanding;
              const canPay = !['paid','waived'].includes(fee.status);
              const sel    = selectedIds.has(fee.id);
              return (
                <div key={fee.id} className="fee-row"
                  style={{ display: 'grid', gridTemplateColumns: '36px 160px 130px 1fr 80px 70px 80px 100px 52px', padding: '10px 16px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', background: sel ? `${primary}06` : '#fff', transition: 'background 0.1s' }}>
                  <input type="checkbox" checked={sel} onChange={e => { const s = new Set(selectedIds); e.target.checked ? s.add(fee.id) : s.delete(fee.id); setSelectedIds(s); }} style={{ width: '14px', height: '14px', accentColor: primary, cursor: 'pointer' }} />
                  <div style={{ paddingRight: '8px' }}>
                    <button onClick={() => setPlayerPanel(fee.player_id)} style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', maxWidth: '148px', textDecoration: 'underline', textDecorationColor: '#E2E8F0', textUnderlineOffset: '2px' }}>
                      {fee.player_name}
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>{fee.team_name}</div>
                  <div style={{ paddingRight: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fee.description}
                      {fee.installment_number && fee.installment_total && (
                        <span style={{ marginLeft: '5px', fontSize: '10px', color: '#64748B', background: '#F1F5F9', borderRadius: '4px', padding: '1px 5px', fontWeight: '600' }}>{fee.installment_number}/{fee.installment_total}</span>
                      )}
                    </div>
                    {fee.due_date && <div style={{ fontSize: '10.5px', color: fee.status === 'overdue' ? '#EF4444' : '#94A3B8', marginTop: '2px' }}>Due {fee.due_date}</div>}
                  </div>
                  <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#374151' }}>${fmt(fee.amount_due - fee.discount)}</div>
                  <div style={{ fontSize: '12.5px', color: fee.amount_paid > 0 ? '#22C55E' : '#CBD5E1', fontWeight: fee.amount_paid > 0 ? '600' : '400' }}>${fmt(fee.amount_paid)}</div>
                  <div style={{ fontSize: '12.5px', fontWeight: '700', color: owed > 0 ? cfg.color : '#CBD5E1' }}>{owed > 0 ? `$${fmt(owed)}` : '—'}</div>
                  <div>
                    <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    {(fee.status === 'paid' || fee.status === 'partial') && (() => {
                      const pmt = allPayments.find(p => p.player_fee_id === fee.id);
                      if (!pmt) return null;
                      const d = new Date(pmt.paid_at);
                      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      const firstName = pmt.recorder_name?.split(' ')[0] ?? null;
                      return (
                        <div style={{ fontSize: '9.5px', color: '#94A3B8', marginTop: '3px', lineHeight: '1.5' }}>
                          <div>{dateStr}</div>
                          {pmt.method && <div style={{ textTransform: 'capitalize' }}>{pmt.method}</div>}
                          {firstName && <div>Recv&apos;d by {firstName}</div>}
                          {pmt.reference && <div>Ref: {pmt.reference}</div>}
                        </div>
                      );
                    })()}
                    {fee.last_reminded_at && fee.status === 'overdue' && (
                      <div style={{ fontSize: '9.5px', color: '#94A3B8', marginTop: '2px' }}>
                        Reminded {Math.floor((Date.now() - new Date(fee.last_reminded_at).getTime()) / 86400000)}d ago
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {fee.status !== 'waived' && (() => {
                      const feePayments = allPayments.filter(p => p.player_fee_id === fee.id);
                      const latestPmt   = feePayments[0] ?? null;
                      return (
                        <RowMenu
                          primary={primary}
                          onPay={canPay ? () => openPayment(fee) : undefined}
                          onWaive={canPay ? () => setShowWaive(fee) : undefined}
                          onEdit={() => { setShowEditFee(fee); setEditFeeForm({ description: fee.description, amount_due: String(fee.amount_due), due_date: fee.due_date ?? '' }); }}
                          onUndo={latestPmt ? () => setShowUndoConfirm({ fee, payment: latestPmt }) : undefined}
                          onResendReceipt={fee.status === 'paid' ? () => handleResendReceipt(fee) : undefined}
                          onQR={fee.payment_token ? () => openQr(fee) : undefined}
                          isPaid={fee.status === 'paid'}
                          hasPayments={feePayments.length > 0}
                        />
                      );
                    })()}
                  </div>
                </div>
              );
            })}

            <div style={{ padding: '10px 16px', background: '#F8FAFC', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>{filtered.length} fee{filtered.length !== 1 ? 's' : ''}{(teamFilter !== 'all' || statusFilter !== 'all' || search) ? ' (filtered)' : ''}</span>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>Total owed: <strong style={{ color: '#374151' }}>${fmt(filtered.reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0))}</strong></span>
            </div>
          </div></div>
        )}
      </div>}{/* end ledger tab */}

      {/* ── Player drill-down panel ─────────────────────────────────────────────── */}
      {playerPanel && (
        <div onClick={() => setPlayerPanel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '460px', maxHeight: '85vh', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', animation: 'popIn 0.2s ease' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '800', color: '#fff', flexShrink: 0 }}>
                {initials(panelName)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>{panelName}</div>
                <div style={{ fontSize: '12px', color: panelOwed > 0 ? '#EF4444' : '#22C55E', fontWeight: '600', marginTop: '2px' }}>
                  {panelOwed > 0 ? `$${fmt(panelOwed)} outstanding` : 'All fees paid ✓'}
                </div>
              </div>
              <button onClick={() => setPlayerPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={18} color="#94A3B8" />
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
              {/* Add fee button */}
              <button onClick={() => setShowIndivAssign(true)}
                style={{ width: '100%', marginBottom: '14px', padding: '8px', borderRadius: '8px', border: `1px dashed ${primary}`, background: `${primary}08`, color: primary, fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <UserPlus size={13} /> Add fee to this player
              </button>

              {panelFees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '13px', color: '#94A3B8' }}>No fees for this player</div>
              ) : panelFees.map(fee => {
                const owed = Math.max(fee.amount_due - fee.discount - fee.amount_paid, 0);
                const cfg  = STATUS_CONFIG[fee.status] ?? STATUS_CONFIG.outstanding;
                const canPay = !['paid','waived'].includes(fee.status);
                const feePayments = allPayments.filter(p => p.player_fee_id === fee.id);
                return (
                  <div key={fee.id} style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px 16px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>{fee.description}</div>
                        {fee.installment_number && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Instalment {fee.installment_number}/{fee.installment_total}</div>}
                        {fee.due_date && <div style={{ fontSize: '11px', color: fee.status === 'overdue' ? '#EF4444' : '#94A3B8', marginTop: '2px' }}>Due {fee.due_date}</div>}
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{fee.team_name}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: cfg.bg, color: cfg.color, marginBottom: '6px' }}>{cfg.label}</span>
                        <div style={{ fontSize: '15px', fontWeight: '800', color: owed > 0 ? cfg.color : '#22C55E' }}>{owed > 0 ? `$${fmt(owed)} owed` : 'Paid'}</div>
                      </div>
                    </div>
                    {feePayments.length > 0 && (
                      <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '8px', marginBottom: '8px' }}>
                        {feePayments.map(p => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B', paddingBottom: '3px' }}>
                            <span>${fmt(p.amount)} via {(p as any).method ?? 'unknown'}</span>
                            <span>{p.paid_at.slice(0,10)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {canPay && (
                      <button onClick={() => openPayment(fee)} style={{ width: '100%', padding: '7px', borderRadius: '7px', border: 'none', background: primary, color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        <CreditCard size={12} /> Record Payment
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Reminder communication log */}
              {!reminderLogLoading && reminderLog.length > 0 && (
                <div style={{ marginTop: '12px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '12px 14px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Reminders sent</div>
                  {reminderLog.map(log => (
                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B', paddingBottom: '3px' }}>
                      <span style={{ textTransform: 'capitalize' }}>{log.reminder_type} reminder</span>
                      <span>{log.sent_at.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Assign to any player modal ────────────────────────────────────────── */}
      {showPlayerAssign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 650, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Assign Fee to Player</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>Search any player from your roster</div>
              </div>
              <button onClick={() => setShowPlayerAssign(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={17} color="#94A3B8" /></button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Player search */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Player</label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    value={playerSearch}
                    onChange={e => { setPlayerSearch(e.target.value); setSelectedPlayer(null); }}
                    placeholder="Search by name or team…"
                    style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
                {/* Dropdown results */}
                {playerSearch && !selectedPlayer && (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                    {rosterLoading ? (
                      <div style={{ padding: '12px 14px', fontSize: '13px', color: '#94A3B8' }}>Loading roster…</div>
                    ) : filteredRoster.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: '13px', color: '#94A3B8' }}>No players found</div>
                    ) : filteredRoster.slice(0, 20).map(p => (
                      <button key={p.id} onClick={() => { setSelectedPlayer(p); setPlayerSearch(p.full_name); }}
                        style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F8FAFC' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{p.full_name}</span>
                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>{p.team_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedPlayer && (
                  <div style={{ marginTop: '6px', padding: '7px 12px', background: '#F0FDF4', borderRadius: '7px', border: '1px solid #BBF7D0', fontSize: '12px', color: '#15803D', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                    <span>✓ {selectedPlayer.full_name}</span>
                    <span style={{ color: '#86EFAC' }}>{selectedPlayer.team_name}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Description</label>
                <input value={playerAssignForm.description} onChange={e => setPlayerAssignForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Registration fee, Kit fee…"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
              </div>

              {/* Amount + Due date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Amount ($)</label>
                  <input type="number" min="0" step="0.01" value={playerAssignForm.amount_due} onChange={e => setPlayerAssignForm(f => ({ ...f, amount_due: e.target.value }))}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Due Date</label>
                  <input type="date" value={playerAssignForm.due_date} onChange={e => setPlayerAssignForm(f => ({ ...f, due_date: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setShowPlayerAssign(false)} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button
                onClick={handlePlayerAssign}
                disabled={!selectedPlayer || !playerAssignForm.description || !playerAssignForm.amount_due || playerAssignSaving}
                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: (!selectedPlayer || !playerAssignForm.description || !playerAssignForm.amount_due) ? '#94A3B8' : primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: (!selectedPlayer || !playerAssignForm.description || !playerAssignForm.amount_due) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {playerAssignSaving ? 'Saving…' : 'Assign Fee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Individual player fee assignment modal ──────────────────────────────── */}
      {showIndivAssign && playerPanel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 650, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Add Fee to Player</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{panelName}</div>
              </div>
              <button onClick={() => { setShowIndivAssign(false); resetIndivForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={17} color="#94A3B8" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={lbl}>Description *</label>
                <input value={indivForm.description} onChange={e => setIndivForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Kit replacement, Tournament entry…" style={inp} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>Amount ($) *</label>
                  <input type="number" value={indivForm.amount_due} onChange={e => setIndivForm(f => ({ ...f, amount_due: e.target.value }))} placeholder="0.00" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Due date</label>
                  <input type="date" value={indivForm.due_date} onChange={e => setIndivForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>Discount ($)</label>
                  <input type="number" value={indivForm.discount_amount} onChange={e => setIndivForm(f => ({ ...f, discount_amount: e.target.value }))} placeholder="0.00" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Discount reason</label>
                  <select value={indivForm.discount_reason} onChange={e => setIndivForm(f => ({ ...f, discount_reason: e.target.value }))} style={inp}>
                    <option value="">None</option>
                    <option>Scholarship</option>
                    <option>Sibling discount</option>
                    <option>Financial aid</option>
                    <option>Early payment</option>
                    <option>Promotional</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowIndivAssign(false); resetIndivForm(); }} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleIndivAssign} disabled={indivSaving || !indivForm.description || !indivForm.amount_due}
                style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: indivSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (!indivForm.description || !indivForm.amount_due) ? 0.5 : 1 }}>
                {indivSaving ? 'Saving…' : 'Add Fee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cash collection mode ────────────────────────────────────────────────── */}
      {showCashMode && (() => {
        // Session totals by method
        const methodTotals = cashCollected.reduce<Record<string, number>>((acc, c) => {
          acc[c.method] = (acc[c.method] ?? 0) + c.amount;
          return acc;
        }, {});
        const sessionTotal = cashCollected.reduce((s, c) => s + c.amount, 0);
        const METHOD_ICONS: Record<string, string> = { Cash: '💵', Check: '📝', Card: '💳' };
        const METHOD_COLORS: Record<string, { color: string; bg: string }> = {
          Cash:  { color: '#15803D', bg: '#DCFCE7' },
          Check: { color: '#1D4ED8', bg: '#DBEAFE' },
          Card:  { color: '#7C3AED', bg: '#EDE9FE' },
        };
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 20px' }}>
            <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '580px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>

              {/* Header */}
              <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Banknote size={18} color={primary} />
                    <span style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A' }}>Collect Payment</span>
                  </div>
                  <button onClick={() => { setShowCashMode(false); if (cashCollected.length > 0) load(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#94A3B8" /></button>
                </div>

                {/* Payment method selector */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B', alignSelf: 'center', marginRight: '4px' }}>Method:</span>
                  {(['Cash', 'Check', 'Card'] as const).map(m => {
                    const mc = METHOD_COLORS[m];
                    const active = cashMethod === m;
                    return (
                      <button key={m} onClick={() => setCashMethod(m)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 16px', borderRadius: '8px', border: `1.5px solid ${active ? mc.color : '#E2E8F0'}`, background: active ? mc.bg : '#fff', fontSize: '13px', fontWeight: '700', color: active ? mc.color : '#64748B', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}>
                        {METHOD_ICONS[m]} {m}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontSize: '12px', color: '#94A3B8', paddingBottom: '14px', borderBottom: '1px solid #F1F5F9' }}>
                  Tap ✓ to record full {cashMethod.toLowerCase()} payment — switch method above for each person
                </div>
              </div>

              {/* Scrollable fee list */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {cashFees.length === 0 ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                    <CheckCircle size={36} color="#22C55E" style={{ margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>All clear!</div>
                    <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>No outstanding fees remaining</div>
                  </div>
                ) : (
                  <>
                    <div style={{ padding: '6px 0' }}>
                      {cashFees.map((fee, i) => {
                        const owed = Math.max(fee.amount_due - fee.discount - fee.amount_paid, 0);
                        const cfg  = STATUS_CONFIG[fee.status] ?? STATUS_CONFIG.outstanding;
                        const mc   = METHOD_COLORS[cashMethod];
                        return (
                          <div key={fee.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 24px', borderBottom: i < cashFees.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: primary, flexShrink: 0 }}>
                              {initials(fee.player_name)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fee.player_name}</div>
                              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>{fee.team_name} · {fee.description}</div>
                            </div>
                            <div style={{ textAlign: 'right', marginRight: '8px' }}>
                              <div style={{ fontSize: '15px', fontWeight: '800', color: cfg.color }}>${fmt(owed)}</div>
                              <span style={{ fontSize: '10px', fontWeight: '700', color: cfg.color }}>{cfg.label}</span>
                            </div>
                            <button
                              onClick={() => handleCashRecord(fee)}
                              style={{ width: '40px', height: '40px', borderRadius: '50%', border: `2px solid ${mc.color}20`, background: mc.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s', fontSize: '16px' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = mc.color; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = mc.bg; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                              title={`Record $${fmt(owed)} ${cashMethod}`}
                            >
                              <CheckCircle size={20} color={mc.color} />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Collected this session */}
                    {cashCollected.length > 0 && (
                      <div style={{ margin: '0 16px 16px', background: '#F0FDF4', borderRadius: '12px', border: '1px solid #BBF7D0', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle size={13} color="#16A34A" />
                          <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#15803D' }}>Collected this session</span>
                        </div>
                        {cashCollected.map((c, i) => {
                          const mc = METHOD_COLORS[c.method] ?? METHOD_COLORS.Cash;
                          return (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', borderBottom: i < cashCollected.length - 1 ? '1px solid #BBF7D030' : 'none' }}>
                              <span style={{ fontSize: '14px' }}>{METHOD_ICONS[c.method] ?? '💵'}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#166534' }}>{c.name}</span>
                                <span style={{ fontSize: '11px', color: '#4ADE80', marginLeft: '6px' }}>{c.description}</span>
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '5px', background: mc.bg, color: mc.color, flexShrink: 0 }}>{c.method}</span>
                              <span style={{ fontSize: '13px', fontWeight: '800', color: '#15803D', flexShrink: 0 }}>${fmt(c.amount)}</span>
                              <button onClick={() => handleUndoCollect(c)} title="Undo"
                                style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #FECACA', background: '#FEF2F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FCA5A5'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#FEF2F2'}
                              ><X size={13} color="#EF4444" /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Session summary footer */}
              {cashCollected.length > 0 && (
                <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>Session total</span>
                    <span style={{ fontSize: '16px', fontWeight: '800', color: '#15803D', letterSpacing: '-0.3px' }}>${fmt(sessionTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {Object.entries(methodTotals).map(([method, total]) => {
                      const mc = METHOD_COLORS[method] ?? METHOD_COLORS.Cash;
                      return (
                        <span key={method} style={{ fontSize: '11.5px', fontWeight: '600', padding: '3px 10px', borderRadius: '6px', background: mc.bg, color: mc.color }}>
                          {METHOD_ICONS[method] ?? '💵'} ${fmt(total)} {method}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Waive modal ─────────────────────────────────────────────────────────── */}
      {showWaive && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Waive Fee</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{showWaive.player_name} · {showWaive.description}</div>
              </div>
              <button onClick={() => { setShowWaive(null); setWaiveReason(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={17} color="#94A3B8" /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: '600' }}>Amount being waived</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#6D28D9' }}>${fmt(Math.max(showWaive.amount_due - showWaive.discount - showWaive.amount_paid, 0))}</div>
              </div>
              <label style={lbl}>Reason (optional)</label>
              <input value={waiveReason} onChange={e => setWaiveReason(e.target.value)} placeholder="e.g. Scholarship, Hardship, Admin error…" style={inp} autoFocus />
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowWaive(null); setWaiveReason(''); }} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleWaive} disabled={waiveSaving} style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: '#8B5CF6', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: waiveSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {waiveSaving ? 'Waiving…' : 'Waive Fee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Payment Modal ─────────────────────────────────────────────────── */}
      {showPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Record Payment</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{showPayment.player_name} · {showPayment.team_name}</div>
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '1px' }}>{showPayment.description}</div>
              </div>
              <button onClick={() => setShowPayment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={17} color="#94A3B8" /></button>
            </div>
            <div style={{ margin: '16px 24px 0', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Total owed</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#EF4444', letterSpacing: '-0.4px' }}>${fmt(Math.max(showPayment.amount_due - showPayment.discount - showPayment.amount_paid, 0))}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Previously paid</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#22C55E' }}>${fmt(showPayment.amount_paid)}</div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={lbl}>Amount received ($) *</label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" max={Math.max(showPayment.amount_due - showPayment.discount - showPayment.amount_paid, 0)} min="0.01" step="0.01" style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Payment method</label>
                <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} style={inp}>
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>Reference #</label>
                  <input value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} placeholder="Optional" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Note</label>
                  <input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" style={inp} />
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPayment(null)} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleRecordPayment} disabled={paymentSaving || !payForm.amount || parseFloat(payForm.amount) <= 0}
                style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: paymentSaving ? '#94A3B8' : primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: paymentSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !payForm.amount || parseFloat(payForm.amount) <= 0 ? 0.5 : 1 }}>
                {paymentSaving ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Club-Wide Modal ───────────────────────────────────────────────── */}
      {showAssign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '540px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Assign Club-Wide Fee</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>Creates a fee for every player on selected teams</div>
              </div>
              <button onClick={() => { setShowAssign(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={18} color="#94A3B8" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', flex: 1 }}>
              <div>
                <div style={lbl}>Apply to</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => setAForm(f => ({ ...f, apply_to: 'all', selected_teams: [] }))} style={{ padding: '7px 16px', borderRadius: '8px', border: `1px solid ${aForm.apply_to === 'all' ? primary : '#E2E8F0'}`, background: aForm.apply_to === 'all' ? `${primary}15` : '#fff', fontSize: '12.5px', fontWeight: '600', color: aForm.apply_to === 'all' ? primary : '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>All teams ({teams.length})</button>
                  <button onClick={() => { setAForm(f => ({ ...f, apply_to: 'select' })); setShowTeamPicker(true); }} style={{ padding: '7px 16px', borderRadius: '8px', border: `1px solid ${aForm.apply_to === 'select' ? primary : '#E2E8F0'}`, background: aForm.apply_to === 'select' ? `${primary}15` : '#fff', fontSize: '12.5px', fontWeight: '600', color: aForm.apply_to === 'select' ? primary : '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Select teams</button>
                  {aForm.apply_to === 'select' && aForm.selected_teams.length > 0 && <button onClick={() => setShowTeamPicker(true)} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${primary}`, background: `${primary}10`, fontSize: '12px', fontWeight: '700', color: primary, cursor: 'pointer', fontFamily: 'inherit' }}>{aForm.selected_teams.length} team{aForm.selected_teams.length !== 1 ? 's' : ''} — edit</button>}
                  {aForm.apply_to === 'select' && aForm.selected_teams.length === 0 && <span style={{ fontSize: '12px', color: '#EF4444' }}>No teams selected</span>}
                </div>
              </div>
              <div>
                <span style={lbl}>Fee type (optional)</span>
                <select value={aForm.category_id} onChange={e => { const cat = categories.find(c => c.id === e.target.value); setAForm(f => ({ ...f, category_id: e.target.value, description: cat?.name ?? f.description, amount_due: cat ? String(cat.amount) : f.amount_due })); }} style={inp}>
                  <option value="">Custom</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name} — ${c.amount}</option>)}
                </select>
              </div>
              <div>
                <span style={lbl}>Description *</span>
                <input value={aForm.description} onChange={e => setAForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Season Registration 2026-27" style={inp} />
              </div>
              <div>
                <span style={lbl}>Total amount per player ($) *</span>
                <input type="number" value={aForm.amount_due} onChange={e => setAForm(f => ({ ...f, amount_due: e.target.value }))} placeholder="0.00" style={inp} />
              </div>
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', border: '1px solid #E2E8F0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: aForm.use_plan ? '14px' : '0' }}>
                  <input type="checkbox" checked={aForm.use_plan} onChange={e => setAForm(f => ({ ...f, use_plan: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: primary }} />
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Split into payment instalments</span>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>Parents can still pay in full at any time</div>
                  </div>
                </label>
                {aForm.use_plan && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <span style={lbl}>Number of instalments</span>
                      <input type="number" min="2" max="24" value={aForm.plan_count} onChange={e => setPlanCount(e.target.value)} style={{ ...inp, maxWidth: '100px' }} />
                    </div>
                    {instPrev.length > 0 && (
                      <div>
                        <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Set due date for each instalment</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {instPrev.map((inst, i) => (
                            <div key={inst.num} style={{ display: 'grid', gridTemplateColumns: '110px 80px 1fr', gap: '10px', alignItems: 'center', background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '8px 12px' }}>
                              <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>Instalment {inst.num}</span>
                              <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>${inst.amount.toFixed(2)}</span>
                              <input type="date" value={aForm.plan_dates[i] ?? ''} onChange={e => setAForm(f => { const d = [...f.plan_dates]; d[i] = e.target.value; return { ...f, plan_dates: d }; })} style={{ ...inp, padding: '5px 8px', fontSize: '12px' }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {!aForm.use_plan && (
                <div>
                  <span style={lbl}>Due date</span>
                  <input type="date" value={aForm.due_date} onChange={e => setAForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={lbl}>Discount per player ($)</span>
                  <input type="number" value={aForm.discount_amount} onChange={e => setAForm(f => ({ ...f, discount_amount: e.target.value }))} placeholder="0.00" style={inp} />
                </div>
                <div>
                  <span style={lbl}>Discount reason</span>
                  <select value={aForm.discount_reason} onChange={e => setAForm(f => ({ ...f, discount_reason: e.target.value }))} style={inp}>
                    <option value="">None</option>
                    <option>Scholarship</option>
                    <option>Sibling discount</option>
                    <option>Financial aid</option>
                    <option>Early payment</option>
                    <option>Promotional</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div>
                <span style={lbl}>Notes (optional)</span>
                <input value={aForm.notes} onChange={e => setAForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal note…" style={inp} />
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>{saveProgress}</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setShowAssign(false); resetForm(); }} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={handleAssign} disabled={saving || !aForm.description || !aForm.amount_due || (aForm.apply_to === 'select' && aForm.selected_teams.length === 0)}
                  style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: saving ? '#94A3B8' : primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (!aForm.description || !aForm.amount_due || (aForm.apply_to === 'select' && aForm.selected_teams.length === 0)) ? 0.5 : 1 }}>
                  {saving ? 'Saving…' : 'Assign Fees'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Undo Payment Confirm Modal ───────────────────────────────────────────── */}
      {showUndoConfirm && (() => {
        const { fee, payment } = showUndoConfirm;
        const d = new Date(payment.paid_at);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Undo Payment</div>
                <button onClick={() => setShowUndoConfirm(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={17} color="#94A3B8" /></button>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '14px 16px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Payment to reverse</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#DC2626' }}>${fmt(payment.amount)}</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>{fee.player_name} · {fee.description}</div>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '3px' }}>{dateStr}{payment.method ? ` · ${payment.method}` : ''}{payment.reference ? ` · Ref: ${payment.reference}` : ''}</div>
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
                  This will delete the payment record and mark the fee as <strong>outstanding</strong>. This cannot be undone.
                </div>
              </div>
              <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowUndoConfirm(null)} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={handleUndoPayment} disabled={undoSaving} style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: '#EF4444', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: undoSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {undoSaving ? 'Undoing…' : 'Undo Payment'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Edit Fee Modal ───────────────────────────────────────────────────────── */}
      {showEditFee && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Edit Fee</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{showEditFee.player_name}</div>
              </div>
              <button onClick={() => setShowEditFee(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={17} color="#94A3B8" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={lbl}>Description</label>
                <input value={editFeeForm.description} onChange={e => setEditFeeForm(f => ({ ...f, description: e.target.value }))} style={inp} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>Amount due ($)</label>
                  <input type="number" value={editFeeForm.amount_due} onChange={e => setEditFeeForm(f => ({ ...f, amount_due: e.target.value }))} placeholder="0.00" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Due date</label>
                  <input type="date" value={editFeeForm.due_date} onChange={e => setEditFeeForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowEditFee(null)} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleEditFee} disabled={editFeeSaving} style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: editFeeSaving ? '#94A3B8' : primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: editFeeSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {editFeeSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Waive Confirm Modal ─────────────────────────────────────────────── */}
      {showBulkWaive && (() => {
        const waivable = filtered.filter(f => !['paid','waived'].includes(f.status) && selectedIds.has(f.id));
        const total    = waivable.reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Bulk Waive Fees</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{waivable.length} fee{waivable.length !== 1 ? 's' : ''} · ${fmt(total)} total</div>
                </div>
                <button onClick={() => setShowBulkWaive(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={17} color="#94A3B8" /></button>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount being waived</div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#6D28D9', marginTop: '4px' }}>${fmt(total)}</div>
                  <div style={{ fontSize: '11.5px', color: '#8B5CF6', marginTop: '4px' }}>{waivable.length} fee{waivable.length !== 1 ? 's' : ''} across {new Set(waivable.map(f => f.player_name)).size} player{new Set(waivable.map(f => f.player_name)).size !== 1 ? 's' : ''}</div>
                </div>
                <label style={lbl}>Reason (optional)</label>
                <input value={bulkWaiveReason} onChange={e => setBulkWaiveReason(e.target.value)} placeholder="e.g. Season end, Team dissolved…" style={inp} autoFocus />
              </div>
              <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowBulkWaive(false)} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={handleBulkWaive} disabled={bulkWaiving} style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: '#8B5CF6', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: bulkWaiving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {bulkWaiving ? 'Waiving…' : `Waive ${waivable.length} fee${waivable.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Team Picker Modal ────────────────────────────────────────────────────── */}
      {showTeamPicker && (() => {
        const filteredTeams = teams.filter(t => t.name.toLowerCase().includes(aForm.team_search.toLowerCase()));
        const allSel = filteredTeams.length > 0 && filteredTeams.every(t => aForm.selected_teams.includes(t.id));
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 800, padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Select teams</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{aForm.selected_teams.length} of {teams.length} selected</div>
                </div>
                <button onClick={() => setShowTeamPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={18} color="#94A3B8" /></button>
              </div>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: '8px', flexShrink: 0 }}>
                <input autoFocus value={aForm.team_search} onChange={e => setAForm(f => ({ ...f, team_search: e.target.value }))} placeholder="Search teams…" style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#374151', outline: 'none', fontFamily: 'inherit' }} />
                <button onClick={() => setAForm(f => ({ ...f, selected_teams: allSel ? f.selected_teams.filter(id => !filteredTeams.find(t => t.id === id)) : [...new Set([...f.selected_teams, ...filteredTeams.map(t => t.id)])] }))} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '12.5px', fontWeight: '600', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                  {allSel ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filteredTeams.length === 0
                  ? <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '13px', color: '#94A3B8' }}>No teams match &quot;{aForm.team_search}&quot;</div>
                  : filteredTeams.map((t, i) => {
                    const checked = aForm.selected_teams.includes(t.id);
                    return (
                      <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: i < filteredTeams.length - 1 ? '1px solid #F8FAFC' : 'none', background: checked ? `${primary}08` : '#fff', cursor: 'pointer' }}>
                        <input type="checkbox" checked={checked} onChange={e => setAForm(f => ({ ...f, selected_teams: e.target.checked ? [...f.selected_teams, t.id] : f.selected_teams.filter(id => id !== t.id) }))} style={{ width: '16px', height: '16px', accentColor: primary, flexShrink: 0 }} />
                        <span style={{ fontSize: '13.5px', fontWeight: checked ? '600' : '400', color: checked ? primary : '#374151', flex: 1 }}>{t.name}</span>
                        {checked && <span style={{ fontSize: '11px', color: primary, fontWeight: '700' }}>✓</span>}
                      </label>
                    );
                  })}
              </div>
              <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <button onClick={() => setAForm(f => ({ ...f, selected_teams: [] }))} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12.5px', fontWeight: '600', color: '#94A3B8', cursor: 'pointer', fontFamily: 'inherit' }}>Clear all</button>
                <button onClick={() => setShowTeamPicker(false)} style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Done — {aForm.selected_teams.length} team{aForm.selected_teams.length !== 1 ? 's' : ''}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── QR Code modal ──────────────────────────────────────────────────────── */}
      {qrFee && (
        <div onClick={() => setQrFee(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '360px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden', animation: 'popIn 0.2s ease' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Payment QR Code</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{qrFee.player_name} · {qrFee.description}</div>
              </div>
              <button onClick={() => setQrFee(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={18} color="#94A3B8" /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ background: '#F8FAFC', borderRadius: '14px', padding: '16px', border: '1px solid #E2E8F0' }}>
                {qrDataUrl
                  ? <img src={qrDataUrl} alt="Payment QR" style={{ width: '240px', height: '240px', display: 'block', borderRadius: '8px' }} />
                  : <div style={{ width: '240px', height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '28px', height: '28px', border: '3px solid #E2E8F0', borderTop: `3px solid ${primary}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    </div>
                }
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center', lineHeight: 1.6 }}>
                Scan to pay · No login required<br />
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', wordBreak: 'break-all' }}>
                  pulse-fc.app/pay/{qrFee.payment_token?.slice(0, 8)}…
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button
                  onClick={() => {
                    if (!qrDataUrl) return;
                    const a = document.createElement('a');
                    a.href = qrDataUrl;
                    a.download = `payment-qr-${qrFee.player_name.replace(/\s+/g, '-').toLowerCase()}.png`;
                    a.click();
                  }}
                  style={{ flex: 1, padding: '10px', borderRadius: '9px', border: '1.5px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '700', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Download size={14} /> Download PNG
                </button>
                <button
                  onClick={() => {
                    if (!qrDataUrl) return;
                    const win = window.open('', '_blank');
                    if (!win) return;
                    win.document.write(`<html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${qrDataUrl}" style="width:400px;height:400px"></body></html>`);
                    win.document.close();
                    win.print();
                  }}
                  style={{ flex: 1, padding: '10px', borderRadius: '9px', border: '1.5px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '700', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Printer size={14} /> Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
