'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Link2, Users, ChevronDown, X, Check, Trash2,
  ExternalLink, Copy, ChevronUp, Download, Eye,
  AlertCircle, Settings2, LayoutTemplate, Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormStatus = 'draft' | 'open' | 'closed';
type SubStatus  = 'pending' | 'approved' | 'waitlisted' | 'declined';

type FieldType =
  | 'section' | 'text' | 'textarea' | 'email' | 'phone'
  | 'number' | 'date' | 'select' | 'radio' | 'multiselect'
  | 'file' | 'waiver';

type FieldDef = {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: string;
  waiver_text?: string;
  accept?: string;
};

type PaymentOptions = 'full' | 'plan' | 'both';
type PaymentStatus  = 'unpaid' | 'paid' | 'partial' | 'refunded';

type PriceMode = 'flat' | 'field' | 'tiers';
type PriceTier = { label: string; price: number };

type RegForm = {
  id: string;
  title: string;
  description: string | null;
  team_id: string | null;
  status: FormStatus;
  token: string;
  deadline: string | null;
  max_spots: number | null;
  confirmation_message: string | null;
  send_confirmation_email: boolean;
  fields: unknown;
  price: number | null;
  currency: string;
  payment_options: PaymentOptions;
  plan_installments: number;
  plan_frequency: 'monthly' | 'weekly';
  plan_deposit: number | null;
  price_mode: PriceMode | null;
  price_tiers: unknown;
  submission_count?: number;
};

type Submission = {
  id: string;
  data: Record<string, string>;
  status: SubStatus;
  payment_choice: 'full' | 'plan' | null;
  payment_status: PaymentStatus;
  amount_due: number | null;
  amount_paid: number;
  notes: string | null;
  submitted_at: string;
};

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { label: string; description: string; icon: string; fields: Omit<FieldDef, 'id'>[] }> = {
  season: {
    label: 'Season Registration',
    description: 'Full player + parent info, medical, documents & consents',
    icon: '⚽',
    fields: [
      { type: 'section',    label: 'Player Information', required: false },
      { type: 'text',       label: "Player's full name", required: true, placeholder: 'First and last name' },
      { type: 'date',       label: 'Date of birth', required: true },
      { type: 'radio',      label: 'Gender', required: true, options: 'Male,Female' },
      { type: 'select',     label: 'Primary position', required: false, options: 'Goalkeeper,Defender,Midfielder,Forward,Not sure yet' },
      { type: 'number',     label: 'Jersey number preference', required: false, placeholder: 'e.g. 10' },
      { type: 'select',     label: 'Kit size', required: false, options: 'YXS,YS,YM,YL,YXL,AS,AM,AL,AXL' },
      { type: 'text',       label: 'School / Year group', required: false },
      { type: 'text',       label: 'Previous club (if any)', required: false },

      { type: 'section',    label: 'Parent / Guardian', required: false },
      { type: 'text',       label: "Parent / guardian full name", required: true },
      { type: 'select',     label: 'Relationship to player', required: true, options: 'Parent,Guardian,Other' },
      { type: 'email',      label: 'Email address', required: true, placeholder: 'parent@example.com' },
      { type: 'phone',      label: 'Mobile number', required: true },
      { type: 'text',       label: 'Second parent / guardian name', required: false },
      { type: 'phone',      label: 'Second parent / guardian phone', required: false },
      { type: 'textarea',   label: 'Home address', required: false, placeholder: 'Street, City, Postcode' },

      { type: 'section',    label: 'Medical & Emergency', required: false },
      { type: 'text',       label: 'Emergency contact name', required: true },
      { type: 'phone',      label: 'Emergency contact phone', required: true },
      { type: 'textarea',   label: 'Medical conditions or allergies', required: false, placeholder: 'List any conditions, allergies, or dietary requirements. Write "None" if not applicable.' },
      { type: 'radio',      label: 'Does your child take any regular medication?', required: true, options: 'Yes,No' },
      { type: 'textarea',   label: 'If yes — medication details', required: false, placeholder: 'Name of medication, dosage, timing' },
      { type: 'text',       label: "Doctor's name", required: false },
      { type: 'phone',      label: "Doctor's phone number", required: false },

      { type: 'section',    label: 'Documents', required: false },
      { type: 'file',       label: 'Proof of age (birth certificate or passport)', required: true, description: 'PDF or photo. Max 10MB.', accept: 'image/*,.pdf' },
      { type: 'file',       label: 'Medical insurance card (if applicable)', required: false, description: 'PDF or photo. Max 10MB.', accept: 'image/*,.pdf' },
      { type: 'file',       label: "Player photo", required: false, description: 'Clear headshot for the team roster. JPG or PNG.', accept: 'image/*' },

      { type: 'section',    label: 'Consents & Agreements', required: false },
      { type: 'waiver',     label: 'Photo & video consent', required: true, waiver_text: 'I give permission for my child to be photographed and/or filmed during training sessions, matches, and club events. I understand these images may be used on the club\'s website, social media, and printed materials.' },
      { type: 'waiver',     label: 'Medical treatment consent', required: true, waiver_text: 'I consent to coaching staff and club officials seeking emergency medical treatment for my child if required, in a situation where I cannot be contacted in time.' },
      { type: 'waiver',     label: 'Code of conduct agreement', required: true, waiver_text: 'I confirm that I have read and agree to the club\'s Code of Conduct for players and parents. I understand that any breach may result in suspension or removal from the club.' },
      { type: 'waiver',     label: 'Data protection consent', required: true, waiver_text: 'I consent to the club holding and processing personal data about my child and myself for the purposes of club administration, as outlined in our Privacy Policy.' },

      { type: 'section',    label: 'Additional Information', required: false },
      { type: 'select',     label: 'How did you hear about us?', required: false, options: 'Social media,Friend or family,School,Google search,Local poster/flyer,Returning member,Other' },
      { type: 'textarea',   label: 'Anything else you\'d like us to know?', required: false },
    ],
  },
  camp: {
    label: 'Camp / Clinic',
    description: 'Lightweight form for a specific camp or holiday programme',
    icon: '🏕️',
    fields: [
      { type: 'section',    label: 'Player Information', required: false },
      { type: 'text',       label: "Player's full name", required: true },
      { type: 'date',       label: 'Date of birth', required: true },
      { type: 'select',     label: 'Age group', required: true, options: 'U6,U7,U8,U9,U10,U11,U12,U13,U14,U15,U16,U17,U18' },
      { type: 'select',     label: 'Primary position', required: false, options: 'Goalkeeper,Defender,Midfielder,Forward,Not sure yet' },
      { type: 'select',     label: 'Kit size', required: false, options: 'YXS,YS,YM,YL,YXL,AS,AM,AL,AXL' },

      { type: 'section',    label: 'Parent / Guardian', required: false },
      { type: 'text',       label: 'Parent / guardian name', required: true },
      { type: 'email',      label: 'Email address', required: true },
      { type: 'phone',      label: 'Mobile number', required: true },

      { type: 'section',    label: 'Medical & Emergency', required: false },
      { type: 'text',       label: 'Emergency contact name', required: true },
      { type: 'phone',      label: 'Emergency contact phone', required: true },
      { type: 'textarea',   label: 'Medical conditions or allergies', required: false, placeholder: 'List any or write "None"' },

      { type: 'section',    label: 'Consents', required: false },
      { type: 'waiver',     label: 'Photo & video consent', required: true, waiver_text: 'I give permission for my child to be photographed and/or filmed during camp activities. These images may be used on the club\'s social media and website.' },
      { type: 'waiver',     label: 'Medical treatment consent', required: true, waiver_text: 'I consent to staff seeking emergency medical treatment for my child if required and I cannot be reached in time.' },
    ],
  },
  tryout: {
    label: 'Tryout / Trial',
    description: 'Quick form for players applying for a team trial',
    icon: '🏆',
    fields: [
      { type: 'section',    label: 'Player Information', required: false },
      { type: 'text',       label: "Player's full name", required: true },
      { type: 'date',       label: 'Date of birth', required: true },
      { type: 'select',     label: 'Primary position', required: true, options: 'Goalkeeper,Defender,Midfielder,Forward' },
      { type: 'select',     label: 'Secondary position', required: false, options: 'Goalkeeper,Defender,Midfielder,Forward,None' },
      { type: 'text',       label: 'Current club', required: false, placeholder: 'Club name or "Unattached"' },
      { type: 'number',     label: 'Years playing organised football', required: false },
      { type: 'textarea',   label: 'Tell us about yourself as a player', required: false },

      { type: 'section',    label: 'Parent / Guardian', required: false },
      { type: 'text',       label: 'Parent / guardian name', required: true },
      { type: 'email',      label: 'Email address', required: true },
      { type: 'phone',      label: 'Mobile number', required: true },

      { type: 'section',    label: 'Consents', required: false },
      { type: 'waiver',     label: 'Medical treatment consent', required: true, waiver_text: 'I consent to staff seeking emergency medical treatment for my child if required and I cannot be reached in time.' },
    ],
  },
  blank: {
    label: 'Blank form',
    description: 'Start from scratch with your own fields',
    icon: '📄',
    fields: [
      { type: 'text',  label: 'Full name', required: true },
      { type: 'email', label: 'Email address', required: true },
      { type: 'phone', label: 'Phone number', required: true },
    ],
  },
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  section:     'Section header',
  text:        'Short text',
  textarea:    'Long text',
  email:       'Email',
  phone:       'Phone',
  number:      'Number',
  date:        'Date',
  select:      'Dropdown',
  radio:       'Radio (single choice)',
  multiselect: 'Checkboxes (multi)',
  file:        'File upload',
  waiver:      'Consent / waiver',
};

