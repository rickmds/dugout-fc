// Shared types and constants for the Registration Hub

export type FormStatus      = 'draft' | 'open' | 'closed';
export type SubStatus       = 'pending' | 'approved' | 'waitlisted' | 'declined';
export type PaymentStatus   = 'unpaid' | 'paid' | 'partial' | 'refunded';
export type PaymentOptions  = 'full' | 'plan' | 'both';
export type PriceMode       = 'flat' | 'field' | 'tiers';
export type OfflineMethod   = 'cash' | 'bank_transfer' | 'cheque' | 'other';
export type DiscountType    = 'percent' | 'flat';

export type FieldType =
  | 'section' | 'text' | 'textarea' | 'email' | 'phone'
  | 'number' | 'date' | 'select' | 'radio' | 'multiselect'
  | 'file' | 'waiver' | 'volunteer';

export type FieldLogicRule = {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'contains';
  value: string;
};

export type FieldDef = {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: string;
  waiver_text?: string;
  accept?: string;
  volunteer_slots?: string;
  logic?: { showIf: FieldLogicRule[] };
};

export type PriceTier = { label: string; price: number };

export type RegForm = {
  id: string;
  club_id: string;
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
  open_at: string | null;
  close_at: string | null;
  archived: boolean;
  season_label: string | null;
  early_access_ends_at: string | null;
  views_count: number;
  allow_late_reg: boolean;
  field_logic: unknown;
  volunteer_slots: unknown;
  required_docs: unknown;
  financial_aid_enabled: boolean;
  created_at: string;
  submission_count?: number;
};

export type Submission = {
  id: string;
  form_id: string;
  data: Record<string, string>;
  status: SubStatus;
  payment_choice: 'full' | 'plan' | null;
  payment_status: PaymentStatus;
  amount_due: number | null;
  amount_paid: number;
  notes: string | null;
  submitted_at: string;
  internal_notes: string | null;
  is_returning: boolean | null;
  is_duplicate_flagged: boolean;
  offline_payment_method: OfflineMethod | null;
  offline_payment_ref: string | null;
  offline_payment_date: string | null;
  financial_aid_requested: boolean;
  financial_aid_approved: boolean | null;
  financial_aid_amount: number | null;
  fee_waived: boolean;
  waitlist_position: number | null;
  promo_code_used: string | null;
  discount_applied: number;
  roster_added_at: string | null;
  roster_player_id: string | null;
};

export type PromoCode = {
  id: string;
  club_id: string;
  form_id: string | null;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
};

export type Installment = {
  id: string;
  submission_id: string;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type EmailTemplate = {
  id: string;
  club_id: string;
  trigger_name: string;
  subject: string;
  body_html: string;
  active: boolean;
};

export type LateInvite = {
  id: string;
  form_id: string;
  email: string;
  token: string;
  sent_at: string;
  used_at: string | null;
  expires_at: string | null;
};

// ── Styling constants ─────────────────────────────────────────────────────────

export const STATUS_STYLES: Record<FormStatus, { color: string; bg: string; label: string }> = {
  draft:  { color: '#64748B', bg: '#F1F5F9', label: 'Draft' },
  open:   { color: '#16A34A', bg: '#DCFCE7', label: 'Open' },
  closed: { color: '#DC2626', bg: '#FEE2E2', label: 'Closed' },
};

export const SUB_STATUS_STYLES: Record<SubStatus, { color: string; bg: string; label: string }> = {
  pending:    { color: '#D97706', bg: '#FEF3C7', label: 'Pending' },
  approved:   { color: '#16A34A', bg: '#DCFCE7', label: 'Approved' },
  waitlisted: { color: '#7C3AED', bg: '#EDE9FE', label: 'Waitlisted' },
  declined:   { color: '#DC2626', bg: '#FEE2E2', label: 'Declined' },
};

export const PAY_STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  unpaid:   { color: '#DC2626', bg: '#FEE2E2', label: 'Unpaid' },
  paid:     { color: '#16A34A', bg: '#DCFCE7', label: 'Paid' },
  partial:  { color: '#D97706', bg: '#FEF3C7', label: 'Partial' },
  refunded: { color: '#64748B', bg: '#F1F5F9', label: 'Refunded' },
};

export const FIELD_COLORS: Record<FieldType, { color: string; bg: string }> = {
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
  volunteer:   { color: '#0F766E', bg: '#F0FDFA' },
};

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
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
  volunteer:   'Volunteer duty sign-up',
};

