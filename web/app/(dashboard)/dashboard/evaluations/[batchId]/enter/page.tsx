'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, Sparkles, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { IdeaPickerButton, type IdeaType } from '@/components/dashboard/evaluation/IdeaPicker';
import { getUsedCategoryIds } from '@/lib/evaluationIdeas';

// Same shape as the mobile entry form (app/(app)/[clubSlug]/admin/evaluation-form.tsx)
// for the fields that actually carry evaluation content. bio/stats/idp are
// left out here on purpose: stats is auto-computed from real attendance/
// RSVP/match-tracker history, which this roster has none of (seeded once,
// never actually used in-app), so it would only ever render as a wall of
// blanks; bio and idp are deeper per-player planning fields mobile also
// leaves fully optional. Ratings + the four note sections are the real
// content a coach is actually filling in here.
type ReportData = {
  bio: { position: string; secondary_position: string; developmental_position: string; age_group: string };
  stats: Record<string, string>;
  super_strengths: [string, string, string];
  areas_of_development: [string, string, string];
  outcome_goals: [string, string];
  performance_goals: [string, string];
  idp: { goal: string; measurables: string; action_items: [string, string, string] }[];
};

const EMPTY_REPORT: ReportData = {
  bio: { position: '', secondary_position: '', developmental_position: '', age_group: '' },
  stats: {},
  super_strengths: ['', '', ''],
  areas_of_development: ['', '', ''],
  outcome_goals: ['', ''],
  performance_goals: ['', ''],
  idp: [],
};

type PlayerRow = { id: string; full_name: string; jersey_number: number | null; guardian_emails: string[] | null };

type EvalRow = {
  id: string;
  player_id: string;
  rating_technical: number | null;
  rating_tactical: number | null;
  rating_physical: number | null;
  rating_mental: number | null;
  report_data: Partial<ReportData> | null;
  final_text: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'published';
  send_to_emails: string[] | null;
};

type FormState = {
  evalId: string | null;
  rating_technical: number;
  rating_tactical: number;
  rating_physical: number;
  rating_mental: number;
  report_data: ReportData;
  final_text: string;
  send_to_emails: string[];
  status: 'draft' | 'submitted' | 'approved' | 'published';
  saving: boolean;
  generating: boolean;
  dirty: boolean;
};

function mergeReport(raw: Partial<ReportData> | null | undefined): ReportData {
  if (!raw) return { ...EMPTY_REPORT };
  return {
    bio: { ...EMPTY_REPORT.bio, ...(raw.bio ?? {}) },
    stats: raw.stats ?? {},
    super_strengths: raw.super_strengths?.length === 3 ? raw.super_strengths : EMPTY_REPORT.super_strengths,
    areas_of_development: raw.areas_of_development?.length === 3 ? raw.areas_of_development : EMPTY_REPORT.areas_of_development,
    outcome_goals: raw.outcome_goals?.length === 2 ? raw.outcome_goals : EMPTY_REPORT.outcome_goals,
    performance_goals: raw.performance_goals?.length === 2 ? raw.performance_goals : EMPTY_REPORT.performance_goals,
    idp: raw.idp ?? [],
  };
}

const RATING_AREAS = [
  { key: 'rating_technical', label: 'Technical' },
  { key: 'rating_tactical', label: 'Tactical' },
  { key: 'rating_physical', label: 'Physical' },
  { key: 'rating_mental', label: 'Mental' },
] as const;
const RATING_LABELS: Record<number, string> = { 1: 'Needs Work', 2: 'Developing', 3: 'Good', 4: 'Strong', 5: 'Excellent' };

const NOTE_SECTIONS = [
  { field: 'super_strengths' as const, label: 'Strengths', count: 3, ideaType: 'strengths' as IdeaType, placeholder: (i: number) => `Strength ${i + 1}` },
  { field: 'areas_of_development' as const, label: 'Areas to Develop', count: 3, ideaType: 'weaknesses' as IdeaType, placeholder: (i: number) => `Area ${i + 1}` },
  { field: 'outcome_goals' as const, label: 'Outcome Goals', count: 2, ideaType: 'outcomeGoals' as IdeaType, placeholder: (i: number) => `Goal ${i + 1} (e.g. "Start for the A team")` },
  { field: 'performance_goals' as const, label: 'Performance Goals', count: 2, ideaType: 'performanceGoals' as IdeaType, placeholder: (i: number) => `Goal ${i + 1} (e.g. "Win 70% of 1v1 duels")` },
];

export default function BulkEnterEvaluationsPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const router = useRouter();
  const { club, profile } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [batch, setBatch] = useState<{ team_id: string; season_label: string; period_label: string; teams: { name: string } | null; coach_id: string } | null>(null);
  const [roster, setRoster] = useState<PlayerRow[]>([]);
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: batchRow }, { data: evalRows }] = await Promise.all([
      supabase.from('evaluation_batches').select('team_id, season_label, period_label, coach_id, teams(name)').eq('id', batchId).single(),
      supabase.from('player_evaluations').select('id, player_id, rating_technical, rating_tactical, rating_physical, rating_mental, report_data, final_text, status, send_to_emails').eq('batch_id', batchId),
    ]);
    if (!batchRow) { setLoading(false); return; }
    setBatch(batchRow as unknown as NonNullable<typeof batch>);

    const { data: players } = await supabase
      .from('players').select('id, full_name, jersey_number, guardian_emails')
      .eq('team_id', batchRow.team_id).order('full_name');
    const rosterRows = (players ?? []) as PlayerRow[];
    setRoster(rosterRows);

    const evalByPlayer = new Map(((evalRows ?? []) as EvalRow[]).map(e => [e.player_id, e]));
    const nextForms: Record<string, FormState> = {};
    for (const p of rosterRows) {
      const existing = evalByPlayer.get(p.id);
      nextForms[p.id] = {
        evalId: existing?.id ?? null,
        rating_technical: existing?.rating_technical ?? 3,
        rating_tactical: existing?.rating_tactical ?? 3,
        rating_physical: existing?.rating_physical ?? 3,
        rating_mental: existing?.rating_mental ?? 3,
        report_data: mergeReport(existing?.report_data),
        final_text: existing?.final_text ?? '',
        send_to_emails: existing?.send_to_emails ?? [],
        status: existing?.status ?? 'draft',
        saving: false,
        generating: false,
        dirty: false,
      };
    }
    setForms(nextForms);
    setLoading(false);
  }, [batchId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
  useEffect(() => { load(); }, [load]);

  const doneCount = useMemo(() => Object.values(forms).filter(f => f.status !== 'draft').length, [forms]);

  function patchForm(playerId: string, patch: Partial<FormState>) {
    setForms(prev => ({ ...prev, [playerId]: { ...prev[playerId], ...patch, dirty: true } }));
  }
  function patchNote(playerId: string, field: typeof NOTE_SECTIONS[number]['field'], index: number, value: string) {
    setForms(prev => {
      const f = prev[playerId];
      const arr = [...f.report_data[field]] as string[];
      arr[index] = value;
      return { ...prev, [playerId]: { ...f, report_data: { ...f.report_data, [field]: arr }, dirty: true } };
    });
  }
  // Drops a picked idea into the next empty slot for that section; if every
  // slot is already filled, replaces the last one rather than doing nothing
  // silently — the coach can still edit it right after.
  function pickIdea(playerId: string, field: typeof NOTE_SECTIONS[number]['field'], text: string) {
    setForms(prev => {
      const f = prev[playerId];
      const arr = [...f.report_data[field]] as string[];
      const emptyIdx = arr.findIndex(v => !v.trim());
      const idx = emptyIdx !== -1 ? emptyIdx : arr.length - 1;
      arr[idx] = text;
      return { ...prev, [playerId]: { ...f, report_data: { ...f.report_data, [field]: arr }, dirty: true } };
    });
  }
  function toggleEmail(playerId: string, email: string) {
    setForms(prev => {
      const f = prev[playerId];
      const set = new Set(f.send_to_emails);
      if (set.has(email)) set.delete(email); else set.add(email);
      return { ...prev, [playerId]: { ...f, send_to_emails: [...set], dirty: true } };
    });
  }

  async function generateAI(player: PlayerRow) {
    const f = forms[player.id];
    patchForm(player.id, { generating: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/ai/generate-evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          player_name: player.full_name,
          position: f.report_data.bio.position,
          season_label: batch?.season_label, period_label: batch?.period_label,
          rating_technical: f.rating_technical, rating_tactical: f.rating_tactical,
          rating_physical: f.rating_physical, rating_mental: f.rating_mental,
          super_strengths: f.report_data.super_strengths,
          areas_of_development: f.report_data.areas_of_development,
          outcome_goals: f.report_data.outcome_goals,
          performance_goals: f.report_data.performance_goals,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const polished = await res.json();
      setForms(prev => {
        const cur = prev[player.id];
        return {
          ...prev,
          [player.id]: {
            ...cur,
            final_text: polished.summary ?? cur.final_text,
            report_data: {
              ...cur.report_data,
              super_strengths: polished.super_strengths ?? cur.report_data.super_strengths,
              areas_of_development: polished.areas_of_development ?? cur.report_data.areas_of_development,
              outcome_goals: polished.outcome_goals ?? cur.report_data.outcome_goals,
              performance_goals: polished.performance_goals ?? cur.report_data.performance_goals,
            },
            generating: false, dirty: true,
          },
        };
      });
    } catch {
      patchForm(player.id, { generating: false });
      setToast('AI generation failed — try again.');
      setTimeout(() => setToast(''), 3000);
    }
  }

  async function saveOne(player: PlayerRow, submitNow: boolean) {
    const f = forms[player.id];
    if (!batch || !profile) return;
    patchForm(player.id, { saving: true });

    const payload = {
      batch_id: batchId, club_id: club!.id, team_id: batch.team_id,
      player_id: player.id, coach_id: batch.coach_id,
      season_label: batch.season_label, period_label: batch.period_label,
      rating_technical: f.rating_technical, rating_tactical: f.rating_tactical,
      rating_physical: f.rating_physical, rating_mental: f.rating_mental,
      report_data: f.report_data,
      final_text: f.final_text,
      send_to_emails: f.send_to_emails,
      status: (submitNow ? 'submitted' : 'draft') as 'draft' | 'submitted',
      ...(submitNow ? { submitted_at: new Date().toISOString() } : {}),
    };

    const { data, error } = f.evalId
      ? await supabase.from('player_evaluations').update(payload).eq('id', f.evalId).select('id').single()
      : await supabase.from('player_evaluations').insert(payload).select('id').single();

    if (error) {
      patchForm(player.id, { saving: false });
      setToast(`Could not save ${player.full_name}: ${error.message}`);
      setTimeout(() => setToast(''), 4000);
      return;
    }

    const { count } = await supabase
      .from('player_evaluations').select('*', { count: 'exact', head: true })
      .eq('batch_id', batchId).neq('status', 'draft');
    await supabase.from('evaluation_batches').update({ completed_count: count ?? 0 }).eq('id', batchId);

    setForms(prev => ({ ...prev, [player.id]: { ...prev[player.id], evalId: data?.id ?? prev[player.id].evalId, status: payload.status, saving: false, dirty: false } }));
    setToast(submitNow ? `${player.full_name} submitted` : `${player.full_name} saved`);
    setTimeout(() => setToast(''), 2000);
  }

  function toggleExpanded(playerId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
      return next;
    });
  }

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>Loading…</div>;
  if (!batch) return <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>Batch not found.</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px' }}>
        <button onClick={() => router.push(`/dashboard/evaluations/${batchId}`)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#64748B', fontSize: '13px', fontWeight: '600', cursor: 'pointer', padding: 0, marginBottom: '8px', fontFamily: 'inherit' }}>
          <ArrowLeft size={14} /> Back to batch
        </button>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '900', color: '#0D1117', margin: 0 }}>{batch.teams?.name ?? 'Team'} — Evaluations</h1>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{batch.period_label} · {batch.season_label}</div>
          </div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: primary }}>{doneCount} / {roster.length} submitted</div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 24px 80px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {roster.map(player => {
          const f = forms[player.id];
          if (!f) return null;
          const isOpen = expanded.has(player.id);
          const emails = player.guardian_emails ?? [];
          // Which idea categories this player's already-picked strengths/
          // weaknesses came from — lets the two Goals pickers suggest goals
          // that actually follow from what's already been identified.
          const usedCategoryIds = getUsedCategoryIds(f.report_data.super_strengths, f.report_data.areas_of_development);
          return (
            <div key={player.id} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <button onClick={() => toggleExpanded(player.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{player.full_name}</span>
                  {player.jersey_number != null && <span style={{ fontSize: '12px', color: '#94A3B8' }}>#{player.jersey_number}</span>}
                  {f.status !== 'draft' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: '700', color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '99px', padding: '2px 8px' }}>
                      <Check size={10} /> Submitted
                    </span>
                  )}
                  {f.status === 'draft' && f.evalId && (
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '99px', padding: '2px 8px' }}>Draft saved</span>
                  )}
                  {emails.length > 0 && (
                    f.send_to_emails.length > 0 ? (
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '99px', padding: '2px 8px' }}>
                        {f.send_to_emails.length} recipient{f.send_to_emails.length !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '99px', padding: '2px 8px' }}>
                        0 recipients selected
                      </span>
                    )
                  )}
                </div>
                {isOpen ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
              </button>

              {isOpen && (
                <div style={{ padding: '4px 18px 18px', borderTop: '1px solid #F1F5F9' }}>
                  {/* Ratings */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', margin: '14px 0' }}>
                    {RATING_AREAS.map(area => (
                      <div key={area.key}>
                        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{area.label}</div>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} onClick={() => patchForm(player.id, { [area.key]: n } as Partial<FormState>)}
                              title={RATING_LABELS[n]}
                              style={{
                                flex: 1, padding: '8px 0', borderRadius: '6px', border: `1.5px solid ${f[area.key] === n ? primary : '#E2E8F0'}`,
                                background: f[area.key] === n ? primary : '#fff', color: f[area.key] === n ? '#fff' : '#94A3B8',
                                fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
                              }}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Note sections */}
                  {NOTE_SECTIONS.map(section => (
                    <div key={section.field} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>{section.label}</div>
                        <IdeaPickerButton
                          type={section.ideaType} primary={primary}
                          onPick={text => pickIdea(player.id, section.field, text)}
                          suggestedCategoryIds={section.ideaType === 'outcomeGoals' || section.ideaType === 'performanceGoals' ? usedCategoryIds : undefined}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {Array.from({ length: section.count }).map((_, i) => (
                          <input
                            key={i}
                            value={f.report_data[section.field][i]}
                            onChange={e => patchNote(player.id, section.field, i, e.target.value)}
                            placeholder={section.placeholder(i)}
                            style={{ width: '100%', padding: '8px 11px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* AI summary */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>Summary</div>
                      <button onClick={() => generateAI(player)} disabled={f.generating}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: primary, fontSize: '12px', fontWeight: '700', cursor: f.generating ? 'default' : 'pointer', fontFamily: 'inherit', padding: 0 }}>
                        {f.generating ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                        {f.generating ? 'Polishing…' : 'Generate with AI'}
                      </button>
                    </div>
                    <textarea
                      value={f.final_text}
                      onChange={e => patchForm(player.id, { final_text: e.target.value })}
                      placeholder="Write a short summary, or fill in the sections above and hit Generate with AI."
                      rows={3}
                      style={{ width: '100%', padding: '9px 11px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>

                  {/* Send recipients — opt-in on purpose. An email on file isn't proof it
                      belongs to this family (see players.guardian_emails' own sourcing
                      caveats), so nothing is pre-checked; the coach who knows these kids
                      is the one confirming who actually receives it. */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Send Evaluation To</div>
                    {emails.length === 0 ? (
                      <div style={{ fontSize: '13px', color: '#94A3B8', fontStyle: 'italic' }}>No email on file for this player.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {emails.map(email => {
                          const checked = f.send_to_emails.includes(email);
                          return (
                            <label key={email} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 11px', borderRadius: '7px', border: `1.5px solid ${checked ? primary : '#E2E8F0'}`, background: checked ? `${primary}14` : '#fff', cursor: 'pointer', fontSize: '13px', color: '#0F172A' }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleEmail(player.id, email)} style={{ accentColor: primary, width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }} />
                              {email}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {emails.length > 0 && (
                      <div style={{ fontSize: '11px', color: f.send_to_emails.length === 0 ? '#B45309' : '#94A3B8', fontWeight: f.send_to_emails.length === 0 ? '700' : '400', marginTop: '7px' }}>
                        {f.send_to_emails.length} of {emails.length} selected{f.send_to_emails.length === 0 ? ' — nothing will be sent to this player until at least one is checked' : ''}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => saveOne(player, false)} disabled={f.saving}
                      style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: '13px', fontWeight: '700', cursor: f.saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                      Save draft
                    </button>
                    <button onClick={() => saveOne(player, true)} disabled={f.saving}
                      style={{ padding: '8px 16px', borderRadius: '7px', border: 'none', background: primary, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: f.saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                      {f.saving ? 'Saving…' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#0F172A', color: '#fff', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', zIndex: 50 }}>
          {toast}
        </div>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
