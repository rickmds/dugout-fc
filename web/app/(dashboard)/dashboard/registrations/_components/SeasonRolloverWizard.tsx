'use client';

import { useState } from 'react';
import { Check, ChevronRight, Archive, Copy, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { labelSt, inputSt, backBtnSt } from './shared';
import type { RegForm } from './shared';

type Step = 'select' | 'configure' | 'archive' | 'confirm';

type FormConfig = {
  formId: string;
  newTitle: string;
  newSeason: string;
  copyFields: boolean;
  copyPricing: boolean;
  copyDocs: boolean;
  openAt: string;
  closeAt: string;
};

export default function SeasonRolloverWizard({ forms, onDone, onCancel }: {
  forms: RegForm[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { profile, club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [step, setStep]           = useState<Step>('select');
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [configs, setConfigs]     = useState<Record<string, FormConfig>>({});
  const [archiveOld, setArchiveOld] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [results, setResults]     = useState<{ title: string; success: boolean; error?: string }[]>([]);
  const [done, setDone]           = useState(false);

  const liveForms = forms.filter((f) => !f.archived);
  const nextSeason = guessNextSeason();

  function toggleForm(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function initConfigs() {
    const initial: Record<string, FormConfig> = {};
    for (const id of selected) {
      const f = forms.find((x) => x.id === id);
      if (!f) continue;
      initial[id] = {
        formId:      f.id,
        newTitle:    suggestNewTitle(f.title),
        newSeason:   nextSeason,
        copyFields:  true,
        copyPricing: true,
        copyDocs:    true,
        openAt:      '',
        closeAt:     '',
      };
    }
    setConfigs(initial);
  }

  function updateConfig(id: string, patch: Partial<FormConfig>) {
    setConfigs((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  }

  async function execute() {
    if (!club) return;
    setExecuting(true);
    const res: typeof results = [];

    for (const id of selected) {
      const cfg = configs[id];
      const orig = forms.find((f) => f.id === id);
      if (!orig || !cfg) continue;

      try {
        const payload: Record<string, unknown> = {
          club_id:        club.id,
          team_id:        orig.team_id,
          title:          cfg.newTitle,
          status:         'draft',
          season_label:   cfg.newSeason,
          created_by:     profile?.id,
          fields:         cfg.copyFields ? orig.fields : [],
          max_spots:      orig.max_spots,
          confirmation_message: orig.confirmation_message,
          send_confirmation_email: orig.send_confirmation_email,
          financial_aid_enabled: orig.financial_aid_enabled,
          required_docs:  cfg.copyDocs ? orig.required_docs : [],
          open_at:        cfg.openAt || null,
          close_at:       cfg.closeAt || null,
        };
        if (cfg.copyPricing) {
          payload.price          = orig.price;
          payload.currency       = orig.currency;
          payload.payment_options = orig.payment_options;
          payload.plan_installments = orig.plan_installments;
          payload.plan_frequency = orig.plan_frequency;
          payload.plan_deposit   = orig.plan_deposit;
          payload.price_mode     = orig.price_mode;
        }

        const { error: insertErr } = await supabase.from('registration_forms').insert(payload);
        if (insertErr) throw insertErr;

        if (archiveOld) {
          await supabase.from('registration_forms').update({ archived: true, status: 'closed' }).eq('id', id);
        }

        res.push({ title: cfg.newTitle, success: true });
      } catch (e: unknown) {
        const msg = (e as { message?: string }).message ?? 'Unknown error';
        res.push({ title: cfg.newTitle, success: false, error: msg });
      }
    }

    setResults(res);
    setExecuting(false);
    setDone(true);
  }

  if (done) {
    const ok  = results.filter((r) => r.success);
    const bad = results.filter((r) => !r.success);
    return (
      <div style={{ padding: '48px 32px', maxWidth: '560px' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px', textAlign: 'center' }}>🎉</div>
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: '8px' }}>Rollover complete</h1>
        <p style={{ fontSize: '14px', color: '#64748B', textAlign: 'center', marginBottom: '28px' }}>
          {ok.length} form{ok.length !== 1 ? 's' : ''} created{archiveOld ? ' and old forms archived' : ''}.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
          {results.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: r.success ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${r.success ? '#D1FAE5' : '#FECACA'}`, borderRadius: '10px', padding: '12px 14px' }}>
              {r.success ? <Check size={16} color="#16A34A" /> : <AlertCircle size={16} color="#DC2626" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: r.success ? '#15803D' : '#DC2626' }}>{r.title}</div>
                {r.error && <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>{r.error}</div>}
              </div>
            </div>
          ))}
        </div>
        {bad.length > 0 && (
          <p style={{ fontSize: '12px', color: '#DC2626', textAlign: 'center', marginBottom: '16px' }}>
            {bad.length} form{bad.length !== 1 ? 's' : ''} failed — check above for details.
          </p>
        )}
        <button onClick={onDone} style={{ width: '100%', padding: '13px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to Forms
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '860px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <button onClick={onCancel} style={backBtnSt}>← Cancel</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Season rollover</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0' }}>Duplicate existing forms for the new season and archive the old ones.</p>
        </div>
        <WizardSteps step={step} primary={primary} />
      </div>

      {/* ── Step 1 — Select ── */}
      {step === 'select' && (
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '14px' }}>Which forms do you want to roll over?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {liveForms.length === 0 && (
              <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>No active forms to roll over</div>
            )}
            {liveForms.map((f) => (
              <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: selected.has(f.id) ? `${primary}08` : '#fff', border: `1.5px solid ${selected.has(f.id) ? primary : '#E2E8F0'}`, borderRadius: '12px', padding: '14px 16px', cursor: 'pointer', transition: 'all 0.1s' }}>
                <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleForm(f.id)} style={{ width: '16px', height: '16px', accentColor: primary } as React.CSSProperties} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A' }}>{f.title}</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                    {f.season_label ? `Season: ${f.season_label} · ` : ''}
                    {(f.submission_count ?? 0)} submission{f.submission_count !== 1 ? 's' : ''} · Status: {f.status}
                  </div>
                </div>
                {selected.has(f.id) && <Check size={16} color={primary} />}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onCancel} style={backBtnSt}>Cancel</button>
            <button onClick={() => { initConfigs(); setStep('configure'); }} disabled={selected.size === 0}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', background: selected.size === 0 ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              Configure {selected.size} form{selected.size !== 1 ? 's' : ''} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2 — Configure ── */}
      {step === 'configure' && (
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '14px' }}>Configure new versions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            {[...selected].map((id) => {
              const orig = forms.find((f) => f.id === id)!;
              const cfg  = configs[id];
              if (!cfg) return null;
              return (
                <div key={id} style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden' }}>
                  <div style={{ background: '#F8FAFC', padding: '12px 16px', borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{orig.title}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Original {orig.season_label ? `(${orig.season_label})` : ''}</div>
                  </div>
                  <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={labelSt}>New form title</label>
                      <input value={cfg.newTitle} onChange={(e) => updateConfig(id, { newTitle: e.target.value })} style={inputSt} />
                    </div>
                    <div>
                      <label style={labelSt}>Season label</label>
                      <input value={cfg.newSeason} onChange={(e) => updateConfig(id, { newSeason: e.target.value })} placeholder="e.g. 2026/27" style={inputSt} />
                    </div>
                    <div>
                      <label style={labelSt}>Open from</label>
                      <input type="datetime-local" value={cfg.openAt} onChange={(e) => updateConfig(id, { openAt: e.target.value })} style={inputSt} />
                    </div>
                    <div>
                      <label style={labelSt}>Close at</label>
                      <input type="datetime-local" value={cfg.closeAt} onChange={(e) => updateConfig(id, { closeAt: e.target.value })} style={inputSt} />
                    </div>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '20px' }}>
                      {[
                        { key: 'copyFields',  label: 'Copy all fields' },
                        { key: 'copyPricing', label: 'Copy pricing' },
                        { key: 'copyDocs',    label: 'Copy required documents' },
                      ].map(({ key, label }) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151', fontWeight: '500' }}>
                          <input type="checkbox" checked={cfg[key as keyof FormConfig] as boolean} onChange={(e) => updateConfig(id, { [key]: e.target.checked })}
                            style={{ width: '15px', height: '15px', accentColor: primary } as React.CSSProperties} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setStep('select')} style={backBtnSt}>← Back</button>
            <button onClick={() => setStep('archive')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 — Archive ── */}
      {step === 'archive' && (
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Archive old forms?</h2>
          <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Old forms will be closed and moved to the archive. Existing submissions are kept.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
            <label style={{ display: 'flex', gap: '14px', background: archiveOld ? '#F0FDF4' : '#fff', border: `1.5px solid ${archiveOld ? '#86EFAC' : '#E2E8F0'}`, borderRadius: '12px', padding: '16px', cursor: 'pointer' }}>
              <input type="radio" checked={archiveOld} onChange={() => setArchiveOld(true)} style={{ marginTop: '3px', accentColor: '#16A34A' } as React.CSSProperties} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}><Archive size={14} color="#16A34A" /> Yes — close and archive old forms</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>Old forms become status Closed and are hidden from the main list. All submission data is kept.</div>
              </div>
            </label>
            <label style={{ display: 'flex', gap: '14px', background: !archiveOld ? '#FFF7ED' : '#fff', border: `1.5px solid ${!archiveOld ? '#FED7AA' : '#E2E8F0'}`, borderRadius: '12px', padding: '16px', cursor: 'pointer' }}>
              <input type="radio" checked={!archiveOld} onChange={() => setArchiveOld(false)} style={{ marginTop: '3px', accentColor: '#EA580C' } as React.CSSProperties} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}><Copy size={14} color="#EA580C" /> No — keep old forms as-is</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>Old forms remain open. Only new duplicate forms will be created.</div>
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setStep('configure')} style={backBtnSt}>← Back</button>
            <button onClick={() => setStep('confirm')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
              Review & confirm <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4 — Confirm ── */}
      {step === 'confirm' && (
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Review rollover plan</h2>
          <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>
            {selected.size} new form{selected.size !== 1 ? 's' : ''} will be created as drafts.
            {archiveOld ? ' Old forms will be closed and archived.' : ' Old forms will be kept open.'}
          </p>

          <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden', marginBottom: '24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  {['Original', 'New title', 'Season', 'Scheduled', 'Fields', 'Pricing', 'Docs'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...selected].map((id, i) => {
                  const orig = forms.find((f) => f.id === id)!;
                  const cfg  = configs[id];
                  return (
                    <tr key={id} style={{ borderBottom: i < selected.size - 1 ? '1px solid #E2E8F0' : 'none', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: '#64748B' }}>{orig.title}</td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '600', color: '#0F172A' }}>{cfg?.newTitle}</td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: '#374151' }}>{cfg?.newSeason || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: '#374151' }}>{cfg?.openAt ? new Date(cfg.openAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Manual'}</td>
                      {[cfg?.copyFields, cfg?.copyPricing, cfg?.copyDocs].map((v, ci) => (
                        <td key={ci} style={{ padding: '10px 14px' }}>{v ? <Check size={14} color="#16A34A" /> : <span style={{ color: '#CBD5E1', fontSize: '12px' }}>Skip</span>}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {archiveOld && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div style={{ fontSize: '13px', color: '#DC2626' }}>
                <strong>Archive note:</strong> {selected.size} form{selected.size !== 1 ? 's' : ''} will be closed and archived. This can be undone by visiting the archive and restoring them.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setStep('archive')} style={backBtnSt}>← Back</button>
            <button onClick={execute} disabled={executing}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', background: executing ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: executing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {executing ? 'Creating forms…' : `Create ${selected.size} form${selected.size !== 1 ? 's' : ''} now`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function WizardSteps({ step, primary }: { step: Step; primary: string }) {
  const STEPS: Step[] = ['select', 'configure', 'archive', 'confirm'];
  const LABELS = ['Select', 'Configure', 'Archive', 'Confirm'];
  const idx = STEPS.indexOf(step);
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: step === s ? primary : idx > i ? '#22C55E' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: step === s || idx > i ? '#fff' : '#94A3B8' }}>{i + 1}</div>
            <span style={{ fontSize: '11px', fontWeight: step === s ? '700' : '500', color: step === s ? '#0F172A' : '#94A3B8', display: i < 3 ? 'none' : 'none', whiteSpace: 'nowrap' }}>{LABELS[i]}</span>
          </div>
          {i < STEPS.length - 1 && <div style={{ width: '20px', height: '2px', background: idx > i ? '#22C55E' : '#E2E8F0' }} />}
        </div>
      ))}
    </div>
  );
}

function guessNextSeason(): string {
  const now   = new Date();
  const year  = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}/${String(year + 1).slice(2)}`;
}

function suggestNewTitle(original: string): string {
  const nextSeason = guessNextSeason();
  const yearPattern = /20\d\d[\/\-]\d{2,4}/g;
  if (yearPattern.test(original)) return original.replace(yearPattern, nextSeason);
  return `${original} ${nextSeason}`;
}