const FIELD_CHIP: Record<FieldType, string> = {
  section: 'SECTION', text: 'SHORT TEXT', textarea: 'LONG TEXT',
  email: 'EMAIL', phone: 'PHONE', number: 'NUMBER', date: 'DATE',
  select: 'DROPDOWN', radio: 'SINGLE CHOICE', multiselect: 'CHECKBOXES',
  file: 'FILE UPLOAD', waiver: 'CONSENT',
};

const FIELD_COLORS: Record<FieldType, { color: string; bg: string }> = {
  section:     { color: '#7C3AED', bg: '#F5F3FF' },
  text:        { color: '#2563EB', bg: '#EFF6FF' },
  textarea:    { color: '#2563EB', bg: '#EFF6FF' },
  email:       { color: '#0891B2', bg: '#ECFEFF' },
  phone:       { color: '#059669', bg: '#ECFDF5' },
  number:      { color: '#D97706', bg: '#FFFBEB' },
  date:        { color: '#D97706', bg: '#FFFBEB' },
  select:      { color: '#7C3AED', bg: '#F5F3FF' },
  radio:       { color: '#7C3AED', bg: '#F5F3FF' },
  multiselect: { color: '#7C3AED', bg: '#F5F3FF' },
  file:        { color: '#EA580C', bg: '#FFF7ED' },
  waiver:      { color: '#DC2626', bg: '#FEF2F2' },
};

const FIELD_GROUPS: { label: string; types: FieldType[] }[] = [
  { label: 'Layout',   types: ['section'] },
  { label: 'Text',     types: ['text', 'textarea', 'number', 'date'] },
  { label: 'Contact',  types: ['email', 'phone'] },
  { label: 'Choice',   types: ['select', 'radio', 'multiselect'] },
  { label: 'Special',  types: ['file', 'waiver'] },
];

const SIDEBAR_BTN_LABELS: Record<FieldType, string> = {
  section: '── Section header', text: 'Short text', textarea: 'Long text',
  email: 'Email', phone: 'Phone', number: 'Number', date: 'Date',
  select: 'Dropdown', radio: 'Single choice', multiselect: 'Checkboxes',
  file: 'File upload', waiver: 'Consent / waiver',
};

const STATUS_STYLES: Record<FormStatus, { color: string; bg: string; label: string }> = {
  draft:  { color: '#64748B', bg: '#F1F5F9', label: 'Draft' },
  open:   { color: '#16A34A', bg: '#DCFCE7', label: 'Open' },
  closed: { color: '#DC2626', bg: '#FEE2E2', label: 'Closed' },
};

const SUB_STATUS_STYLES: Record<SubStatus, { color: string; bg: string; label: string }> = {
  pending:    { color: '#D97706', bg: '#FEF3C7', label: 'Pending' },
  approved:   { color: '#16A34A', bg: '#DCFCE7', label: 'Approved' },
  waitlisted: { color: '#7C3AED', bg: '#EDE9FE', label: 'Waitlisted' },
  declined:   { color: '#DC2626', bg: '#FEE2E2', label: 'Declined' },
};

const PAY_STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  unpaid:   { color: '#DC2626', bg: '#FEE2E2', label: 'Unpaid' },
  paid:     { color: '#16A34A', bg: '#DCFCE7', label: 'Paid' },
  partial:  { color: '#D97706', bg: '#FEF3C7', label: 'Partial' },
  refunded: { color: '#64748B', bg: '#F1F5F9', label: 'Refunded' },
};

function fmtMoney(amount: number | null, currency: string) {
  if (amount === null || amount === undefined) return '—';
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
  return `${sym}${amount.toFixed(2)}`;
}

