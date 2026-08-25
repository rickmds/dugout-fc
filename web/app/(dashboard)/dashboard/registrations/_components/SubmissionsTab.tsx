'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Download, Mail, CheckCircle, XCircle, Clock,
  AlertTriangle, Flag, Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  RegForm, Submission, SubStatus, PaymentStatus, FieldDef,
  SUB_STATUS_STYLES, PAY_STATUS_STYLES,
  fmtMoney, fmtDate, formFields, playerName, parentEmail,
} from './shared';
import SubmissionDetail from './SubmissionDetail';

// ── Internal types ────────────────────────────────────────────────────────────

interface FilterState {
  formId: string;
  status: SubStatus | '';
  payment: PaymentStatus | '';
  search: string;
  flagsOnly: boolean;
}

interface ActiveSub {
  sub: Submission;
  form: RegForm;
}

// ── Select option constants ───────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: SubStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'declined', label: 'Declined' },
];

const PAYMENT_OPTIONS: Array<{ value: PaymentStatus | ''; label: string }> = [
  { value: '', label: 'All payments' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'refunded', label: 'Refunded' },
];

// ── Shared inline style helpers ───────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  padding: '11px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  color: '#94A3B8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
};

const SELECT_STYLE: React.CSSProperties = {
  fontSize: '13px',
  padding: '7px 12px',
  borderRadius: '10px',
  border: '1px solid #E2E8F0',
  background: '#F8FAFC',
  color: '#334155',
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SubmissionsTab() {
  const { club, teams } = useDashboard();

  const primary =
    club?.primary_color && club.primary_color !== '#000000'
      ? club.primary_color
      : '#22C55E';

  // ── Data state ──────────────────────────────────────────────────────────────
  const [forms, setForms]           = useState<RegForm[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<FilterState>({
    formId: '', status: '', payment: '', search: '', flagsOnly: false,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeSub, setActiveSub]   = useState<ActiveSub | null>(null);
  const [showDuplicateBanner, setShowDuplicateBanner] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // ── Derived maps ────────────────────────────────────────────────────────────

  const formMap = useMemo(() => {
    const m = new Map<string, RegForm>();
    for (const f of forms) m.set(f.id, f);
    return m;
  }, [forms]);

  const teamMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.name);
    return m;
  }, [teams]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getTeamName = (form: RegForm): string =>
    form.team_id ? (teamMap.get(form.team_id) ?? '—') : '—';

  const formHasPrice = (form: RegForm): boolean =>
    form.price !== null && form.price !== undefined && form.price > 0;

  const anyFormHasPrice = forms.some(formHasPrice);

  // ── Duplicate detection ─────────────────────────────────────────────────────

  const detectDuplicates = useCallback(async (
    allForms: RegForm[],
    allSubs: Submission[],
  ) => {
    const toFlag: string[] = [];

    for (const form of allForms) {
      const formSubs = allSubs.filter(s => s.form_id === form.id);
      if (formSubs.length < 2) continue;

      const fingerprints = new Map<string, string[]>();

      for (const sub of formSubs) {
        const name  = playerName(sub.data).toLowerCase().trim();
        const email = parentEmail(sub.data).toLowerCase().trim();
        if (!name && !email) continue;

        const key = `${name}|${email}`;
        if (!fingerprints.has(key)) fingerprints.set(key, []);
        fingerprints.get(key)!.push(sub.id);
      }

      for (const ids of fingerprints.values()) {
        if (ids.length > 1) {
          for (const id of ids) {
            if (!toFlag.includes(id)) toFlag.push(id);
          }
        }
      }
    }

    if (toFlag.length > 0) {
      await supabase
        .from('registration_submissions')
        .update({ is_duplicate_flagged: true })
        .in('id', toFlag);

      setSubmissions(prev =>
        prev.map(s => ({
          ...s,
          is_duplicate_flagged: s.is_duplicate_flagged || toFlag.includes(s.id),
        })),
      );
      setShowDuplicateBanner(true);
    }
  }, []);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    setError(null);
    try {
      const { data: formsData, error: formsErr } = await supabase
        .from('registration_forms')
        .select('*')
        .eq('club_id', club.id)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (formsErr) throw formsErr;

      const loadedForms = (formsData ?? []) as RegForm[];
      setForms(loadedForms);

      if (loadedForms.length === 0) {
        setSubmissions([]);
        return;
      }

      const formIds = loadedForms.map(f => f.id);
      const { data: subsData, error: subsErr } = await supabase
        .from('registration_submissions')
        .select('*')
        .in('form_id', formIds)
        .order('submitted_at', { ascending: false });

      if (subsErr) throw subsErr;

      const loadedSubs = (subsData ?? []) as Submission[];
      setSubmissions(loadedSubs);

      await detectDuplicates(loadedForms, loadedSubs);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [club, detectDuplicates]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtered submissions ────────────────────────────────────────────────────

  const filteredSubs = useMemo(() => {
    return submissions.filter(sub => {
      if (filter.formId  && sub.form_id        !== filter.formId)  return false;
      if (filter.status  && sub.status         !== filter.status)  return false;
      if (filter.payment && sub.payment_status !== filter.payment) return false;
      if (filter.flagsOnly && !sub.is_duplicate_flagged && !sub.financial_aid_requested) return false;
      if (filter.search) {
        const q     = filter.search.toLowerCase();
        const name  = playerName(sub.data).toLowerCase();
        const email = parentEmail(sub.data).toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, filter]);

  // ── Selection ───────────────────────────────────────────────────────────────

  const allSelected =
    filteredSubs.length > 0 && filteredSubs.every(s => selectedIds.has(s.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSubs.map(s => s.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Bulk actions ────────────────────────────────────────────────────────────

  const handleBulkStatus = async (newStatus: SubStatus) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      if (newStatus === 'waitlisted') {
        // Group by form to assign sequential waitlist positions
        const byForm = new Map<string, string[]>();
        for (const id of selectedIds) {
          const sub = submissions.find(s => s.id === id);
          if (!sub) continue;
          if (!byForm.has(sub.form_id)) byForm.set(sub.form_id, []);
          byForm.get(sub.form_id)!.push(id);
        }

        for (const [formId, ids] of byForm) {
          const existing = submissions.filter(
            s => s.form_id === formId && s.status === 'waitlisted' && !selectedIds.has(s.id),
          );
          const maxPos = existing.length > 0
            ? Math.max(...existing.map(s => s.waitlist_position ?? 0))
            : 0;
          let nextPos = maxPos + 1;

          for (const id of ids) {
            await supabase
              .from('registration_submissions')
              .update({ status: 'waitlisted', waitlist_position: nextPos })
              .eq('id', id);
            nextPos += 1;
          }
        }
      } else if (newStatus === 'approved') {
        // Promoting off the waitlist needs the "a spot opened up" email and
        // resequencing everyone else's waitlist_position — route those
        // specific ids through the API (which does both) instead of a
        // plain status update; anything not currently waitlisted (e.g.
        // approving a fresh submission) can still go straight through.
        const toPromote = [...selectedIds].filter(id => submissions.find(s => s.id === id)?.status === 'waitlisted');
        const rest = [...selectedIds].filter(id => !toPromote.includes(id));

        if (toPromote.length > 0) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          for (const submission_id of toPromote) {
            await fetch('/api/registrations/promote-waitlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: JSON.stringify({ submission_id }),
            });
          }
        }
        if (rest.length > 0) {
          await supabase
            .from('registration_submissions')
            .update({ status: 'approved', waitlist_position: null })
            .in('id', rest);
        }
      } else {
        await supabase
          .from('registration_submissions')
          .update({ status: newStatus, waitlist_position: null })
          .in('id', [...selectedIds]);
      }

      await loadData();
      setSelectedIds(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkEmail = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const submissionArr = [...selectedIds];
      const uniqueFormIds = [...new Set(
        submissionArr
          .map(id => submissions.find(s => s.id === id)?.form_id)
          .filter((fid): fid is string => fid !== undefined),
      )];

      await fetch('/api/registrations/bulk-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          submission_ids: submissionArr,
          form_id: uniqueFormIds.length === 1 ? uniqueFormIds[0] : undefined,
        }),
      });

      setSelectedIds(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExportCSV = () => {
    const selected = submissions.filter(s => selectedIds.has(s.id));
    if (selected.length === 0) return;

    const relevantFormIds = [...new Set(selected.map(s => s.form_id))];
    const relevantForms   = relevantFormIds
      .map(id => formMap.get(id))
      .filter((f): f is RegForm => f !== undefined);

    // Collect unique field defs across relevant forms
    const allDefs: FieldDef[]                   = [];
    const defsByFormId = new Map<string, FieldDef[]>();

    for (const form of relevantForms) {
      const defs = formFields(form);
      defsByFormId.set(form.id, defs);
      for (const def of defs) {
        if (!allDefs.some(d => d.id === def.id)) allDefs.push(def);
      }
    }

    const baseHeaders = [
      'Player Name', 'Parent Email', 'Form', 'Team',
      'Status', 'Payment Status', 'Amount Due', 'Amount Paid', 'Submitted',
    ];
    const headers = [...baseHeaders, ...allDefs.map(d => d.label)];

    const rows = selected.map(sub => {
      const form     = formMap.get(sub.form_id);
      const defs     = defsByFormId.get(sub.form_id) ?? [];
      const teamName = form ? getTeamName(form) : '';

      const base = [
        playerName(sub.data),
        parentEmail(sub.data),
        form?.title ?? '',
        teamName,
        sub.status,
        sub.payment_status,
        form ? fmtMoney(sub.amount_due, form.currency) : (sub.amount_due?.toString() ?? ''),
        form ? fmtMoney(sub.amount_paid, form.currency) : sub.amount_paid.toString(),
        fmtDate(sub.submitted_at),
      ];

      const fieldVals = allDefs.map(def => {
        const hasDef = defs.some(d => d.id === def.id);
        if (!hasDef) return '';
        return sub.data[def.id] ?? '';
      });

      return [...base, ...fieldVals];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectSub = (sub: Submission, form: RegForm) => {
    setActiveSub({ sub, form });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', color: '#94A3B8', fontSize: '14px',
      }}>
        Loading submissions…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        margin: '24px', padding: '16px 20px', borderRadius: '12px',
        background: '#FEF2F2', border: '1px solid #FECACA',
        color: '#DC2626', fontSize: '13px',
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100%' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
          All submissions
        </h1>
        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
          {submissions.length} total · {filteredSubs.length} shown
        </p>
      </div>

      {/* ── Duplicate banner ────────────────────────────────────────────────── */}
      {showDuplicateBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: '#FFFBEB', border: '1px solid #F59E0B',
          borderRadius: '10px', padding: '12px 16px', marginBottom: '16px',
        }}>
          <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: '#92400E', flex: 1 }}>
            Potential duplicate submissions detected. Rows marked &quot;Duplicate?&quot; are highlighted below.
          </span>
          <button
            onClick={() => setShowDuplicateBanner(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#D97706', fontSize: '20px', lineHeight: 1, padding: '0 2px',
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
        background: '#fff', border: '1px solid #E2E8F0',
        borderRadius: '14px', padding: '14px 16px', marginBottom: '14px',
      }}>
        {/* Form selector */}
        <select
          value={filter.formId}
          onChange={e => setFilter(f => ({ ...f, formId: e.target.value }))}
          style={SELECT_STYLE}
        >
          <option value="">All forms</option>
          {forms.map(form => (
            <option key={form.id} value={form.id}>{form.title}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value as SubStatus | '' }))}
          style={SELECT_STYLE}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Payment filter */}
        <select
          value={filter.payment}
          onChange={e => setFilter(f => ({ ...f, payment: e.target.value as PaymentStatus | '' }))}
          style={SELECT_STYLE}
        >
          {PAYMENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute', left: '10px', top: '50%',
              transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search player or parent email…"
            value={filter.search}
            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            style={{
              width: '100%', fontSize: '13px', padding: '7px 12px 7px 32px',
              borderRadius: '10px', border: '1px solid #E2E8F0',
              background: '#F8FAFC', color: '#334155', outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Flags toggle */}
        <button
          onClick={() => setFilter(f => ({ ...f, flagsOnly: !f.flagsOnly }))}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '13px', padding: '7px 14px', borderRadius: '8px',
            border: filter.flagsOnly ? `1.5px solid ${primary}` : '1px solid #E2E8F0',
            background: filter.flagsOnly ? `${primary}18` : '#F8FAFC',
            color: filter.flagsOnly ? primary : '#64748B',
            cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          <Flag size={13} />
          Flagged only
        </button>
      </div>

      {/* ── Bulk actions bar ────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          background: '#1E293B', borderRadius: '10px',
          padding: '10px 16px', marginBottom: '12px',
        }}>
          <span style={{ fontSize: '13px', color: '#94A3B8', marginRight: '6px', whiteSpace: 'nowrap' }}>
            {selectedIds.size} selected
          </span>

          <button
            onClick={() => handleBulkStatus('approved')}
            disabled={bulkLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', fontWeight: 600, padding: '5px 13px',
              borderRadius: '8px', border: 'none', cursor: bulkLoading ? 'not-allowed' : 'pointer',
              background: '#22C55E', color: '#fff', fontFamily: 'inherit', opacity: bulkLoading ? 0.6 : 1,
            }}
          >
            <CheckCircle size={12} /> Approve
          </button>

          <button
            onClick={() => handleBulkStatus('declined')}
            disabled={bulkLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', fontWeight: 600, padding: '5px 13px',
              borderRadius: '8px', border: 'none', cursor: bulkLoading ? 'not-allowed' : 'pointer',
              background: '#EF4444', color: '#fff', fontFamily: 'inherit', opacity: bulkLoading ? 0.6 : 1,
            }}
          >
            <XCircle size={12} /> Decline
          </button>

          <button
            onClick={() => handleBulkStatus('waitlisted')}
            disabled={bulkLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', fontWeight: 600, padding: '5px 13px',
              borderRadius: '8px', border: 'none', cursor: bulkLoading ? 'not-allowed' : 'pointer',
              background: '#F59E0B', color: '#fff', fontFamily: 'inherit', opacity: bulkLoading ? 0.6 : 1,
            }}
          >
            <Clock size={12} /> Waitlist
          </button>

          <button
            onClick={handleExportCSV}
            disabled={bulkLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', fontWeight: 600, padding: '5px 13px',
              borderRadius: '8px', border: '1px solid #475569',
              background: 'transparent', color: '#CBD5E1',
              cursor: bulkLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: bulkLoading ? 0.6 : 1,
            }}
          >
            <Download size={12} /> Export CSV
          </button>

          <button
            onClick={handleBulkEmail}
            disabled={bulkLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', fontWeight: 600, padding: '5px 13px',
              borderRadius: '8px', border: '1px solid #475569',
              background: 'transparent', color: '#CBD5E1',
              cursor: bulkLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: bulkLoading ? 0.6 : 1,
            }}
          >
            <Mail size={12} /> Email selected
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              marginLeft: 'auto', fontSize: '12px', padding: '5px 10px',
              borderRadius: '8px', border: 'none',
              background: 'transparent', color: '#64748B',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Table / Empty state ─────────────────────────────────────────────── */}
      {filteredSubs.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '16px',
          background: '#fff', border: '1px solid #E2E8F0',
          borderRadius: '14px', padding: '64px 24px',
        }}>
          <Users size={44} color="#CBD5E1" />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#334155', margin: '0 0 6px' }}>
              No submissions found
            </p>
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>
              {filter.search || filter.formId || filter.status || filter.payment || filter.flagsOnly
                ? 'Try adjusting your filters.'
                : 'Submissions will appear here once families start registering.'}
            </p>
          </div>
        </div>
      ) : (
        <div style={{
          background: '#fff', border: '1px solid #E2E8F0',
          borderRadius: '14px', overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead>
                <tr style={{ background: '#1E293B' }}>
                  {/* Checkbox */}
                  <th style={{ ...TH_STYLE, width: '44px', padding: '11px 16px' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer', accentColor: primary } as React.CSSProperties}
                      aria-label="Select all"
                    />
                  </th>
                  <th style={TH_STYLE}>Player</th>
                  <th style={TH_STYLE}>Form</th>
                  <th style={TH_STYLE}>Team</th>
                  <th style={TH_STYLE}>Status</th>
                  {anyFormHasPrice && <th style={TH_STYLE}>Payment</th>}
                  <th style={TH_STYLE}>Submitted</th>
                  <th style={TH_STYLE}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.map((sub, idx) => {
                  const form       = formMap.get(sub.form_id);
                  const isSelected = selectedIds.has(sub.id);
                  const isDuplicate = sub.is_duplicate_flagged;
                  const isAid      = sub.financial_aid_requested;
                  const subStyle   = SUB_STATUS_STYLES[sub.status];
                  const payStyle   = PAY_STATUS_STYLES[sub.payment_status];

                  let rowBg = idx % 2 === 0 ? '#fff' : '#F8FAFC';
                  if (isSelected) rowBg = `${primary}0c`;
                  if (isDuplicate && !isSelected) rowBg = '#FFFBEB';

                  return (
                    <tr
                      key={sub.id}
                      onClick={() => { if (form) handleSelectSub(sub, form); }}
                      style={{
                        background: rowBg,
                        borderTop: '1px solid #E2E8F0',
                        cursor: form ? 'pointer' : 'default',
                      }}
                    >
                      {/* Checkbox */}
                      <td
                        style={{ padding: '11px 16px' }}
                        onClick={e => { e.stopPropagation(); toggleOne(sub.id); }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(sub.id)}
                          style={{ cursor: 'pointer', accentColor: primary } as React.CSSProperties}
                          aria-label="Select row"
                        />
                      </td>

                      {/* Player name + parent email */}
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                          {playerName(sub.data)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                          {parentEmail(sub.data)}
                        </div>
                      </td>

                      {/* Form title */}
                      <td style={{ padding: '11px 16px', fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>
                        {form?.title ?? '—'}
                      </td>

                      {/* Team */}
                      <td style={{ padding: '11px 16px', fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>
                        {form ? getTeamName(form) : '—'}
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          fontSize: '11px', fontWeight: 700,
                          padding: '3px 10px', borderRadius: '20px',
                          color: subStyle.color, background: subStyle.bg,
                          whiteSpace: 'nowrap',
                        }}>
                          {subStyle.label}
                          {sub.status === 'waitlisted' && sub.waitlist_position !== null
                            ? ` #${sub.waitlist_position}`
                            : ''}
                        </span>
                      </td>

                      {/* Payment badge */}
                      {anyFormHasPrice && (
                        <td style={{ padding: '11px 16px' }}>
                          {form && formHasPrice(form) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '11px', fontWeight: 700,
                                padding: '3px 10px', borderRadius: '20px',
                                color: payStyle.color, background: payStyle.bg,
                                whiteSpace: 'nowrap',
                              }}>
                                {payStyle.label}
                              </span>
                              {(sub.amount_paid > 0 || sub.amount_due !== null) && (
                                <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                                  {fmtMoney(sub.amount_paid, form.currency)} / {fmtMoney(sub.amount_due, form.currency)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#CBD5E1' }}>—</span>
                          )}
                        </td>
                      )}

                      {/* Submitted date */}
                      <td style={{ padding: '11px 16px', fontSize: '13px', color: '#64748B', whiteSpace: 'nowrap' }}>
                        {fmtDate(sub.submitted_at)}
                      </td>

                      {/* Flags */}
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {isDuplicate && (
                            <span style={{
                              fontSize: '10px', fontWeight: 700,
                              padding: '2px 8px', borderRadius: '20px',
                              background: '#FED7AA', color: '#C2410C',
                              whiteSpace: 'nowrap',
                            }}>
                              Duplicate?
                            </span>
                          )}
                          {isAid && (
                            <span style={{
                              fontSize: '10px', fontWeight: 700,
                              padding: '2px 8px', borderRadius: '20px',
                              background: '#EDE9FE', color: '#7C3AED',
                              whiteSpace: 'nowrap',
                            }}>
                              Aid request
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Submission detail modal ─────────────────────────────────────────── */}
      {activeSub && (
        <SubmissionDetail
          sub={activeSub.sub}
          form={activeSub.form}
          onUpdated={loadData}
          onClose={() => {
            setActiveSub(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
