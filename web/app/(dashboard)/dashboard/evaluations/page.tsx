'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Award, CheckCircle, ChevronRight, Users, Plus, X, Folder } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { StatusChip, ProgressBar } from '@/components/dashboard/evaluation/EvalStatusUI';

type BatchRow = {
  id: string;
  team_id: string;
  period_id: string | null;
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

type PeriodRow = {
  id: string;
  season_label: string;
  period_label: string;
  created_at: string;
};

export default function EvaluationsPage() {
  const { profile, club } = useDashboard();
  const router = useRouter();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  const [batches,  setBatches]  = useState<BatchRow[]>([]);
  const [periods,  setPeriods]  = useState<PeriodRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  // ── New Period modal ─────────────────────────────────────────────────────
  const [teamOptions, setTeamOptions] = useState<{ id: string; name: string }[]>([]);
  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [newTeamIds, setNewTeamIds]   = useState<Set<string>>(new Set());
  const [newSeason, setNewSeason]     = useState('');
  const [newPeriod, setNewPeriod]     = useState('');
  const [creating, setCreating]       = useState(false);
  const [newError, setNewError]       = useState('');

  const load = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const [bRes, pRes] = await Promise.all([
      supabase
        .from('evaluation_batches')
        .select('*, teams(name,age_group), coach:profiles!evaluation_batches_coach_id_fkey(full_name)')
        .eq('club_id', club.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('evaluation_periods')
        .select('id,season_label,period_label,created_at')
        .eq('club_id', club.id)
        .order('created_at', { ascending: false }),
    ]);
    setBatches((bRes.data ?? []) as BatchRow[]);
    setPeriods((pRes.data ?? []) as PeriodRow[]);
    setLoading(false);
  }, [club]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!club) return;
    supabase.from('teams').select('id, name').eq('club_id', club.id).order('name')
      .then(({ data }) => setTeamOptions((data ?? []) as { id: string; name: string }[]));
  }, [club]);

  function openNewPeriod() {
    setNewTeamIds(new Set());
    setNewSeason('');
    setNewPeriod('');
    setNewError('');
    setShowNewPeriod(true);
  }

  function toggleTeam(id: string) {
    setNewTeamIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function createPeriod() {
    if (!club || !profile || newTeamIds.size === 0 || !newSeason.trim() || !newPeriod.trim()) return;
    setCreating(true);
    setNewError('');
    try {
      const { data: periodRow, error: periodErr } = await supabase
        .from('evaluation_periods')
        .insert({ club_id: club.id, season_label: newSeason.trim(), period_label: newPeriod.trim(), created_by: profile.id })
        .select('id')
        .single();
      if (periodErr || !periodRow) {
        setNewError('Could not create the evaluation period. Please try again.');
        return;
      }

      const teamIds = [...newTeamIds];
      const { data: playerCounts } = await supabase
        .from('players')
        .select('team_id')
        .in('team_id', teamIds);
      const countByTeam = new Map<string, number>();
      for (const row of playerCounts ?? []) {
        countByTeam.set(row.team_id, (countByTeam.get(row.team_id) ?? 0) + 1);
      }

      const { error: batchErr } = await supabase.from('evaluation_batches').insert(
        teamIds.map(teamId => ({
          club_id: club.id,
          team_id: teamId,
          period_id: periodRow.id,
          coach_id: profile.id,
          season_label: newSeason.trim(),
          period_label: newPeriod.trim(),
          total_players: countByTeam.get(teamId) ?? 0,
          completed_count: 0,
          status: 'in_progress' as const,
        }))
      );
      if (batchErr) {
        setNewError('Period created, but could not set up all teams. Please try again.');
        return;
      }

      setShowNewPeriod(false);
      router.push(`/dashboard/evaluations/periods/${periodRow.id}`);
    } finally {
      setCreating(false);
    }
  }

  // Summary stats — across every batch regardless of whether it belongs to a period
  const submitted = batches.filter(b => b.status === 'submitted').length;
  const inProgress = batches.filter(b => b.status === 'in_progress').length;
  const approved = batches.filter(b => b.status === 'approved').length;
  const totalEvals = batches.reduce((s, b) => s + b.total_players, 0);
  const completedEvals = batches.reduce((s, b) => s + b.completed_count, 0);

  const standaloneBatches = batches.filter(b => !b.period_id);
  const periodStatusOrder = { submitted: 0, in_progress: 1, approved: 2 } as const;

  type PeriodCard = { period: PeriodRow; teamBatches: BatchRow[] };
  const periodCards: PeriodCard[] = periods
    .map(p => ({ period: p, teamBatches: batches.filter(b => b.period_id === p.id) }))
    .filter(pc => pc.teamBatches.length > 0);

  function periodWorstStatus(teamBatches: BatchRow[]): keyof typeof periodStatusOrder {
    return teamBatches.reduce((worst, b) => periodStatusOrder[b.status] < periodStatusOrder[worst] ? b.status : worst, 'approved' as BatchRow['status']);
  }

  const sortedPeriodCards = [...periodCards].sort((a, b) => {
    const oa = periodStatusOrder[periodWorstStatus(a.teamBatches)];
    const ob = periodStatusOrder[periodWorstStatus(b.teamBatches)];
    if (oa !== ob) return oa - ob;
    return new Date(b.period.created_at).getTime() - new Date(a.period.created_at).getTime();
  });

  const sortedStandalone = [...standaloneBatches].sort((a, b) => {
    const order = periodStatusOrder;
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  function fmt(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      <style>{`
        @media (max-width: 768px) {
          .eval-header { padding: 12px 16px !important; }
          .eval-content { padding: 14px 16px !important; }
          .eval-stats { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
      `}</style>

      {/* Header */}
      <div className="eval-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Develop</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Evaluations</h1>
        </div>
        {isAdmin && (
          <button
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '6px', border: 'none', background: primary, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
            onClick={openNewPeriod}
          >
            <Plus size={14} />
            New Evaluation Period
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
            <div key={label} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '28px', fontWeight: '900', color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontWeight: '600' }}>{label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: '72px', borderRadius: '8px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite', border: '1px solid #E2E8F0' }} />
            ))}
            <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          </div>
        ) : sortedPeriodCards.length === 0 && sortedStandalone.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '56px 32px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Award size={22} color="#94A3B8" />
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No evaluations yet</div>
            <div style={{ fontSize: '13px', color: '#64748B' }}>
              Start an evaluation period across your teams, or a coach can start one from the mobile app.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Period cards — club-wide rounds spanning multiple teams */}
            {sortedPeriodCards.map(({ period, teamBatches }) => {
              const total = teamBatches.reduce((s, b) => s + b.total_players, 0);
              const completed = teamBatches.reduce((s, b) => s + b.completed_count, 0);
              const worst = periodWorstStatus(teamBatches);
              return (
                <div
                  key={period.id}
                  onClick={() => router.push(`/dashboard/evaluations/periods/${period.id}`)}
                  style={{
                    background: '#fff', borderRadius: '8px', border: `1px solid ${worst === 'submitted' ? 'rgba(59,130,246,0.25)' : '#E2E8F0'}`,
                    padding: '16px 20px', boxShadow: worst === 'submitted' ? '0 0 0 3px rgba(59,130,246,0.06)' : '0 1px 2px rgba(0,0,0,0.06)',
                    cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '12px',
                  }}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${primary}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Folder size={17} color={primary} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>{period.period_label} · {period.season_label}</span>
                      <StatusChip status={worst} />
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600', marginBottom: '10px' }}>
                      {teamBatches.length} team{teamBatches.length !== 1 ? 's' : ''}
                    </div>
                    <div style={{ maxWidth: '280px' }}>
                      <ProgressBar completed={completed} total={total} primary={primary} />
                    </div>
                  </div>
                  <ChevronRight size={16} color="#CBD5E1" style={{ marginTop: '6px', flexShrink: 0 }} />
                </div>
              );
            })}

            {/* Standalone batches — started directly (e.g. from the mobile app) without a period */}
            {sortedStandalone.map(batch => (
              <div
                key={batch.id}
                onClick={() => router.push(`/dashboard/evaluations/${batch.id}`)}
                style={{
                  background: '#fff', borderRadius: '8px', border: `1px solid ${batch.status === 'submitted' ? 'rgba(59,130,246,0.25)' : '#E2E8F0'}`,
                  padding: '16px 20px', boxShadow: batch.status === 'submitted' ? '0 0 0 3px rgba(59,130,246,0.06)' : '0 1px 2px rgba(0,0,0,0.06)',
                  cursor: 'pointer', transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = batch.status === 'submitted' ? '0 0 0 3px rgba(59,130,246,0.06)' : '0 1px 2px rgba(0,0,0,0.06)'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
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

                {isAdmin && batch.status === 'submitted' && (
                  <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/dashboard/evaluations/${batch.id}`); }}
                      style={{ padding: '7px 16px', borderRadius: '6px', border: 'none', background: '#3B82F6', color: '#fff', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
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

      {/* ── New Evaluation Period modal ──────────────────────────────────── */}
      {showNewPeriod && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>New Evaluation Period</div>
              <button onClick={() => setShowNewPeriod(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={17} color="#94A3B8" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>Season</label>
                <input value={newSeason} onChange={e => setNewSeason(e.target.value)} placeholder="e.g. 2026-27"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>Period</label>
                <input value={newPeriod} onChange={e => setNewPeriod(e.target.value)} placeholder="e.g. Fall mid-season"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>
                  Teams {newTeamIds.size > 0 && `(${newTeamIds.size} selected)`}
                </label>
                {teamOptions.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#94A3B8' }}>No teams found for this club.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px' }}>
                    {teamOptions.map(t => {
                      const checked = newTeamIds.has(t.id);
                      return (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: '6px', cursor: 'pointer', background: checked ? `${primary}10` : 'transparent' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleTeam(t.id)} style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                          <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: checked ? '700' : '500' }}>{t.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {newError && <div style={{ fontSize: '12.5px', color: '#EF4444', fontWeight: '600' }}>{newError}</div>}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewPeriod(false)} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button
                onClick={createPeriod}
                disabled={creating || newTeamIds.size === 0 || !newSeason.trim() || !newPeriod.trim()}
                style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (newTeamIds.size === 0 || !newSeason.trim() || !newPeriod.trim()) ? 0.5 : 1 }}
              >
                {creating ? 'Creating…' : 'Create Period'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
