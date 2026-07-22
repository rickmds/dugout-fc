'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Star, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type ReportData = {
  bio:   { position: string; birth_year: string; school: string };
  stats: { rsvp_pct: string; practice_pct: string; game_pct: string; games_played: string; minutes_played: string; goals: string; assists: string; yellow_cards: string; secondary_foot: string };
  super_strengths:      [string, string, string];
  areas_of_development: [string, string, string];
  outcome_goals:        [string, string];
  performance_goals:    [string, string];
};

type EvalRow = {
  id: string;
  player_id: string;
  season_label: string;
  period_label: string;
  status: 'draft' | 'submitted' | 'approved' | 'published';
  rating_technical: number | null;
  rating_tactical:  number | null;
  rating_physical:  number | null;
  rating_mental:    number | null;
  report_data:  ReportData | null;
  final_text:   string | null;
  published_at: string | null;
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
const RADAR_COLORS = ['#3B82F6', '#F59E0B', '#22C55E', '#8B5CF6'];
const RADAR_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
const RADAR_LABELS = ['Technical', 'Physical', 'Mental', 'Tactical'];

function RadarChart({ ratings, primary }: {
  ratings: { technical: number | null; tactical: number | null; physical: number | null; mental: number | null };
  primary: string;
}) {
  const CX = 110, CY = 110, MR = 72;
  const values = [ratings.technical ?? 0, ratings.physical ?? 0, ratings.mental ?? 0, ratings.tactical ?? 0];

  function pt(val: number, angle: number) {
    const r = (val / 5) * MR;
    return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
  }
  function gridPoly(lvl: number) {
    return RADAR_ANGLES.map(a => { const r = (lvl / 5) * MR; return `${CX + r * Math.cos(a)},${CY + r * Math.sin(a)}`; }).join(' ');
  }

  const dataPts  = values.map((v, i) => pt(v, RADAR_ANGLES[i]));
  const dataPoly = dataPts.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width="220" height="220" viewBox="0 0 220 220">
      {[1,2,3,4,5].map(l => <polygon key={l} points={gridPoly(l)} fill="none" stroke={l===5?'rgba(0,0,0,0.15)':'rgba(0,0,0,0.07)'} strokeWidth={l===5?1.5:1} />)}
      {RADAR_ANGLES.map((a,i) => <line key={i} x1={CX} y1={CY} x2={CX+MR*Math.cos(a)} y2={CY+MR*Math.sin(a)} stroke="rgba(0,0,0,0.08)" strokeWidth={1}/>)}
      <polygon points={dataPoly} fill={primary} fillOpacity={0.15} stroke={primary} strokeWidth={2.5} strokeLinejoin="round"/>
      {dataPts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r={5} fill={RADAR_COLORS[i]}/>)}
      {RADAR_LABELS.map((lbl,i) => {
        const lx = CX + (MR+22)*Math.cos(RADAR_ANGLES[i]);
        const ly = CY + (MR+22)*Math.sin(RADAR_ANGLES[i]);
        const ta = Math.abs(RADAR_ANGLES[i]) < 0.1 ? 'start' : Math.abs(Math.abs(RADAR_ANGLES[i])-Math.PI) < 0.1 ? 'end' : 'middle';
        return (
          <g key={i}>
            <text x={lx} y={ly-7}  textAnchor={ta} fontSize={14} fontWeight="900" fill={RADAR_COLORS[i]}>{values[i] || '—'}</text>
            <text x={lx} y={ly+6}  textAnchor={ta} fontSize={7}  fontWeight="800" fill={RADAR_COLORS[i]} letterSpacing={1}>{lbl.toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SectionHead({ label, primary }: { label: string; primary: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${primary}`, paddingLeft: '10px', marginBottom: '10px' }}>
      <span style={{ fontSize: '9px', fontWeight: '900', color: primary, letterSpacing: '1.2px', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

function BulletList({ items, primary }: { items: string[]; primary: string }) {
  const filtered = (items || []).filter(Boolean);
  if (!filtered.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {filtered.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ minWidth: '18px', height: '18px', borderRadius: '9px', background: `${primary}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '900', color: primary, flexShrink: 0, marginTop: '1px' }}>{i+1}</div>
          <p style={{ margin: 0, fontSize: '12px', color: '#1e293b', lineHeight: 1.5, fontWeight: '500' }}>{t}</p>
        </div>
      ))}
    </div>
  );
}

function StatChip({ val, label, color }: { val: string; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: '56px' }}>
      <div style={{ fontSize: '15px', fontWeight: '900', color }}>{val}</div>
      <div style={{ fontSize: '8px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.5px', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

function ReportPanel({ ev, primary, clubLogoUrl, clubName, onClose, onPrev, onNext, hasPrev, hasNext }: {
  ev: EvalRow; primary: string; clubLogoUrl: string | null; clubName: string;
  onClose: () => void; onPrev: () => void; onNext: () => void; hasPrev: boolean; hasNext: boolean;
}) {
  const rd         = ev.report_data;
  const playerName = ev.players?.full_name ?? '';
  const lastName   = playerName.split(' ').slice(-1)[0]?.toUpperCase() ?? '';
  const jerseyNum  = ev.players?.jersey_number;
  const pubDate    = ev.published_at
    ? new Date(ev.published_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

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
          <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color="#64748B" />
          </button>
        </div>

        {/* Report card */}
        <div style={{ padding: '16px', flex: 1 }}>
          <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>

            {/* Band */}
            <div style={{ background: primary, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {clubLogoUrl && <img src={clubLogoUrl} alt={clubName} style={{ width: '34px', height: '34px', objectFit: 'contain' }} />}
                <div>
                  <div style={{ fontSize: '7px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', marginBottom: '1px' }}>PLAYER DEVELOPMENT REPORT</div>
                  <div style={{ fontSize: '13px', fontWeight: '900', color: '#fff' }}>{clubName}</div>
                </div>
              </div>
              <div style={{ fontSize: '9px', fontWeight: '700', color: 'rgba(255,255,255,0.65)' }}>{pubDate}</div>
            </div>

            {/* Hero */}
            <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #f1f5f9', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', fontSize: '80px', fontWeight: '900', letterSpacing: '-5px', top: '-10px', left: '14px', color: `${primary}28`, lineHeight: 1, pointerEvents: 'none' }}>{lastName}</div>
              <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.5px', marginBottom: '8px', position: 'relative' }}>{playerName}</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', position: 'relative' }}>
                {rd?.bio?.position && <span style={{ padding: '3px 10px', borderRadius: '20px', border: `1px solid ${primary}44`, background: `${primary}22`, fontSize: '11px', fontWeight: '700', color: primary }}>{rd.bio.position}</span>}
                {jerseyNum != null && <span style={{ padding: '3px 10px', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#f1f5f9', fontSize: '11px', fontWeight: '700', color: '#475569' }}>#{jerseyNum}</span>}
                <span style={{ padding: '3px 10px', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#f1f5f9', fontSize: '11px', fontWeight: '700', color: '#475569' }}>{ev.period_label} · {ev.season_label}</span>
              </div>
            </div>

            {/* Profile */}
            {(rd?.bio?.birth_year || rd?.bio?.school) && (
              <div style={{ padding: '10px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '8px', fontWeight: '800', color: '#94a3b8', letterSpacing: '1.5px', marginBottom: '8px' }}>PROFILE</div>
                <div style={{ display: 'flex', gap: '24px' }}>
                  {rd.bio.birth_year && <StatChip val={rd.bio.birth_year} label="BIRTH YEAR" color="#0f172a" />}
                  {rd.bio.school     && <StatChip val={rd.bio.school}     label="SCHOOL"     color="#0f172a" />}
                </div>
              </div>
            )}

            {/* Attendance */}
            {(rd?.stats?.rsvp_pct || rd?.stats?.practice_pct || rd?.stats?.game_pct) && (
              <div style={{ padding: '10px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '8px', fontWeight: '800', color: '#94a3b8', letterSpacing: '1.5px', marginBottom: '8px' }}>ATTENDANCE</div>
                <div style={{ display: 'flex', gap: '20px' }}>
                  {rd.stats.rsvp_pct     && <StatChip val={rd.stats.rsvp_pct}     label="RSVP"     color={primary} />}
                  {rd.stats.practice_pct && <StatChip val={rd.stats.practice_pct} label="PRACTICE" color={primary} />}
                  {rd.stats.game_pct     && <StatChip val={rd.stats.game_pct}     label="GAMES"    color={primary} />}
                </div>
              </div>
            )}

            {/* Season */}
            {rd?.stats?.games_played && (
              <div style={{ padding: '10px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '8px', fontWeight: '800', color: '#94a3b8', letterSpacing: '1.5px', marginBottom: '8px' }}>SEASON</div>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {rd.stats.games_played                           && <StatChip val={rd.stats.games_played}   label="PLAYED"   color={primary} />}
                  {rd.stats.goals   && rd.stats.goals   !== '0'   && <StatChip val={rd.stats.goals}          label="GOALS"    color={primary} />}
                  {rd.stats.assists && rd.stats.assists !== '0'   && <StatChip val={rd.stats.assists}        label="ASSISTS"  color={primary} />}
                  {rd.stats.minutes_played                         && <StatChip val={rd.stats.minutes_played} label="MINUTES"  color="#0f172a" />}
                  {rd.stats.secondary_foot                         && <StatChip val={rd.stats.secondary_foot} label="2ND FOOT" color="#0f172a" />}
                </div>
              </div>
            )}

            {/* Radar */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <RadarChart ratings={{ technical: ev.rating_technical, tactical: ev.rating_tactical, physical: ev.rating_physical, mental: ev.rating_mental }} primary={primary} />
            </div>

            {/* Strengths + Dev */}
            {(rd?.super_strengths?.some(Boolean) || rd?.areas_of_development?.some(Boolean)) && (
              <div style={{ display: 'flex', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                {rd?.super_strengths?.some(Boolean) && (
                  <div style={{ flex: 1 }}>
                    <SectionHead label="Super Strengths" primary={primary} />
                    <BulletList items={rd.super_strengths} primary={primary} />
                  </div>
                )}
                {rd?.super_strengths?.some(Boolean) && rd?.areas_of_development?.some(Boolean) && <div style={{ width: '1px', background: '#f1f5f9', margin: '0 16px' }} />}
                {rd?.areas_of_development?.some(Boolean) && (
                  <div style={{ flex: 1 }}>
                    <SectionHead label="Development" primary={primary} />
                    <BulletList items={rd.areas_of_development} primary={primary} />
                  </div>
                )}
              </div>
            )}

            {/* Goals */}
            {(rd?.outcome_goals?.some(Boolean) || rd?.performance_goals?.some(Boolean)) && (
              <div style={{ display: 'flex', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                {rd?.outcome_goals?.some(Boolean) && (
                  <div style={{ flex: 1 }}>
                    <SectionHead label="Outcome Goals" primary={primary} />
                    <BulletList items={rd.outcome_goals} primary={primary} />
                  </div>
                )}
                {rd?.outcome_goals?.some(Boolean) && rd?.performance_goals?.some(Boolean) && <div style={{ width: '1px', background: '#f1f5f9', margin: '0 16px' }} />}
                {rd?.performance_goals?.some(Boolean) && (
                  <div style={{ flex: 1 }}>
                    <SectionHead label="Perf. Goals" primary={primary} />
                    <BulletList items={rd.performance_goals} primary={primary} />
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            {ev.final_text?.trim() && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                <SectionHead label="Coach's Summary" primary={primary} />
                <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.65 }}>{ev.final_text}</p>
              </div>
            )}

            {/* Footer */}
            <div style={{ padding: '10px 20px' }}>
              <span style={{ fontSize: '9px', color: `${primary}99`, fontWeight: '600', letterSpacing: '0.3px' }}>
                🎖 {clubName} · {ev.period_label} · {ev.season_label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

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
      supabase.from('player_evaluations').select('*, players(full_name, jersey_number)').eq('batch_id', batchId).order('players(full_name)'),
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
    await supabase.from('player_evaluations').update({ status: 'published', approved_by: profile!.id, approved_at: now, published_at: now }).eq('batch_id', batchId).eq('status', 'submitted');
    await supabase.from('evaluation_batches').update({ status: 'approved', approved_by: profile!.id, approved_at: now }).eq('id', batchId);

    // Notify players — get profile_ids for all players in this batch
    const playerIds = evals.map((e) => e.player_id).filter(Boolean);
    if (playerIds.length) {
      const { data: players } = await supabase.from('players').select('profile_id').in('id', playerIds);
      const profileIds = (players ?? []).map((p: any) => p.profile_id).filter(Boolean) as string[];
      if (profileIds.length) {
        supabase.functions.invoke('send-push', {
          body: {
            profile_ids: profileIds,
            title: '📊 Your evaluation is ready',
            body: `Your ${batch.period_label} report from your coach is now available.`,
            data: { type: 'evaluation_published' },
          },
        }).catch(() => {});
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
        ) : evals.map((ev, idx) => {
          const isSelected = selected === ev.id;
          const ready = ev.status !== 'draft';
          return (
            <div
              key={ev.id}
              onClick={() => setSelected(isSelected ? null : ev.id)}
              style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${isSelected ? primary : ready ? '#E2E8F0' : '#FCA5A5'}`, overflow: 'hidden', boxShadow: isSelected ? `0 0 0 3px ${primary}22` : '0 1px 4px rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSelected ? primary : `${primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: isSelected ? '#fff' : primary, flexShrink: 0, transition: 'background 0.15s' }}>
                  {ev.players?.full_name?.[0] ?? '?'}
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
        <ReportPanel
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
