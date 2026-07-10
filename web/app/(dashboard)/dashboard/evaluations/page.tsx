'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Award, CheckCircle, Clock, ChevronRight, AlertCircle, Users, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type BatchRow = {
  id: string;
  team_id: string;
  coach_id: string;
  season_label: string;
  period_label: string;
  status: 'in_progress' | 'submitted' | 'approved';
  total_players: number;
  completed_count: number;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  teams: { name: string; age_group: string | null } | null;
  coach: { full_name: string | null } | null;
};

const STATUS_CONFIG = {
  in_progress: { label: 'In Progress', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', icon: Clock },
  submitted:   { label: 'Awaiting Approval', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', icon: AlertCircle },
  approved:    { label: 'Approved', color: '#22C55E', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle },
};

function StatusChip({ status }: { status: BatchRow['status'] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '20px',
      background: cfg.bg, color: cfg.color,
      fontSize: '11.5px', fontWeight: '700',
    }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function ProgressBar({ completed, total, primary }: { completed: number; total: number; primary: string }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '5px', borderRadius: '99px', background: '#E2E8F0', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '99px', background: pct === 100 ? '#22C55E' : primary, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#64748B', whiteSpace: 'nowrap' }}>
        {completed}/{total}
      </span>
    </div>
  );
}

export default function EvaluationsPage() {
  const { profile, club, teams } = useDashboard();
  const router = useRouter();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  const [batches,  setBatches]  = useState<BatchRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const { data } = await supabase
      .from('evaluation_batches')
      .select('*, teams(name,age_group), coach:profiles!evaluation_batches_coach_id_fkey(full_name)')
      .eq('club_id', club.id)
      .order('created_at', { ascending: false });

    setBatches((data ?? []) as BatchRow[]);
    setLoading(false);
  }, [club]);

  useEffect(() => { load(); }, [load]);

  // Summary stats
  const submitted = batches.filter(b => b.status === 'submitted').length;
  const inProgress = batches.filter(b => b.status === 'in_progress').length;
  const approved = batches.filter(b => b.status === 'approved').length;
  const totalEvals = batches.reduce((s, b) => s + b.total_players, 0);
  const completedEvals = batches.reduce((s, b) => s + b.completed_count, 0);

  // Pending approval first, then in_progress, then approved; within groups by date desc
  const sorted = [...batches].sort((a, b) => {
    const order = { submitted: 0, in_progress: 1, approved: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  function fmt(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <style>{`
        @media (max-width: 768px) {
          .eval-header { padding: 12px 16px !important; }
          .eval-content { padding: 14px 16px !important; }
          .eval-stats { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
      `}</style>

      {/* Header */}
      <div className="eval-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '20px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Develop</div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>Evaluations</h1>
        </div>
        {isAdmin && (
          <button
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '10px', border: 'none', background: primary, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
            onClick={() => {/* TODO: open new batch modal */}}
          >
            <Plus size={14} />
            New Batch
          </button>
        )}
      </div>

      <div className="eval-content" style={{ padding: '24px 32px' }}>

        {/* Stats */}
        <div className="eval-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Awaiting Approval', value: submitted,  color: '#3B82F6' },
            { label: 'In Progress',       value: inProgress, color: '#F59E0B' },
            { label: 'Approved',          value: approved,   color: '#22C55E' },
            { label: 'Reports Written',   value: `${completedEvals}/${totalEvals}`, color: primary },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '28px', fontWeight: '900', color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontWeight: '600' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Batches */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: '72px', borderRadius: '12px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite', border: '1px solid #E2E8F0' }} />
            ))}
            <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '56px 32px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Award size={22} color="#94A3B8" />
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No evaluation batches yet</div>
            <div style={{ fontSize: '13px', color: '#64748B' }}>
              Coaches start a batch from the mobile app. Submitted batches appear here for approval.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sorted.map(batch => (
              <div
                key={batch.id}
                onClick={() => router.push(`/dashboard/evaluations/${batch.id}`)}
                style={{
                  background: '#fff', borderRadius: '14px', border: `1px solid ${batch.status === 'submitted' ? 'rgba(59,130,246,0.25)' : '#E2E8F0'}`,
                  padding: '16px 20px', boxShadow: batch.status === 'submitted' ? '0 0 0 3px rgba(59,130,246,0.06)' : '0 1px 4px rgba(0,0,0,0.04)',
                  cursor: 'pointer', transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = batch.status === 'submitted' ? '0 0 0 3px rgba(59,130,246,0.06)' : '0 1px 4px rgba(0,0,0,0.04)'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  {/* Left: team + period */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>
                        {batch.teams?.name ?? '—'}
                      </span>
                      {batch.teams?.age_group && (
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px' }}>
                          {batch.teams.age_group}
                        </span>
                      )}
                      <StatusChip status={batch.status} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600' }}>
                        {batch.period_label} · {batch.season_label}
                      </span>
                      {batch.coach?.full_name && (
                        <span style={{ fontSize: '12px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Users size={11} />
                          {batch.coach.full_name}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: '10px', maxWidth: '280px' }}>
                      <ProgressBar completed={batch.completed_count} total={batch.total_players} primary={primary} />
                    </div>
                  </div>

                  {/* Right: dates + chevron */}
                  <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {batch.submitted_at && (
                      <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                        Submitted {fmt(batch.submitted_at)}
                      </div>
                    )}
                    {batch.approved_at && (
                      <div style={{ fontSize: '11.5px', color: '#22C55E', fontWeight: '600' }}>
                        Approved {fmt(batch.approved_at)}
                      </div>
                    )}
                    {!batch.submitted_at && (
                      <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                        Started {fmt(batch.created_at)}
                      </div>
                    )}
                    <ChevronRight size={14} color="#CBD5E1" style={{ marginTop: '8px' }} />
                  </div>
                </div>

                {/* Approve CTA for submitted batches */}
                {isAdmin && batch.status === 'submitted' && (
                  <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/dashboard/evaluations/${batch.id}`); }}
                      style={{ padding: '7px 16px', borderRadius: '8px', border: 'none', background: '#3B82F6', color: '#fff', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <CheckCircle size={13} />
                      Review & Approve
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