function uid() { return Math.random().toString(36).slice(2, 10); }
function makeFields(defs: Omit<FieldDef, 'id'>[]): FieldDef[] {
  return defs.map((d) => ({ ...d, id: uid() }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegistrationsPage() {
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const isOrgAdmin = profile?.role === 'org_admin';

  type View = 'list' | 'create' | 'submissions' | 'detail';
  const [view, setView]               = useState<View>('list');
  const [forms, setForms]             = useState<RegForm[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeForm, setActiveForm]   = useState<RegForm | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [activeSub, setActiveSub]     = useState<Submission | null>(null);
  const [copied, setCopied]           = useState<string | null>(null);
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving]   = useState(false);

  // Create form state
  const [step, setStep]               = useState<'template' | 'build' | 'settings'>('template');
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId]           = useState(teams[0]?.id ?? '');
  const [deadline, setDeadline]       = useState('');
  const [maxSpots, setMaxSpots]       = useState('');
  const [confMsg, setConfMsg]         = useState('Thank you for registering! We\'ll be in touch shortly with next steps.');
  const [sendEmail, setSendEmail]     = useState(true);
  const [fields, setFields]           = useState<FieldDef[]>([]);
  // Pricing
  const [isPaid, setIsPaid]               = useState(false);
  const [priceMode, setPriceMode]         = useState<PriceMode>('flat');
  const [price, setPrice]                 = useState('');
  const [currency, setCurrency]           = useState('USD');
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptions>('both');
  const [planInstallments, setPlanInstallments] = useState('3');
  const [planFrequency, setPlanFrequency] = useState<'monthly' | 'weekly'>('monthly');
  const [planDeposit, setPlanDeposit]     = useState('');
  const [priceTiers, setPriceTiers]       = useState<{ label: string; price: string }[]>([{ label: '', price: '' }]);
  const [priceFieldLabel, setPriceFieldLabel] = useState('');
  const [priceFieldRules, setPriceFieldRules] = useState<Record<string, string>>({});
  const [saving, setSaving]           = useState(false);
  const [createError, setCreateError] = useState('');
  const [deleteFormConfirm, setDeleteFormConfirm] = useState<{ id: string; title: string } | null>(null);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);

  const loadForms = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const { data } = await supabase
      .from('registration_forms')
      .select('*')
      .eq('club_id', club.id)
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    const withCounts = await Promise.all(data.map(async (f) => {
      const { count } = await supabase
        .from('registration_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', f.id);
      return { ...f, submission_count: count ?? 0 };
    }));

    setForms(withCounts as RegForm[]);
    setLoading(false);
  }, [club]);

  useEffect(() => { loadForms(); }, [loadForms]);

  async function loadSubmissions(form: RegForm) {
    setActiveForm(form);
    setLoadingSubs(true);
    setView('submissions');
    const { data } = await supabase
      .from('registration_submissions')
      .select('*')
      .eq('form_id', form.id)
      .order('submitted_at', { ascending: false });
    setSubmissions((data ?? []) as Submission[]);
    setLoadingSubs(false);
  }

  async function handleCreate() {
    if (!title.trim() || !club) return;
    setSaving(true);
    const { error } = await supabase.from('registration_forms').insert({
      club_id: club.id,
      team_id: teamId || null,
      title: title.trim(),
      description: description.trim() || null,
      fields: fields.map(({ id: _id, ...rest }) => rest),
      deadline: deadline || null,
      max_spots: maxSpots ? parseInt(maxSpots) : null,
      confirmation_message: confMsg,
      send_confirmation_email: sendEmail,
      price: isPaid && priceMode === 'flat' && price ? parseFloat(price) : null,
      currency,
      payment_options: isPaid ? paymentOptions : 'full',
      plan_installments: parseInt(planInstallments) || 3,
      plan_frequency: planFrequency,
      plan_deposit: isPaid && planDeposit ? parseFloat(planDeposit) : null,
      price_mode: isPaid ? priceMode : 'flat',
      price_tiers: isPaid && priceMode === 'field'
        ? { field: priceFieldLabel, rules: Object.fromEntries(Object.entries(priceFieldRules).map(([k, v]) => [k, parseFloat(v) || 0])) }
        : isPaid && priceMode === 'tiers'
        ? priceTiers.filter((t) => t.label && t.price).map((t) => ({ label: t.label, price: parseFloat(t.price) || 0 }))
        : null,
      status: 'draft',
      created_by: profile?.id,
    });
    setSaving(false);
    if (error) { setCreateError(error.message); return; }
    setCreateError('');
    resetCreate();
    setView('list');
    loadForms();
  }

  function resetCreate() {
    setStep('template'); setTemplateKey(null); setTitle(''); setDescription('');
    setTeamId(teams[0]?.id ?? ''); setDeadline(''); setMaxSpots('');
    setConfMsg('Thank you for registering! We\'ll be in touch shortly with next steps.');
    setSendEmail(true); setFields([]);
    setIsPaid(false); setPriceMode('flat'); setPrice(''); setCurrency('USD'); setPaymentOptions('both');
    setPlanInstallments('3'); setPlanFrequency('monthly'); setPlanDeposit('');
    setPriceTiers([{ label: '', price: '' }]); setPriceFieldLabel(''); setPriceFieldRules({});
    setEditingFormId(null); setCreateError('');
  }

  function openEdit(form: RegForm) {
    setEditingFormId(form.id);
    setTitle(form.title);
    setDescription(form.description ?? '');
    setTeamId(form.team_id ?? teams[0]?.id ?? '');
    setDeadline(form.deadline ?? '');
    setMaxSpots(form.max_spots ? String(form.max_spots) : '');
    setConfMsg(form.confirmation_message ?? 'Thank you for registering! We\'ll be in touch shortly with next steps.');
    setSendEmail(form.send_confirmation_email);
    setFields(formFields(form));
    const mode = (form.price_mode ?? 'flat') as PriceMode;
    setIsPaid(form.price !== null || !!form.price_tiers);
    setPriceMode(mode);
    setPrice(form.price ? String(form.price) : '');
    setCurrency(form.currency ?? 'USD');
    setPaymentOptions(form.payment_options ?? 'both');
    setPlanInstallments(String(form.plan_installments ?? 3));
    setPlanFrequency(form.plan_frequency ?? 'monthly');
    setPlanDeposit(form.plan_deposit ? String(form.plan_deposit) : '');
    if (form.price_tiers) {
      const pt = form.price_tiers as Record<string, unknown>;
      if (mode === 'field') {
        setPriceFieldLabel((pt.field as string) ?? '');
        setPriceFieldRules(Object.fromEntries(Object.entries((pt.rules as Record<string, number>) ?? {}).map(([k, v]) => [k, String(v)])));
      } else if (mode === 'tiers') {
        setPriceTiers(((pt as unknown) as PriceTier[]).map((t) => ({ label: t.label, price: String(t.price) })));
      }
    } else {
      setPriceTiers([{ label: '', price: '' }]); setPriceFieldLabel(''); setPriceFieldRules({});
    }
    setCreateError('');
    setStep('build');
    setView('create');
  }

  async function handleUpdate() {
    if (!title.trim() || !club || !editingFormId) return;
    setSaving(true);
    const { error } = await supabase.from('registration_forms').update({
      team_id: teamId || null,
      title: title.trim(),
      description: description.trim() || null,
      fields: fields.map(({ id: _id, ...rest }) => rest),
      deadline: deadline || null,
      max_spots: maxSpots ? parseInt(maxSpots) : null,
      confirmation_message: confMsg,
      send_confirmation_email: sendEmail,
      price: isPaid && priceMode === 'flat' && price ? parseFloat(price) : null,
      currency,
      payment_options: isPaid ? paymentOptions : 'full',
      plan_installments: parseInt(planInstallments) || 3,
      plan_frequency: planFrequency,
      plan_deposit: isPaid && planDeposit ? parseFloat(planDeposit) : null,
      price_mode: isPaid ? priceMode : 'flat',
      price_tiers: isPaid && priceMode === 'field'
        ? { field: priceFieldLabel, rules: Object.fromEntries(Object.entries(priceFieldRules).map(([k, v]) => [k, parseFloat(v) || 0])) }
        : isPaid && priceMode === 'tiers'
        ? priceTiers.filter((t) => t.label && t.price).map((t) => ({ label: t.label, price: parseFloat(t.price) || 0 }))
        : null,
    }).eq('id', editingFormId);
    setSaving(false);
    if (error) { setCreateError(error.message); return; }
    setCreateError('');
    resetCreate();
    setView('list');
    loadForms();
  }

  async function updateFormStatus(id: string, status: FormStatus) {
    await supabase.from('registration_forms').update({ status }).eq('id', id);
    setForms((p) => p.map((f) => f.id === id ? { ...f, status } : f));
    if (activeForm?.id === id) setActiveForm((f) => f ? { ...f, status } : f);
  }

  async function updateSubStatus(id: string, status: SubStatus) {
    await supabase.from('registration_submissions').update({ status }).eq('id', id);
    setSubmissions((p) => p.map((s) => s.id === id ? { ...s, status } : s));
    if (activeSub?.id === id) setActiveSub((s) => s ? { ...s, status } : s);
  }

  async function bulkUpdateStatus(status: SubStatus) {
    if (!selectedSubs.size) return;
    setBulkSaving(true);
    const ids = Array.from(selectedSubs);
    await supabase.from('registration_submissions').update({ status }).in('id', ids);
    setSubmissions((p) => p.map((s) => selectedSubs.has(s.id) ? { ...s, status } : s));
    setSelectedSubs(new Set());
    setBulkSaving(false);
  }

  function exportSelectedCSV() {
    const toExport = submissions.filter((s) => selectedSubs.has(s.id));
    if (!toExport.length || !activeForm) return;
    exportCSV(toExport, activeForm.title);
  }

  function toggleSub(id: string) {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllSubs() {
    setSelectedSubs((prev) =>
      prev.size === submissions.length ? new Set() : new Set(submissions.map((s) => s.id))
    );
  }

  async function deleteForm(id: string) {
    await supabase.from('registration_forms').delete().eq('id', id);
    setForms((p) => p.filter((f) => f.id !== id));
    setDeleteFormConfirm(null);
    setView('list');
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/register/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  function exportCSV(subs: Submission[], formTitle: string) {
    if (!subs.length) return;
    const keys = ['Submitted', 'Status', ...Object.keys(subs[0].data)];
    const rows = subs.map((s) => [
      new Date(s.submitted_at).toLocaleDateString(),
      s.status,
      ...Object.values(s.data).map((v) => `"${String(v).replace(/"/g, '""')}"`),
    ]);
    const csv = [keys.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${formTitle.replace(/\s+/g, '_')}_registrations.csv`;
    a.click();
  }

  // ── Field builder helpers ──────────────────────────────────────────────────
  function addField(type: FieldType) {
    setFields((p) => [...p, { id: uid(), type, label: '', required: type !== 'section', options: type === 'select' || type === 'radio' || type === 'multiselect' ? '' : undefined }]);
  }
  function updateField(id: string, patch: Partial<FieldDef>) {
    setFields((p) => p.map((f) => f.id === id ? { ...f, ...patch } : f));
  }
  function removeField(id: string) { setFields((p) => p.filter((f) => f.id !== id)); }
  function moveField(id: string, dir: -1 | 1) {
    setFields((p) => {
      const i = p.findIndex((f) => f.id === id);
      if (i + dir < 0 || i + dir >= p.length) return p;
      const n = [...p];
      [n[i], n[i + dir]] = [n[i + dir], n[i]];
      return n;
    });
  }

  const teamName = (id: string | null) => id ? teams.find((t) => t.id === id)?.name ?? '—' : 'All teams';
  const formFields = (f: RegForm): FieldDef[] => Array.isArray(f.fields) ? f.fields as FieldDef[] : [];

  // ─────────────────────────────────────────────────────────────────────────
  // SUBMISSION DETAIL VIEW
  if (view === 'detail' && activeSub && activeForm) {
    const fFields = formFields(activeForm);
    const dataKeys = Object.keys(activeSub.data);
    const sub = activeSub;

    return (
      <div style={{ padding: '32px 36px', maxWidth: '760px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <button onClick={() => { setView('submissions'); setActiveSub(null); }} style={backBtnSt}>← Back to submissions</button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>{activeForm.title}</p>
          </div>
          <SubStatusBadge status={sub.status} />
        </div>

        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>Submission details</span>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>{new Date(sub.submitted_at).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          {dataKeys.map((key) => {
            const val = sub.data[key];
            const isFile = val?.startsWith('https://');
            const isChecked = val === 'yes' || val === 'I agree';
            return (
              <div key={key} style={{ padding: '14px 22px', borderBottom: '1px solid #F8FAFC', display: 'flex', gap: '20px' }}>
                <div style={{ width: '240px', flexShrink: 0, fontSize: '13px', color: '#64748B', fontWeight: '500' }}>{key}</div>
                <div style={{ flex: 1, fontSize: '14px', color: '#0F172A' }}>
                  {isFile
                    ? <a href={val} target="_blank" rel="noreferrer" style={{ color: primary, fontWeight: '600', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ExternalLink size={13} /> View / download
                      </a>
                    : isChecked
                    ? <span style={{ color: '#16A34A', fontWeight: '600' }}>✓ Agreed</span>
                    : <span style={{ whiteSpace: 'pre-wrap' }}>{val || <em style={{ color: '#CBD5E1' }}>Not provided</em>}</span>
                  }
                </div>
              </div>
            );
          })}
        </div>

        {/* Payment summary for paid forms */}
        {activeForm.price && (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '18px 22px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>Payment</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600', marginBottom: '3px' }}>Plan chosen</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>
                  {sub.payment_choice === 'plan' ? '📅 Payment plan' : sub.payment_choice === 'full' ? '💳 Full payment' : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600', marginBottom: '3px' }}>Amount due</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{fmtMoney(sub.amount_due ?? activeForm.price, activeForm.currency)}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600', marginBottom: '3px' }}>Amount paid</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#16A34A' }}>{fmtMoney(sub.amount_paid ?? 0, activeForm.currency)}</div>
              </div>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', marginBottom: '8px' }}>Payment status</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['unpaid', 'partial', 'paid', 'refunded'] as const).map((ps) => (
                  <button key={ps} onClick={async () => {
                    await supabase.from('registration_submissions').update({ payment_status: ps }).eq('id', sub.id);
                    setSubmissions((p) => p.map((s) => s.id === sub.id ? { ...s, payment_status: ps } : s));
                    setActiveSub((s) => s ? { ...s, payment_status: ps } : s);
                  }} style={{ padding: '7px 14px', borderRadius: '8px', border: `2px solid ${(sub.payment_status ?? 'unpaid') === ps ? PAY_STATUS_STYLES[ps].color : '#E2E8F0'}`, background: (sub.payment_status ?? 'unpaid') === ps ? PAY_STATUS_STYLES[ps].bg : '#fff', color: (sub.payment_status ?? 'unpaid') === ps ? PAY_STATUS_STYLES[ps].color : '#64748B', fontWeight: (sub.payment_status ?? 'unpaid') === ps ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {(sub.payment_status ?? 'unpaid') === ps && '✓ '}{PAY_STATUS_STYLES[ps].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '18px 22px' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Update status</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['pending', 'approved', 'waitlisted', 'declined'] as SubStatus[]).map((s) => (
              <button key={s} onClick={() => updateSubStatus(sub.id, s)} style={{ padding: '8px 16px', borderRadius: '8px', border: `2px solid ${sub.status === s ? SUB_STATUS_STYLES[s].color : '#E2E8F0'}`, background: sub.status === s ? SUB_STATUS_STYLES[s].bg : '#fff', color: sub.status === s ? SUB_STATUS_STYLES[s].color : '#64748B', fontWeight: sub.status === s ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                {sub.status === s && '✓ '}{SUB_STATUS_STYLES[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBMISSIONS VIEW
  if (view === 'submissions' && activeForm) {
    const counts = { pending: 0, approved: 0, waitlisted: 0, declined: 0 };
    submissions.forEach((s) => { counts[s.status] = (counts[s.status] ?? 0) + 1; });

    return (
      <div style={{ padding: '32px 36px', maxWidth: '1100px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '24px' }}>
          <button onClick={() => { setView('list'); setActiveForm(null); setSubmissions([]); }} style={backBtnSt}>← All forms</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: '0 0 4px' }}>{activeForm.title}</h1>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <FormStatusBadge status={activeForm.status} />
              <span style={{ fontSize: '13px', color: '#94A3B8' }}>{teamName(activeForm.team_id)}</span>
              {activeForm.max_spots && <span style={{ fontSize: '13px', color: '#94A3B8' }}>{submissions.length}/{activeForm.max_spots} spots filled</span>}
              {activeForm.deadline && <span style={{ fontSize: '13px', color: '#94A3B8' }}>Deadline {new Date(activeForm.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => openEdit(activeForm)} style={{ ...actionBtnSt, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Pencil size={13} /> Edit form
            </button>
            {activeForm.status === 'draft' && <button onClick={() => updateFormStatus(activeForm.id, 'open')} style={{ ...actionBtnSt, background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>Publish</button>}
            {activeForm.status === 'open' && <button onClick={() => updateFormStatus(activeForm.id, 'closed')} style={{ ...actionBtnSt, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>Close</button>}
            {activeForm.status === 'closed' && <button onClick={() => updateFormStatus(activeForm.id, 'open')} style={{ ...actionBtnSt, background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>Reopen</button>}
            <button onClick={() => copyLink(activeForm.token)} style={{ ...actionBtnSt, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {copied === activeForm.token ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy link</>}
            </button>
            <a href={`/register/${activeForm.token}`} target="_blank" rel="noreferrer" style={{ ...actionBtnSt, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ExternalLink size={13} /> Preview
            </a>
            {submissions.length > 0 && (
              <button onClick={() => exportCSV(submissions, activeForm.title)} style={{ ...actionBtnSt, display: 'flex', alignItems: 'center', gap: '6px', background: `${primary}10`, color: primary, border: `1px solid ${primary}30` }}>
                <Download size={13} /> Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Status summary */}
        <div style={{ display: 'grid', gridTemplateColumns: activeForm.price ? 'repeat(4, 1fr) 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {(['pending', 'approved', 'waitlisted', 'declined'] as SubStatus[]).map((s) => (
            <div key={s} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
              <div style={{ fontSize: '22px', fontWeight: '800', color: SUB_STATUS_STYLES[s].color }}>{counts[s]}</div>
              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', marginTop: '2px' }}>{SUB_STATUS_STYLES[s].label}</div>
            </div>
          ))}
          {activeForm.price && (
            <div style={{ background: '#F0FDF4', borderRadius: '12px', border: '1px solid #D1FAE5', padding: '14px 16px' }}>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#16A34A' }}>
                {fmtMoney(submissions.reduce((sum, s) => sum + (s.amount_paid ?? 0), 0), activeForm.currency)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', marginTop: '2px' }}>Collected</div>
            </div>
          )}
        </div>

        {loadingSubs ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>Loading…</div>
        ) : submissions.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
            <Users size={32} color="#CBD5E1" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748B', marginBottom: '4px' }}>No submissions yet</div>
            <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '20px' }}>Share the link with parents to start collecting registrations</div>
            <button onClick={() => copyLink(activeForm.token)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 20px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Link2 size={14} /> {copied === activeForm.token ? 'Copied!' : 'Copy registration link'}
            </button>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#0F172A', borderBottom: 'none' }}>
                    <th style={{ ...thSt, width: '40px' }}>
                      <div onClick={toggleAllSubs} style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${selectedSubs.size === submissions.length && submissions.length > 0 ? primary : '#D1D5DB'}`, background: selectedSubs.size === submissions.length && submissions.length > 0 ? primary : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedSubs.size === submissions.length && submissions.length > 0 && <Check size={11} color="#fff" strokeWidth={3} />}
                      </div>
                    </th>
                    <th style={thSt}>Submitted</th>
                    <th style={thSt}>Status</th>
                    {activeForm.price && <th style={thSt}>Payment</th>}
                    {activeForm.price && <th style={thSt}>Plan</th>}
                    {Object.keys(submissions[0].data).slice(0, activeForm.price ? 2 : 4).map((k) => <th key={k} style={thSt}>{k}</th>)}
                    <th style={thSt}></th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s, i) => {
                    const isSel = selectedSubs.has(s.id);
                    return (
                      <tr key={s.id} style={{ borderBottom: i < submissions.length - 1 ? '1px solid #F1F5F9' : 'none', background: isSel ? `${primary}06` : 'transparent' }}
                        onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isSel ? `${primary}06` : 'transparent'; }}>
                        <td style={tdSt} onClick={() => toggleSub(s.id)}>
                          <div style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${isSel ? primary : '#D1D5DB'}`, background: isSel ? primary : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}>
                            {isSel && <Check size={11} color="#fff" strokeWidth={3} />}
                          </div>
                        </td>
                        <td style={{ ...tdSt, cursor: 'pointer' }} onClick={() => { setActiveSub(s); setView('detail'); }}>{new Date(s.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td style={{ ...tdSt, cursor: 'pointer' }} onClick={() => { setActiveSub(s); setView('detail'); }}><SubStatusBadge status={s.status} /></td>
                        {activeForm.price && (
                          <td style={{ ...tdSt, cursor: 'pointer' }} onClick={() => { setActiveSub(s); setView('detail'); }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: PAY_STATUS_STYLES[s.payment_status ?? 'unpaid'].color, background: PAY_STATUS_STYLES[s.payment_status ?? 'unpaid'].bg, borderRadius: '20px', padding: '2px 8px' }}>
                              {PAY_STATUS_STYLES[s.payment_status ?? 'unpaid'].label}
                            </span>
                          </td>
                        )}
                        {activeForm.price && <td style={{ ...tdSt, cursor: 'pointer' }} onClick={() => { setActiveSub(s); setView('detail'); }}>{s.payment_choice === 'plan' ? '📅 Plan' : s.payment_choice === 'full' ? '💳 Full' : '—'}</td>}
                        {Object.values(s.data).slice(0, activeForm.price ? 2 : 4).map((v, vi) => (
                          <td key={vi} style={{ ...tdSt, cursor: 'pointer' }} onClick={() => { setActiveSub(s); setView('detail'); }}>{v?.startsWith('https://') ? '📎 File' : String(v).slice(0, 40)}{String(v).length > 40 ? '…' : ''}</td>
                        ))}
                        <td style={{ ...tdSt, color: primary, fontWeight: '600', cursor: 'pointer' }} onClick={() => { setActiveSub(s); setView('detail'); }}>View →</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Bulk action bar */}
            {selectedSubs.size > 0 && (
              <div style={{ position: 'sticky', bottom: 0, background: '#0F172A', borderTop: '1px solid #1E293B', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '10px', borderRadius: '0 0 16px 16px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#94A3B8', flex: 1 }}>{selectedSubs.size} selected</span>
                <button onClick={() => bulkUpdateStatus('approved')} disabled={bulkSaving} style={{ padding: '8px 14px', background: '#DCFCE7', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#16A34A', cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✓ Approve ({selectedSubs.size})
                </button>
                <button onClick={() => bulkUpdateStatus('declined')} disabled={bulkSaving} style={{ padding: '8px 14px', background: '#FEE2E2', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✗ Decline ({selectedSubs.size})
                </button>
                <button onClick={exportSelectedCSV} style={{ padding: '8px 14px', background: '#1E293B', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#94A3B8', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={12} /> Export ({selectedSubs.size})
                </button>
                <button onClick={() => setSelectedSubs(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748B', display: 'flex' }}>
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE FORM VIEW
  if (view === 'create') {
    return (
      <div style={{ padding: '32px 36px', maxWidth: step === 'build' ? '1100px' : '820px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <button onClick={() => { resetCreate(); setView('list'); }} style={backBtnSt}>← {editingFormId ? 'Discard changes' : 'Cancel'}</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>{editingFormId ? 'Edit registration form' : 'New registration form'}</h1>
          </div>
          {/* Step indicator — hidden when editing (no template step) */}
          {!editingFormId && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {(['template', 'build', 'settings'] as const).map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: step === s ? primary : i < ['template', 'build', 'settings'].indexOf(step) ? '#22C55E' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: step === s || i < ['template', 'build', 'settings'].indexOf(step) ? '#fff' : '#94A3B8' }}>
                    {i + 1}
                  </div>
                  {i < 2 && <div style={{ width: '24px', height: '2px', background: '#E2E8F0' }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── STEP 1: Template — only shown for new forms ── */}
        {step === 'template' && !editingFormId && (
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Choose a template</h2>
            <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px' }}>Start with a ready-made set of fields, or build from scratch.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '28px' }}>
              {Object.entries(TEMPLATES).map(([key, t]) => (
                <button key={key} onClick={() => setTemplateKey(key)} style={{ background: '#fff', border: `2px solid ${templateKey === key ? primary : '#E2E8F0'}`, borderRadius: '14px', padding: '20px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}>
                  <div style={{ fontSize: '28px', marginBottom: '10px' }}>{t.icon}</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>{t.label}</div>
                  <div style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>{t.description}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '10px' }}>{t.fields.length} fields</div>
                </button>
              ))}
            </div>
            <button onClick={() => {
              if (!templateKey) return;
              const tpl = TEMPLATES[templateKey];
              setTitle(tpl.label === 'Blank form' ? '' : tpl.label);
              setFields(makeFields(tpl.fields));
              setStep('build');
            }} disabled={!templateKey} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: templateKey ? primary : '#CBD5E1', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px 24px', fontWeight: '700', fontSize: '14px', cursor: templateKey ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              Use this template → Customise fields
            </button>
          </div>
        )}

        {/* ── STEP 2: Build fields ── */}
        {step === 'build' && (
          <div>
            {/* Title + description */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={labelSt}>Form title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fall 2025 Season Registration" style={{ ...inputSt, fontSize: '15px', fontWeight: '600' }} />
              </div>
              <div>
                <label style={labelSt}>Description shown to parents</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any instructions before they start filling in…" style={inputSt} />
              </div>
            </div>

            {/* Two-column: fields list + sidebar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 210px', gap: '20px', alignItems: 'start' }}>

              {/* Field list */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Form fields
                  </h3>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600' }}>{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                  {fields.map((f, i) => (
                    <FieldEditor key={f.id} field={f} index={i} total={fields.length} primary={primary}
                      onChange={(patch) => updateField(f.id, patch)}
                      onRemove={() => removeField(f.id)}
                      onMove={(dir) => moveField(f.id, dir)} />
                  ))}
                  {fields.length === 0 && (
                    <div style={{ border: '2px dashed #E2E8F0', borderRadius: '12px', padding: '48px 24px', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', marginBottom: '10px' }}>📋</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#94A3B8', marginBottom: '4px' }}>No fields yet</div>
                      <div style={{ fontSize: '12px', color: '#CBD5E1' }}>Click a field type on the right to add it</div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {!editingFormId && <button onClick={() => setStep('template')} style={backBtnSt}>← Back</button>}
                  <button onClick={() => setStep('settings')} disabled={!title.trim() || fields.length === 0} style={{ flex: 1, padding: '13px', background: !title.trim() || fields.length === 0 ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: !title.trim() || fields.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    Next → Form settings
                  </button>
                </div>
              </div>

              {/* Sticky add-field sidebar */}
              <div style={{ position: 'sticky', top: '24px' }}>
                <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ padding: '12px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Add a field</div>
                  </div>
                  <div style={{ padding: '10px 10px 14px' }}>
                    {FIELD_GROUPS.map((group) => (
                      <div key={group.label} style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '9px', fontWeight: '800', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '5px', paddingLeft: '4px' }}>{group.label}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {group.types.map((type) => {
                            const c = FIELD_COLORS[type];
                            return (
                              <button key={type} onClick={() => addField(type)} style={{ display: 'flex', alignItems: 'center', gap: '7px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '7px', padding: '7px 10px', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%', transition: 'all 0.1s' }}
                                onMouseEnter={(e) => { const el = e.currentTarget; el.style.background = c.bg; el.style.color = c.color; el.style.borderColor = `${c.color}40`; }}
                                onMouseLeave={(e) => { const el = e.currentTarget; el.style.background = '#F8FAFC'; el.style.color = '#374151'; el.style.borderColor = '#F1F5F9'; }}>
                                <span style={{ fontSize: '11px', color: c.color, fontWeight: '900' }}>+</span>
                                {SIDEBAR_BTN_LABELS[type]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Settings ── */}
        {step === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelSt}>Team</label>
                <div style={{ position: 'relative' }}>
                  <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ ...inputSt, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                    {isOrgAdmin && <option value="">All teams (club-wide)</option>}
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>
              <div>
                <label style={labelSt}>Max spots (leave blank for unlimited)</label>
                <input type="number" min="1" value={maxSpots} onChange={(e) => setMaxSpots(e.target.value)} placeholder="e.g. 25" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Registration deadline (optional)</label>
                <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={inputSt} />
              </div>
            </div>

            {/* ── Pricing ── */}
            {(() => {
              const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
              const selectFields = fields.filter((f) => ['select', 'radio', 'multiselect'].includes(f.type) && f.options);
              const linkedField  = selectFields.find((f) => f.label === priceFieldLabel);
              const linkedOpts   = linkedField?.options?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];
              const hasPrices    =
                priceMode === 'flat' ? !!price :
                priceMode === 'field' ? Object.values(priceFieldRules).some((v) => !!v) :
                priceTiers.some((t) => t.label && t.price);
              return (
                <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden' }}>
                  {/* Toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 18px', cursor: 'pointer', background: isPaid ? '#F0FDF4' : '#F8FAFC', borderBottom: isPaid ? '1px solid #D1FAE5' : 'none' }}>
                    <div style={{ width: '40px', height: '22px', borderRadius: '11px', background: isPaid ? primary : '#CBD5E1', position: 'relative', flexShrink: 0, transition: 'background 0.2s', cursor: 'pointer' }} onClick={() => setIsPaid((p) => !p)}>
                      <div style={{ position: 'absolute', top: '2px', left: isPaid ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>This registration has a fee</div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>Set a price and payment options for parents</div>
                    </div>
                  </label>

                  {isPaid && (
                    <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                      {/* ── Pricing mode ── */}
                      <div>
                        <label style={labelSt}>How is the fee calculated?</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          {([
                            ['flat',  'Flat fee',        'Everyone pays the same'],
                            ['field', 'Field-linked',    'Price set by a dropdown answer'],
                            ['tiers', 'Manual tiers',    'Parent selects their tier'],
                          ] as [PriceMode, string, string][]).map(([val, lbl, sub]) => (
                            <button key={val} type="button" onClick={() => setPriceMode(val)}
                              style={{ padding: '12px', borderRadius: '10px', border: `2px solid ${priceMode === val ? primary : '#E2E8F0'}`, background: priceMode === val ? `${primary}08` : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: priceMode === val ? primary : '#374151', marginBottom: '2px' }}>{lbl}</div>
                              <div style={{ fontSize: '11px', color: '#94A3B8' }}>{sub}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ── Currency (all modes) ── */}
                      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'end' }}>
                        <div>
                          <label style={labelSt}>Currency</label>
                          <div style={{ position: 'relative' }}>
                            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputSt, appearance: 'none', paddingRight: '28px', cursor: 'pointer' }}>
                              <option value="GBP">£ GBP</option>
                              <option value="USD">$ USD</option>
                              <option value="EUR">€ EUR</option>
                            </select>
                            <ChevronDown size={12} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                          </div>
                        </div>

                        {/* ── Flat: single price input ── */}
                        {priceMode === 'flat' && (
                          <div>
                            <label style={labelSt}>Total fee</label>
                            <div style={{ position: 'relative' }}>
                              <span style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#64748B', fontWeight: '600' }}>{sym}</span>
                              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" style={{ ...inputSt, paddingLeft: '28px' }} />
                            </div>
                          </div>
                        )}

                        {/* ── Field-linked / Tiers: spacer ── */}
                        {(priceMode === 'field' || priceMode === 'tiers') && <div />}
                      </div>

                      {/* ── Field-linked config ── */}
                      {priceMode === 'field' && (
                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div>
                            <label style={labelSt}>Which field sets the price?</label>
                            {selectFields.length === 0 ? (
                              <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: '8px', padding: '10px 13px', fontSize: '12px', color: '#92400E' }}>
                                ⚠ No dropdown or radio fields in this form yet. Go back and add one (e.g. Age Group).
                              </div>
                            ) : (
                              <div style={{ position: 'relative' }}>
                                <select value={priceFieldLabel} onChange={(e) => { setPriceFieldLabel(e.target.value); setPriceFieldRules({}); }}
                                  style={{ ...inputSt, appearance: 'none', paddingRight: '28px', cursor: 'pointer' }}>
                                  <option value="">Select a field…</option>
                                  {selectFields.map((f) => <option key={f.label} value={f.label}>{f.label}</option>)}
                                </select>
                                <ChevronDown size={12} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                              </div>
                            )}
                          </div>
                          {priceFieldLabel && linkedOpts.length > 0 && (
                            <div>
                              <label style={labelSt}>Price per option</label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {linkedOpts.map((opt) => (
                                  <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', flex: 1 }}>{opt}</span>
                                    <div style={{ position: 'relative', width: '140px', flexShrink: 0 }}>
                                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#64748B', fontWeight: '600' }}>{sym}</span>
                                      <input type="number" min="0" step="0.01" value={priceFieldRules[opt] ?? ''} onChange={(e) => setPriceFieldRules((p) => ({ ...p, [opt]: e.target.value }))} placeholder="0.00" style={{ ...inputSt, paddingLeft: '26px', width: '140px' }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Manual tiers config ── */}
                      {priceMode === 'tiers' && (
                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <label style={labelSt}>Tiers</label>
                          {priceTiers.map((tier, i) => (
                            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input value={tier.label} onChange={(e) => setPriceTiers((p) => p.map((t, ti) => ti === i ? { ...t, label: e.target.value } : t))}
                                placeholder="Tier name (e.g. U9, Early bird)" style={{ ...inputSt, flex: 1 }} />
                              <div style={{ position: 'relative', width: '130px', flexShrink: 0 }}>
                                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#64748B', fontWeight: '600' }}>{sym}</span>
                                <input type="number" min="0" step="0.01" value={tier.price} onChange={(e) => setPriceTiers((p) => p.map((t, ti) => ti === i ? { ...t, price: e.target.value } : t))}
                                  placeholder="0.00" style={{ ...inputSt, paddingLeft: '26px', width: '130px' }} />
                              </div>
                              <button type="button" onClick={() => setPriceTiers((p) => p.filter((_, ti) => ti !== i))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#CBD5E1', display: 'flex', borderRadius: '6px', flexShrink: 0 }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <button type="button" onClick={() => setPriceTiers((p) => [...p, { label: '', price: '' }])}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#fff', border: '1.5px dashed #CBD5E1', borderRadius: '8px', padding: '8px', fontSize: '12px', fontWeight: '700', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                            + Add tier
                          </button>
                        </div>
                      )}

                      {/* ── Payment options (all modes) ── */}
                      {hasPrices && (
                        <div>
                          <label style={labelSt}>Payment options offered to parents</label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                            {([
                              ['both', 'Full or plan', 'Parent chooses'],
                              ['full', 'Full only',    'One upfront payment'],
                              ['plan', 'Plan only',    'Instalments only'],
                            ] as [PaymentOptions, string, string][]).map(([val, lbl, sub]) => (
                              <button key={val} type="button" onClick={() => setPaymentOptions(val)}
                                style={{ padding: '12px', borderRadius: '10px', border: `2px solid ${paymentOptions === val ? primary : '#E2E8F0'}`, background: paymentOptions === val ? `${primary}08` : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                                <div style={{ fontSize: '13px', fontWeight: '700', color: paymentOptions === val ? primary : '#374151', marginBottom: '2px' }}>{lbl}</div>
                                <div style={{ fontSize: '11px', color: '#94A3B8' }}>{sub}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Payment plan config ── */}
                      {hasPrices && (paymentOptions === 'plan' || paymentOptions === 'both') && (
                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment plan settings</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                              <label style={labelSt}>Number of instalments</label>
                              <div style={{ position: 'relative' }}>
                                <select value={planInstallments} onChange={(e) => setPlanInstallments(e.target.value)} style={{ ...inputSt, appearance: 'none', paddingRight: '28px', cursor: 'pointer' }}>
                                  {[2,3,4,5,6,9,10,12].map((n) => <option key={n} value={n}>{n} payments</option>)}
                                </select>
                                <ChevronDown size={12} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                              </div>
                            </div>
                            <div>
                              <label style={labelSt}>Frequency</label>
                              <div style={{ position: 'relative' }}>
                                <select value={planFrequency} onChange={(e) => setPlanFrequency(e.target.value as 'monthly' | 'weekly')} style={{ ...inputSt, appearance: 'none', paddingRight: '28px', cursor: 'pointer' }}>
                                  <option value="monthly">Monthly</option>
                                  <option value="weekly">Weekly</option>
                                </select>
                                <ChevronDown size={12} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                              </div>
                            </div>
                            <div>
                              <label style={labelSt}>Upfront deposit (optional)</label>
                              <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#64748B', fontWeight: '600' }}>{sym}</span>
                                <input type="number" min="0" step="0.01" value={planDeposit} onChange={(e) => setPlanDeposit(e.target.value)} placeholder="0.00" style={{ ...inputSt, paddingLeft: '28px' }} />
                              </div>
                              <p style={{ margin: '5px 0 0', fontSize: '11px', color: '#94A3B8' }}>Paid now; remainder split over instalments</p>
                            </div>
                            {priceMode === 'flat' && price && (
                              <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '12px 14px' }}>
                                <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</p>
                                {(() => {
                                  const total = parseFloat(price) || 0;
                                  const dep   = parseFloat(planDeposit) || 0;
                                  const n     = parseInt(planInstallments) || 3;
                                  const inst  = Math.max(0, total - dep) / n;
                                  return (
                                    <>
                                      {dep > 0 && <p style={{ margin: '0 0 2px', fontSize: '13px', color: '#374151' }}>Deposit: <strong>{sym}{dep.toFixed(2)}</strong></p>}
                                      <p style={{ margin: '0 0 2px', fontSize: '13px', color: '#374151' }}>{n}× {sym}{inst.toFixed(2)} {planFrequency}</p>
                                      <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8' }}>Total: {sym}{total.toFixed(2)}</p>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: '10px', padding: '11px 14px', fontSize: '12px', color: '#92400E' }}>
                        💳 <strong>Stripe not yet connected.</strong> Pricing is saved and will be shown to parents — payments will be collected once Stripe is live.
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div>
              <label style={labelSt}>Confirmation message shown after submission</label>
              <textarea value={confMsg} onChange={(e) => setConfMsg(e.target.value)} rows={3} style={{ ...inputSt, resize: 'vertical' }} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '14px 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: primary }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A' }}>Send confirmation email to parents</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>Automatically email the confirmation message above after submission</div>
              </div>
            </label>

            {createError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#DC2626', marginBottom: '4px' }}>
                Failed to create form: {createError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setStep('build')} style={backBtnSt}>← Back</button>
              <button onClick={editingFormId ? handleUpdate : handleCreate} disabled={saving} style={{ flex: 1, padding: '13px', background: saving ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? (editingFormId ? 'Saving…' : 'Creating…') : editingFormId ? 'Save changes' : 'Create form (save as draft)'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN LIST
  return (
    <div style={{ padding: '32px 36px', maxWidth: '1000px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>Registrations</h1>
          <p style={{ fontSize: '13px', color: '#64748B' }}>Create forms, share links with parents, manage submissions</p>
        </div>
        <button onClick={() => setView('create')} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '11px 18px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={16} /> New registration
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>Loading…</div>
      ) : forms.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📋</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No registrations yet</div>
          <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px' }}>Create your first form — season sign-ups, camps, tryouts, anything</div>
          <button onClick={() => setView('create')} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 22px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={15} /> Create first registration
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {forms.map((f) => (
            <div key={f.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px 22px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>{f.title}</span>
                  <FormStatusBadge status={f.status} />
                  {f.price && (
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#16A34A', background: '#DCFCE7', borderRadius: '20px', padding: '2px 9px' }}>
                      {fmtMoney(f.price, f.currency ?? 'GBP')}
                      {f.payment_options === 'both' ? ' · Full or plan' : f.payment_options === 'plan' ? ' · Plan only' : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#94A3B8' }}>
                  <span>{teamName(f.team_id)}</span>
                  {f.deadline && <span>Closes {new Date(f.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  {f.max_spots && <span>{f.submission_count}/{f.max_spots} spots</span>}
                  {!f.max_spots && <span>{f.submission_count} submission{f.submission_count !== 1 ? 's' : ''}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
                <button onClick={() => loadSubmissions(f)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 13px', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Users size={13} /> View submissions
                </button>
                <button onClick={() => openEdit(f)} title="Edit form" style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 13px', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${primary}10`; (e.currentTarget as HTMLElement).style.color = primary; (e.currentTarget as HTMLElement).style.borderColor = `${primary}30`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; (e.currentTarget as HTMLElement).style.color = '#374151'; (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; }}>
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={() => copyLink(f.token)} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: copied === f.token ? '#DCFCE7' : '#F8FAFC', border: `1px solid ${copied === f.token ? '#BBF7D0' : '#E2E8F0'}`, borderRadius: '8px', padding: '8px 13px', fontSize: '12px', fontWeight: '600', color: copied === f.token ? '#16A34A' : '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {copied === f.token ? <Check size={12} /> : <Copy size={12} />} {copied === f.token ? 'Copied' : 'Copy link'}
                </button>
                {f.status === 'draft'  && <button onClick={() => updateFormStatus(f.id, 'open')}   style={{ ...actionBtnSt, background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>Publish</button>}
                {f.status === 'open'   && <button onClick={() => updateFormStatus(f.id, 'closed')} style={{ ...actionBtnSt, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>Close</button>}
                {f.status === 'closed' && <button onClick={() => updateFormStatus(f.id, 'open')}   style={{ ...actionBtnSt, background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>Reopen</button>}
                <button onClick={() => setDeleteFormConfirm({ id: f.id, title: f.title })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '7px', borderRadius: '7px', color: '#CBD5E1', display: 'flex' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteFormConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => setDeleteFormConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <Trash2 size={20} color="#EF4444" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Delete form?</div>
            <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>
              <strong style={{ color: '#0F172A' }}>{deleteFormConfirm.title}</strong> and all its submissions will be permanently deleted.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDeleteFormConfirm(null)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => deleteForm(deleteFormConfirm.id)} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field editor sub-component ───────────────────────────────────────────────

function FieldEditor({ field: f, index, total, primary, onChange, onRemove, onMove }: {
  field: FieldDef; index: number; total: number; primary: string;
  onChange: (p: Partial<FieldDef>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const isSection    = f.type === 'section';
  const needsOptions = ['select', 'radio', 'multiselect'].includes(f.type);
  const needsWaiver  = f.type === 'waiver';
  const needsAccept  = f.type === 'file';
  const c = FIELD_COLORS[f.type] ?? { color: '#64748B', bg: '#F8FAFC' };

  const moveButtons = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
      <button onClick={() => onMove(-1)} disabled={index === 0}
        style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '2px', color: index === 0 ? '#E2E8F0' : '#94A3B8', display: 'flex' }}>
        <ChevronUp size={12} />
      </button>
      <button onClick={() => onMove(1)} disabled={index === total - 1}
        style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', padding: '2px', color: index === total - 1 ? '#E2E8F0' : '#94A3B8', display: 'flex' }}>
        <ChevronDown size={12} />
      </button>
    </div>
  );

  const deleteBtn = (
    <button onClick={onRemove}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#E2E8F0', display: 'flex', flexShrink: 0, borderRadius: '5px' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#E2E8F0'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
      <X size={14} />
    </button>
  );

  /* ── Section header ── */
  if (isSection) {
    return (
      <div style={{ background: c.bg, border: `1.5px solid ${c.color}30`, borderLeft: `4px solid ${c.color}`, borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {moveButtons}
        <span style={{ fontSize: '9px', fontWeight: '800', color: c.color, letterSpacing: '1.5px', flexShrink: 0 }}>SECTION</span>
        <input
          value={f.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Section title — e.g. Player Information"
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '13px', fontWeight: '700', color: '#4C1D95', outline: 'none', fontFamily: 'inherit' }}
        />
        {deleteBtn}
      </div>
    );
  }

  /* ── Regular field ── */
  return (
    <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ height: '2px', background: c.color }} />
      <div style={{ padding: '10px 12px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          {moveButtons}
          <span style={{ fontSize: '9px', fontWeight: '800', color: c.color, background: c.bg, borderRadius: '4px', padding: '2px 6px', flexShrink: 0, letterSpacing: '0.6px' }}>
            {FIELD_CHIP[f.type]}
          </span>
          <input
            value={f.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Field label"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '13px', fontWeight: '600', color: '#0F172A', outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            onClick={() => onChange({ required: !f.required })}
            style={{ padding: '3px 9px', borderRadius: '5px', border: `1.5px solid ${f.required ? '#22C55E' : '#E2E8F0'}`, background: f.required ? '#F0FDF4' : '#F8FAFC', color: f.required ? '#16A34A' : '#94A3B8', fontSize: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, letterSpacing: '0.3px' }}>
            {f.required ? '● Required' : '○ Optional'}
          </button>
          {deleteBtn}
        </div>

        {/* Help text */}
        <input
          value={f.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Help text (optional)"
          style={{ width: '100%', background: '#F8FAFC', border: 'none', borderRadius: '6px', padding: '5px 9px', fontSize: '11.5px', color: '#64748B', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: needsOptions || needsWaiver || needsAccept ? '8px' : 0 }}
        />

        {needsOptions && (
          <div>
            <div style={{ fontSize: '9px', fontWeight: '800', color: '#CBD5E1', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Options — comma separated</div>
            <input
              value={f.options ?? ''}
              onChange={(e) => onChange({ options: e.target.value })}
              placeholder="Option 1, Option 2, Option 3"
              style={{ width: '100%', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '6px 9px', fontSize: '12px', color: '#374151', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
            {f.options && (
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
                {f.options.split(',').filter(Boolean).map((o, i) => (
                  <span key={i} style={{ fontSize: '11px', color: c.color, background: c.bg, borderRadius: '4px', padding: '2px 7px', fontWeight: '600' }}>{o.trim()}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {needsWaiver && (
          <textarea
            value={f.waiver_text ?? ''}
            onChange={(e) => onChange({ waiver_text: e.target.value })}
            placeholder="Full consent text that parents must agree to…"
            rows={3}
            style={{ width: '100%', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: '#374151', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          />
        )}

        {needsAccept && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600' }}>Accept:</span>
            {[['image/*,.pdf', 'Images & PDF'], ['image/*', 'Images only'], ['.pdf', 'PDF only']].map(([val, lbl]) => (
              <button key={val} onClick={() => onChange({ accept: val })} style={{ padding: '3px 9px', borderRadius: '5px', border: `1.5px solid ${f.accept === val ? c.color : '#E2E8F0'}`, background: f.accept === val ? c.bg : '#F8FAFC', color: f.accept === val ? c.color : '#64748B', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                {lbl}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Badge components ─────────────────────────────────────────────────────────

function FormStatusBadge({ status }: { status: FormStatus }) {
  const s = STATUS_STYLES[status];
  return <span style={{ fontSize: '11px', fontWeight: '700', color: s.color, background: s.bg, borderRadius: '20px', padding: '2px 9px' }}>{s.label}</span>;
}

function SubStatusBadge({ status }: { status: SubStatus }) {
  const s = SUB_STATUS_STYLES[status];
  return <span style={{ fontSize: '11px', fontWeight: '700', color: s.color, background: s.bg, borderRadius: '20px', padding: '2px 9px', whiteSpace: 'nowrap' }}>{s.label}</span>;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  fontSize: '11px', fontWeight: '700', color: '#64748B',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};
const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const actionBtnSt: React.CSSProperties = {
  background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px',
  padding: '7px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', color: '#374151',
};
const backBtnSt: React.CSSProperties = {
  background: '#F1F5F9', border: 'none', borderRadius: '8px', padding: '8px 14px',
  fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
};
const thSt: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700',
  color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
};
const tdSt: React.CSSProperties = {
  padding: '12px 16px', fontSize: '13px', color: '#374151', verticalAlign: 'middle',
};
