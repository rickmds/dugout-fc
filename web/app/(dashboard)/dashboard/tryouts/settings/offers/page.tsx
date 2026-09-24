'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Save, Info, Eye, X, Plus, Trash2 } from 'lucide-react';
import { CURRENCY_SYMBOLS, renderInstallmentPlanHtml, normalizeDueType, type Installment as FeeInstallment, type DueType } from '@/lib/tryoutFeePlan';
import { AGE_GROUPS } from '@/lib/ageGroup';

type OfferSettings = {
  id?: string;
  from_name: string;
  offer_deadline: string;
  payment_link: string;
  club_website_url: string;
  uniform_shop_url: string;
};

type EmailTemplate = {
  id?: string;
  template_key: 'waitlist' | 'decline' | 'reminder';
  subject: string;
  from_name: string;
  body_html: string;
};

// A "band" is one row that can cover any set of age groups (or none, for
// the Default row) — merging U9/U10/U11 into one band means setting the
// fee/letter once instead of once per age group. isDefault identifies the
// one row that acts as the fallback for any age group no band claims;
// it's tracked explicitly rather than inferred from an empty ageGroups
// array, since a non-default band can transiently have zero members too
// (e.g. right after its last age group is reassigned elsewhere).
type FeePlanBand = {
  id: string; isDefault: boolean; ageGroups: string[]; season_fee: string;
  installments: { label: string; amount: string; due_type: DueType; due_date: string }[];
};
type LetterBand = {
  id: string; isDefault: boolean; ageGroups: string[];
  subject: string; from_name: string; body_html: string;
};

const BLANK: OfferSettings = {
  from_name: '', offer_deadline: '',
  payment_link: '',
  club_website_url: '', uniform_shop_url: '',
};