export const FIELD_CHIP: Record<FieldType, string> = {
  section: 'SECTION', text: 'SHORT TEXT', textarea: 'LONG TEXT',
  email: 'EMAIL', phone: 'PHONE', number: 'NUMBER', date: 'DATE',
  select: 'DROPDOWN', radio: 'SINGLE CHOICE', multiselect: 'CHECKBOXES',
  file: 'FILE UPLOAD', waiver: 'CONSENT', volunteer: 'VOLUNTEER',
};

export const FIELD_GROUPS: { label: string; types: FieldType[] }[] = [
  { label: 'Layout',    types: ['section'] },
  { label: 'Text',      types: ['text', 'textarea', 'number', 'date'] },
  { label: 'Contact',   types: ['email', 'phone'] },
  { label: 'Choice',    types: ['select', 'radio', 'multiselect'] },
  { label: 'Special',   types: ['file', 'waiver', 'volunteer'] },
];

export const SIDEBAR_BTN_LABELS: Record<FieldType, string> = {
  section: '── Section header', text: 'Short text', textarea: 'Long text',
  email: 'Email', phone: 'Phone', number: 'Number', date: 'Date',
  select: 'Dropdown', radio: 'Single choice', multiselect: 'Checkboxes',
  file: 'File upload', waiver: 'Consent / waiver', volunteer: 'Volunteer duty',
};

export const WAIVER_TEMPLATES = [
  { id: 'season_participation', label: 'Season Participation', emoji: '📋', desc: 'Training & game liability' },
  { id: 'medical_consent',      label: 'Medical Consent',      emoji: '🏥', desc: 'Emergency treatment auth' },
  { id: 'photo_video',          label: 'Photo & Video',        emoji: '📸', desc: 'Media use consent' },
  { id: 'tournament_travel',    label: 'Tournament / Travel',  emoji: '✈️', desc: 'Away games & overnight trips' },
  { id: 'clinic_camp',          label: 'Clinic or Camp',       emoji: '⚽', desc: 'Single event participation' },
  { id: 'guest_player',         label: 'Guest Player',         emoji: '👤', desc: 'One-off player additions' },
];

export const EMAIL_TRIGGER_LABELS: Record<string, { label: string; desc: string }> = {
  approval:            { label: 'Approval',             desc: 'Sent when a submission is approved' },
  decline:             { label: 'Decline',              desc: 'Sent when a submission is declined' },
  waitlist:            { label: 'Waitlist placement',   desc: 'Sent when moved to waitlist' },
  waitlist_promoted:   { label: 'Waitlist promoted',    desc: 'Sent when promoted off waitlist' },
  payment_reminder:    { label: 'Payment reminder',     desc: 'Sent X days after payment is overdue' },
  deadline_reminder:   { label: 'Deadline reminder',    desc: 'Sent Y days before form closes' },
  late_invite:         { label: 'Late-reg invite',      desc: 'Private invite for a closed form' },
  early_access:        { label: 'Early access invite',  desc: 'Priority window for returning players' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function uid() { return Math.random().toString(36).slice(2, 10); }

export function fmtMoney(amount: number | null, currency: string) {
  if (amount === null || amount === undefined) return '—';
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
  return `${sym}${amount.toFixed(2)}`;
}

export function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formFields(f: RegForm): FieldDef[] {
  return Array.isArray(f.fields) ? (f.fields as FieldDef[]) : [];
}

export function playerName(data: Record<string, string>): string {
  const keys = Object.keys(data);
  const nameKey = keys.find(k =>
    /player.*(name|full)/i.test(k) || /^(full.?name|name|player)/i.test(k)
  );
  if (nameKey) return data[nameKey] ?? '—';
  const vals = Object.values(data).filter(v => v && v.length > 2 && v.length < 50);
  return vals[0] ?? '—';
}

export function parentEmail(data: Record<string, string>): string {
  const vals = Object.values(data).find(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v ?? ''));
  return vals ?? '—';
}

// ── Shared style constants ────────────────────────────────────────────────────

export const labelSt: React.CSSProperties = {
  fontSize: '11px', fontWeight: '700', color: '#64748B',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};

export const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

export const backBtnSt: React.CSSProperties = {
  background: '#F1F5F9', border: 'none', borderRadius: '8px', padding: '8px 14px',
  fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
};
