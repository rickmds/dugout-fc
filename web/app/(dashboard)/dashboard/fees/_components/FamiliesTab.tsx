'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, Users, CheckCircle, Mail, Search,
  FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

// ── Types ────────────────────────────────────────────────────────────────────
type FamilyFee = {
  id: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  discount: number;
  status: string;
  due_date: string | null;
  payments: { id: string; amount: number; paid_at: string; method: string | null }[];
};

type FamilyPlayer = {
  id: string;
  full_name: string;
  team_name: string;
  fees: FamilyFee[];
  registrations: { id: string; form_title: string; status: string; created_at: string }[];
};

type Family = {
  key: string;
  parent_name: string;
  parent_email: string | null;
  players: FamilyPlayer[];
  total_invoiced: number;
  total_paid: number;
  total_owed: number;
  has_overdue: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function initials(name: string) { return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2); }

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  outstanding: { label: 'Outstanding', color: '#F59E0B', bg: '#FFFBEB' },
  partial:     { label: 'Partial',     color: '#3B82F6', bg: '#EFF6FF' },
  paid:        { label: 'Paid',        color: '#22C55E', bg: '#F0FDF4' },
  waived:      { label: 'Waived',      color: '#8B5CF6', bg: '#F5F3FF' },
  overdue:     { label: 'Overdue',     color: '#EF4444', bg: '#FEF2F2' },
};

const REG_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  approved:   { label: 'Approved',   color: '#22C55E', bg: '#F0FDF4' },
  pending:    { label: 'Pending',    color: '#F59E0B', bg: '#FFFBEB' },
  waitlisted: { label: 'Waitlist',   color: '#8B5CF6', bg: '#F5F3FF' },
  rejected:   { label: 'Rejected',   color: '#EF4444', bg: '#FEF2F2' },
};

