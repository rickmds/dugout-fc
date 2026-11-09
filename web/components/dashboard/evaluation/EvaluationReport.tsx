'use client';

// The slide-out panel chrome (backdrop, header, admin actions) around the
// report card — see EvaluationReportCard.tsx for the card itself, which
// stays server-renderable so web/lib/evaluationPdf.tsx can reuse it for
// the PDF. Re-exports the card's types/components too, so existing
// `from '@/components/dashboard/evaluation/EvaluationReport'` imports
// elsewhere in the app don't need to change.

import { useState } from 'react';
import { X, FileDown, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { EvaluationReportCard, type EvalRow } from './EvaluationReportCard';

export * from './EvaluationReportCard';

// All five admin-action props are optional — the player Development tab
// renders this same panel read-only with none of them set, so it must
// stay fully functional with just the display props above.
export type EvaluationReportPanelActions = {
  onMarkGood?: () => void;
  onMarkNotGood?: () => void;
  onReleaseNow?: () => void;
  onSchedule?: () => void;
  actionBusy?: boolean;
};

export function EvaluationReportPanel({
  ev, primary, clubLogoUrl, clubName, onClose, onPrev, onNext, hasPrev, hasNext,
  onMarkGood, onMarkNotGood, onReleaseNow, onSchedule, actionBusy,
}: {
  ev: EvalRow; primary: string; clubLogoUrl: string | null; clubName: string;
  onClose: () => void; onPrev: () => void; onNext: () => void; hasPrev: boolean; hasNext: boolean;
} & EvaluationReportPanelActions) {
  const playerName = ev.players?.full_name ?? '';
  const [pdfBusy, setPdfBusy] = useState(false);

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/evaluations/${ev.id}/pdf`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      console.error('PDF download failed:', err);
      alert('Could not generate the PDF — try again.');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 40, backdropFilter: 'blur(2px)' }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '520px', zIndex: 50,
        background: '#f1f5f9', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Panel header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button onClick={onPrev} disabled={!hasPrev} style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid #E2E8F0', background: hasPrev ? '#fff' : '#F8FAFC', cursor: hasPrev ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: hasPrev ? '#374151' : '#CBD5E1' }}>↑</button>
          <button onClick={onNext} disabled={!hasNext} style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid #E2E8F0', background: hasNext ? '#fff' : '#F8FAFC', cursor: hasNext ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: hasNext ? '#374151' : '#CBD5E1' }}>↓</button>
          <span style={{ flex: 1, fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{playerName}</span>
          <button onClick={downloadPdf} disabled={pdfBusy} title="Preview the PDF a parent would receive"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', cursor: pdfBusy ? 'default' : 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>
            {pdfBusy ? <Loader2 size={13} className="spin" /> : <FileDown size={13} />}
            PDF
          </button>
          <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color="#64748B" />
          </button>
        </div>

        {/* Admin actions — only rendered when the caller wired them up */}
        {(onMarkGood || onMarkNotGood || onReleaseNow || onSchedule) && (
          <div style={{ position: 'sticky', top: '53px', zIndex: 9, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {ev.status === 'submitted' && onMarkGood && (
              <button onClick={onMarkGood} disabled={actionBusy} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#22C55E', color: '#fff', fontSize: '12.5px', fontWeight: '700', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.7 : 1 }}>
                ✓ Mark Good
              </button>
            )}
            {ev.status === 'submitted' && onMarkNotGood && (
              <button onClick={onMarkNotGood} disabled={actionBusy} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', border: '1px solid #FECACA', background: '#fff', color: '#DC2626', fontSize: '12.5px', fontWeight: '700', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.7 : 1 }}>
                Send Back
              </button>
            )}
            {ev.status === 'approved' && (
              <>
                {onReleaseNow && (
                  <button onClick={onReleaseNow} disabled={actionBusy} style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: primary, color: '#fff', fontSize: '12.5px', fontWeight: '700', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.7 : 1 }}>
                    Release Now
                  </button>
                )}
                {onSchedule && (
                  <button onClick={onSchedule} disabled={actionBusy} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', color: '#374151', fontSize: '12.5px', fontWeight: '700', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.7 : 1 }}>
                    Schedule…
                  </button>
                )}
                <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#22C55E', marginLeft: '2px' }}>✓ Reviewed</span>
              </>
            )}
            {ev.status === 'published' && (
              <span style={{ fontSize: '12px', fontWeight: '700', color: primary }}>✓ Published to family</span>
            )}
          </div>
        )}

        {/* Report card */}
        <div style={{ padding: '16px', flex: 1 }}>
          <EvaluationReportCard ev={ev} primary={primary} clubLogoUrl={clubLogoUrl} clubName={clubName} />
        </div>
      </div>
    </>
  );
}
