'use client';

// Extracted out of evaluations/[batchId]/page.tsx so the player profile's
// Development tab can show the exact same report card instead of
// duplicating ~150 lines of radar-chart/chip SVG and layout. That page now
// imports from here too.

import { X } from 'lucide-react';

export type ReportData = {
  bio:   { position: string; birth_year: string; school: string };
  stats: { rsvp_pct: string; practice_pct: string; game_pct: string; games_played: string; minutes_played: string; goals: string; assists: string; yellow_cards: string; secondary_foot: string };
  super_strengths:      [string, string, string];
  areas_of_development: [string, string, string];
  outcome_goals:        [string, string];
  performance_goals:    [string, string];
};

export type EvalRow = {
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
  players: { full_name: string; jersey_number: number | null; photo_url: string | null } | null;
};

const RADAR_COLORS = ['#3B82F6', '#F59E0B', '#22C55E', '#8B5CF6'];
const RADAR_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
const RADAR_LABELS = ['Technical', 'Physical', 'Mental', 'Tactical'];

export function RadarChart({ ratings, primary }: {
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

export function SectionHead({ label, primary }: { label: string; primary: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${primary}`, paddingLeft: '10px', marginBottom: '10px' }}>
      <span style={{ fontSize: '9px', fontWeight: '900', color: primary, letterSpacing: '1.2px', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

export function BulletList({ items, primary }: { items: string[]; primary: string }) {
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

export function StatChip({ val, label, color }: { val: string; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: '56px' }}>
      <div style={{ fontSize: '15px', fontWeight: '900', color }}>{val}</div>
      <div style={{ fontSize: '8px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.5px', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

export function EvaluationReportPanel({ ev, primary, clubLogoUrl, clubName, onClose, onPrev, onNext, hasPrev, hasNext }: {
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
                {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
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
