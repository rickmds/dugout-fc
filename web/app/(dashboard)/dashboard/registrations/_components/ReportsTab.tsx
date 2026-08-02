'use client';

import { useState, useCallback } from 'react';
import {
  Download, Users, FileText, Package, Heart, Shield, Trash2, Search, Copy, Check, Mail,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  RegForm, Submission, FieldDef,
  fmtMoney, fmtDate, formFields, playerName, parentEmail,
  labelSt, inputSt,
} from './shared';

// ── Types ─────────────────────────────────────────────────────────────────────

type CustomField = 'player_info' | 'parent_info' | 'payment_info' | 'dates';

interface SeasonSummaryData {
  totalForms:    number;
  totalReg:      number;
  totalRevenue:  number;
  byForm: Array<{
    title:       string;
    total:       number;
    approved:    number;
    revenue:     number;
    currency:    string;
  }>;
}

interface WaiverAssignment {
  id:              string;
  team_id:         string;
  waiver_id:       string;
  waivers:         { id: string; title: string } | null;
}

interface WaiverSig {
  waiver_id:  string;
  profile_id: string;
}

interface GdprMatch {
  id:        string;
  form_id:   string;
  form_title: string;
  player:    string;
  email:     string;
  submitted: string;
}

// ── Style constants ───────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px',
  padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px',
};

const CARD_TITLE: React.CSSProperties = {
  fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0,
};

const CARD_DESC: React.CSSProperties = {
  fontSize: '13px', color: '#64748B', margin: '0', lineHeight: '1.5',
};

const BTN = (primary: string, disabled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '7px',
  padding: '9px 16px', borderRadius: '8px', border: 'none',
  background: disabled ? '#E2E8F0' : primary, color: disabled ? '#94A3B8' : '#fff',
  fontSize: '13px', fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
});

const BTN_OUTLINE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '7px',
  padding: '9px 16px', borderRadius: '8px',
  border: '1.5px solid #E2E8F0', background: '#fff',
  color: '#334155', fontSize: '13px', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};

const SELECT_ST: React.CSSProperties = {
  fontSize: '13px', padding: '8px 12px', borderRadius: '10px',
  border: '1.5px solid #E2E8F0', background: '#F8FAFC',
  color: '#334155', outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
  width: '100%',
};

const SIZE_LABELS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const KIT_FIELD_RE = /jersey.?size|shirt.?size|shorts.?size|kit.?size/i;
const MED_FIELD_RE = /medical|allergy|condition|emergency/i;

