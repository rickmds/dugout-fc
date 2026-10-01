'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { sendProfilesEmail } from '@/lib/emailProfiles';
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

const AREAS = ['technical', 'tactical', 'physical', 'mental'] as const;

export default function BatchReviewPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const router      = useRouter();
  const { profile, club } = useDashboard();
  const primary     = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const isAdmin     = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  const [batch,     setBatch]     = useState<BatchMeta | null>(null);
  const [evals,     setEvals]     = useState<EvalRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [bRes, eRes] = await Promise.all([
      supabase.from('evaluation_batches').select('*, teams(name)').eq('id', batchId).single(),
      supabase.from('player_evaluations').select('*, players(full_name, jersey_number, photo_url)').eq('batch_id', batchId).order('players(full_name)'),
    ]);
    if (bRes.data) setBatch(bRes.data as BatchMeta);
    setEvals((eRes.data ?? []) as EvalRow[]);
    setLoading(false);
  }, [batchId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { load(); }, [load]);

  async function approveAll() {
    if (!isAdmin || !batch) return;
    setApproving(true);
    const now = new Date().toISOString();
    await supabase.from('player_evaluations').update({ status: 'published', approved_by: profile!.id, approved_at: now, published_at: now }).eq('batch_id', batchId).eq('status', 'submitted');
    await supabase.from('evaluation_batches').update({ status: 'approved', approved_by: profile!.id, approved_at: now }).eq('id', batchId);

    // Notify players — get profile_ids for all players in this batch
    const playerIds = evals.map((e) => e.player_id).filter(Boolean);
    if (playerIds.length) {
      const { data: players } = await supabase.from('players').select('profile_id').in('id', playerIds);
      const profileIds = (players ?? []).map(p => p.profile_id).filter(Boolean) as string[];
      if (profileIds.length) {
        const evalBody = `Your ${batch.period_label} report from your coach is now available.`;
        supabase.functions.invoke('send-push', {
          body: {
            profile_ids: profileIds,
            title: '📊 Your evaluation is ready',
            body: evalBody,
            data: { type: 'evaluation_published' },
          },
        }).catch(() => {});
        sendProfilesEmail({
          profileIds,
          subject: '📊 Your evaluation is ready',
          body: evalBody,
          fromName: profile?.full_name ?? club?.name ?? 'Coach',
          teamName: batch.teams?.name ?? '',
          clubName: club?.name ?? null,
          logoUrl: club?.logo_url ?? null,
          primaryColor: club?.primary_color ?? null,
        });
      }
    }

    setApproving(false);
    router.push('/dashboard/evaluations');
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

  const readyCount = evals.filter(e => e.status !== 'draft').length;
  const canApprove = isAdmin && batch?.status === 'submitted' && readyCount > 0;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/dashboard/evaluations')} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '13px', fontWeight: '600', padding: '4px' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ width: '1px', height: '20px', background: '#E2E8F0' }} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '18px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>
            {batch?.teams?.name ?? '—'} · {batch?.period_label} {batch?.season_label}
          </h1>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>{readyCount} of {evals.length} reports ready</div>
        </div>
        {canApprove && (
          <button onClick={approveAll} disabled={approving} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '10px', border: 'none', background: '#22C55E', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.7 : 1 }}>
            <CheckCircle size={14} />
            {approving ? 'Approving…' : `Approve All & Publish (${readyCount})`}
          </button>
        )}
        {batch?.status === 'approved' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '8px', background: 'rgba(34,197,94,0.1)', color: '#22C55E', fontSize: '13px', fontWeight: '700' }}>
            <CheckCircle size={13} /> Approved & Published
          </span>
        )}
      </div>

      {/* List */}
      <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {evals.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#64748B' }}>No evaluations in this batch yet.</div>
          </div>
        ) : evals.map((ev) => {
          const isSelected = selected === ev.id;
          const ready = ev.status !== 'draft';
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
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 9px', borderRadius: '6px', background: ready ? 'rgba(34,197,94,0.1)' : 'rgba(252,165,165,0.2)', color: ready ? '#22C55E' : '#EF4444' }}>
                  {ready ? (ev.status === 'published' ? 'Published' : 'Ready') : 'Draft'}
                </span>
              </div>
            </div>
          );
        })}
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
        />
      )}
    </div>
  );
}
