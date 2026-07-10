'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type EvalRow = {
  id: string;
  player_id: string;
  status: 'draft' | 'submitted' | 'approved' | 'published';
  rating_technical: number | null;
  rating_tactical: number | null;
  rating_physical: number | null;
  rating_mental: number | null;
  q1_improvement: string | null;
  q2_focus: string | null;
  q3_message: string | null;
  ai_draft: string | null;
  final_text: string | null;
  players: { full_name: string; jersey_number: number | null } | null;
};

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
const AREA_LABELS: Record<typeof AREAS[number], string> = {
  technical: 'Technical', tactical: 'Tactical', physical: 'Physical', mental: 'Mental',
};

function RatingDots({ value }: { value: number | null }) {
  return (
    <div style={{ display: 'flex', gap: '3px' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <div key={n} style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: value != null && n <= value ? '#F59E0B' : '#E2E8F0',
        }} />
      ))}
    </div>
  );
}

function StarRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '500', minWidth: '72px' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <RatingDots value={value} />
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#0F172A', minWidth: '16px', textAlign: 'right' }}>{value ?? '—'}</span>
      </div>
    </div>
  );
}

export default function BatchReviewPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const router = useRouter();
  const { profile, club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  const [batch,    setBatch]    = useState<BatchMeta | null>(null);
  const [evals,    setEvals]    = useState<EvalRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [bRes, eRes] = await Promise.all([
      supabase
        .from('evaluation_batches')
        .select('*, teams(name)')
        .eq('id', batchId)
        .single(),
      supabase
        .from('player_evaluations')
        .select('*, players(full_name, jersey_number)')
        .eq('batch_id', batchId)
        .order('players(full_name)'),
    ]);
    if (bRes.data) setBatch(bRes.data as BatchMeta);
    setEvals((eRes.data ?? []) as EvalRow[]);
    setLoading(false);
  }, [batchId]);

  useEffect(() => { load(); }, [load]);

  async function approveAll() {
    if (!isAdmin || !batch) return;
    setApproving(true);
    const now = new Date().toISOString();

    await supabase
      .from('player_evaluations')
      .update({ status: 'published', approved_by: profile!.id, approved_at: now, published_at: now })
      .eq('batch_id', batchId)
      .eq('status', 'submitted');

    await supabase
      .from('evaluation_batches')
      .update({ status: 'approved', approved_by: profile!.id, approved_at: now })
      .eq('id', batchId);

    setApproving(false);
    router.push('/dashboard/evaluations');
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: '#94A3B8' }}>Loading…</div>
      </div>
    );
  }

  const readyCount = evals.filter(e => e.status === 'submitted' || e.status === 'approved' || e.status === 'published').length;
  const canApprove = isAdmin && batch?.status === 'submitted' && readyCount > 0;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => router.push('/dashboard/evaluations')}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '13px', fontWeight: '600', padding: '4px' }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ width: '1px', height: '20px', background: '#E2E8F0' }} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '18px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>
            {batch?.teams?.name ?? '—'} · {batch?.period_label} {batch?.season_label}
          </h1>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>
            {readyCount} of {evals.length} reports ready
          </div>
        </div>
        {canApprove && (
          <button
            onClick={approveAll}
            disabled={approving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '10px', border: 'none', background: '#22C55E', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.7 : 1 }}
          >
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
        ) : evals.map(ev => {
          const open = expanded === ev.id;
          const ready = ev.status !== 'draft';
          return (
            <div key={ev.id} style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${ready ? '#E2E8F0' : '#FCA5A5'}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              {/* Row header */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', cursor: 'pointer' }}
                onClick={() => setExpanded(open ? null : ev.id)}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%', background: `${primary}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: '800', color: primary, flexShrink: 0,
                }}>
                  {ev.players?.full_name?.[0] ?? '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>
                    {ev.players?.full_name ?? 'Unknown'}
                    {ev.players?.jersey_number != null && (
                      <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '6px' }}>#{ev.players.jersey_number}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    {AREAS.map(area => (
                      <div key={area} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Star size={10} color="#F59E0B" fill={ev[`rating_${area}` as keyof EvalRow] != null ? '#F59E0B' : 'transparent'} />
                        <span style={{ fontSize: '11px', color: '#64748B' }}>{ev[`rating_${area}` as keyof EvalRow] ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: '700', padding: '3px 9px', borderRadius: '6px',
                    background: ready ? 'rgba(34,197,94,0.1)' : 'rgba(252,165,165,0.2)',
                    color: ready ? '#22C55E' : '#EF4444',
                  }}>
                    {ready ? (ev.status === 'published' ? 'Published' : 'Ready') : 'Draft'}
                  </span>
                  {open ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
                </div>
              </div>

              {/* Expanded detail */}
              {open && (
                <div style={{ borderTop: '1px solid #F1F5F9', padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Ratings */}
                  <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>Ratings</div>
                    {AREAS.map(area => (
                      <StarRow key={area} label={AREA_LABELS[area]} value={ev[`rating_${area}` as keyof EvalRow] as number | null} />
                    ))}
                  </div>

                  {/* Coach answers */}
                  {(ev.q1_improvement || ev.q2_focus || ev.q3_message) && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>Coach Notes</div>
                      {[
                        { label: 'Biggest improvement', value: ev.q1_improvement },
                        { label: 'Focus area next',     value: ev.q2_focus },
                        { label: 'Personal message',    value: ev.q3_message },
                      ].filter(r => r.value).map(r => (
                        <div key={r.label} style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600', marginBottom: '2px' }}>{r.label}</div>
                          <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{r.value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Final text */}
                  {(ev.final_text || ev.ai_draft) && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Report{ev.final_text ? '' : ' (AI Draft)'}
                      </div>
                      <div style={{ fontSize: '13.5px', color: '#374151', lineHeight: 1.7, background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', border: '1px solid #E2E8F0' }}>
                        {ev.final_text ?? ev.ai_draft}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
