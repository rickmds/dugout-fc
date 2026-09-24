'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { formatCurrency } from '@/lib/formatCurrency';

type InstallmentData = {
  amount: number; due_date: string; paid: boolean; currency: string;
  form_title: string; club_name: string; club_logo_url: string | null; club_color: string | null;
  total_due: number | null; total_paid: number; has_future_installments: boolean;
};

function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22C55E';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22C55E';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ((r < 15 && g < 15 && b < 15) || (r > 240 && g > 240 && b > 240)) return '#22C55E';
  return hex;
}
function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#000' : '#fff';
}

function CheckoutForm({ accent, amount, currency, clubName, onSuccess }: {
  accent: string; amount: number; currency: string; clubName: string; onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authConsent, setAuthConsent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !authConsent) return;
    setProcessing(true);
    setError(null);

    const { error: confirmErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (confirmErr) {
      setError(confirmErr.message ?? 'Payment failed. Please try again.');
      setProcessing(false);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      fetch('/api/registration/confirm-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_intent_id: paymentIntent.id }),
      }).catch(() => {});
      onSuccess();
      return;
    }
    setProcessing(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', margin: '18px 0 0' }}>
        <input type="checkbox" checked={authConsent} onChange={e => setAuthConsent(e.target.checked)} style={{ marginTop: '3px', accentColor: accent }} />
        <span style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.5' }}>
          I authorize {clubName} to charge <strong style={{ color: '#e5e7eb' }}>{formatCurrency(amount, currency)}</strong> to this card.
        </span>
      </label>
      {error && (
        <div style={{ marginTop: '14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#fca5a5' }}>
          {error}
        </div>
      )}
      <button type="submit" disabled={!stripe || processing || !authConsent}
        style={{ width: '100%', marginTop: '18px', padding: '15px', borderRadius: '12px', border: 'none', background: (processing || !authConsent) ? `${accent}88` : accent, color: contrastText(accent), fontSize: '15px', fontWeight: '800', cursor: (processing || !authConsent) ? 'not-allowed' : 'pointer', boxShadow: (processing || !authConsent) ? 'none' : `0 4px 16px ${accent}44` }}>
        {processing ? 'Processing…' : 'Pay now'}
      </button>
    </form>
  );
}

