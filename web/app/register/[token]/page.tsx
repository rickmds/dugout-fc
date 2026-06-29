'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type FieldType =
  | 'section' | 'text' | 'textarea' | 'email' | 'phone'
  | 'number' | 'date' | 'select' | 'radio' | 'multiselect'
  | 'file' | 'waiver';

type FieldDef = {
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: string;
  waiver_text?: string;
  accept?: string;
};

type Form = {
  id: string;
  title: string;
  description: string | null;
  fields: FieldDef[];
  deadline: string | null;
  max_spots: number | null;
  status: string;
  confirmation_message: string | null;
  send_confirmation_email: boolean;
  token: string;
  price: number | null;
  currency: string;
  payment_options: 'full' | 'plan' | 'both';
  plan_installments: number;
  plan_frequency: 'monthly' | 'weekly';
  plan_deposit: number | null;
  clubs: {
    name: string;
    logo_url: string | null;
    primary_color: string | null;
  } | null;
};

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function RegisterPage() {
  const { token } = useParams<{ token: string }>();

  const [form, setForm]           = useState<Form | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [spotsLeft, setSpotsLeft] = useState<number | null>(null);

  // Form values: text/radio/select values + file objects
  const [values, setValues]       = useState<Record<string, string>>({});
  const [files, setFiles]         = useState<Record<string, File | null>>({});
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, boolean>>({});
  const [paymentChoice, setPaymentChoice] = useState<'full' | 'plan' | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('registration_forms')
        .select('id,title,description,fields,deadline,max_spots,status,confirmation_message,send_confirmation_email,token,price,currency,payment_options,plan_installments,plan_frequency,plan_deposit,clubs(name,logo_url,primary_color)')
        .eq('token', token)
        .single();

      if (error || !data) { setNotFound(true); setLoading(false); return; }

      const f = data as unknown as Form;
      setForm(f);

      if (f.max_spots) {
        const { count } = await supabase
          .from('registration_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('form_id', f.id);
        setSpotsLeft(f.max_spots - (count ?? 0));
      }

      setLoading(false);
    }
    load();
  }, [token]);

  const primary = form?.clubs?.primary_color && form.clubs.primary_color !== '#000000'
    ? form.clubs.primary_color : '#22C55E';

  function setValue(label: string, val: string) {
    setValues((v) => ({ ...v, [label]: val }));
    setErrors((e) => { const n = { ...e }; delete n[label]; return n; });
  }

  function setMultiValue(label: string, option: string, checked: boolean) {
    const current = (values[label] ?? '').split(',').filter(Boolean);
    const updated = checked ? [...current, option] : current.filter((o) => o !== option);
    setValue(label, updated.join(', '));
  }

  function setFile(label: string, file: File | null) {
    setFiles((f) => ({ ...f, [label]: file }));
    setErrors((e) => { const n = { ...e }; delete n[label]; return n; });
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    for (const f of form?.fields ?? []) {
      if (f.type === 'section') continue;
      if (f.required) {
        if (f.type === 'file') {
          if (!files[f.label]) errs[f.label] = 'Please upload a file';
        } else if (f.type === 'waiver') {
          if (values[f.label] !== 'agreed') errs[f.label] = 'You must agree to continue';
        } else if (!values[f.label]?.trim()) {
          errs[f.label] = 'This field is required';
        }
      }
      if (f.type === 'email' && values[f.label] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[f.label])) {
        errs[f.label] = 'Please enter a valid email address';
      }
    }
    if (form?.price && !paymentChoice) {
      errs['__payment'] = 'Please select a payment option to continue';
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

    setSubmitting(true);

    // 1. Upload any files to Supabase Storage
    const submissionId = uid();
    const finalValues = { ...values };

    for (const [label, file] of Object.entries(files)) {
      if (!file) continue;
      setUploadProgress((p) => ({ ...p, [label]: true }));
      const ext = file.name.split('.').pop();
      const path = `${form!.id}/${submissionId}/${label.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${ext}`;
      const { data: uploaded, error: upErr } = await supabase.storage
        .from('registration-docs')
        .upload(path, file, { upsert: true });
      setUploadProgress((p) => ({ ...p, [label]: false }));

      if (upErr) {
        setErrors((er) => ({ ...er, [label]: `Upload failed: ${upErr.message}` }));
        setSubmitting(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('registration-docs').getPublicUrl(uploaded.path);
      finalValues[label] = urlData.publicUrl;
    }

    // Convert waiver values
    for (const f of form?.fields ?? []) {
      if (f.type === 'waiver' && finalValues[f.label] === 'agreed') {
        finalValues[f.label] = 'I agree';
      }
    }

    // 2. Insert submission
    const { error: subErr } = await supabase.from('registration_submissions').insert({
      form_id: form!.id,
      data: finalValues,
      status: 'pending',
      payment_choice: form!.price ? paymentChoice : null,
      payment_status: form!.price ? 'unpaid' : null,
      amount_due: form!.price ?? null,
    });

    if (subErr) {
      alert('Submission failed. Please try again.');
      setSubmitting(false);
      return;
    }

    // 3. Send confirmation email if enabled
    if (form?.send_confirmation_email) {
      const parentEmail = Object.entries(finalValues).find(([k]) =>
        k.toLowerCase().includes('email')
      )?.[1];
      const playerName = Object.entries(finalValues).find(([k]) =>
        k.toLowerCase().includes('name') || k.toLowerCase().includes('player')
      )?.[1] ?? '';

      if (parentEmail) {
        await fetch('/api/registration-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: parentEmail,
            player_name: playerName,
            form_title: form.title,
            club_name: form.clubs?.name,
            club_logo_url: form.clubs?.logo_url,
            primary_color: form.clubs?.primary_color,
            confirmation_message: form.confirmation_message,
          }),
        });
      }
    }

    setSubmitting(false);
    setDone(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Render states ────────────────────────────────────────────────────────

  if (loading) return (
    <Page>
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <Spinner color="#22C55E" />
      </div>
    </Page>
  );

  if (notFound || !form) return (
    <Page>
      <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', padding: '48px', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔍</div>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>Form not found</h1>
        <p style={{ fontSize: '14px', color: '#64748B' }}>This link may be invalid or has expired. Contact your club for a new link.</p>
      </div>
    </Page>
  );

  if (form.status === 'closed') return (
    <Page>
      <FormCard primary={primary} form={form}>
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>Registration closed</h2>
          <p style={{ fontSize: '14px', color: '#64748B' }}>This form is no longer accepting registrations. Contact the club directly.</p>
        </div>
      </FormCard>
    </Page>
  );

  if (spotsLeft !== null && spotsLeft <= 0) return (
    <Page>
      <FormCard primary={primary} form={form}>
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>😔</div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>Fully booked</h2>
          <p style={{ fontSize: '14px', color: '#64748B' }}>All spots for this registration have been filled. Contact the club to join a waitlist.</p>
        </div>
      </FormCard>
    </Page>
  );

  if (done) return (
    <Page>
      <FormCard primary={primary} form={form}>
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ width: '64px', height: '64px', background: '#DCFCE7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px' }}>✅</div>
          <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', marginBottom: '12px' }}>Registration received!</h2>
          <p style={{ fontSize: '15px', color: '#374151', lineHeight: '1.65', maxWidth: '400px', margin: '0 auto' }}>
            {form.confirmation_message ?? 'Thank you! We\'ll be in touch shortly.'}
          </p>
          {form.send_confirmation_email && (
            <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '16px' }}>A confirmation email has been sent to you.</p>
          )}
        </div>
      </FormCard>
    </Page>
  );

  // ─── Main form ────────────────────────────────────────────────────────────

  const errorCount = Object.keys(errors).length;

  return (
    <Page>
      <FormCard primary={primary} form={form}>
        {/* Deadline / spots banner */}
        {(form.deadline || spotsLeft !== null) && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '10px', padding: '10px 14px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '16px' }}>⏰</span>
            <div>
              {form.deadline && <span style={{ fontSize: '13px', fontWeight: '600', color: '#92400E' }}>Deadline: {new Date(form.deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. </span>}
              {spotsLeft !== null && <span style={{ fontSize: '13px', color: '#92400E' }}>{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} remaining.</span>}
            </div>
          </div>
        )}

        {/* Error summary */}
        {errorCount > 0 && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '15px' }}>⚠️</span>
            <div style={{ fontSize: '13px', color: '#DC2626', fontWeight: '600' }}>
              {errorCount} field{errorCount !== 1 ? 's' : ''} need{errorCount === 1 ? 's' : ''} your attention — please check below.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {form.fields.map((f, i) => (
            <FormField
              key={i}
              field={f}
              value={values[f.label] ?? ''}
              fileValue={files[f.label] ?? null}
              error={errors[f.label]}
              uploading={uploadProgress[f.label] ?? false}
              primary={primary}
              onValue={(v) => setValue(f.label, v)}
              onMultiValue={(opt, checked) => setMultiValue(f.label, opt, checked)}
              onFile={(file) => setFile(f.label, file)}
            />
          ))}

          {/* ── Payment section ── */}
          {form.price && (() => {
            const sym = form.currency === 'GBP' ? '£' : form.currency === 'USD' ? '$' : '€';
            const total = form.price;
            const dep = form.plan_deposit ?? 0;
            const n = form.plan_installments ?? 3;
            const freq = form.plan_frequency ?? 'monthly';
            const remaining = Math.max(0, total - dep);
            const instAmount = remaining / n;
            const hasError = !!errors['__payment'];

            return (
              <div style={{ marginTop: '24px', marginBottom: '8px' }}>
                <div style={{ margin: '0 0 16px', paddingBottom: '10px', borderBottom: '2px solid #F1F5F9' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: '800', color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment</h3>
                </div>

                <div style={{ background: `${primary}08`, border: `1.5px solid ${primary}25`, borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', marginBottom: '2px' }}>Registration fee</div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A' }}>{sym}{total.toFixed(2)}</div>
                  </div>
                  <div style={{ fontSize: '28px' }}>💳</div>
                </div>

                {hasError && (
                  <p style={{ fontSize: '12px', color: '#EF4444', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>⚠ {errors['__payment']}</p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Full payment option */}
                  {(form.payment_options === 'full' || form.payment_options === 'both') && (
                    <button type="button" onClick={() => setPaymentChoice('full')} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px', borderRadius: '12px', border: `2px solid ${paymentChoice === 'full' ? primary : hasError ? '#EF4444' : '#E2E8F0'}`, background: paymentChoice === 'full' ? `${primary}08` : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.1s' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${paymentChoice === 'full' ? primary : '#CBD5E1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                        {paymentChoice === 'full' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: primary }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: paymentChoice === 'full' ? '#0F172A' : '#374151', marginBottom: '3px' }}>Pay in full — {sym}{total.toFixed(2)}</div>
                        <div style={{ fontSize: '13px', color: '#64748B' }}>One payment. Payment link will be sent to you after registration.</div>
                      </div>
                    </button>
                  )}

                  {/* Payment plan option */}
                  {(form.payment_options === 'plan' || form.payment_options === 'both') && (
                    <button type="button" onClick={() => setPaymentChoice('plan')} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px', borderRadius: '12px', border: `2px solid ${paymentChoice === 'plan' ? primary : hasError ? '#EF4444' : '#E2E8F0'}`, background: paymentChoice === 'plan' ? `${primary}08` : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.1s' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${paymentChoice === 'plan' ? primary : '#CBD5E1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                        {paymentChoice === 'plan' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: primary }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: paymentChoice === 'plan' ? '#0F172A' : '#374151', marginBottom: '3px' }}>
                          Payment plan
                          {dep > 0 ? ` — ${sym}${dep.toFixed(2)} now, then ${n}× ${sym}${instAmount.toFixed(2)} ${freq}` : ` — ${n}× ${sym}${instAmount.toFixed(2)} ${freq}`}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748B' }}>Spread payments over time. Total: {sym}{total.toFixed(2)}. Links sent after registration.</div>
                      </div>
                    </button>
                  )}
                </div>

                <div style={{ marginTop: '12px', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: '8px', padding: '10px 13px', fontSize: '12px', color: '#92400E' }}>
                  💡 No payment is taken now. You'll receive a secure payment link by email after submitting.
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: '28px' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', background: submitting ? '#86EFAC' : primary,
                color: '#fff', fontWeight: '700', fontSize: '16px',
                padding: '15px', borderRadius: '12px', border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              }}
            >
              {submitting ? <><Spinner color="#fff" size={18} /> Submitting…</> : 'Submit registration →'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '12px', color: '#94A3B8', marginTop: '12px' }}>
              Your information is stored securely and will only be used by {form.clubs?.name ?? 'the club'}.
            </p>
          </div>
        </form>
      </FormCard>
    </Page>
  );
}

// ─── Field renderer ───────────────────────────────────────────────────────────

function FormField({ field: f, value, fileValue, error, uploading, primary, onValue, onMultiValue, onFile }: {
  field: FieldDef; value: string; fileValue: File | null; error?: string;
  uploading: boolean; primary: string;
  onValue: (v: string) => void;
  onMultiValue: (opt: string, checked: boolean) => void;
  onFile: (file: File | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  if (f.type === 'section') {
    return (
      <div style={{ margin: '28px 0 16px', paddingBottom: '10px', borderBottom: '2px solid #F1F5F9' }}>
        <h3 style={{ fontSize: '12px', fontWeight: '800', color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</h3>
      </div>
    );
  }

  const baseStyle: React.CSSProperties = {
    width: '100%', background: '#fff',
    border: `1.5px solid ${error ? '#EF4444' : '#E2E8F0'}`,
    borderRadius: '10px', padding: '11px 14px', fontSize: '14px', color: '#0F172A',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{ fontSize: '14px', fontWeight: '600', color: '#1E293B', display: 'block', marginBottom: '5px' }}>
        {f.label}
        {f.required && <span style={{ color: '#EF4444', marginLeft: '3px' }}>*</span>}
      </label>
      {f.description && <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px', lineHeight: '1.5' }}>{f.description}</p>}

      {/* ── Text ── */}
      {(f.type === 'text' || f.type === 'email' || f.type === 'phone' || f.type === 'number') && (
        <input
          type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder={f.placeholder}
          onFocus={(e) => !error && (e.target.style.borderColor = primary)}
          onBlur={(e) => !error && (e.target.style.borderColor = '#E2E8F0')}
          style={baseStyle}
        />
      )}

      {/* ── Date ── */}
      {f.type === 'date' && (
        <input type="date" value={value} onChange={(e) => onValue(e.target.value)} style={baseStyle} />
      )}

      {/* ── Textarea ── */}
      {f.type === 'textarea' && (
        <textarea
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder={f.placeholder}
          rows={3}
          onFocus={(e) => !error && (e.target.style.borderColor = primary)}
          onBlur={(e) => !error && (e.target.style.borderColor = '#E2E8F0')}
          style={{ ...baseStyle, resize: 'vertical', lineHeight: '1.6' }}
        />
      )}

      {/* ── Select ── */}
      {f.type === 'select' && (
        <select value={value} onChange={(e) => onValue(e.target.value)} style={{ ...baseStyle, appearance: 'none', cursor: 'pointer', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2364748B' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: '36px' }}>
          <option value="">Select…</option>
          {(f.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}

      {/* ── Radio ── */}
      {f.type === 'radio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(f.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: `1.5px solid ${value === o ? primary : '#E2E8F0'}`, background: value === o ? `${primary}08` : '#fff', cursor: 'pointer', transition: 'all 0.1s' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${value === o ? primary : '#CBD5E1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {value === o && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: primary }} />}
              </div>
              <input type="radio" value={o} checked={value === o} onChange={() => onValue(o)} style={{ display: 'none' }} />
              <span style={{ fontSize: '14px', color: value === o ? '#0F172A' : '#374151', fontWeight: value === o ? '600' : '400' }}>{o}</span>
            </label>
          ))}
        </div>
      )}

      {/* ── Multiselect ── */}
      {f.type === 'multiselect' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(f.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => {
            const selected = value.split(', ').includes(o);
            return (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: `1.5px solid ${selected ? primary : '#E2E8F0'}`, background: selected ? `${primary}08` : '#fff', cursor: 'pointer', transition: 'all 0.1s' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${selected ? primary : '#CBD5E1'}`, background: selected ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <span style={{ color: '#fff', fontSize: '11px', fontWeight: '900' }}>✓</span>}
                </div>
                <input type="checkbox" checked={selected} onChange={(e) => onMultiValue(o, e.target.checked)} style={{ display: 'none' }} />
                <span style={{ fontSize: '14px', color: selected ? '#0F172A' : '#374151', fontWeight: selected ? '600' : '400' }}>{o}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* ── File upload ── */}
      {f.type === 'file' && (
        <div>
          <input ref={fileRef} type="file" accept={f.accept ?? 'image/*,.pdf'} style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          {fileValue ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: `${primary}08`, border: `1.5px solid ${primary}40`, borderRadius: '10px' }}>
              <span style={{ fontSize: '20px' }}>{fileValue.type.includes('pdf') ? '📄' : '🖼️'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileValue.name}</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>{(fileValue.size / 1024 / 1024).toFixed(1)} MB</div>
              </div>
              <button type="button" onClick={() => { onFile(null); if (fileRef.current) fileRef.current.value = ''; }} style={{ background: '#FEE2E2', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600' }}>
                Remove
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) onFile(file); }}
              style={{ border: `2px dashed ${error ? '#EF4444' : dragOver ? primary : '#CBD5E1'}`, borderRadius: '10px', padding: '24px 16px', textAlign: 'center', cursor: 'pointer', background: dragOver ? `${primary}06` : '#FAFAFA', transition: 'all 0.15s' }}
            >
              <div style={{ fontSize: '24px', marginBottom: '6px' }}>📎</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Drop file here or click to browse</div>
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                {f.accept?.includes('pdf') && f.accept?.includes('image') ? 'PDF or image' : f.accept?.includes('pdf') ? 'PDF only' : 'Images only'} · Max 10MB
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Waiver / Consent ── */}
      {f.type === 'waiver' && (
        <div>
          {f.waiver_text && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', fontSize: '13px', color: '#374151', lineHeight: '1.7', marginBottom: '12px', maxHeight: '160px', overflow: 'auto' }}>
              {f.waiver_text}
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px', borderRadius: '10px', border: `2px solid ${value === 'agreed' ? primary : error ? '#EF4444' : '#E2E8F0'}`, background: value === 'agreed' ? `${primary}08` : '#fff', cursor: 'pointer', transition: 'all 0.1s' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '5px', border: `2px solid ${value === 'agreed' ? primary : '#CBD5E1'}`, background: value === 'agreed' ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
              {value === 'agreed' && <span style={{ color: '#fff', fontSize: '12px', fontWeight: '900' }}>✓</span>}
            </div>
            <input type="checkbox" checked={value === 'agreed'} onChange={(e) => onValue(e.target.checked ? 'agreed' : '')} style={{ display: 'none' }} />
            <span style={{ fontSize: '13px', fontWeight: '600', color: value === 'agreed' ? '#0F172A' : '#374151', lineHeight: '1.5' }}>
              I have read and agree to the above
            </span>
          </label>
        </div>
      )}

      {/* Error */}
      {error && <p style={{ fontSize: '12px', color: '#EF4444', margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>⚠ {error}</p>}
    </div>
  );
}

// ─── Layout components ────────────────────────────────────────────────────────

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', padding: '32px 20px 64px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}

function FormCard({ children, primary, form }: { children: React.ReactNode; primary: string; form: Form }) {
  const club = form.clubs;
  const initials = (club?.name ?? 'DG').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.08)' }}>
      {/* Accent bar */}
      <div style={{ height: '5px', background: `linear-gradient(90deg, ${primary}, ${primary}aa)` }} />

      {/* Club header */}
      <div style={{ padding: '24px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: club?.logo_url ? 'transparent' : primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '800', color: '#fff', flexShrink: 0, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
            {club?.logo_url ? <img src={club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{club?.name}</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', lineHeight: '1.25', letterSpacing: '-0.4px' }}>{form.title}</div>
          </div>
        </div>

        {form.description && (
          <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', fontSize: '14px', color: '#374151', lineHeight: '1.65', borderLeft: `3px solid ${primary}` }}>
            {form.description}
          </div>
        )}
      </div>

      <div style={{ padding: '0 28px 28px' }}>
        {children}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 28px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC' }}>
        <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8', textAlign: 'center' }}>
          Powered by <a href="https://dugoutfc.app" style={{ color: primary, textDecoration: 'none', fontWeight: '600' }}>Dugout FC</a> · Your data is stored securely
        </p>
      </div>
    </div>
  );
}

function Spinner({ color = '#22C55E', size = 24 }: { color?: string; size?: number }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `2.5px solid ${color}33`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