// Toggling a chip claims that age group for `currentId`, stealing it from
// whichever other band held it — an age group always belongs to at most
// one band, so there's never a conflict to resolve by hand.
function AgeGroupChips({ ageGroups, ownerMap, bandOwnerLabel, currentId, primary, onToggle }: {
  ageGroups: string[]; ownerMap: Record<string, string>; bandOwnerLabel: (bandId: string) => string;
  currentId: string; primary: string; onToggle: (ag: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
      {ageGroups.map(ag => {
        const ownerId = ownerMap[ag];
        const mine = ownerId === currentId;
        const ownedByOther = !!ownerId && !mine;
        return (
          <button key={ag} type="button" onClick={() => onToggle(ag)}
            title={ownedByOther ? `Currently in "${bandOwnerLabel(ownerId)}" — click to move it here` : undefined}
            style={{
              padding: '4px 11px', borderRadius: '14px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer',
              border: `1.5px solid ${mine ? primary : '#E2E8F0'}`,
              background: mine ? primary : '#fff',
              color: mine ? '#fff' : ownedByOther ? '#CBD5E1' : '#64748B',
            }}>
            {ag}
          </button>
        );
      })}
    </div>
  );
}


const MERGE_TOKENS = [
  { token: '{{player_first_name}}', desc: 'Player first name' },
  { token: '{{player_full_name}}',  desc: 'Player full name' },
  { token: '{{parent_name}}',       desc: 'Parent / guardian name' },
  { token: '{{team_name}}',         desc: 'Team name' },
  { token: '{{age_group}}',         desc: 'Age group (e.g. U11)' },
  { token: '{{club_name}}',         desc: 'Club name' },
  { token: '{{season_label}}',      desc: 'Season (e.g. 2026-27)' },
  { token: '{{offer_deadline}}',    desc: 'Deadline to respond' },
  { token: '{{season_fee}}',        desc: 'Total season fee — set in Cost & Installments' },
  { token: '{{deposit_amount}}',    desc: 'First installment amount — set in Cost & Installments' },
  { token: '{{installment_plan}}',  desc: 'Full payment plan table — set in Cost & Installments' },
  { token: '{{payment_link}}',      desc: 'Link to pay' },
  { token: '{{uniform_link}}',      desc: 'Uniform shop link' },
  { token: '{{club_website}}',      desc: 'Club website' },
  { token: '{{coach_name}}',        desc: 'Head coach — pulled from Coaches tab' },
  { token: '{{training_schedule}}', desc: 'Practice days/times — pulled from Practice Schedule tab' },
  { token: '{{accept_link}}',       desc: 'One-click accept button' },
  { token: '{{decline_link}}',      desc: 'One-click decline button' },
];

const DEFAULT_OFFER_BODY = `<p>Dear {{parent_name}},</p>

<p>It is our pleasure to offer <strong>{{player_full_name}}</strong> a roster spot on the <strong>{{team_name}}</strong> team for the {{season_label}} season. This is the result of a competitive tryout process, and we're thrilled to invite {{player_first_name}} to continue their journey with {{club_name}}.</p>

<p>Please take a moment to review the details below before accepting your spot.</p>

<h2>Your Team</h2>
<div style="background:#fafafa;border-radius:8px;margin:8px 0;padding:4px 16px;">
  <div style="display:block;padding:12px 0;border-bottom:1px solid #eee;"><span style="display:inline-block;width:130px;color:#6b7280;font-size:13px;">Team</span><span style="font-weight:600;">{{team_name}}</span></div>
  <div style="display:block;padding:12px 0;border-bottom:1px solid #eee;"><span style="display:inline-block;width:130px;color:#6b7280;font-size:13px;">Age Group</span><span style="font-weight:600;">{{age_group}}</span></div>
  <div style="display:block;padding:12px 0;"><span style="display:inline-block;width:130px;color:#6b7280;font-size:13px;">Head Coach</span><span style="font-weight:600;">{{coach_name}}</span></div>
</div>

<h2>Training Schedule</h2>
<div style="background:#fafafa;border-left:3px solid #6b7280;padding:14px 18px;border-radius:4px;margin:8px 0;">
  {{training_schedule}}
</div>
<p style="font-size:13px;color:#6b7280;">We maintain this schedule through spring whenever possible. Your coach will reach out shortly with a personal welcome.</p>

<h2>Team Expectations</h2>
<ul>
  <li>{{club_name}} is your player's primary team during fall and spring seasons</li>
  <li><span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:4px;font-weight:700;">[Add your attendance policy, e.g. "90% attendance required"]</span></li>
  <li>Attendance will be tracked in the Pulse FC app — please mark your availability for all games and training sessions so coaches can plan accordingly.</li>
</ul>

<h2>Program Cost</h2>
<div style="background:#fafafa;border-radius:8px;margin:8px 0;padding:4px 16px;">
  <div style="display:block;padding:12px 0;"><span style="display:inline-block;width:150px;color:#6b7280;font-size:13px;">Total Registration Fee</span><span style="font-weight:700;">{{season_fee}}</span></div>
</div>
<p style="font-size:13px;color:#6b7280;margin:0 0 4px;">Payment plan:</p>
{{installment_plan}}
<ul style="font-size:13px;color:#4b5563;">
  <li>All payments must be made via the payment link below (no personal checks or Venmo)</li>
  <li>Players cannot participate until their balance is cleared</li>
  <li>Failure to complete payment will invoke the club suspension policy until the account is in good standing.</li>
</ul>

<h2>Uniforms</h2>
<p><span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:4px;font-weight:700;">[Add your uniform ordering process]</span> <a href="{{uniform_link}}">Order uniforms here</a>.</p>

<h2>Season Overview</h2>
<ul>
  <li><strong>Fall:</strong> <span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:4px;font-weight:700;">[Add your fall season dates]</span></li>
  <li><strong>Winter Training:</strong> <span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:4px;font-weight:700;">[Add your winter training dates, if applicable]</span></li>
  <li><strong>Spring:</strong> <span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:4px;font-weight:700;">[Add your spring season dates]</span></li>
</ul>
<p><strong>Tournaments:</strong></p>
<ul>
  <li><span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:4px;font-weight:700;">[Add any tournaments this team plans to attend]</span></li>
</ul>

<h2>Refund Policy</h2>
<p style="font-size:13px;color:#4b5563;"><span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:4px;font-weight:700;">[Add your club's refund/cancellation policy]</span></p>

<h2>Dual Carding</h2>
<p style="font-size:13px;color:#4b5563;"><span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:4px;font-weight:700;">[Add your club's dual-carding / multi-club policy, if applicable]</span></p>

<h2>Next Steps</h2>
<ol>
  <li><strong>Accept your offer below</strong> by {{offer_deadline}}</li>
  <li>Download the Pulse FC app — connect with your team, RSVP to events, and stay up to date</li>
  <li>Upload any required documents to your club administrator</li>
  <li>Review the Player &amp; Parent Agreement</li>
  <li>Watch for your Pulse FC app invite and uniform email (if applicable)</li>
</ol>

<p>If you can't accept or need more time, please let us know right away — your decision affects other placements.</p>

<p>We're excited to welcome <strong>{{player_first_name}}</strong> to the {{club_name}} family!</p>`;

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '')
    .replace(/<\/h[1-6]>/gi, '\n\n').replace(/<h[1-6][^>]*>/gi, '')
    .replace(/<\/li>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function textToHtml(text: string): string {
  if (!text.trim()) return '';
  return text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
}

function hasHtmlTags(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '9px',
  border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A',
  background: '#fff', outline: 'none', boxSizing: 'border-box',
};
const bodyTA: React.CSSProperties = {
  width: '100%', minHeight: '180px', padding: '10px 12px', borderRadius: '9px',
  border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#0F172A', background: '#fff',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', resize: 'vertical', lineHeight: '1.5',
};
const lbl = (text: string) => (
  <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{text}</label>
);

function EmailBodyEditor({ editorKey, value, onChange, onPreview, previewLabel, showCta, placeholder, emailModes, setEmailModes, primary, onViewTokens }: {
  editorKey: string; value: string; onChange: (v: string) => void;
  onPreview: () => void; previewLabel: string; showCta: boolean; placeholder?: string;
  emailModes: Record<string, 'simple' | 'html'>;
  setEmailModes: React.Dispatch<React.SetStateAction<Record<string, 'simple' | 'html'>>>;
  primary: string; onViewTokens: () => void;
}) {
  const mode = emailModes[editorKey] ?? (hasHtmlTags(value) ? 'html' : 'simple');
  const isSimple = mode === 'simple';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <label style={{ fontSize: '12px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email body</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Simple / HTML toggle */}
          <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '6px', padding: '2px', gap: '1px' }}>
            <button onClick={() => setEmailModes(m => ({ ...m, [editorKey]: 'simple' }))}
              style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '11.5px', fontWeight: '700',
                background: isSimple ? '#fff' : 'transparent', color: isSimple ? '#0F172A' : '#64748B',
                boxShadow: isSimple ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.1s' }}>
              ✏ Text
            </button>
            <button onClick={() => setEmailModes(m => ({ ...m, [editorKey]: 'html' }))}
              style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '11.5px', fontWeight: '700',
                background: !isSimple ? '#fff' : 'transparent', color: !isSimple ? '#0F172A' : '#64748B',
                boxShadow: !isSimple ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.1s' }}>
              {'<>'} HTML
            </button>
          </div>
          {!value && previewLabel === 'Roster Offer' && (
            <button onClick={() => { onChange(DEFAULT_OFFER_BODY); setEmailModes(m => ({ ...m, [editorKey]: 'html' })); }}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', background: '#EFF6FF', border: '1px solid #BFDBFE', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#1D4ED8' }}>
              Load template
            </button>
          )}
          <button onClick={onPreview}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
            <Eye size={12} /> Preview
          </button>
        </div>
      </div>

      {isSimple ? (
        <textarea
          value={stripHtmlToText(value)}
          onChange={e => onChange(textToHtml(e.target.value))}
          style={{ ...bodyTA, fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.7', minHeight: showCta ? '220px' : '160px' }}
          placeholder={'Write your message here…\n\nUse blank lines to separate paragraphs.\nMerge tokens like {{player_first_name}} work here too.'}
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...bodyTA, minHeight: showCta ? '280px' : '180px' }}
          placeholder={placeholder}
        />
      )}

      <div style={{ marginTop: '8px', fontSize: '11px', color: '#94A3B8', lineHeight: '1.8' }}>
        {isSimple ? (
          'Plain text — blank lines create paragraphs. Switch to HTML for tables and advanced formatting.'
        ) : (
          <>HTML source. Quick tokens: <code style={{ background: '#F1F5F9', color: '#374151', padding: '1px 5px', borderRadius: '4px', marginRight: '4px' }}>{'{{player_first_name}}'}</code>
            <code style={{ background: '#F1F5F9', color: '#374151', padding: '1px 5px', borderRadius: '4px', marginRight: '4px' }}>{'{{team_name}}'}</code>
            <code style={{ background: '#F1F5F9', color: '#374151', padding: '1px 5px', borderRadius: '4px', marginRight: '4px' }}>{'{{offer_deadline}}'}</code>
            <button onClick={onViewTokens} style={{ background: 'none', border: 'none', cursor: 'pointer', color: primary, fontWeight: '600', fontSize: '11px', padding: '0 2px' }}>all tokens →</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function TryoutOfferSettingsPage() {
  const { club } = useDashboard();
  const [settings, setSettings] = useState<OfferSettings>(BLANK);
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [feeAgeGroups, setFeeAgeGroups] = useState<string[]>([]);
  const [feeBands, setFeeBands] = useState<FeePlanBand[]>([]);
  const [deletedFeeBandIds, setDeletedFeeBandIds] = useState<string[]>([]);
  const [collapsedFeeBandIds, setCollapsedFeeBandIds] = useState<Set<string>>(new Set());
  const [savingFeeBandId, setSavingFeeBandId] = useState<string | null>(null);
  const [letterBands, setLetterBands] = useState<LetterBand[]>([]);
  const [deletedLetterBandIds, setDeletedLetterBandIds] = useState<string[]>([]);
  const [activeLetterBandId, setActiveLetterBandId] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [activeSection, setActiveSection] = useState<'settings'|'cost'|'offer'|'waitlist'|'decline'|'reminder'|'tokens'>('settings');
  const [preview, setPreview]     = useState<string | null>(null);
  const [emailModes, setEmailModes] = useState<Record<string, 'simple'|'html'>>({});

  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  function snapshotOf(s: OfferSettings, t: Record<string, EmailTemplate>, f: FeePlanBand[], l: LetterBand[]) {
    return JSON.stringify({ s, t, f, l });
  }

  useEffect(() => {
    if (!club) return;
    (async () => {
      const [{ data: os }, { data: tmpl }, { data: teamRows }, { data: planRows }, { data: letterRows }] = await Promise.all([
        supabase.from('tryout_offer_settings').select('*').eq('club_id', club.id).single(),
        supabase.from('tryout_email_templates').select('*').eq('club_id', club.id),
        supabase.from('tryout_teams').select('age_group').eq('club_id', club.id),
        supabase.from('tryout_fee_plans').select('id, age_groups, season_fee, installments').eq('club_id', club.id),
        supabase.from('tryout_offer_letter_templates').select('id, age_groups, subject, from_name, body_html').eq('club_id', club.id),
      ]);
      const loadedSettings = os ? { ...BLANK, ...os } : BLANK;
      setSettings(loadedSettings);
      const map: Record<string, EmailTemplate> = {};
      for (const t of (tmpl ?? [])) map[t.template_key] = t;
      setTemplates(map);

      const counts: Record<string, number> = {};
      for (const t of (teamRows ?? [])) { if (t.age_group) counts[t.age_group] = (counts[t.age_group] ?? 0) + 1; }
      setFeeAgeGroups(Object.keys(counts));

      const sortBands = <T extends { isDefault: boolean; ageGroups: string[] }>(bands: T[]) => bands.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return (parseInt((a.ageGroups[0] ?? '').replace(/\D/g, '')) || 99) - (parseInt((b.ageGroups[0] ?? '').replace(/\D/g, '')) || 99);
      });

      const loadedFeeBands: FeePlanBand[] = (planRows ?? []).map(r => ({
        id: r.id, isDefault: (r.age_groups ?? []).length === 0, ageGroups: r.age_groups ?? [],
        season_fee: r.season_fee != null ? String(r.season_fee) : '',
        installments: ((r.installments ?? []) as FeeInstallment[]).map(i => ({ label: i.label ?? '', amount: i.amount != null ? String(i.amount) : '', due_type: normalizeDueType(i), due_date: i.due_date ?? '' })),
      }));
      if (!loadedFeeBands.some(b => b.isDefault)) {
        loadedFeeBands.push({ id: crypto.randomUUID(), isDefault: true, ageGroups: [], season_fee: '', installments: [] });
      }
      sortBands(loadedFeeBands);
      setFeeBands(loadedFeeBands);
      setDeletedFeeBandIds([]);
      // Bands that already have real content came in already-configured —
      // start them collapsed to a summary so the page isn't a wall of cards.
      setCollapsedFeeBandIds(new Set(loadedFeeBands.filter(b => b.season_fee.trim() !== '' || b.installments.length > 0).map(b => b.id)));

      const loadedLetterBands: LetterBand[] = (letterRows ?? []).map(r => ({
        id: r.id, isDefault: (r.age_groups ?? []).length === 0, ageGroups: r.age_groups ?? [],
        subject: r.subject ?? '', from_name: r.from_name ?? '', body_html: r.body_html ?? '',
      }));
      if (!loadedLetterBands.some(b => b.isDefault)) {
        loadedLetterBands.push({ id: crypto.randomUUID(), isDefault: true, ageGroups: [], subject: 'Your Roster Offer — {{team_name}}', from_name: '', body_html: '' });
      }
      sortBands(loadedLetterBands);
      setLetterBands(loadedLetterBands);
      setDeletedLetterBandIds([]);
      setActiveLetterBandId(loadedLetterBands.find(b => b.isDefault)!.id);

      setSavedSnapshot(snapshotOf(loadedSettings, map, loadedFeeBands, loadedLetterBands));
    })();
  }, [club]);

  const isDirty = savedSnapshot !== null && savedSnapshot !== snapshotOf(settings, templates, feeBands, letterBands);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    await supabase.from('tryout_offer_settings').upsert({ ...settings, club_id: club.id }, { onConflict: 'club_id' });
    for (const key of ['waitlist', 'decline', 'reminder'] as const) {
      const t = templates[key];
      if (t) await supabase.from('tryout_email_templates').upsert({ ...t, club_id: club.id, template_key: key }, { onConflict: 'club_id,template_key' });
    }

    // A non-default band that lost all its age groups (reassigned
    // elsewhere, or explicitly deleted) no longer means anything — drop it.
    const feeKeep: FeePlanBand[] = [];
    const feeToDelete = [...deletedFeeBandIds];
    for (const b of feeBands) { if (!b.isDefault && b.ageGroups.length === 0) feeToDelete.push(b.id); else feeKeep.push(b); }
    const feeUpserts = feeKeep
      .filter(b => b.isDefault || b.season_fee.trim() !== '' || b.installments.some(i => i.label.trim() !== '' || i.amount.trim() !== ''))
      .map(b => ({
        id: b.id, club_id: club.id, age_groups: b.ageGroups,
        season_fee: b.season_fee.trim() === '' ? null : Number(b.season_fee.replace(/[^0-9.]/g, '')),
        installments: b.installments
          .filter(i => i.label.trim() !== '' || i.amount.trim() !== '')
          .map(i => ({ label: i.label.trim(), amount: i.amount.trim() === '' ? null : Number(i.amount.replace(/[^0-9.]/g, '')), due_type: i.due_type, due_date: i.due_type === 'date' ? (i.due_date || null) : null })),
      }));
    if (feeUpserts.length) await supabase.from('tryout_fee_plans').upsert(feeUpserts, { onConflict: 'id' });
    if (feeToDelete.length) await supabase.from('tryout_fee_plans').delete().in('id', feeToDelete);
    await Promise.all(feeKeep.filter(b => !b.isDefault && b.ageGroups.length > 0).map(b => ensureLetterBandForAgeGroups(b.ageGroups)));

    const letterKeep: LetterBand[] = [];
    const letterToDelete = [...deletedLetterBandIds];
    for (const b of letterBands) { if (!b.isDefault && b.ageGroups.length === 0) letterToDelete.push(b.id); else letterKeep.push(b); }
    const letterUpserts = letterKeep
      .filter(b => b.isDefault || b.subject.trim() !== '' || b.from_name.trim() !== '' || b.body_html.trim() !== '')
      .map(b => ({
        id: b.id, club_id: club.id, age_groups: b.ageGroups,
        subject: b.subject.trim() || null, from_name: b.from_name.trim() || null, body_html: b.body_html.trim() || null,
      }));
    if (letterUpserts.length) await supabase.from('tryout_offer_letter_templates').upsert(letterUpserts, { onConflict: 'id' });
    if (letterToDelete.length) await supabase.from('tryout_offer_letter_templates').delete().in('id', letterToDelete);

    setFeeBands(feeKeep);
    setDeletedFeeBandIds([]);
    setLetterBands(letterKeep);
    setDeletedLetterBandIds([]);
    if (!letterKeep.some(b => b.id === activeLetterBandId)) setActiveLetterBandId(letterKeep.find(b => b.isDefault)!.id);

    setSavedSnapshot(snapshotOf(settings, templates, feeKeep, letterKeep));
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function set(patch: Partial<OfferSettings>) { setSettings(s => ({ ...s, ...patch })); }
  function setTmpl(key: string, patch: Partial<EmailTemplate>) {
    setTemplates(prev => {
      const ex = prev[key] ?? { subject: '', from_name: '', body_html: '', template_key: key as EmailTemplate['template_key'] };
      return { ...prev, [key]: { ...ex, ...patch } };
    });
  }

  function letterBandFor(id: string): LetterBand { return letterBands.find(b => b.id === id) ?? letterBands.find(b => b.isDefault)!; }
  function updateLetterBand(id: string, patch: Partial<LetterBand>) {
    setLetterBands(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }
  function copyDefaultLetterInto(id: string) {
    const def = letterBands.find(b => b.isDefault)!;
    updateLetterBand(id, { subject: def.subject, from_name: def.from_name, body_html: def.body_html });
  }
  function addLetterBand() {
    const id = crypto.randomUUID();
    setLetterBands(prev => [...prev, { id, isDefault: false, ageGroups: [], subject: '', from_name: '', body_html: '' }]);
    setActiveLetterBandId(id);
  }
  function deleteLetterBand(id: string) {
    setLetterBands(prev => prev.filter(b => b.id !== id));
    setDeletedLetterBandIds(prev => [...prev, id]);
    setActiveLetterBandId(letterBands.find(b => b.isDefault)!.id);
  }
  function toggleLetterAgeGroup(bandId: string, ag: string) {
    setLetterBands(prev => prev.map(b => {
      if (b.isDefault) return b;
      if (b.id === bandId) return b.ageGroups.includes(ag) ? { ...b, ageGroups: b.ageGroups.filter(x => x !== ag) } : { ...b, ageGroups: [...b.ageGroups, ag] };
      return b.ageGroups.includes(ag) ? { ...b, ageGroups: b.ageGroups.filter(x => x !== ag) } : b;
    }));
  }
  function letterBandLabel(band: LetterBand): string {
    if (band.isDefault) return 'Default';
    return band.ageGroups.length ? band.ageGroups.join(', ') : 'New letter';
  }

  function feeBandFor(id: string): FeePlanBand { return feeBands.find(b => b.id === id) ?? feeBands.find(b => b.isDefault)!; }
  function updateFeeBand(id: string, patch: Partial<FeePlanBand>) {
    setFeeBands(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }
  function addInstallment(id: string) {
    const band = feeBandFor(id);
    const isFirst = band.installments.length === 0;
    updateFeeBand(id, { installments: [...band.installments, { label: isFirst ? 'Deposit' : '', amount: '', due_type: isFirst ? 'acceptance' : 'date', due_date: '' }] });
  }
  function updateInstallment(id: string, idx: number, patch: Partial<{ label: string; amount: string; due_type: DueType; due_date: string }>) {
    const band = feeBandFor(id);
    updateFeeBand(id, { installments: band.installments.map((inst, i) => i === idx ? { ...inst, ...patch } : inst) });
  }
  function removeInstallment(id: string, idx: number) {
    const band = feeBandFor(id);
    updateFeeBand(id, { installments: band.installments.filter((_, i) => i !== idx) });
  }
  function addFeeBand() {
    setFeeBands(prev => [...prev, { id: crypto.randomUUID(), isDefault: false, ageGroups: [], season_fee: '', installments: [] }]);
  }
  function deleteFeeBand(id: string) {
    setFeeBands(prev => prev.filter(b => b.id !== id));
    setDeletedFeeBandIds(prev => [...prev, id]);
    setCollapsedFeeBandIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }
  function toggleFeeAgeGroup(bandId: string, ag: string) {
    setFeeBands(prev => prev.map(b => {
      if (b.isDefault) return b;
      if (b.id === bandId) return b.ageGroups.includes(ag) ? { ...b, ageGroups: b.ageGroups.filter(x => x !== ag) } : { ...b, ageGroups: [...b.ageGroups, ag] };
      return b.ageGroups.includes(ag) ? { ...b, ageGroups: b.ageGroups.filter(x => x !== ag) } : b;
    }));
  }
  function expandFeeBand(id: string) {
    setCollapsedFeeBandIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  // When a price group is saved for specific age groups that don't
  // already have their own custom letter (i.e. they're still falling
  // back to Default), auto-create a letter for those exact age groups by
  // copying the Default letter — since the Default already references
  // {{season_fee}}/{{installment_plan}}, the copy picks up this band's
  // cost automatically and keeps doing so if the price ever changes.
  // Never touches age groups that already have a letter someone wrote.
  async function ensureLetterBandForAgeGroups(ageGroups: string[]) {
    if (!club || ageGroups.length === 0) return;
    const alreadyOwned = ageGroups.some(ag => !!letterOwnerMap[ag]);
    if (alreadyOwned) return;
    const def = letterBands.find(b => b.isDefault);
    if (!def || (!def.body_html.trim() && !def.subject.trim() && !def.from_name.trim())) return;
    const newBand: LetterBand = {
      id: crypto.randomUUID(), isDefault: false, ageGroups: [...ageGroups],
      subject: def.subject, from_name: def.from_name, body_html: def.body_html,
    };
    setLetterBands(prev => [...prev, newBand]);
    await supabase.from('tryout_offer_letter_templates').upsert({
      id: newBand.id, club_id: club.id, age_groups: newBand.ageGroups,
      subject: newBand.subject.trim() || null, from_name: newBand.from_name.trim() || null, body_html: newBand.body_html.trim() || null,
    }, { onConflict: 'id' });
  }

  // Saves just this one price group immediately (instead of waiting for
  // the page-level Save), then collapses it to a summary row.
  async function saveFeeBand(band: FeePlanBand) {
    if (!club) return;
    setSavingFeeBandId(band.id);
    try {
      if (!band.isDefault && band.ageGroups.length === 0) {
        await supabase.from('tryout_fee_plans').delete().eq('id', band.id);
        setFeeBands(prev => prev.filter(b => b.id !== band.id));
        return;
      }
      await supabase.from('tryout_fee_plans').upsert({
        id: band.id, club_id: club.id, age_groups: band.ageGroups,
        season_fee: band.season_fee.trim() === '' ? null : Number(band.season_fee.replace(/[^0-9.]/g, '')),
        installments: band.installments
          .filter(i => i.label.trim() !== '' || i.amount.trim() !== '')
          .map(i => ({ label: i.label.trim(), amount: i.amount.trim() === '' ? null : Number(i.amount.replace(/[^0-9.]/g, '')), due_type: i.due_type, due_date: i.due_type === 'date' ? (i.due_date || null) : null })),
      }, { onConflict: 'id' });
      setDeletedFeeBandIds(prev => prev.filter(id => id !== band.id));
      setCollapsedFeeBandIds(prev => new Set(prev).add(band.id));
      if (!band.isDefault) await ensureLetterBandForAgeGroups(band.ageGroups);
    } finally {
      setSavingFeeBandId(null);
    }
  }

  function renderFeePlanCard(band: FeePlanBand, ownerMap: Record<string, string>) {
    const currSym = CURRENCY_SYMBOLS[club?.currency ?? 'USD'] ?? '$';
    const totalInstallments = band.installments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const seasonFeeNum = Number(band.season_fee) || 0;
    const mismatch = band.installments.length > 0 && band.season_fee.trim() !== '' && Math.abs(totalInstallments - seasonFeeNum) > 0.01;

    if (collapsedFeeBandIds.has(band.id)) {
      return (
        <div key={band.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '13px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0F172A' }}>{band.isDefault ? 'Default' : band.ageGroups.join(', ')}</span>
            <span style={{ fontSize: '12.5px', color: '#64748B' }}>
              {seasonFeeNum > 0 ? `${currSym}${seasonFeeNum.toLocaleString()}` : 'No fee set'}
              {band.installments.length > 0 ? ` · ${band.installments.length} payment${band.installments.length === 1 ? '' : 's'}` : ''}
            </span>
          </div>
          <button onClick={() => expandFeeBand(band.id)}
            style={{ flexShrink: 0, padding: '6px 14px', borderRadius: '7px', background: '#F1F5F9', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>
            Edit
          </button>
          {!band.isDefault && (
            <button onClick={() => deleteFeeBand(band.id)} title="Delete this price group"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      );
    }

    return (
      <div key={band.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', marginBottom: '14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: '800', color: '#0F172A', marginBottom: band.isDefault ? 0 : '8px' }}>
              {band.isDefault ? 'Default (all other age groups)' : (band.ageGroups.length ? null : 'No age groups yet — pick some below')}
            </div>
            {!band.isDefault && (
              <AgeGroupChips ageGroups={AGE_GROUPS} ownerMap={ownerMap} bandOwnerLabel={id => feeBandLabelById(id)} currentId={band.id} primary={primary}
                onToggle={ag => toggleFeeAgeGroup(band.id, ag)} />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div style={{ position: 'relative', width: '140px' }}>
              <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94A3B8', pointerEvents: 'none' }}>{currSym}</span>
              <input value={band.season_fee} onChange={e => updateFeeBand(band.id, { season_fee: e.target.value })} placeholder="Season fee" type="number"
                style={{ width: '100%', padding: '8px 10px 8px 26px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {!band.isDefault && (
              <button onClick={() => deleteFeeBand(band.id)} title="Delete this price group"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
        {band.installments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
            {band.installments.map((inst, i) => (
              <div key={i} style={{ background: '#FAFBFC', border: '1px solid #F1F5F9', borderRadius: '8px', padding: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 28px', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <input value={inst.label} onChange={e => updateInstallment(band.id, i, { label: e.target.value })} placeholder={`Installment ${i + 1}`}
                    style={{ padding: '7px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', fontSize: '12.5px', color: '#94A3B8', pointerEvents: 'none' }}>{currSym}</span>
                    <input value={inst.amount} onChange={e => updateInstallment(band.id, i, { amount: e.target.value })} type="number" placeholder="0"
                      style={{ width: '100%', padding: '7px 8px 7px 22px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
                  </div>
                  <button onClick={() => removeInstallment(band.id, i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select value={inst.due_type} onChange={e => updateInstallment(band.id, i, { due_type: e.target.value as DueType })}
                    style={{ padding: '6px 8px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#0F172A', outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="acceptance">Due upon acceptance</option>
                    <option value="date">Specific date</option>
                    <option value="tbd">Date TBD</option>
                  </select>
                  {inst.due_type === 'date' && (
                    <input value={inst.due_date} onChange={e => updateInstallment(band.id, i, { due_date: e.target.value })} type="date"
                      style={{ padding: '6px 8px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#0F172A', outline: 'none', background: '#fff' }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => addInstallment(band.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', background: '#F1F5F9', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#374151' }}>
            <Plus size={12} /> Add installment
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {mismatch && (
              <span style={{ fontSize: '11.5px', color: '#D97706', fontWeight: '600' }}>
                ⚠ Installments total {currSym}{totalInstallments.toLocaleString()} — season fee is {currSym}{seasonFeeNum.toLocaleString()}
              </span>
            )}
            <button onClick={() => saveFeeBand(band)} disabled={savingFeeBandId === band.id || (!band.isDefault && band.ageGroups.length === 0)}
              style={{
                padding: '7px 16px', borderRadius: '7px', border: 'none', fontSize: '12.5px', fontWeight: '700', color: '#fff',
                background: (!band.isDefault && band.ageGroups.length === 0) ? '#94A3B8' : primary,
                cursor: (!band.isDefault && band.ageGroups.length === 0) ? 'default' : 'pointer',
                opacity: savingFeeBandId === band.id ? 0.7 : 1,
              }}>
              {savingFeeBandId === band.id ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function feeBandLabelById(id: string): string {
    const b = feeBands.find(x => x.id === id);
    if (!b) return '';
    return b.isDefault ? 'Default' : (b.ageGroups.join(', ') || 'New price group');
  }

  function buildPreviewHtml(bodyHtml: string, heroLabel = 'Roster Offer', showCta = true): string {
    const primary   = club?.primary_color  ?? '#7f1d1d';
    const secondary = club?.secondary_color ?? '#c99a3f';
    const logoUrl   = club?.logo_url ?? '';
    const clubName  = club?.name ?? 'Your Club';

    const hex = primary.replace('#', '').padEnd(6, '0');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const dark     = `rgb(${Math.round(r*.6)},${Math.round(g*.6)},${Math.round(b*.6)})`;
    const veryDark = `rgb(${Math.round(r*.35)},${Math.round(g*.35)},${Math.round(b*.35)})`;

    const deadline = settings.offer_deadline
      ? new Date(settings.offer_deadline).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'June 30 at 12:00 PM';

    const sampleInstallments: FeeInstallment[] = [
      { label: 'Deposit',       amount: 765, due_type: 'acceptance', due_date: null },
      { label: 'Installment 2', amount: 765, due_type: 'date',       due_date: '2027-08-01' },
      { label: 'Installment 3', amount: 765, due_type: 'date',       due_date: '2027-11-01' },
    ];
    const sample: Record<string, string> = {
      player_first_name: 'Alex', player_full_name: 'Alex Johnson', parent_name: 'Sarah Johnson',
      team_name: 'Milan B', age_group: 'U12', club_name: clubName, coach_name: 'Coach Smith',
      season_label: '2026/27', offer_deadline: deadline,
      season_fee: '$2,295', deposit_amount: '$765',
      installment_plan: renderInstallmentPlanHtml({ seasonFee: 2295, installments: sampleInstallments }, club?.currency ?? 'USD'),
      payment_link: '#', uniform_link: '#', club_website: '#',
      accept_link: '#accept', decline_link: '#decline',
      training_schedule: '<ul style="margin:0;padding-left:18px;"><li><strong>Mon</strong> 5:00pm–6:30pm — Superdome Sports, Field A</li><li><strong>Wed</strong> 5:00pm–6:30pm — Superdome Sports, Field B</li></ul>',
    };

    let body = bodyHtml || '<p style="color:#6b7280;font-style:italic;">(No email body written yet.)</p>';
    for (const [k, v] of Object.entries(sample)) body = body.split(`{{${k}}}`).join(v);

    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" width="92" alt="${clubName}" style="display:block;margin:0 auto;border:0;width:92px;height:auto;">`
      : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;color:#fff;font-family:Georgia,serif;">${clubName.charAt(0)}</div>`;

    const ctaBlock = showCta ? `
    <tr><td style="padding:0 50px 18px;background:#fff;">
      <div style="padding:32px 28px;background:linear-gradient(160deg,${dark} 0%,${veryDark} 100%);border-radius:18px;border:1px solid ${primary};text-align:center;box-shadow:0 16px 40px rgba(0,0,0,0.25);">
        <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:4px;font-weight:700;margin-bottom:6px;">Action Required</div>
        <div style="font-family:Georgia,serif;font-size:23px;color:#fff;font-weight:700;margin-bottom:20px;">Confirm Your Roster Spot</div>
        <div>
          <a href="#" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;font-weight:700;padding:15px 34px;border-radius:10px;font-size:15px;box-shadow:0 6px 16px rgba(21,128,61,0.35);">&#10003; Accept My Spot</a>
          &nbsp;
          <a href="#" style="display:inline-block;background:#fff;color:#b91c1c;text-decoration:none;font-weight:700;padding:15px 30px;border-radius:10px;font-size:15px;border:1.5px solid #f3c2c2;">Decline</a>
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.15);font-size:12px;color:rgba(255,255,255,0.7);">&#9201; Please respond by <strong style="color:#fff;">${deadline}</strong></div>
      </div>
    </td></tr>` : '';

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email Preview</title>
<style>
  .letter p{margin:0 0 16px}
  .letter h2{font-family:Georgia,serif;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:${primary};font-weight:700;margin:34px 0 14px;padding-bottom:10px;border-bottom:1px solid #eef0f4}
  .letter h2:first-child{margin-top:0}
  .letter ul,.letter ol{margin:0 0 16px;padding-left:22px}
  .letter li{margin:0 0 8px;line-height:1.7}
  .letter ul li::marker{color:${secondary}}
  .letter ol li::marker{color:${primary};font-weight:700}
  .letter strong{color:#111827}
  .letter a{color:${primary}}
</style>
</head>
<body style="margin:0;padding:0;background:#eceef3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#283142;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eceef3;"><tr><td align="center" style="padding:36px 12px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 24px 64px rgba(15,23,42,0.16);">
  <tr><td style="height:4px;background:${secondary};line-height:4px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="background:${veryDark};padding:11px 34px;"><table role="presentation" width="100%"><tr>
    <td style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:700;">${clubName}</td>
    <td align="right" style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:700;">2026 / 2027 Season</td>
  </tr></table></td></tr>
  <tr><td style="background:${primary};background-image:radial-gradient(ellipse at 50% 0%,${primary} 0%,${dark} 45%,${veryDark} 100%);padding:0;">
    <table role="presentation" width="100%"><tr><td align="center" style="padding:54px 32px 46px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 26px;">
        <tr><td align="center" style="width:128px;height:128px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.3);border-radius:50%;">${logoHtml}</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;"><tr>
        <td style="width:40px;height:1px;background:${secondary};line-height:1px;font-size:0;">&nbsp;</td>
        <td style="padding:0 12px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${secondary};font-weight:700;white-space:nowrap;">${heroLabel}</td>
        <td style="width:40px;height:1px;background:${secondary};line-height:1px;font-size:0;">&nbsp;</td>
      </tr></table>
      <div style="font-family:Georgia,serif;font-size:44px;line-height:1.08;color:#fff;font-weight:700;letter-spacing:-0.8px;">Welcome,<br><em style="color:rgba(255,255,255,0.88);font-style:italic;font-weight:400;">Alex</em></div>
      <div style="margin:18px auto 0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.82);max-width:440px;">You've earned a place on the roster for<br><strong style="color:rgba(255,255,255,0.96);font-size:17px;">U12 Milan B</strong></div>
      <div style="margin:28px auto 0;color:${secondary};font-size:13px;letter-spacing:8px;">&#9670; &#9670; &#9670;</div>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#f8f9fc;padding:22px 28px;border-bottom:1px solid #eef0f4;">
    <table role="presentation" width="100%"><tr>
      <td align="center" valign="top" style="padding:8px;width:33.33%;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:7px;">Team</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#111827;font-weight:700;">Milan B</div>
      </td>
      <td align="center" valign="top" style="padding:8px;width:33.33%;border-left:1px solid #e9ebf1;border-right:1px solid #e9ebf1;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:7px;">Age Group</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#111827;font-weight:700;">U12 · Male</div>
      </td>
      <td align="center" valign="top" style="padding:8px;width:33.33%;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:7px;">Head Coach</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#111827;font-weight:700;">Coach Smith</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td class="letter" style="padding:46px 50px 18px;font-size:15.5px;line-height:1.78;color:#283142;background:#fff;">${body}</td></tr>
  ${ctaBlock}
  <tr><td style="padding:12px 50px 46px;background:#fff;">
    <div style="border-top:1px solid #f1f1f4;padding-top:30px;">
      <div style="font-size:14px;color:#6b7280;">With pride and gratitude,</div>
      <div style="margin-top:6px;font-family:Georgia,serif;font-size:21px;font-style:italic;color:${primary};font-weight:700;">${clubName}</div>
      <div style="margin-top:4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;">Coaching Staff</div>
    </div>
  </td></tr>
  <tr><td style="background:#111827;padding:32px;text-align:center;">
    ${logoUrl ? `<img src="${logoUrl}" width="46" alt="" style="display:block;margin:0 auto 14px;border:0;opacity:0.9;">` : ''}
    <div style="font-family:Georgia,serif;font-size:20px;color:#fff;font-weight:700;">${clubName}</div>
    <div style="margin-top:6px;font-size:11px;color:#9ca3af;letter-spacing:2.5px;text-transform:uppercase;font-weight:600;">Coaching Staff</div>
  </td></tr>
</table>
<div style="margin-top:18px;font-size:11px;color:#9ca3af;">&#169; 2026 ${clubName} &middot; All rights reserved</div>
</td></tr></table>
</body></html>`;
  }

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  type SectionId = 'settings'|'cost'|'offer'|'waitlist'|'decline'|'reminder'|'tokens';

  // Surfaces the gaps that would actually break or blank-out a real email,
  // not just "hasn't been touched yet".
  const feeOwnerMap: Record<string, string> = {};
  for (const b of feeBands) if (!b.isDefault) for (const ag of b.ageGroups) feeOwnerMap[ag] = b.id;
  const defaultFeeBand = feeBands.find(b => b.isDefault);
  const missingFeeAgeGroups = feeAgeGroups.filter(ag => {
    const owner = feeOwnerMap[ag] ? feeBands.find(x => x.id === feeOwnerMap[ag]) : defaultFeeBand;
    return !owner?.season_fee?.trim();
  });

  const letterOwnerMap: Record<string, string> = {};
  for (const b of letterBands) if (!b.isDefault) for (const ag of b.ageGroups) letterOwnerMap[ag] = b.id;
  const defaultLetterBand = letterBands.find(b => b.isDefault);

  const NEEDS_ATTENTION: Partial<Record<SectionId, string>> = {
    settings: !settings.from_name.trim() ? 'No "From name" set — emails will show your club name instead' : undefined,
    cost: missingFeeAgeGroups.length > 0 ? `${missingFeeAgeGroups.join(', ')} has no fee set and there's no default fee` : undefined,
    offer: !defaultLetterBand?.body_html.trim() ? 'Default letter body is empty — offers would send blank' : undefined,
  };

  const SECTIONS: { id: SectionId; num: number; label: string; desc: string }[] = [
    { id: 'settings',  num: 1, label: 'Global settings',     desc: 'From name, deadline, links' },
    { id: 'cost',      num: 2, label: 'Cost & installments', desc: 'Fee per age group + payment plan' },
    { id: 'offer',     num: 3, label: 'Offer letter',        desc: 'Default + per-age-group overrides' },
    { id: 'waitlist',  num: 4, label: 'Waitlist email',      desc: 'Player on the waitlist' },
    { id: 'decline',   num: 5, label: 'Decline email',       desc: 'Player not selected' },
    { id: 'reminder',  num: 6, label: 'Reminder email',      desc: 'Follow-up before deadline' },
    { id: 'tokens',    num: 7, label: 'Merge tokens',        desc: `${MERGE_TOKENS.length} available variables` },
  ];

  function hint(when: string) {
    return (
      <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12.5px', color: '#92400E', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{ flexShrink: 0 }}>📧</span><span><strong>When sent:</strong> {when}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Sticky header */}
      <div style={{ padding: '14px 24px', background: '#fff', borderBottom: `3px solid ${primary}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '2px' }}>Tryout Setup</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Offer Templates</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isDirty && !saving && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '600', color: '#D97706' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#D97706' }} /> Unsaved changes
            </span>
          )}
          <button onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: saved ? '#16A34A' : '#22C55E', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 18px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
            <Save size={14} />{saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Body: left nav + right panel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Left section list */}
        <div style={{ width: '240px', flexShrink: 0, borderRight: '1px solid #E2E8F0', background: '#fff', overflowY: 'auto', padding: '16px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '0 8px', marginBottom: '10px' }}>Setup flow</div>
          {SECTIONS.map(s => {
            const active = activeSection === s.id;
            const warning = NEEDS_ATTENTION[s.id];
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)} title={warning}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%', padding: '10px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: '2px',
                  background: active ? `${primary}12` : 'transparent',
                  borderLeft: active ? `2px solid ${primary}` : '2px solid transparent',
                }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800',
                  background: active ? primary : '#F1F5F9',
                  color: active ? '#fff' : '#64748B' }}>
                  {s.num}
                  {warning && (
                    <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '9px', height: '9px', borderRadius: '50%', background: '#D97706', border: '1.5px solid #fff' }} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: active ? '700' : '500', color: active ? '#0D1117' : '#374151', lineHeight: '1.3' }}>{s.label}</div>
                  <div style={{ fontSize: '11px', color: warning ? '#D97706' : '#94A3B8', fontWeight: warning ? '600' : '400', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{warning ?? s.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right editing panel */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#F0F2F5' }}>

          {activeSection === 'settings' && (
            <div style={{ maxWidth: '680px' }}>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12.5px', color: '#1D4ED8', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span>ℹ️</span><span><strong>Start here.</strong> These settings apply across all emails. Set them once and your templates will pick them up via merge tokens.</span>
              </div>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    {lbl('From name')}
                    <input value={settings.from_name} onChange={e => set({ from_name: e.target.value })} placeholder="Maroons SC" style={inp} />
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Shown as the sender on all offer emails</div>
                  </div>
                  <div>
                    {lbl('Offer response deadline')}
                    <input type="datetime-local" value={settings.offer_deadline ? settings.offer_deadline.slice(0, 16) : ''} onChange={e => set({ offer_deadline: e.target.value })} style={inp} />
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Token: <code style={{ background: '#F1F5F9', padding: '1px 4px', borderRadius: '3px' }}>{'{{offer_deadline}}'}</code></div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Links (used via tokens in email body)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      {lbl('Payment link')}
                      <input value={settings.payment_link} onChange={e => set({ payment_link: e.target.value })} placeholder="https://pay.example.com" style={inp} />
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Token: <code style={{ background: '#F1F5F9', padding: '1px 4px', borderRadius: '3px' }}>{'{{payment_link}}'}</code></div>
                    </div>
                    <div>
                      {lbl('Uniform shop URL')}
                      <input value={settings.uniform_shop_url} onChange={e => set({ uniform_shop_url: e.target.value })} placeholder="https://shop.example.com" style={inp} />
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Token: <code style={{ background: '#F1F5F9', padding: '1px 4px', borderRadius: '3px' }}>{'{{uniform_link}}'}</code></div>
                    </div>
                    <div>
                      {lbl('Club website')}
                      <input value={settings.club_website_url} onChange={e => set({ club_website_url: e.target.value })} placeholder="https://yourclub.com" style={inp} />
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Token: <code style={{ background: '#F1F5F9', padding: '1px 4px', borderRadius: '3px' }}>{'{{club_website}}'}</code></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'cost' && (
            <div style={{ maxWidth: '720px' }}>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12.5px', color: '#1D4ED8', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>Set a season fee and payment plan per age group. <strong>Merge age groups that share a price</strong> by clicking their chips onto the same group below — e.g. put U9, U10 and U11 in one group and set it once. Any age group not claimed by a group falls back to Default. A specific team can still override its own fee individually in <strong>Team Setup</strong> if needed.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {feeBands.filter(b => b.isDefault).map(b => renderFeePlanCard(b, feeOwnerMap))}
                {feeBands.filter(b => !b.isDefault).map(b => renderFeePlanCard(b, feeOwnerMap))}
                <button onClick={addFeeBand}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px', borderRadius: '8px', border: '1.5px dashed #CBD5E1', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: '700', color: '#64748B' }}>
                  <Plus size={14} /> New price group
                </button>
              </div>
            </div>
          )}

          {activeSection === 'offer' && (() => {
            const current = letterBandFor(activeLetterBandId);
            const def = letterBands.find(b => b.isDefault)!;
            const isDefault = current.isDefault;
            const resolvedBody = current.body_html.trim() || def.body_html;
            const resolvedSubject = current.subject.trim() || def.subject || 'Your Roster Offer — {{team_name}}';
            return (
              <div style={{ maxWidth: '680px' }}>
                {hint('Sent to families when their child is offered a spot on a team. Includes the Accept / Decline buttons.')}
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12.5px', color: '#1D4ED8', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span><strong>Merge age groups that share a letter</strong> by assigning them to the same group below instead of writing it more than once.</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px', alignItems: 'center' }}>
                  {letterBands.map(band => {
                    const active = activeLetterBandId === band.id;
                    const hasOverride = !band.isDefault && (band.subject.trim() || band.from_name.trim() || band.body_html.trim());
                    return (
                      <button key={band.id} onClick={() => setActiveLetterBandId(band.id)}
                        style={{
                          padding: '6px 13px', borderRadius: '20px', fontSize: '12.5px', fontWeight: active || hasOverride ? '700' : '500', cursor: 'pointer',
                          border: `1.5px solid ${active ? primary : hasOverride ? `${primary}70` : '#E2E8F0'}`,
                          background: active ? primary : hasOverride ? `${primary}12` : '#fff',
                          color: active ? '#fff' : hasOverride ? primary : '#64748B',
                        }}>
                        {letterBandLabel(band)}
                      </button>
                    );
                  })}
                  <button onClick={addLetterBand}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 13px', borderRadius: '20px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', border: '1.5px dashed #CBD5E1', background: 'transparent', color: '#64748B' }}>
                    <Plus size={12} /> New letter
                  </button>
                </div>
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {!isDefault && (
                    <>
                      <div>
                        {lbl('Applies to these age groups')}
                        <AgeGroupChips ageGroups={AGE_GROUPS} ownerMap={letterOwnerMap} bandOwnerLabel={id => { const b = letterBands.find(x => x.id === id); return b ? letterBandLabel(b) : ''; }}
                          currentId={current.id} primary={primary} onToggle={ag => toggleLetterAgeGroup(current.id, ag)} />
                      </div>
                      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px', fontSize: '12.5px', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        <span>Any field left blank here uses the Default letter&apos;s value instead.</span>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          {def.body_html.trim() && (
                            <button onClick={() => copyDefaultLetterInto(current.id)}
                              style={{ padding: '5px 12px', borderRadius: '6px', background: '#fff', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '11.5px', fontWeight: '700', color: '#374151' }}>
                              Copy Default letter here
                            </button>
                          )}
                          <button onClick={() => deleteLetterBand(current.id)}
                            style={{ padding: '5px 12px', borderRadius: '6px', background: '#fff', border: '1px solid #FECACA', cursor: 'pointer', fontSize: '11.5px', fontWeight: '700', color: '#DC2626' }}>
                            Delete this letter
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      {lbl('Subject line')}
                      <input value={current.subject} onChange={e => updateLetterBand(current.id, { subject: e.target.value })}
                        placeholder={isDefault ? 'Your Roster Offer — {{team_name}}' : (def.subject || 'Same as Default')} style={inp} />
                    </div>
                    <div>
                      {lbl('From name')}
                      <input value={current.from_name} onChange={e => updateLetterBand(current.id, { from_name: e.target.value })}
                        placeholder={isDefault ? (settings.from_name || 'Maroons SC') : (def.from_name || settings.from_name || 'Same as Default')} style={inp} />
                    </div>
                  </div>
                  <EmailBodyEditor
                    editorKey={`offer-${current.id}`}
                    value={current.body_html}
                    onChange={v => updateLetterBand(current.id, { body_html: v })}
                    onPreview={() => setPreview(buildPreviewHtml(resolvedBody, 'Roster Offer', true))}
                    previewLabel="Roster Offer"
                    showCta={true}
                    placeholder={isDefault
                      ? `<p>Dear {{parent_name}},</p>\n<p>We are pleased to offer <strong>{{player_first_name}}</strong> a roster spot on <strong>{{team_name}}</strong> for the {{season_label}} season.</p>`
                      : 'Leave blank to use the Default letter for this age group.'}
                    emailModes={emailModes} setEmailModes={setEmailModes} primary={primary} onViewTokens={() => setActiveSection('tokens')}
                  />
                  {!isDefault && !current.body_html.trim() && (
                    <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>Preview shows the inherited Default letter — nothing is overridden here yet. Resolved subject right now: <strong>{resolvedSubject}</strong></div>
                  )}
                </div>
              </div>
            );
          })()}

          {activeSection === 'waitlist' && (
            <div style={{ maxWidth: '680px' }}>
              {hint("Sent when a player is moved to the waitlist. Lets the family know they weren't selected initially but may still receive an offer if a spot opens.")}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>{lbl('Subject')}<input value={templates['waitlist']?.subject ?? ''} onChange={e => setTmpl('waitlist', { subject: e.target.value })} style={inp} /></div>
                  <div>{lbl('From name')}<input value={templates['waitlist']?.from_name ?? ''} onChange={e => setTmpl('waitlist', { from_name: e.target.value })} placeholder={settings.from_name || 'Maroons SC'} style={inp} /></div>
                </div>
                <EmailBodyEditor
                  editorKey="waitlist"
                  value={templates['waitlist']?.body_html ?? ''}
                  onChange={v => setTmpl('waitlist', { body_html: v })}
                  onPreview={() => setPreview(buildPreviewHtml(templates['waitlist']?.body_html ?? '', 'Waitlist', false))}
                  previewLabel="Waitlist"
                  showCta={false}
                  emailModes={emailModes} setEmailModes={setEmailModes} primary={primary} onViewTokens={() => setActiveSection('tokens')}
                />
              </div>
            </div>
          )}

          {activeSection === 'decline' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('Sent when a player is not selected. Keep it respectful and encouraging — this is a family getting difficult news.')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>{lbl('Subject')}<input value={templates['decline']?.subject ?? ''} onChange={e => setTmpl('decline', { subject: e.target.value })} style={inp} /></div>
                  <div>{lbl('From name')}<input value={templates['decline']?.from_name ?? ''} onChange={e => setTmpl('decline', { from_name: e.target.value })} placeholder={settings.from_name || 'Maroons SC'} style={inp} /></div>
                </div>
                <EmailBodyEditor
                  editorKey="decline"
                  value={templates['decline']?.body_html ?? ''}
                  onChange={v => setTmpl('decline', { body_html: v })}
                  onPreview={() => setPreview(buildPreviewHtml(templates['decline']?.body_html ?? '', 'Decline', false))}
                  previewLabel="Decline"
                  showCta={false}
                  emailModes={emailModes} setEmailModes={setEmailModes} primary={primary} onViewTokens={() => setActiveSection('tokens')}
                />
              </div>
            </div>
          )}

          {activeSection === 'reminder' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('Sent as a follow-up to families who received an offer but haven\'t responded yet. Typically sent 24-48 hours before the deadline.')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>{lbl('Subject')}<input value={templates['reminder']?.subject ?? ''} onChange={e => setTmpl('reminder', { subject: e.target.value })} style={inp} /></div>
                  <div>{lbl('From name')}<input value={templates['reminder']?.from_name ?? ''} onChange={e => setTmpl('reminder', { from_name: e.target.value })} placeholder={settings.from_name || 'Maroons SC'} style={inp} /></div>
                </div>
                <EmailBodyEditor
                  editorKey="reminder"
                  value={templates['reminder']?.body_html ?? ''}
                  onChange={v => setTmpl('reminder', { body_html: v })}
                  onPreview={() => setPreview(buildPreviewHtml(templates['reminder']?.body_html ?? '', 'Reminder', true))}
                  previewLabel="Reminder"
                  showCta={true}
                  emailModes={emailModes} setEmailModes={setEmailModes} primary={primary} onViewTokens={() => setActiveSection('tokens')}
                />
              </div>
            </div>
          )}

          {activeSection === 'tokens' && (
            <div style={{ maxWidth: '720px' }}>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12.5px', color: '#1D4ED8', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>Copy any token into your email body — it will be replaced with real data when the email is sent. Click a token to copy it.</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                {MERGE_TOKENS.map(({ token, desc }) => (
                  <button key={token} onClick={() => navigator.clipboard.writeText(token)}
                    style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', background: '#fff', border: '1px solid #E2E8F0', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = primary}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'}>
                    <code style={{ fontSize: '11.5px', background: '#EEF2FF', color: '#4338CA', borderRadius: '4px', padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: '700' }}>{token}</code>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Email preview modal */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPreview(null)}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '720px', maxWidth: '94vw', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.45)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '14px', color: '#0F172A' }}>Email Preview</div>
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '1px' }}>Sample data — real emails use live player and team details</div>
              </div>
              <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}><X size={18} color="#64748B" /></button>
            </div>
            <iframe srcDoc={preview} style={{ flex: 1, border: 'none', width: '100%' }} title="Email Preview" sandbox="allow-same-origin" />
          </div>
        </div>
      )}
    </div>
  );
}
