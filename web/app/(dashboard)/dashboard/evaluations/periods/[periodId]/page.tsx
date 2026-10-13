'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, Users as UsersIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { StatusChip, ProgressBar } from '@/components/dashboard/evaluation/EvalStatusUI';

type PeriodMeta = { id: string; season_label: string; period_label: string };
type BatchRow = {
  id: string;
  status: 'in_progress' | 'submitted' | 'approved';
  total_players: number;
  completed_count: number;
  teams: { name: string; age_group: string | null; gender: string | null } | null;
  coach: { full_name: string | null } | null;
};

const AGE_GROUPS = ['U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19','Senior'];
const GENDERS = [
  { value: 'boys',  label: 'Boys'  },
  { value: 'girls', label: 'Girls' },
  { value: 'mixed', label: 'Mixed' },
];

export default function EvaluationPeriodPage() {
  const { periodId } = useParams<{ periodId: string }>();
  const router  = useRouter();
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [period,  setPeriod]  = useState<PeriodMeta | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAge, setFilterAge]       = useState('All');
  const [filterGender, setFilterGender] = useState('All');
  const [filterCoach, setFilterCoach]   = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, bRes] = await Promise.all([
      supabase.from('evaluation_periods').select('id,season_label,period_label').eq('id', periodId).single(),
      supabase.from('evaluation_batches')
        .select('id,status,total_players,completed_count,teams(name,age_group,gender),coach:profiles!evaluation_batches_coach_id_fkey(full_name)')
        .eq('period_id', periodId)
        .order('created_at', { ascending: true }),
    ]);
    if (pRes.data) setPeriod(pRes.data as PeriodMeta);
    setBatches((bRes.data ?? []) as unknown as BatchRow[]);
    setLoading(false);
  }, [periodId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { load(); }, [load]);

  const totalPlayers   = batches.reduce((s, b) => s + b.total_players, 0);
  const completedCount = batches.reduce((s, b) => s + b.completed_count, 0);

  const coachOptionsPresent = [...new Set(batches.filter(b => b.coach?.full_name).map(b => b.coach!.full_name as string))].sort();
  const filteredBatches = batches.filter(b => {
    if (filterAge !== 'All' && (b.teams?.age_group ?? '') !== filterAge) return false;
    if (filterGender !== 'All' && (b.teams?.gender ?? '') !== filterGender) return false;
    if (filterCoach === 'Unassigned' && b.coach?.full_name) return false;
    if (filterCoach !== 'All' && filterCoach !== 'Unassigned' && b.coach?.full_name !== filterCoach) return false;
    return true;
  });

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: '#94A3B8' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/dashboard/evaluations')} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '13px', fontWeight: '600', padding: '4px' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ width: '1px', height: '20px', background: '#E2E8F0' }} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '18px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>
            {period?.period_label} · {period?.season_label}
          </h1>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>
            {batches.length} team{batches.length !== 1 ? 's' : ''} · {completedCount}/{totalPlayers} reports complete
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {batches.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <select value={filterAge} onChange={e => setFilterAge(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#374151', outline: 'none', fontFamily: 'inherit', background: '#fff' }}>
              <option value="All">All ages</option>
              {AGE_GROUPS.filter(ag => batches.some(b => b.teams?.age_group === ag)).map(ag => <option key={ag} value={ag}>{ag}</option>)}
            </select>
            <select value={filterGender} onChange={e => setFilterGender(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#374151', outline: 'none', fontFamily: 'inherit', background: '#fff' }}>
              <option value="All">All genders</option>
              {GENDERS.filter(g => batches.some(b => b.teams?.gender === g.value)).map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            {coachOptionsPresent.length > 0 && (
              <select value={filterCoach} onChange={e => setFilterCoach(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#374151', outline: 'none', fontFamily: 'inherit', background: '#fff' }}>
                <option value="All">All coaches</option>
                <option value="Unassigned">Unassigned</option>
                {coachOptionsPresent.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            )}
            {(filterAge !== 'All' || filterGender !== 'All' || filterCoach !== 'All') && (
              <button
                onClick={() => { setFilterAge('All'); setFilterGender('All'); setFilterCoach('All'); }}
                style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: 'none', fontSize: '12.5px', fontWeight: '700', color: primary, cursor: 'pointer' }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {batches.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '56px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#64748B' }}>No teams in this period yet.</div>
          </div>
        ) : filteredBatches.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '56px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#64748B' }}>No teams match these filters.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredBatches.map(b => (
              <div
                key={b.id}
                onClick={() => router.push(`/dashboard/evaluations/${b.id}`)}
                style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>{b.teams?.name ?? '—'}</span>
                    {b.teams?.age_group && (
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px' }}>{b.teams.age_group}</span>
                    )}
                    <StatusChip status={b.status} />
                    {b.coach?.full_name && (
                      <span style={{ fontSize: '12px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <UsersIcon size={11} /> {b.coach.full_name}
                      </span>
                    )}
                  </div>
                  <div style={{ maxWidth: '320px' }}>
                    <ProgressBar completed={b.completed_count} total={b.total_players} primary={primary} />
                  </div>
                </div>
                <ChevronRight size={16} color="#CBD5E1" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