// ── Component ────────────────────────────────────────────────────────────────
export default function FamiliesTab() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [families, setFamilies]       = useState<Family[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState<'all' | 'outstanding' | 'paid'>('all');

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!club) return;
    setLoading(true);

    // 1. Teams
    const { data: teamsData } = await supabase
      .from('teams').select('id,name').eq('club_id', club.id);
    const teams = (teamsData ?? []) as { id: string; name: string }[];
    const tMap  = Object.fromEntries(teams.map(t => [t.id, t.name]));
    if (!teams.length) { setLoading(false); return; }
    const teamIds = teams.map(t => t.id);

    // 2. Players + linked parent profiles
    const { data: playersData } = await supabase
      .from('players')
      .select('id,full_name,team_id,profile_id,profiles(id,full_name)')
      .in('team_id', teamIds);
    const players = (playersData ?? []) as unknown as {
      id: string; full_name: string; team_id: string; profile_id: string | null;
      profiles: { id: string; full_name: string | null } | null;
    }[];
    const playerIds = players.map(p => p.id);
    if (!playerIds.length) { setLoading(false); return; }

    // 3. Parent emails from invites (for players without linked accounts)
    const { data: invitesData } = await supabase
      .from('invites').select('player_id,email').in('player_id', playerIds);
    const inviteMap: Record<string, string> = {};
    for (const inv of (invitesData ?? [])) {
      if (!inviteMap[inv.player_id]) inviteMap[inv.player_id] = inv.email;
    }

    // 4. All fees
    const { data: feesData } = await supabase
      .from('player_fees')
      .select('id,player_id,description,amount_due,amount_paid,discount,status,due_date')
      .in('player_id', playerIds);
    const rawFees = (feesData ?? []) as {
      id: string; player_id: string; description: string; amount_due: number;
      amount_paid: number; discount: number | null; status: string; due_date: string | null;
    }[];
    const feeIds  = rawFees.map(f => f.id);

    const normFees = rawFees.map(f => ({
      ...f,
      amount_due:  +f.amount_due,
      amount_paid: +f.amount_paid,
      discount:    +(f.discount ?? 0),
      status: f.status !== 'paid' && f.status !== 'waived' && f.due_date && f.due_date < today
        ? 'overdue' : f.status,
    }));

    // 5. All payments (only if we have fees)
    const pmtsMap: Record<string, { id: string; amount: number; paid_at: string; method: string | null }[]> = {};
    if (feeIds.length > 0) {
      const { data: pmtsData } = await supabase
        .from('fee_payments')
        .select('id,player_fee_id,amount,paid_at,method')
        .in('player_fee_id', feeIds)
        .order('paid_at', { ascending: false });
      for (const p of (pmtsData ?? [])) {
        if (!pmtsMap[p.player_fee_id]) pmtsMap[p.player_fee_id] = [];
        pmtsMap[p.player_fee_id].push(p);
      }
    }

    // 6. Registrations
    const regsMap: Record<string, { id: string; form_title: string; status: string; created_at: string }[]> = {};
    try {
      const { data: regsData } = await supabase
        .from('registration_submissions')
        .select('id,player_id,status,created_at,registration_forms(title)')
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
        .returns<{ id: string; player_id: string; status: string; created_at: string; registration_forms: { title: string } | null }[]>();
      for (const r of (regsData ?? [])) {
        const pid = r.player_id;
        if (!regsMap[pid]) regsMap[pid] = [];
        regsMap[pid].push({
          id:         r.id,
          form_title: r.registration_forms?.title ?? 'Registration',
          status:     r.status,
          created_at: r.created_at,
        });
      }
    } catch {
      // registration_submissions may not exist in all envs
    }

    // 7. Group players into families
    const familyMap: Record<string, {
      profile_id: string | null; parent_name: string; parent_email: string | null; playerList: typeof players;
    }> = {};

    for (const player of players) {
      const profileId   = player.profile_id;
      const email       = inviteMap[player.id] ?? null;
      const key         = profileId ?? email ?? `solo_${player.id}`;
      const profileName = player.profiles?.full_name ?? null;
      const parentName  = profileName ?? (email ? email.split('@')[0].replace(/[._]/g, ' ') : 'No contact info');

      if (!familyMap[key]) {
        familyMap[key] = { profile_id: profileId, parent_name: parentName, parent_email: email, playerList: [] };
      }
      familyMap[key].playerList.push(player);
    }

    // 8. Build Family objects
    const result: Family[] = [];
    for (const [key, fam] of Object.entries(familyMap)) {
      const famPlayers: FamilyPlayer[] = fam.playerList.map(player => ({
        id:         player.id,
        full_name:  player.full_name,
        team_name:  tMap[player.team_id] ?? 'Unknown',
        fees: normFees
          .filter(f => f.player_id === player.id)
          .map(f => ({ ...f, payments: pmtsMap[f.id] ?? [] })),
        registrations: regsMap[player.id] ?? [],
      }));

      const allFees       = famPlayers.flatMap(p => p.fees);
      const total_invoiced = allFees.reduce((s, f) => s + (f.amount_due - f.discount), 0);
      const total_paid     = allFees.reduce((s, f) => s + f.amount_paid, 0);
      const total_owed     = allFees
        .filter(f => !['paid','waived'].includes(f.status))
        .reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);
      const has_overdue = allFees.some(f => f.status === 'overdue');

      result.push({ key, parent_name: fam.parent_name, parent_email: fam.parent_email, players: famPlayers, total_invoiced, total_paid, total_owed, has_overdue });
    }

    result.sort((a, b) => {
      if (a.has_overdue !== b.has_overdue) return a.has_overdue ? -1 : 1;
      if (b.total_owed  !== a.total_owed)  return b.total_owed - a.total_owed;
      return a.parent_name.localeCompare(b.parent_name);
    });

    setFamilies(result);
    setLoading(false);
  }, [club, today]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load sets state from a real network call, not derivable at render time
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let f = families;
    if (filter === 'outstanding') f = f.filter(fam => fam.total_owed > 0);
    if (filter === 'paid')        f = f.filter(fam => fam.total_owed === 0 && fam.total_invoiced > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter(fam =>
        fam.parent_name.toLowerCase().includes(q) ||
        (fam.parent_email ?? '').toLowerCase().includes(q) ||
        fam.players.some(p => p.full_name.toLowerCase().includes(q))
      );
    }
    return f;
  }, [families, filter, search]);

  const owingFamilies = families.filter(f => f.total_owed > 0).length;
  const totalOwed     = families.reduce((s, f) => s + f.total_owed, 0);
  const totalReg      = families.flatMap(f => f.players).flatMap(p => p.registrations).length;

  const shimmer: React.CSSProperties = { background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite', borderRadius: '8px' };
  const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', background: '#fff' };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1240px' }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Total Families',     value: loading ? '—' : families.length,      icon: '👨‍👩‍👧', color: '#64748B', bg: '#F1F5F9' },
          { label: 'Families Owing',     value: loading ? '—' : owingFamilies,         icon: '⚠️',       color: '#EF4444', bg: '#FEF2F2' },
          { label: 'Total Outstanding',  value: loading ? '—' : `$${fmt(totalOwed)}`,  icon: '💰',       color: '#F59E0B', bg: '#FFFBEB' },
          { label: 'Registrations',      value: loading ? '—' : totalReg,              icon: '📋',       color: '#3B82F6', bg: '#EFF6FF' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color, letterSpacing: '-0.4px' }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search family, player, email…"
            style={{ ...inp, paddingLeft: '30px', width: '100%' }} />
        </div>
        {(['all','outstanding','paid'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '7px 16px', borderRadius: '8px', border: `1px solid ${filter === f ? primary : '#E2E8F0'}`, background: filter === f ? `${primary}15` : '#fff', fontSize: '12.5px', fontWeight: '600', color: filter === f ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {f === 'all' ? 'All families' : f === 'outstanding' ? 'Owing' : 'Fully paid'}
          </button>
        ))}
        <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: 'auto' }}>{filtered.length} {filtered.length === 1 ? 'family' : 'families'}</span>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height: '72px', ...shimmer }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '60px 40px', textAlign: 'center' }}>
          <Users size={32} color="#CBD5E1" style={{ margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No families found</div>
          <div style={{ fontSize: '13px', color: '#64748B' }}>
            {search ? 'Try a different search.' : filter !== 'all' ? 'No families match this filter.' : 'Families appear once players are added and fees assigned.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(fam => {
            const isExpanded  = expandedKey === fam.key;
            const pct         = fam.total_invoiced > 0 ? Math.round((fam.total_paid / fam.total_invoiced) * 100) : 0;
            const barColor    = pct >= 80 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444';
            const totalRegs   = fam.players.flatMap(p => p.registrations).length;

            return (
              <div key={fam.key} style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${fam.has_overdue ? '#FECACA' : '#E2E8F0'}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>

                {/* ── Family row header ── */}
                <button onClick={() => setExpandedKey(isExpanded ? null : fam.key)}
                  style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', fontFamily: 'inherit', textAlign: 'left' }}>

                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: fam.has_overdue ? '#FEF2F2' : `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: fam.has_overdue ? '#EF4444' : primary, flexShrink: 0 }}>
                    {initials(fam.parent_name)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{fam.parent_name}</span>
                      {fam.has_overdue && <span style={{ fontSize: '10px', fontWeight: '700', color: '#EF4444', background: '#FEF2F2', border: '1px solid #FECACA', padding: '1px 6px', borderRadius: '4px' }}>OVERDUE</span>}
                      {totalRegs > 0 && <span style={{ fontSize: '10px', fontWeight: '600', color: '#3B82F6', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '1px 6px', borderRadius: '4px' }}>{totalRegs} reg{totalRegs !== 1 ? 's' : ''}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                      {fam.players.map(p => (
                        <span key={p.id} style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                          {p.full_name} <span style={{ color: '#CBD5E1' }}>·</span> {p.team_name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Collection bar */}
                  {fam.total_invoiced > 0 && (
                    <div style={{ width: '110px', flexShrink: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', color: '#94A3B8' }}>Collection</span>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: barColor }}>{pct}%</span>
                      </div>
                      <div style={{ height: '4px', background: '#F1F5F9', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: '2px' }} />
                      </div>
                    </div>
                  )}

                  {/* Balance */}
                  <div style={{ textAlign: 'right', minWidth: '80px', flexShrink: 0 }}>
                    {fam.total_owed > 0 ? (
                      <>
                        <div style={{ fontSize: '15px', fontWeight: '800', color: fam.has_overdue ? '#EF4444' : '#F59E0B', letterSpacing: '-0.3px' }}>${fmt(fam.total_owed)}</div>
                        <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>outstanding</div>
                      </>
                    ) : fam.total_invoiced > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                        <CheckCircle size={13} color="#22C55E" />
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#22C55E' }}>Paid up</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '11.5px', color: '#CBD5E1' }}>No fees</span>
                    )}
                  </div>

                  {isExpanded ? <ChevronUp size={14} color="#94A3B8" style={{ flexShrink: 0 }} /> : <ChevronDown size={14} color="#94A3B8" style={{ flexShrink: 0 }} />}
                </button>

                {/* ── Expanded ledger ── */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #F1F5F9', background: '#F8FAFC' }}>

                    {/* Contact bar */}
                    {fam.parent_email && (
                      <div style={{ padding: '10px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mail size={12} color="#94A3B8" />
                        <span style={{ fontSize: '12px', color: '#64748B' }}>{fam.parent_email}</span>
                        <a href={`mailto:${fam.parent_email}`}
                          style={{ fontSize: '11.5px', fontWeight: '700', color: primary, textDecoration: 'none', marginLeft: 'auto' }}>
                          Send email →
                        </a>
                      </div>
                    )}

                    {/* Per-player sections */}
                    {fam.players.map((player, pi) => (
                      <div key={player.id} style={{ borderBottom: pi < fam.players.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <div style={{ padding: '14px 20px 6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: primary, flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>{player.full_name}</span>
                          <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>· {player.team_name}</span>
                        </div>

                        {/* Fees */}
                        {player.fees.length === 0 && player.registrations.length === 0 ? (
                          <div style={{ fontSize: '12px', color: '#CBD5E1', fontStyle: 'italic', padding: '0 20px 14px 32px' }}>No fees or registrations</div>
                        ) : (
                          <div style={{ padding: '0 20px 12px 28px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {player.fees.map(fee => {
                              const owed = Math.max(fee.amount_due - fee.discount - fee.amount_paid, 0);
                              const cfg  = STATUS_CONFIG[fee.status] ?? STATUS_CONFIG.outstanding;
                              return (
                                <div key={fee.id} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '10px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', justifyContent: 'space-between' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#374151' }}>{fee.description}</div>
                                      {fee.due_date && (
                                        <div style={{ fontSize: '11px', color: fee.status === 'overdue' ? '#EF4444' : '#94A3B8', marginTop: '1px' }}>Due {fee.due_date}</div>
                                      )}
                                      {fee.payments.length > 0 && (
                                        <div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          {fee.payments.map(p => (
                                            <div key={p.id} style={{ fontSize: '11px', color: '#64748B' }}>
                                              ${fmt(p.amount)} via {p.method ?? 'unknown'} · {p.paid_at.slice(0, 10)}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                      <span style={{ display: 'inline-block', fontSize: '10.5px', fontWeight: '700', padding: '2px 7px', borderRadius: '4px', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginTop: '3px' }}>${fmt(fee.amount_due - fee.discount)}</div>
                                      {fee.discount > 0 && <div style={{ fontSize: '10.5px', color: '#8B5CF6' }}>−${fmt(fee.discount)} disc.</div>}
                                      {owed > 0 && <div style={{ fontSize: '11px', color: cfg.color, fontWeight: '700' }}>${fmt(owed)} owed</div>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Registrations */}
                            {player.registrations.map(reg => {
                              const cfg = REG_STATUS_CONFIG[reg.status] ?? { label: reg.status, color: '#64748B', bg: '#F8FAFC' };
                              return (
                                <div key={reg.id} style={{ background: '#EFF6FF', borderRadius: '8px', border: '1px solid #BFDBFE', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <FileText size={13} color="#3B82F6" style={{ flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#1E40AF' }}>{reg.form_title}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>{reg.created_at.slice(0, 10)}</div>
                                  </div>
                                  <span style={{ fontSize: '10.5px', fontWeight: '700', padding: '2px 7px', borderRadius: '4px', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Family totals footer */}
                    {fam.total_invoiced > 0 && (
                      <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '28px', alignItems: 'center', background: '#fff' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Invoiced</div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>${fmt(fam.total_invoiced)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Paid</div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#22C55E' }}>${fmt(fam.total_paid)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Balance</div>
                          <div style={{ fontSize: '15px', fontWeight: '800', color: fam.total_owed > 0 ? (fam.has_overdue ? '#EF4444' : '#F59E0B') : '#22C55E', letterSpacing: '-0.3px' }}>
                            {fam.total_owed > 0 ? `$${fmt(fam.total_owed)}` : '✓ Paid'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
