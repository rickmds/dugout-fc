'use client';

import { useEffect, useState } from 'react';
import { FileText, Users, CreditCard, TrendingUp, AlertCircle, CheckCircle, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { fmtMoney, fmtDate, derivePaymentBucket } from './shared';
import type { RegForm, Submission, InstallmentBucketInfo } from './shared';

interface OverviewStats {
  openForms: number;
  totalSubmissionsThisSeason: number;
  revenueCollected: number;
  revenueOutstanding: number;
  financialAidRequests: number;
  duplicateFlags: number;
  paymentIssues: number;
  recentSubmissions: (Submission & { form_title: string; form_currency: string })[];
  formSummaries: { form: RegForm; total: number; waitlisted: number }[];
}

export default function OverviewTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStats() {
    if (!club) return;
    setLoading(true);

    const { data: forms } = await supabase
      .from('registration_forms')
      .select('*')
      .eq('club_id', club.id)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (!forms) { setLoading(false); return; }

    const formIds = forms.map((f) => f.id);

    const { data: allSubs } = formIds.length
      ? await supabase.from('registration_submissions').select('*').in('form_id', formIds)
      : { data: [] };

    const subs = (allSubs ?? []) as Submission[];

    const openForms                   = forms.filter((f) => f.status === 'open').length;
    const revenueCollected            = subs.reduce((acc, s) => acc + (s.amount_paid ?? 0), 0);
    const revenueOutstanding          = subs.reduce((acc, s) => acc + Math.max(0, (s.amount_due ?? 0) - (s.amount_paid ?? 0)), 0);
    const financialAidRequests        = subs.filter((s) => s.financial_aid_requested && s.financial_aid_approved === null).length;
    const duplicateFlags              = subs.filter((s) => s.is_duplicate_flagged).length;

    // Only a priced form's submissions can ever have installments — same
    // scoping as the Submissions tab's own batched fetch.
    const pricedFormIds = new Set(forms.filter((f) => f.price !== null && f.price !== undefined && f.price > 0).map((f) => f.id));
    const pricedSubIds  = subs.filter((s) => pricedFormIds.has(s.form_id)).map((s) => s.id);
    const installmentsBySub = new Map<string, InstallmentBucketInfo[]>();
    if (pricedSubIds.length) {
      const { data: insts } = await supabase
        .from('registration_installments')
        .select('submission_id, paid_at, due_date, last_charge_error, charge_attempts')
        .in('submission_id', pricedSubIds);
      for (const inst of (insts ?? []) as InstallmentBucketInfo[]) {
        const list = installmentsBySub.get(inst.submission_id) ?? [];
        list.push(inst);
        installmentsBySub.set(inst.submission_id, list);
      }
    }
    const paymentIssues = subs.filter((s) => derivePaymentBucket(s, installmentsBySub.get(s.id) ?? []) === 'missed').length;

    const recentSubmissions = subs
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .slice(0, 6)
      .map((s) => {
        const form = forms.find((f) => f.id === s.form_id);
        return { ...s, form_title: form?.title ?? '—', form_currency: form?.currency ?? 'GBP' };
      });

    const formSummaries = forms.slice(0, 8).map((form) => {
      const fs = subs.filter((s) => s.form_id === form.id);
      return {
        form: form as RegForm,
        total:      fs.length,
        waitlisted: fs.filter((s) => s.status === 'waitlisted').length,
      };
    });

    setStats({
      openForms, totalSubmissionsThisSeason: subs.length,
      revenueCollected, revenueOutstanding, financialAidRequests, duplicateFlags, paymentIssues,
      recentSubmissions, formSummaries,
    });
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- fetch-on-mount effect; loadStats is a plain function whose only reactive input (club.id) is already tracked
  useEffect(() => { if (club) loadStats(); }, [club?.id]);

  const currency = 'GBP';

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>Loading…</div>;
  if (!stats) return null;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Registrations</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0' }}>Your registration hub — forms, payments, compliance, and reporting in one place.</p>
        </div>
        <button onClick={() => onNavigate('forms')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '11px 18px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={15} /> New form
        </button>
      </div>

      {/* ── Alert banners ── */}
      {(stats.paymentIssues > 0 || stats.financialAidRequests > 0 || stats.duplicateFlags > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          {stats.paymentIssues > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={16} color="#DC2626" />
              <span style={{ fontSize: '13px', color: '#991B1B', fontWeight: '600' }}>
                {stats.paymentIssues} registration{stats.paymentIssues !== 1 ? 's' : ''} with a missed or failed payment
              </span>
              <button onClick={() => onNavigate('submissions')} style={{ marginLeft: 'auto', padding: '5px 12px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Review</button>
            </div>
          )}
          {stats.financialAidRequests > 0 && (
            <div style={{ background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={16} color="#7C3AED" />
              <span style={{ fontSize: '13px', color: '#5B21B6', fontWeight: '600' }}>
                {stats.financialAidRequests} financial assistance request{stats.financialAidRequests !== 1 ? 's' : ''} awaiting review
              </span>
              <button onClick={() => onNavigate('submissions')} style={{ marginLeft: 'auto', padding: '5px 12px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Review</button>
            </div>
          )}
          {stats.duplicateFlags > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={16} color="#DC2626" />
              <span style={{ fontSize: '13px', color: '#991B1B', fontWeight: '600' }}>
                {stats.duplicateFlags} possible duplicate submission{stats.duplicateFlags !== 1 ? 's' : ''} flagged
              </span>
              <button onClick={() => onNavigate('submissions')} style={{ marginLeft: 'auto', padding: '5px 12px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Review</button>
            </div>
          )}
        </div>
      )}

      {/* ── Stats cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Open forms',     value: stats.openForms,                    icon: <FileText size={18} />,    color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Registrations',  value: stats.totalSubmissionsThisSeason,   icon: <Users size={18} />,       color: primary,   bg: '#F0FDF4' },
          { label: 'Collected',      value: fmtMoney(stats.revenueCollected, currency), icon: <CheckCircle size={18} />, color: '#16A34A', bg: '#DCFCE7' },
          { label: 'Outstanding',    value: fmtMoney(stats.revenueOutstanding, currency), icon: <CreditCard size={18} />, color: '#DC2626', bg: '#FEF2F2' },
        ].map((c) => (
          <div key={c.label} style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '14px', padding: '18px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: c.bg, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              {c.icon}
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', lineHeight: 1, marginBottom: '4px' }}>{c.value}</div>
            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: '500' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── Two column ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>

        {/* Form summaries */}
        <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>Forms at a glance</div>
            <button onClick={() => onNavigate('forms')} style={{ fontSize: '12px', color: primary, fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all</button>
          </div>
          {stats.formSummaries.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>No forms yet</div>
          ) : (
            <div>
              {stats.formSummaries.map(({ form, total, waitlisted }) => {
                const pct = form.max_spots ? Math.min(100, Math.round((total / form.max_spots) * 100)) : null;
                return (
                  <div key={form.id} style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', flex: 1 }}>{form.title}</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: form.status === 'open' ? '#16A34A' : '#64748B', background: form.status === 'open' ? '#DCFCE7' : '#F1F5F9', borderRadius: '20px', padding: '2px 8px' }}>
                        {form.status}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '500' }}>{total} total</span>
                    </div>
                    {waitlisted > 0 && (
                      <div style={{ marginBottom: pct !== null ? '8px' : 0 }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#7C3AED', background: '#EDE9FE', borderRadius: '4px', padding: '2px 7px' }}>{waitlisted} waitlisted</span>
                      </div>
                    )}
                    {/* Capacity bar */}
                    {pct !== null && (
                      <div>
                        <div style={{ height: '4px', background: '#F1F5F9', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 90 ? '#DC2626' : pct >= 70 ? '#D97706' : primary, borderRadius: '2px', transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '3px' }}>{total} / {form.max_spots} spots filled ({pct}%)</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Quick actions */}
          <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '16px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', marginBottom: '12px' }}>Quick actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: 'Create new form',           onClick: () => onNavigate('forms'),       color: primary },
                { label: 'View all submissions',      onClick: () => onNavigate('submissions'), color: '#2563EB' },
                { label: 'Chase outstanding payments', onClick: () => onNavigate('submissions'), color: '#D97706' },
                { label: 'Export season report',       onClick: () => onNavigate('reports'),    color: '#7C3AED' },
              ].map((a) => (
                <button key={a.label} onClick={a.onClick}
                  style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.color = a.color; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#374151'; }}>
                  <TrendingUp size={12} color={a.color} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recent submissions */}
          <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Recent submissions</div>
              <button onClick={() => onNavigate('submissions')} style={{ fontSize: '11px', color: primary, fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all</button>
            </div>
            {stats.recentSubmissions.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: '#94A3B8' }}>No submissions yet</div>
            ) : (
              stats.recentSubmissions.map((s) => (
                <div key={s.id} style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.form_title}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>{fmtDate(s.submitted_at)}</div>
                  </div>
                  {s.status === 'waitlisted' && (
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#7C3AED', background: '#EDE9FE', borderRadius: '20px', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                      Waitlisted
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