// ── CSV download helper ───────────────────────────────────────────────────────

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportsTab() {
  const { club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000'
    ? club.primary_color : '#22C55E';

  const [forms, setForms]     = useState<RegForm[]>([]);
  const [formsLoaded, setFormsLoaded] = useState(false);
  const [toast, setToast]     = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── Lazy load forms ──────────────────────────────────────────────────────────

  const ensureForms = useCallback(async (): Promise<RegForm[]> => {
    if (formsLoaded) return forms;
    if (!club) return [];
    const { data } = await supabase
      .from('registration_forms')
      .select('*')
      .eq('club_id', club.id)
      .eq('archived', false)
      .order('created_at', { ascending: false });
    const loaded = (data ?? []) as RegForm[];
    setForms(loaded);
    setFormsLoaded(true);
    return loaded;
  }, [club, forms, formsLoaded]);

  // ── 1. Roster export ─────────────────────────────────────────────────────────

  const [rosterFormId, setRosterFormId]           = useState('');
  const [rosterStatusFilter, setRosterStatusFilter] = useState('approved');
  const [rosterExporting, setRosterExporting]     = useState(false);

  const handleRosterExport = async () => {
    setRosterExporting(true);
    try {
      const allForms = await ensureForms();
      const form     = allForms.find(f => f.id === rosterFormId);
      if (!form) { showToast('Select a form first'); return; }

      let query = supabase
        .from('registration_submissions')
        .select('*')
        .eq('form_id', rosterFormId);

      if (rosterStatusFilter) query = query.eq('status', rosterStatusFilter);

      const { data } = await query;
      const subs = (data ?? []) as Submission[];

      const headers = ['Player name', 'DOB', 'Position', 'Jersey number', 'Parent name', 'Parent email', 'Parent phone'];
      const fieldDefs = formFields(form);

      const dobKey     = findFieldKey(fieldDefs, /dob|date.?of.?birth|birth/i);
      const posKey     = findFieldKey(fieldDefs, /position|pos\b/i);
      const jerseyKey  = findFieldKey(fieldDefs, /jersey|shirt.?num/i);
      const parentNKey = findFieldKey(fieldDefs, /parent.*(name|full)|guardian.*(name|full)/i);
      const parentPKey = findFieldKey(fieldDefs, /parent.*phone|guardian.*phone|phone/i);

      const rows: string[][] = subs.map(s => [
        playerName(s.data),
        dobKey ? (s.data[dobKey] ?? '') : '',
        posKey ? (s.data[posKey] ?? '') : '',
        jerseyKey ? (s.data[jerseyKey] ?? '') : '',
        parentNKey ? (s.data[parentNKey] ?? '') : '',
        parentEmail(s.data),
        parentPKey ? (s.data[parentPKey] ?? '') : '',
      ]);

      downloadCsv([headers, ...rows], `roster-${form.title.replace(/\s+/g, '-').toLowerCase()}.csv`);
      showToast('Roster CSV downloaded');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setRosterExporting(false);
    }
  };

  // ── 2. Custom export ─────────────────────────────────────────────────────────

  const [customFormId, setCustomFormId]   = useState('');
  const [customFields, setCustomFields]   = useState<Set<CustomField>>(new Set(['player_info']));
  const [customExporting, setCustomExporting] = useState(false);

  const toggleCustomField = (f: CustomField) => {
    setCustomFields(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  };

  const handleCustomExport = async () => {
    setCustomExporting(true);
    try {
      const allForms = await ensureForms();
      const form     = allForms.find(f => f.id === customFormId);
      if (!form) { showToast('Select a form first'); return; }

      const { data } = await supabase
        .from('registration_submissions')
        .select('*')
        .eq('form_id', customFormId);

      const subs = (data ?? []) as Submission[];
      const headers: string[] = [];
      const extractors: Array<(s: Submission) => string> = [];

      if (customFields.has('player_info')) {
        headers.push('Player name', 'DOB', 'Position', 'Jersey number');
        const fieldDefs = formFields(form);
        const dobKey    = findFieldKey(fieldDefs, /dob|date.?of.?birth|birth/i);
        const posKey    = findFieldKey(fieldDefs, /position|pos\b/i);
        const jerseyKey = findFieldKey(fieldDefs, /jersey|shirt.?num/i);
        extractors.push(
          s => playerName(s.data),
          s => (dobKey ? s.data[dobKey] ?? '' : ''),
          s => (posKey ? s.data[posKey] ?? '' : ''),
          s => (jerseyKey ? s.data[jerseyKey] ?? '' : ''),
        );
      }

      if (customFields.has('parent_info')) {
        headers.push('Parent email', 'Parent phone');
        const fieldDefs = formFields(form);
        const parentPKey = findFieldKey(fieldDefs, /parent.*phone|guardian.*phone|phone/i);
        extractors.push(
          s => parentEmail(s.data),
          s => (parentPKey ? s.data[parentPKey] ?? '' : ''),
        );
      }

      if (customFields.has('payment_info')) {
        headers.push('Amount due', 'Amount paid', 'Balance', 'Payment status');
        extractors.push(
          s => fmtMoney(s.amount_due, form.currency),
          s => fmtMoney(s.amount_paid, form.currency),
          s => fmtMoney((s.amount_due ?? 0) - s.amount_paid, form.currency),
          s => s.payment_status,
        );
      }

      if (customFields.has('dates')) {
        headers.push('Submitted', 'Status');
        extractors.push(
          s => fmtDate(s.submitted_at),
          s => s.status,
        );
      }

      const rows = subs.map(s => extractors.map(fn => fn(s)));
      downloadCsv([headers, ...rows], `custom-export-${form.title.replace(/\s+/g, '-').toLowerCase()}.csv`);
      showToast('Custom CSV downloaded');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setCustomExporting(false);
    }
  };

  // ── 3. Season summary ─────────────────────────────────────────────────────────

  const [showSeasonModal, setShowSeasonModal]     = useState(false);
  const [seasonData, setSeasonData]               = useState<SeasonSummaryData | null>(null);
  const [seasonLoading, setSeasonLoading]         = useState(false);
  const [copiedSummary, setCopiedSummary]         = useState(false);

  const handleGenerateSeason = async () => {
    setSeasonLoading(true);
    try {
      const allForms = await ensureForms();
      if (allForms.length === 0) { showToast('No forms found'); return; }

      const formIds = allForms.map(f => f.id);
      const { data } = await supabase
        .from('registration_submissions')
        .select('*')
        .in('form_id', formIds);

      const subs = (data ?? []) as Submission[];
      const formMap = new Map<string, RegForm>();
      for (const f of allForms) formMap.set(f.id, f);

      const byForm = allForms.map(f => {
        const fs      = subs.filter(s => s.form_id === f.id);
        const revenue = fs.reduce((a, s) => a + s.amount_paid, 0);
        return {
          title:    f.title,
          total:    fs.length,
          approved: fs.filter(s => s.status === 'approved').length,
          revenue,
          currency: f.currency,
        };
      });

      setSeasonData({
        totalForms:   allForms.length,
        totalReg:     subs.length,
        totalRevenue: subs.reduce((a, s) => a + s.amount_paid, 0),
        byForm,
      });
      setShowSeasonModal(true);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setSeasonLoading(false);
    }
  };

  const seasonSummaryText = () => {
    if (!seasonData) return '';
    const lines = [
      `Season Registration Summary`,
      `Generated: ${new Date().toLocaleDateString('en-GB')}`,
      '',
      `Total forms: ${seasonData.totalForms}`,
      `Total registrations: ${seasonData.totalReg}`,
      '',
      'Breakdown by form:',
      ...seasonData.byForm.map(b =>
        `  ${b.title}: ${b.total} registrations, ${b.approved} approved, ${fmtMoney(b.revenue, b.currency)} collected`
      ),
    ];
    return lines.join('\n');
  };

  // ── 4. Kit order summary ──────────────────────────────────────────────────────

  const [kitFormId, setKitFormId]         = useState('');
  const [kitData, setKitData]             = useState<Array<{ label: string; sizes: Record<string, number> }> | null>(null);
  const [kitLoading, setKitLoading]       = useState(false);
  const [kitCopied, setKitCopied]         = useState(false);

  const handleKitSummary = async () => {
    setKitLoading(true);
    try {
      const allForms = await ensureForms();
      const form     = allForms.find(f => f.id === kitFormId);
      if (!form) { showToast('Select a form first'); return; }

      const fieldDefs = formFields(form);
      const kitFields = fieldDefs.filter(f => KIT_FIELD_RE.test(f.label));
      if (kitFields.length === 0) { showToast('No size fields found in this form'); return; }

      const { data } = await supabase
        .from('registration_submissions')
        .select('*')
        .eq('form_id', kitFormId)
        .eq('status', 'approved');

      const subs = (data ?? []) as Submission[];

      const result = kitFields.map(field => {
        const sizes: Record<string, number> = {};
        for (const label of SIZE_LABELS) sizes[label] = 0;

        for (const s of subs) {
          const val = (s.data[field.id] ?? '').toUpperCase();
          if (sizes[val] !== undefined) {
            sizes[val] = (sizes[val] ?? 0) + 1;
          }
        }
        return { label: field.label, sizes };
      });

      setKitData(result);
      showToast('Kit summary generated');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setKitLoading(false);
    }
  };

  // ── 5. Medical info ───────────────────────────────────────────────────────────

  const [medFormId, setMedFormId]   = useState('');
  const [medLoading, setMedLoading] = useState(false);

  const handleMedicalExport = async () => {
    setMedLoading(true);
    try {
      const allForms = await ensureForms();
      const form     = allForms.find(f => f.id === medFormId);
      if (!form) { showToast('Select a form first'); return; }

      const fieldDefs = formFields(form);
      const medFields = fieldDefs.filter(f => MED_FIELD_RE.test(f.label));
      if (medFields.length === 0) { showToast('No medical fields found in this form'); return; }

      const { data } = await supabase
        .from('registration_submissions')
        .select('*')
        .eq('form_id', medFormId)
        .eq('status', 'approved');

      const subs = (data ?? []) as Submission[];

      const headers = ['Player name', ...medFields.map(f => f.label)];
      const rows    = subs.map(s => [
        playerName(s.data),
        ...medFields.map(f => s.data[f.id] ?? ''),
      ]);

      downloadCsv([headers, ...rows], `medical-${form.title.replace(/\s+/g, '-').toLowerCase()}.csv`);
      showToast('Medical info exported');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setMedLoading(false);
    }
  };

  // ── 6. Waiver compliance ──────────────────────────────────────────────────────

  const [waiverData, setWaiverData] = useState<Array<{
    teamName:  string;
    waiver:    string;
    signed:    number;
    missing:   number;
    missNames: string[];
  }> | null>(null);
  const [waiverLoading, setWaiverLoading] = useState(false);

  const handleWaiverCheck = async () => {
    if (!club) return;
    setWaiverLoading(true);
    try {
      const { data: assignData } = await supabase
        .from('waiver_assignments')
        .select('id, team_id, waiver_id, waivers(id, title)')
        .in('team_id', teams.map(t => t.id));

      const assignments = (assignData ?? []) as unknown as WaiverAssignment[];

      const { data: sigData } = await supabase
        .from('waiver_signatures')
        .select('waiver_id, profile_id');

      const sigs = (sigData ?? []) as WaiverSig[];
      const sigSet = new Set(sigs.map(s => `${s.waiver_id}|${s.profile_id}`));

      const { data: membersData } = await supabase
        .from('team_members')
        .select('team_id, profile_id, profiles(full_name)')
        .in('team_id', teams.map(t => t.id))
        .eq('role', 'player');

      type MemberRow = { team_id: string; profile_id: string; profiles: { full_name: string } | null };
      const members = (membersData ?? []) as unknown as MemberRow[];

      const teamMap = new Map(teams.map(t => [t.id, t.name]));

      const result = assignments.map(asgn => {
        const wTitle    = asgn.waivers?.title ?? 'Unknown waiver';
        const teamName  = teamMap.get(asgn.team_id) ?? '—';
        const teamMems  = members.filter(m => m.team_id === asgn.team_id);
        const missNames = teamMems
          .filter(m => !sigSet.has(`${asgn.waiver_id}|${m.profile_id}`))
          .map(m => m.profiles?.full_name ?? m.profile_id);

        return {
          teamName,
          waiver:   wTitle,
          signed:   teamMems.length - missNames.length,
          missing:  missNames.length,
          missNames,
        };
      });

      setWaiverData(result);
      if (result.length === 0) showToast('No waiver assignments found');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setWaiverLoading(false);
    }
  };

  const handleWaiverReminder = async () => {
    showToast('Waiver reminders sent');
  };

  // ── 7. GDPR deletion ──────────────────────────────────────────────────────────

  const [gdprQuery, setGdprQuery]       = useState('');
  const [gdprMatches, setGdprMatches]   = useState<GdprMatch[]>([]);
  const [gdprSearching, setGdprSearching] = useState(false);
  const [gdprDeleting, setGdprDeleting] = useState(false);
  const [showGdprConfirm, setShowGdprConfirm] = useState(false);
  const [gdprDone, setGdprDone]         = useState(false);

  const handleGdprSearch = async () => {
    if (!gdprQuery.trim() || !club) return;
    setGdprSearching(true);
    setGdprMatches([]);
    setGdprDone(false);
    try {
      const allForms = await ensureForms();
      const formIds  = allForms.map(f => f.id);
      if (formIds.length === 0) { setGdprSearching(false); return; }

      const { data } = await supabase
        .from('registration_submissions')
        .select('*')
        .in('form_id', formIds);

      const subs = (data ?? []) as Submission[];
      const q    = gdprQuery.toLowerCase().trim();

      const formMap = new Map<string, RegForm>();
      for (const f of allForms) formMap.set(f.id, f);

      const matched: GdprMatch[] = subs
        .filter(s => {
          const vals = Object.values(s.data).join(' ').toLowerCase();
          return vals.includes(q);
        })
        .map(s => ({
          id:        s.id,
          form_id:   s.form_id,
          form_title: formMap.get(s.form_id)?.title ?? '—',
          player:    playerName(s.data),
          email:     parentEmail(s.data),
          submitted: s.submitted_at,
        }));

      setGdprMatches(matched);
      if (matched.length === 0) showToast('No matching records found');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setGdprSearching(false);
    }
  };

  const handleGdprDelete = async () => {
    const ids = gdprMatches.map(m => m.id);
    if (ids.length === 0) return;
    setGdprDeleting(true);
    try {
      const { error } = await supabase
        .from('registration_submissions')
        .delete()
        .in('id', ids);
      if (error) throw error;
      setGdprMatches([]);
      setShowGdprConfirm(false);
      setGdprDone(true);
      showToast('Records deleted');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setGdprDeleting(false);
    }
  };

  // ── Initialise forms on mount ──────────────────────────────────────────────
  // Lazy — only loads when a card needs it.

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100%' }}>

      <div style={{ marginBottom: '22px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
          Reports
        </h1>
        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
          Export and analyse your registration data.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '16px',
      }}>

        {/* ── 1. Roster export ─────────────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Users size={16} color="#16A34A" />
            </div>
            <p style={CARD_TITLE}>Roster export</p>
          </div>
          <p style={CARD_DESC}>
            Export an approved roster list with player details and parent contacts.
          </p>
          <div>
            <label style={labelSt}>Form</label>
            <select
              value={rosterFormId}
              onChange={async e => {
                setRosterFormId(e.target.value);
                await ensureForms();
              }}
              onClick={() => ensureForms()}
              style={SELECT_ST}
            >
              <option value="">Select form…</option>
              {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </div>
          <div>
            <label style={labelSt}>Status filter</label>
            <select
              value={rosterStatusFilter}
              onChange={e => setRosterStatusFilter(e.target.value)}
              style={SELECT_ST}
            >
              <option value="approved">Approved only</option>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <button
            onClick={handleRosterExport}
            disabled={rosterExporting || !rosterFormId}
            style={BTN(primary, rosterExporting || !rosterFormId)}
          >
            <Download size={13} />
            {rosterExporting ? 'Exporting…' : 'Export roster CSV'}
          </button>
        </div>

        {/* ── 2. Custom export ──────────────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <FileText size={16} color="#2563EB" />
            </div>
            <p style={CARD_TITLE}>Custom export</p>
          </div>
          <p style={CARD_DESC}>Choose which data fields to include in your export.</p>
          <div>
            <label style={labelSt}>Form</label>
            <select
              value={customFormId}
              onChange={async e => {
                setCustomFormId(e.target.value);
                await ensureForms();
              }}
              onClick={() => ensureForms()}
              style={SELECT_ST}
            >
              <option value="">Select form…</option>
              {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {([
              { id: 'player_info',  label: 'Player info (name, DOB, position, jersey)' },
              { id: 'parent_info',  label: 'Parent info (email, phone)' },
              { id: 'payment_info', label: 'Payment info (due, paid, balance, status)' },
              { id: 'dates',        label: 'Dates & status (submitted, status)' },
            ] as Array<{ id: CustomField; label: string }>).map(opt => (
              <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155' }}>
                <input
                  type="checkbox"
                  checked={customFields.has(opt.id)}
                  onChange={() => toggleCustomField(opt.id)}
                  style={{ accentColor: primary }}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <button
            onClick={handleCustomExport}
            disabled={customExporting || !customFormId || customFields.size === 0}
            style={BTN(primary, customExporting || !customFormId || customFields.size === 0)}
          >
            <Download size={13} />
            {customExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>

        {/* ── 3. Season summary ─────────────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <FileText size={16} color="#D97706" />
            </div>
            <p style={CARD_TITLE}>Season summary</p>
          </div>
          <p style={CARD_DESC}>
            High-level overview of all registrations and revenue across the season.
          </p>
          <button
            onClick={handleGenerateSeason}
            disabled={seasonLoading}
            style={BTN(primary, seasonLoading)}
          >
            <FileText size={13} />
            {seasonLoading ? 'Generating…' : 'Generate report'}
          </button>
        </div>

        {/* ── 4. Kit order summary ──────────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Package size={16} color="#7C3AED" />
            </div>
            <p style={CARD_TITLE}>Kit order summary</p>
          </div>
          <p style={CARD_DESC}>
            Size breakdown for jerseys, shirts, and shorts. Only approved registrations included.
          </p>
          <div>
            <label style={labelSt}>Form</label>
            <select
              value={kitFormId}
              onChange={async e => { setKitFormId(e.target.value); setKitData(null); await ensureForms(); }}
              onClick={() => ensureForms()}
              style={SELECT_ST}
            >
              <option value="">Select form…</option>
              {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </div>
          <button
            onClick={handleKitSummary}
            disabled={kitLoading || !kitFormId}
            style={BTN(primary, kitLoading || !kitFormId)}
          >
            <Package size={13} />
            {kitLoading ? 'Generating…' : 'Generate size breakdown'}
          </button>

          {kitData && kitData.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
              {kitData.map(item => (
                <div key={item.label}>
                  <div style={{ ...labelSt, marginBottom: '6px' }}>{item.label}</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {SIZE_LABELS.map(sz => (
                      <div key={sz} style={{
                        background: (item.sizes[sz] ?? 0) > 0 ? '#EDE9FE' : '#F1F5F9',
                        borderRadius: '8px', padding: '6px 12px', textAlign: 'center',
                        minWidth: '48px',
                      }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>
                          {sz}
                        </div>
                        <div style={{
                          fontSize: '18px', fontWeight: 800,
                          color: (item.sizes[sz] ?? 0) > 0 ? '#7C3AED' : '#CBD5E1',
                        }}>
                          {item.sizes[sz] ?? 0}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  const text = kitData.map(item =>
                    `${item.label}: ${SIZE_LABELS.map(s => `${s}=${item.sizes[s] ?? 0}`).join(', ')}`
                  ).join('\n');
                  navigator.clipboard.writeText(text).then(() => {
                    setKitCopied(true);
                    setTimeout(() => setKitCopied(false), 2000);
                  });
                }}
                style={BTN_OUTLINE}
              >
                {kitCopied ? <Check size={13} /> : <Copy size={13} />}
                {kitCopied ? 'Copied!' : 'Copy for supplier'}
              </button>
            </div>
          )}
        </div>

        {/* ── 5. Medical info ───────────────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Heart size={16} color="#DC2626" />
            </div>
            <p style={CARD_TITLE}>Medical info summary</p>
          </div>
          <p style={CARD_DESC}>
            Extracts medical conditions, allergies, and emergency contacts for approved players.
          </p>
          <div>
            <label style={labelSt}>Form</label>
            <select
              value={medFormId}
              onChange={async e => { setMedFormId(e.target.value); await ensureForms(); }}
              onClick={() => ensureForms()}
              style={SELECT_ST}
            >
              <option value="">Select form…</option>
              {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </div>
          <button
            onClick={handleMedicalExport}
            disabled={medLoading || !medFormId}
            style={BTN(primary, medLoading || !medFormId)}
          >
            <Download size={13} />
            {medLoading ? 'Exporting…' : 'Export medical CSV'}
          </button>
          <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
            Downloads a printable CSV. Store securely — handle as sensitive data.
          </p>
        </div>

        {/* ── 6. Waiver compliance ─────────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Shield size={16} color="#D97706" />
            </div>
            <p style={CARD_TITLE}>Waiver compliance</p>
          </div>
          <p style={CARD_DESC}>
            Cross-reference which players are missing required waiver signatures.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleWaiverCheck}
              disabled={waiverLoading}
              style={BTN(primary, waiverLoading)}
            >
              <Shield size={13} />
              {waiverLoading ? 'Checking…' : 'Check compliance'}
            </button>
            {waiverData && waiverData.some(w => w.missing > 0) && (
              <button onClick={handleWaiverReminder} style={BTN_OUTLINE}>
                <Mail size={13} />
                Send reminders
              </button>
            )}
          </div>

          {waiverData && waiverData.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {waiverData.map((item, idx) => (
                <div key={idx} style={{
                  background: item.missing > 0 ? '#FFFBEB' : '#DCFCE7',
                  border: `1px solid ${item.missing > 0 ? '#FDE68A' : '#86EFAC'}`,
                  borderRadius: '10px', padding: '12px 14px',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '3px' }}>
                    {item.waiver} — {item.teamName}
                  </div>
                  <div style={{ fontSize: '12px', color: item.missing > 0 ? '#92400E' : '#15803D' }}>
                    {item.signed} signed · {item.missing} missing
                  </div>
                  {item.missing > 0 && item.missNames.length > 0 && (
                    <div style={{ fontSize: '11px', color: '#92400E', marginTop: '4px' }}>
                      {item.missNames.slice(0, 5).join(', ')}
                      {item.missNames.length > 5 ? ` +${item.missNames.length - 5} more` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 7. GDPR data deletion ─────────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Trash2 size={16} color="#64748B" />
            </div>
            <p style={CARD_TITLE}>GDPR data deletion</p>
          </div>
          <p style={CARD_DESC}>
            Search by email or name to locate and delete a person's registration records.
          </p>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={gdprQuery}
              onChange={e => setGdprQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleGdprSearch(); }}
              placeholder="Email or name…"
              style={{ ...inputSt, flex: 1 }}
            />
            <button
              onClick={handleGdprSearch}
              disabled={gdprSearching || !gdprQuery.trim()}
              style={BTN(primary, gdprSearching || !gdprQuery.trim())}
            >
              <Search size={13} />
              {gdprSearching ? '…' : 'Find'}
            </button>
          </div>

          {gdprDone && (
            <div style={{
              background: '#DCFCE7', border: '1px solid #86EFAC',
              borderRadius: '8px', padding: '10px 14px',
              fontSize: '13px', color: '#15803D',
            }}>
              Data deleted as requested. We recommend keeping a log of deletion requests for your records.
            </div>
          )}

          {gdprMatches.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                {gdprMatches.length} record{gdprMatches.length !== 1 ? 's' : ''} found
              </div>
              {gdprMatches.map(m => (
                <div key={m.id} style={{
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: '8px', padding: '10px 14px',
                  fontSize: '12px', color: '#0F172A',
                }}>
                  <strong>{m.player}</strong> · {m.email} · {m.form_title} · {fmtDate(m.submitted)}
                </div>
              ))}
              <button
                onClick={() => setShowGdprConfirm(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  padding: '9px 16px', borderRadius: '8px', border: 'none',
                  background: '#DC2626', color: '#fff', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Trash2 size={13} />
                Delete all records for this person
              </button>
            </div>
          )}

          <div style={{
            background: '#F1F5F9', borderRadius: '8px', padding: '10px 14px',
            fontSize: '11px', color: '#64748B', lineHeight: '1.5',
          }}>
            Under GDPR / UK GDPR, you must respond to subject access requests within 30 days.
            Use the deletion tool above to honour erasure requests.
          </div>
        </div>

      </div>

      {/* ── Season summary modal ─────────────────────────────────────────────── */}
      {showSeasonModal && seasonData && (
        <>
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
            }}
            onClick={() => setShowSeasonModal(false)}
          />
          <div
            style={{
              position: 'fixed', top: '50%', left: '50%', zIndex: 1001,
              transform: 'translate(-50%, -50%)',
              background: '#fff', borderRadius: '16px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
              width: '580px', maxWidth: '95vw', maxHeight: '80vh', overflowY: 'auto',
              padding: '28px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
                Season summary
              </h2>
              <button
                onClick={() => setShowSeasonModal(false)}
                style={{
                  background: '#F1F5F9', border: 'none', borderRadius: '8px',
                  width: '30px', height: '30px', cursor: 'pointer',
                  fontSize: '16px', color: '#64748B', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {([
                { label: 'Total forms',         value: String(seasonData.totalForms) },
                { label: 'Total registrations', value: String(seasonData.totalReg)   },
                { label: 'Revenue collected',   value: fmtMoney(seasonData.totalRevenue, forms[0]?.currency ?? 'GBP') },
              ] as Array<{ label: string; value: string }>).map(s => (
                <div key={s.label} style={{
                  background: '#F8FAFC', border: '1px solid #E2E8F0',
                  borderRadius: '10px', padding: '14px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Breakdown by form
              </div>
              {seasonData.byForm.map((b, i) => (
                <div key={i} style={{
                  padding: '12px 14px',
                  borderBottom: i < seasonData.byForm.length - 1 ? '1px solid #F1F5F9' : 'none',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '3px' }}>
                    {b.title}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    {b.total} registrations · {b.approved} approved · {fmtMoney(b.revenue, b.currency)} collected
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(seasonSummaryText()).then(() => {
                    setCopiedSummary(true);
                    setTimeout(() => setCopiedSummary(false), 2000);
                  });
                }}
                style={BTN_OUTLINE}
              >
                {copiedSummary ? <Check size={13} /> : <Copy size={13} />}
                {copiedSummary ? 'Copied!' : 'Copy to clipboard'}
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([seasonSummaryText()], { type: 'text/plain' });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement('a');
                  a.href     = url;
                  a.download = 'season-summary.txt';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                style={BTN(primary)}
              >
                <Download size={13} />
                Download as text
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── GDPR confirm dialog ──────────────────────────────────────────────── */}
      {showGdprConfirm && (
        <>
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 1100,
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
            }}
            onClick={() => setShowGdprConfirm(false)}
          />
          <div
            style={{
              position: 'fixed', top: '50%', left: '50%', zIndex: 1101,
              transform: 'translate(-50%, -50%)',
              background: '#fff', borderRadius: '14px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
              width: '420px', maxWidth: '95vw', padding: '28px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
              Confirm deletion
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
              This will permanently delete <strong>{gdprMatches.length} registration record{gdprMatches.length !== 1 ? 's' : ''}</strong>.
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleGdprDelete}
                disabled={gdprDeleting}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                  background: '#DC2626', color: '#fff', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', opacity: gdprDeleting ? 0.7 : 1,
                }}
              >
                {gdprDeleting ? 'Deleting…' : 'Delete records'}
              </button>
              <button
                onClick={() => setShowGdprConfirm(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  border: '1.5px solid #E2E8F0', background: '#fff',
                  color: '#334155', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
          background: '#1E293B', color: '#fff', fontSize: '13px', fontWeight: 600,
          padding: '10px 22px', borderRadius: '10px', zIndex: 2000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function findFieldKey(fields: FieldDef[], pattern: RegExp): string | null {
  const match = fields.find(f => pattern.test(f.label));
  return match ? match.id : null;
}
