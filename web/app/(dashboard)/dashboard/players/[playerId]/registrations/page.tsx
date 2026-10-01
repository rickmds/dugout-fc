'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  type RegForm, type Submission, type InstallmentBucketInfo,
  STATUS_STYLES, PAYMENT_BUCKET_STYLES, fmtMoney, fmtDate, derivePaymentBucket,
} from '@/app/(dashboard)/dashboard/registrations/_components/shared';

type Row = { sub: Submission; form: RegForm | null; installments: InstallmentBucketInfo[] };

const card: React.CSSProperties = { background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', marginBottom: '16px' };
const sectionTitle: React.CSSProperties = { fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' };

export default function RegistrationsPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);

    const { data: subs } = await supabase
      .from('registration_submissions')
      .select('id,form_id,data,status,amount_due,amount_paid,submitted_at,payment_choice,payment_status,notes,internal_notes,is_returning,is_duplicate_flagged,offline_payment_method,offline_payment_ref,offline_payment_date,financial_aid_requested,financial_aid_approved,financial_aid_amount,fee_waived,waitlist_position,promo_code_used,discount_applied,roster_added_at,roster_player_id,tryout_assignment_id')
      .eq('roster_player_id', playerId)
      .order('submitted_at', { ascending: false });

    const submissions = (subs ?? []) as unknown as Submission[];
    if (!submissions.length) { setRows([]); setLoading(false); return; }

    const formIds = [...new Set(submissions.map((s) => s.form_id))];
    const [{ data: forms }, { data: installments }] = await Promise.all([
      supabase.from('registration_forms').select('*').in('id', formIds),
      supabase.from('registration_installments').select('submission_id,paid_at,due_date,last_charge_error,charge_attempts,refunded_amount,amount')
        .in('submission_id', submissions.map((s) => s.id)),
    ]);

    const formById = new Map(((forms ?? []) as unknown as RegForm[]).map((f) => [f.id, f]));
    const installmentsBySub = new Map<string, InstallmentBucketInfo[]>();
    for (const i of (installments ?? []) as unknown as InstallmentBucketInfo[]) {
      const list = installmentsBySub.get(i.submission_id) ?? [];
      list.push(i);
      installmentsBySub.set(i.submission_id, list);
    }

    setRows(submissions.map((sub) => ({
      sub,
      form: formById.get(sub.form_id) ?? null,
      installments: installmentsBySub.get(sub.id) ?? [],
    })));
    setLoading(false);
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from real network calls, not derivable at render time
  useEffect(() => { load(); }, [load]);

  const active = rows.filter((r) => r.form?.status === 'open' && !r.form?.archived);
  const past = rows.filter((r) => !(r.form?.status === 'open' && !r.form?.archived));

  function RegistrationRow({ row }: { row: Row }) {
    const { sub, form, installments } = row;
    const bucket = derivePaymentBucket(sub, installments);
    const bucketStyle = bucket ? PAYMENT_BUCKET_STYLES[bucket] : null;
    const statusStyle = form ? STATUS_STYLES[form.status] : null;
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
        <div>
          <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>{form?.title ?? 'Untitled form'}</div>
          <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
            {form?.season_label ? `${form.season_label} · ` : ''}Submitted {fmtDate(sub.submitted_at)}
          </div>
          {sub.amount_due != null && sub.amount_due > 0 && (
            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
              {fmtMoney(sub.amount_paid, form?.currency ?? 'USD')} / {fmtMoney(sub.amount_due, form?.currency ?? 'USD')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
          {statusStyle && <span style={{ fontSize: '10.5px', fontWeight: '700', color: statusStyle.color, background: statusStyle.bg, borderRadius: '20px', padding: '3px 9px' }}>{statusStyle.label}</span>}
          {bucketStyle && <span style={{ fontSize: '10.5px', fontWeight: '700', color: bucketStyle.color, background: bucketStyle.bg, borderRadius: '20px', padding: '3px 9px' }}>{bucketStyle.label}</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '620px' }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Active registrations</div>
          <Link href="/dashboard/registrations" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '600', color: '#22C55E', textDecoration: 'none' }}>
            Registration hub <ExternalLink size={11} />
          </Link>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <div style={{ width: '18px', height: '18px', border: '2px solid #22C55E', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : active.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No active registrations right now</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {active.map((r) => <RegistrationRow key={r.sub.id} row={r} />)}
          </div>
        )}
      </div>

      {!loading && past.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>Past registrations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {past.map((r) => <RegistrationRow key={r.sub.id} row={r} />)}
          </div>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <FileText size={22} color="#CBD5E1" style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No registrations on file for this player</p>
          </div>
        </div>
      )}
    </div>
  );
}
