'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Star, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { notifyEvaluationsPublished } from '@/lib/evaluationRelease';
import { EvaluationReportPanel, type EvalRow } from '@/components/dashboard/evaluation/EvaluationReport';

type BatchMeta = {
  id: string;
  team_id: string;
  status: 'in_progress' | 'submitted' | 'approved';
  season_label: string;
  period_label: string;
  total_players: number;
  completed_count: number;
  teams: { name: string } | null;
};

// A roster player the coach hasn't started an evaluation for yet — no
// player_evaluations row exists at all (that row is only created once a
// coach opens the eval form on mobile and saves a draft). Shown
// separately from real EvalRow cards below so a freshly-created batch
// reads as "14 players, 0 started" instead of a bare "no evaluations yet".
type NotStartedPlayer = { id: string; full_name: string; jersey_number: number | null; photo_url: string | null };

const AREAS = ['technical', 'tactical', 'physical', 'mental'] as const;

export default function BatchReviewPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const router      = useRouter();
  const { profile, club } = useDashboard();
  const primary     = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const isAdmin     = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  const [batch,     setBatch]     = useState<BatchMeta | null>(null);
  const [evals,     setEvals]     = useState<EvalRow[]>([]);
  const [notStarted, setNotStarted] = useState<NotStartedPlayer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<{ ids: string[] } | null>(null);
  const [scheduleAt, setScheduleAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [bRes, eRes] = await Promise.all([
      supabase.from('evaluation_batches').select('*, teams(name)').eq('id', batchId).single(),
      supabase.from('player_evaluations').select('*, players(full_name, jersey_number, photo_url, card_photo_url)').eq('batch_id', batchId).order('players(full_name)'),
    ]);
    const batchRow = bRes.data as BatchMeta | null;
    const evalRows = (eRes.data ?? []) as EvalRow[];
    setBatch(batchRow);
    setEvals(evalRows);

    if (batchRow?.team_id) {
      const { data: roster } = await supabase
        .from('players')
        .select('id, full_name, jersey_number, photo_url')
        .eq('team_id', batchRow.team_id)
        .order('full_name');
      const coveredIds = new Set(evalRows.map(e => e.player_id));
      setNotStarted(((roster ?? []) as NotStartedPlayer[]).filter(p => !coveredIds.has(p.id)));
    } else {
      setNotStarted([]);
    }

    setLoading(false);
  }, [batchId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { load(); }, [load]);

  async function notifyFor(evalIds: string[]) {
    if (!batch) return;
    const playerIds = evals.filter(e => evalIds.includes(e.id)).map(e => e.player_id).filter(Boolean);
    await notifyEvaluationsPublished({
      playerIds,
      periodLabel: batch.period_label,
      teamName: batch.teams?.name ?? '',
      fromName: profile?.full_name ?? null,
      clubName: club?.name ?? null,
      clubLogoUrl: club?.logo_url ?? null,
      clubPrimaryColor: club?.primary_color ?? null,
    });
  }

  async function markGood(evalIds: string[]) {
    if (!isAdmin || !profile) return;
    setActionBusy(true);
    const now = new Date().toISOString();
    await supabase.from('player_evaluations')
      .update({ status: 'approved', approved_by: profile.id, approved_at: now })
      .in('id', evalIds)
      .eq('status', 'submitted');
    await load();
    setActionBusy(false);
  }

  async function releaseNow(evalIds: string[]) {
    if (!isAdmin) return;
    setActionBusy(true);
    const now = new Date().toISOString();
    await supabase.from('player_evaluations')
      .update({ status: 'published', published_at: now, scheduled_publish_at: null })
      .in('id', evalIds)
      .eq('status', 'approved');
    await notifyFor(evalIds);
    await maybeCloseOutBatch();
    await load();
    setActionBusy(false);
  }

  async function confirmSchedule() {
    if (!scheduleFor || !scheduleAt) return;
    setActionBusy(true);
    await supabase.from('player_evaluations')
      .update({ scheduled_publish_at: new Date(scheduleAt).toISOString() })
      .in('id', scheduleFor.ids)
      .eq('status', 'approved');
    setScheduleFor(null);
    setScheduleAt('');
    await load();
    setActionBusy(false);
  }

  // A batch moves to 'approved' once every eval in it has at least been
  // reviewed (approved or published) — mirrors the old approveAll()'s
  // batch-level bookkeeping, just no longer tied to publishing happening
  // in the same step.
  async function maybeCloseOutBatch() {
    if (!batch || !profile) return;
    const { count } = await supabase.from('player_evaluations')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .in('status', ['draft', 'submitted']);
    if (count === 0) {
      await supabase.from('evaluation_batches')
        .update({ status: 'approved', approved_by: profile.id, approved_at: new Date().toISOString() })
        .eq('id', batchId)
        .eq('status', 'submitted');
    }
  }

  const selectedIdx = evals.findIndex(e => e.id === selected);
  const selectedEv  = selectedIdx >= 0 ? evals[selectedIdx] : null;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: '#94A3B8' }}>Loading…</div>
      </div>
    );
  }

  const readyCount     = evals.filter(e => e.status !== 'draft').length;
  const submittedIds   = evals.filter(e => e.status === 'submitted').map(e => e.id);
  const approvedIds    = evals.filter(e => e.status === 'approved').map(e => e.id);
  const publishedCount = evals.filter(e => e.status === 'published').length;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/dashboard/evaluations')} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '13px', fontWeight: '600', padding: '4px' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ width: '1px', height: '20px', background: '#E2E8F0' }} />
        <div style={{ flex: 1, minWidth: '160px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>
            {batch?.teams?.name ?? '—'} · {batch?.period_label} {batch?.season_label}
          </h1>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>
            {readyCount} of {evals.length + notStarted.length} reports ready · {publishedCount} published
            {notStarted.length > 0 && ` · ${notStarted.length} not started`}
          </div>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {submittedIds.length > 0 && (
              <button onClick={() => markGood(submittedIds)} disabled={actionBusy} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '10px', border: 'none', background: '#22C55E', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.7 : 1 }}>
                <CheckCircle size={14} />
                Mark All Good ({submittedIds.length})
              </button>
            )}
            {approvedIds.length > 0 && (
              <>
                <button onClick={() => releaseNow(approvedIds)} disabled={actionBusy} style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', background: primary, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.7 : 1 }}>
                  Release All Approved ({approvedIds.length})
                </button>
                <button onClick={() => setScheduleFor({ ids: approvedIds })} disabled={actionBusy} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '9px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#fff', color: '#374151', fontSize: '13px', fontWeight: '700', cursor: actionBusy ? 'not-allowed' : 'pointer', opacity: actionBusy ? 0.7 : 1 }}>
                  <Clock size={14} /> Schedule…
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {evals.length === 0 && notStarted.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#64748B' }}>No players on this team&apos;s roster yet.</div>
          </div>
        ) : (
          <>
        {evals.map((ev) => {
          const isSelected = selected === ev.id;
          const ready = ev.status !== 'draft';
          const badgeStyle = ev.status === 'published'
            ? { background: 'rgba(34,197,94,0.12)', color: '#15803D', label: 'Published' }
            : ev.status === 'approved'
            ? { background: 'rgba(34,197,94,0.1)', color: '#22C55E', label: ev.scheduled_publish_at ? `Scheduled ${new Date(ev.scheduled_publish_at).toLocaleDateString()}` : 'Reviewed — Good' }
            : ready
            ? { background: 'rgba(59,130,246,0.1)', color: '#3B82F6', label: 'Submitted' }
            : { background: 'rgba(252,165,165,0.2)', color: '#EF4444', label: 'Draft' };
          return (
            <div
              key={ev.id}
              onClick={() => setSelected(isSelected ? null : ev.id)}
              style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${isSelected ? primary : ready ? '#E2E8F0' : '#FCA5A5'}`, overflow: 'hidden', boxShadow: isSelected ? `0 0 0 3px ${primary}22` : '0 1px 4px rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSelected ? primary : `${primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: isSelected ? '#fff' : primary, flexShrink: 0, transition: 'background 0.15s', overflow: 'hidden' }}>
                  {ev.players?.photo_url
                    ? <img src={ev.players.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (ev.players?.full_name?.[0] ?? '?')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>
                    {ev.players?.full_name ?? 'Unknown'}
                    {ev.players?.jersey_number != null && <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '6px' }}>#{ev.players.jersey_number}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    {AREAS.map(area => (
                      <div key={area} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Star size={10} color="#F59E0B" fill={ev[`rating_${area}` as keyof EvalRow] != null ? '#F59E0B' : 'transparent'} />
                        <span style={{ fontSize: '11px', color: '#64748B' }}>{(ev[`rating_${area}` as keyof EvalRow] as number | null) ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 9px', borderRadius: '6px', background: badgeStyle.background, color: badgeStyle.color, whiteSpace: 'nowrap' }}>
                  {badgeStyle.label}
                </span>
              </div>
            </div>
          );
        })}

        {notStarted.map(p => (
          <div
            key={p.id}
            style={{ background: '#fff', borderRadius: '14px', border: '1px dashed #E2E8F0', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', opacity: 0.75 }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: '#94A3B8', flexShrink: 0, overflow: 'hidden' }}>
              {p.photo_url
                ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (p.full_name?.[0] ?? '?')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#475569' }}>
                {p.full_name}
                {p.jersey_number != null && <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '6px' }}>#{p.jersey_number}</span>}
              </div>
            </div>
            <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 9px', borderRadius: '6px', background: '#F1F5F9', color: '#94A3B8', whiteSpace: 'nowrap' }}>
              Not Started
            </span>
          </div>
        ))}
          </>
        )}
      </div>

      {/* Slide-over panel */}
      {selectedEv && (
        <EvaluationReportPanel
          ev={selectedEv}
          primary={primary}
          clubLogoUrl={club?.logo_url ?? null}
          clubName={club?.name ?? ''}
          onClose={() => setSelected(null)}
          onPrev={() => selectedIdx > 0 && setSelected(evals[selectedIdx - 1].id)}
          onNext={() => selectedIdx < evals.length - 1 && setSelected(evals[selectedIdx + 1].id)}
          hasPrev={selectedIdx > 0}
          hasNext={selectedIdx < evals.length - 1}
          actionBusy={actionBusy}
          onMarkGood={isAdmin ? () => markGood([selectedEv.id]) : undefined}
          onReleaseNow={isAdmin ? () => releaseNow([selectedEv.id]) : undefined}
          onSchedule={isAdmin ? () => setScheduleFor({ ids: [selectedEv.id] }) : undefined}
        />
      )}

      {/* Schedule modal */}
      {scheduleFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', marginBottom: '4px' }}>Schedule release</div>
            <div style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '16px' }}>
              {scheduleFor.ids.length} report{scheduleFor.ids.length !== 1 ? 's' : ''} will go out to families at this time.
            </div>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={e => setScheduleAt(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button onClick={() => { setScheduleFor(null); setScheduleAt(''); }} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmSchedule} disabled={actionBusy || !scheduleAt} style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: actionBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !scheduleAt ? 0.5 : 1 }}>
                {actionBusy ? 'Scheduling…' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