function PayRegistrationContent() {
  const { token } = useParams<{ token: string }>();

  const [data, setData] = useState<InstallmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [autopayConsent, setAutopayConsent] = useState(false);
  const [settingUpPayment, setSettingUpPayment] = useState(false);

  async function proceedToPayment(consent: boolean) {
    setSettingUpPayment(true);
    const piRes = await fetch('/api/registration/create-payment-intent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_token: token, autopay_consent: consent }),
    });
    const pi = await piRes.json();
    if (pi.configured === false) { setNotConfigured(true); setSettingUpPayment(false); return; }
    if (!piRes.ok) { setError(pi.error ?? 'Could not set up payment.'); setSettingUpPayment(false); return; }
    setClientSecret(pi.client_secret);
    setPublishableKey(pi.publishable_key);
    setStripePromise(loadStripe(pi.publishable_key));
    setSettingUpPayment(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; sets state from a real network call, not derivable at render time
    if (!token) { setLoading(false); return; }
    (async () => {
      const res = await fetch(`/api/registration/installment?token=${token}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Could not load this payment.'); setLoading(false); return; }
      setData(d);
      setLoading(false);
      if (d.paid) return;
      // A one-time or final payment has nothing left to offer autopay for —
      // skip straight to the card form. Otherwise wait for the consent
      // choice below before creating the PaymentIntent, since whether the
      // card gets saved has to be decided before Stripe creates it.
      if (!d.has_future_installments) await proceedToPayment(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- proceedToPayment is a stable function defined in this same component; only `token` is a real reactive input here
  }, [token]);

  const accent = resolveAccent(data?.club_color);
  const btnColor = contrastText(accent);
  const ini = (data?.club_name ?? '').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '500px', height: '180px', pointerEvents: 'none', background: `radial-gradient(ellipse at 50% 0%, ${accent}18 0%, transparent 70%)` }} />
      <div style={{ maxWidth: '440px', width: '100%', position: 'relative', zIndex: 1 }}>
        {(data?.club_name || data?.club_logo_url) && (
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            {data?.club_logo_url
              // eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL, next/image remotePatterns not configured
              ? <img src={data.club_logo_url} alt="" style={{ height: '52px', objectFit: 'contain', borderRadius: '12px' }} />
              : <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: `linear-gradient(135deg, ${accent}cc, ${accent}88)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '900', color: btnColor, boxShadow: `0 4px 20px ${accent}44` }}>{ini}</div>}
            {data?.club_name && <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: '700', color: '#e5e7eb', letterSpacing: '-0.2px' }}>{data.club_name}</div>}
          </div>
        )}
        <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
          <div style={{ height: '2px', background: `linear-gradient(90deg, ${accent}, ${accent}66)` }} />
          <div style={{ padding: '28px' }}>{children}</div>
        </div>
        <p style={{ marginTop: '18px', textAlign: 'center', fontSize: '11px', color: '#374151' }}>
          Powered by <a href="https://pulse-fc.app" style={{ color: '#4b5563', textDecoration: 'none', fontWeight: '600' }}>Pulse FC</a>
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (loading) return shell(
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${accent}33`, borderTopColor: accent, borderRadius: '50%', margin: '0 auto', animation: 'spin 0.75s linear infinite' }} />
      <div style={{ marginTop: '14px', fontSize: '13px', color: '#6b7280' }}>Loading payment…</div>
    </div>
  );

  if (error) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', marginBottom: '14px' }}>🔗</div>
      <div style={{ fontSize: '17px', fontWeight: '800', color: '#f3f4f6', marginBottom: '8px' }}>Link invalid</div>
      <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6' }}>{error}</div>
    </div>
  );

  if (notConfigured) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '32px', marginBottom: '14px' }}>💳</div>
      <div style={{ fontSize: '17px', fontWeight: '800', color: '#f3f4f6', marginBottom: '8px' }}>Online payment isn&apos;t set up yet</div>
      <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6' }}>Please contact {data?.club_name ?? 'your club'} directly to arrange payment.</div>
    </div>
  );

  if (success || data?.paid) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: `${accent}20`, border: `2px solid ${accent}55`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '18px', color: accent }}>✓</div>
      <div style={{ fontSize: '20px', fontWeight: '800', color: '#f9fafb', marginBottom: '8px' }}>Payment received</div>
      <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.65' }}>
        Thanks! Your payment for <strong style={{ color: '#e5e7eb' }}>{data?.form_title}</strong> has been received. A receipt is on its way to your email.
      </div>
    </div>
  );

  // A plan with more payments left, and the card hasn't been set up yet —
  // ask about autopay before creating the PaymentIntent (Stripe needs to
  // know up front whether to save the card).
  if (data?.has_future_installments && !clientSecret) return shell(
    <>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Registration payment</div>
      <div style={{ fontSize: '18px', fontWeight: '800', color: '#f9fafb', lineHeight: '1.3', marginBottom: '4px' }}>{data?.form_title}</div>
      <div style={{ fontSize: '26px', fontWeight: '900', color: accent, margin: '10px 0 18px' }}>{data ? formatCurrency(data.amount, data.currency) : ''}</div>
      <div style={{ height: '1px', background: '#1e1e1e', margin: '0 0 20px' }} />
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '20px' }}>
        <input type="checkbox" checked={autopayConsent} onChange={e => setAutopayConsent(e.target.checked)} style={{ marginTop: '3px', accentColor: accent }} />
        <span style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.55' }}>
          Automatically charge this card for my remaining scheduled payments as they come due. You&apos;ll get a receipt each time — you can always pay a specific installment manually instead by ignoring this.
        </span>
      </label>
      <button onClick={() => proceedToPayment(autopayConsent)} disabled={settingUpPayment}
        style={{ width: '100%', padding: '15px', borderRadius: '12px', border: 'none', background: settingUpPayment ? `${accent}cc` : accent, color: btnColor, fontSize: '15px', fontWeight: '800', cursor: settingUpPayment ? 'not-allowed' : 'pointer', boxShadow: settingUpPayment ? 'none' : `0 4px 16px ${accent}44` }}>
        {settingUpPayment ? 'Setting up…' : 'Continue to payment'}
      </button>
    </>
  );

  return shell(
    <>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Registration payment</div>
      <div style={{ fontSize: '18px', fontWeight: '800', color: '#f9fafb', lineHeight: '1.3', marginBottom: '4px' }}>{data?.form_title}</div>
      <div style={{ fontSize: '26px', fontWeight: '900', color: accent, margin: '10px 0 18px' }}>{data ? formatCurrency(data.amount, data.currency) : ''}</div>
      <div style={{ height: '1px', background: '#1e1e1e', margin: '0 0 20px' }} />
      {clientSecret && publishableKey && stripePromise ? (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: {
          theme: 'night', variables: { colorPrimary: accent, colorBackground: '#1C1C1E', colorText: '#F9FAFB', colorDanger: '#EF4444', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', borderRadius: '10px', colorTextPlaceholder: '#6B7280' },
          rules: { '.Input': { border: '1px solid #374151', boxShadow: 'none', padding: '12px 14px' }, '.Input:focus': { border: `1px solid ${accent}`, boxShadow: `0 0 0 2px ${accent}30` }, '.Label': { color: '#9CA3AF', fontSize: '12px', fontWeight: '600' } },
        }, loader: 'auto' }}>
          <CheckoutForm accent={accent} amount={data?.amount ?? 0} currency={data?.currency ?? 'USD'} clubName={data?.club_name ?? 'this club'} onSuccess={() => setSuccess(true)} />
        </Elements>
      ) : (
        <div style={{ textAlign: 'center', fontSize: '13px', color: '#6b7280' }}>Setting up payment…</div>
      )}
    </>
  );
}

export default function PayRegistrationPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '28px', height: '28px', border: '2px solid #22C55E33', borderTopColor: '#22C55E', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <PayRegistrationContent />
    </Suspense>
  );
}
