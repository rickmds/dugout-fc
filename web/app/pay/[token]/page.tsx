'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { formatCurrency } from '@/lib/formatCurrency';
import { symbolForCurrency } from '@/lib/countries';
import { calculateFee, LEGACY_BLENDED_FEE_MODEL, type PaymentRail } from '@/lib/feeCalculator';

type FeeData = {
  id: string;
  payment_token: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  discount: number;
  due_date: string | null;
  status: string;
  allow_partial_payments: boolean;
  stripe_fee_handling: 'absorb' | 'pass_on';
  hardship_fund_enabled: boolean;
  installment_number: number | null;
  installment_total: number | null;
  payee_type: 'club' | 'coach';
  payment_instructions: string | null;
  fee_model_version: string;
  player_name: string;
  team_name: string;
  club_name: string;
  club_logo: string | null;
  club_color: string;
  club_slug: string;
  currency: string;
};

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

type SurchargeCheck = { eligible: boolean; base_amount: number; surcharge_amount: number; total: number };

// ── Inner checkout form (uses Stripe hooks — must be inside <Elements>) ────────
function CheckoutForm({ chargeAmount, payAmount, currency, accent, onSuccess, surchargePending, paymentToken, paymentIntentId, clientSecret, clubName }: {
  chargeAmount: number; payAmount: number; currency: string; accent: string; onSuccess: () => void;
  surchargePending: boolean; paymentToken: string; paymentIntentId: string | null; clientSecret: string; clubName: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency);
  const stripe   = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [ready, setReady]           = useState(false);

  // Only card + pass_on fees go through this — the real, card-network-
  // validated surcharge (and whether it applies at all, since debit cards
  // can never be surcharged) isn't known until a specific card is entered.
  const [surchargeCheck, setSurchargeCheck] = useState<SurchargeCheck | null>(null);
  const [pendingPaymentMethodId, setPendingPaymentMethodId] = useState<string | null>(null);
  const [checkingSurcharge, setCheckingSurcharge] = useState(false);

  async function finishPayment(paymentMethodId?: string) {
    setProcessing(true);
    setError(null);

    const { error: confirmErr, paymentIntent } = paymentMethodId
      ? await stripe!.confirmCardPayment(clientSecret, { payment_method: paymentMethodId })
      : await stripe!.confirmPayment({
          elements: elements!,
          confirmParams: { return_url: window.location.href + '?paid=1' },
          redirect: 'if_required',
        });

    if (confirmErr) {
      setError(confirmErr.message ?? 'Payment failed. Please try again.');
      setProcessing(false);
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess();
    } else {
      setProcessing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || processing || checkingSurcharge) return;

    const { error: submitErr } = await elements.submit();
    if (submitErr) { setError(submitErr.message ?? 'Please check your card details.'); return; }

    if (!surchargePending) {
      await finishPayment();
      return;
    }

    // Card + pass_on: create the PaymentMethod first, then ask Stripe
    // whether this specific card can be surcharged and for how much,
    // before disclosing a final number and letting the payer confirm.
    setCheckingSurcharge(true);
    setError(null);
    const { error: pmErr, paymentMethod } = await stripe.createPaymentMethod({ elements });
    if (pmErr || !paymentMethod) {
      setError(pmErr?.message ?? 'Please check your card details.');
      setCheckingSurcharge(false);
      return;
    }

    try {
      const res = await fetch('/api/stripe/check-surcharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_token: paymentToken, payment_intent_id: paymentIntentId, payment_method_id: paymentMethod.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not validate this card. Please try again.');
        setCheckingSurcharge(false);
        return;
      }
      setSurchargeCheck(data as SurchargeCheck);
      setPendingPaymentMethodId(paymentMethod.id);
    } catch {
      setError('Something went wrong validating your card. Please try again.');
    }
    setCheckingSurcharge(false);
  }

  // ── Disclosure step: card is validated, real surcharge is known — show
  // it plainly and let the payer confirm or go back and use a different
  // card, per card network disclosure requirements.
  if (surchargeCheck && pendingPaymentMethodId) {
    return (
      <div>
        <div style={{ background: '#1C1C1E', border: '1px solid #2A2A2A', borderRadius: '12px', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#9CA3AF' }}>
            <span>Amount to {clubName}</span><span>{fmt(surchargeCheck.base_amount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#9CA3AF' }}>
            <span>Processing fee{!surchargeCheck.eligible ? ' — none for debit cards' : ''}</span>
            <span>{surchargeCheck.surcharge_amount > 0 ? `+${fmt(surchargeCheck.surcharge_amount)}` : fmt(0)}</span>
          </div>
          <div style={{ height: '1px', background: '#2A2A2A', margin: '2px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '800', color: '#F9FAFB' }}>
            <span>Total</span><span>{fmt(surchargeCheck.total)}</span>
          </div>
        </div>

        {error && (
          <div style={{ background: '#7F1D1D', border: '1px solid #EF4444', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        <button
          onClick={() => finishPayment(pendingPaymentMethodId)}
          disabled={processing}
          style={{
            width: '100%', padding: '16px', borderRadius: '12px', border: 'none',
            background: processing ? '#374151' : accent, color: '#fff', fontSize: '16px', fontWeight: '800',
            cursor: processing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', letterSpacing: '-0.2px',
          }}
        >
          {processing ? 'Processing…' : `Confirm & pay ${fmt(surchargeCheck.total)}`}
        </button>
        <button
          onClick={() => { setSurchargeCheck(null); setPendingPaymentMethodId(null); setError(null); }}
          disabled={processing}
          style={{ width: '100%', marginTop: '10px', padding: '8px', background: 'transparent', border: 'none', color: '#6B7280', fontSize: '13px', cursor: processing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          ← Use a different card
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '16px', opacity: ready ? 1 : 0.4, transition: 'opacity 0.3s' }}>
        <PaymentElement
          onReady={() => setReady(true)}
          options={{ layout: 'tabs' }}
        />
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #EF4444', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: '#FCA5A5' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || processing || checkingSurcharge || !ready}
        style={{
          width: '100%', padding: '16px', borderRadius: '12px', border: 'none',
          background: processing || checkingSurcharge || !ready ? '#374151' : accent,
          color: '#fff', fontSize: '16px', fontWeight: '800',
          cursor: processing || checkingSurcharge || !ready ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', letterSpacing: '-0.2px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          transition: 'background 0.15s',
        }}
      >
        {processing ? 'Processing…'
          : checkingSurcharge ? 'Checking your card…'
          : !ready ? 'Loading…'
          : surchargePending ? 'Continue →'
          : `Pay ${fmt(chargeAmount)} securely`}
      </button>

      {!surchargePending && chargeAmount > payAmount && (
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: '#6B7280' }}>
          Includes {fmt(chargeAmount - payAmount)} processing fee · You pay {fmt(chargeAmount)} total
        </div>
      )}
      {surchargePending && (
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: '#6B7280' }}>
          We&apos;ll show your exact total — including any card processing fee — before you pay.
        </div>
      )}
    </form>
  );
}

// ── Main pay page ──────────────────────────────────────────────────────────────
export default function PayPage() {
  const { token }      = useParams<{ token: string }>();
  const searchParams   = useSearchParams();
  const paidParam      = searchParams.get('paid') === '1' || searchParams.get('redirect_status') === 'succeeded';

  const [fee, setFee]               = useState<FeeData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [notFound, setNotFound]     = useState(false);
  const [partialAmount, setPartialAmount] = useState('');
  const [donationAmount, setDonationAmount] = useState<number>(0);
  const [customDonation, setCustomDonation] = useState('');
  const [rail, setRail] = useState<PaymentRail>('ach');

  // Checkout state
  const [checkoutState, setCheckoutState] = useState<'idle' | 'loading' | 'ready' | 'success'>(
    paidParam ? 'success' : 'idle'
  );
  const [clientSecret, setClientSecret]   = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [chargeAmount, setChargeAmount]   = useState(0);
  const [payAmount, setPayAmount]         = useState(0);
  const [initError, setInitError]         = useState<string | null>(null);
  const [surchargePending, setSurchargePending] = useState(false);
  const [paymentIntentId, setPaymentIntentId]   = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/pay/fee?token=${encodeURIComponent(token)}`);
        if (!res.ok) { setNotFound(true); setLoading(false); return; }
        const data = await res.json();
        setFee(data as FeeData);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
  }, [token]);

  const effectiveDonation = donationAmount > 0 ? donationAmount : (customDonation ? parseFloat(customDonation) || 0 : 0);
  const isLegacyFeeModel  = fee?.fee_model_version === LEGACY_BLENDED_FEE_MODEL;
  // Stripe's ACH direct debit (us_bank_account) only supports US bank
  // accounts on USD PaymentIntents — non-US clubs only ever see Card.
  const achAvailable      = fee?.currency === 'USD';
  const effectiveRail: PaymentRail = achAvailable ? rail : 'card';

  const previewBalance    = fee ? Math.max(0, fee.amount_due - fee.discount - fee.amount_paid) : 0;
  const previewPayAmount  = fee?.allow_partial_payments && partialAmount ? (parseFloat(partialAmount) || previewBalance) : previewBalance;
  const feeBaseForPreview = previewPayAmount + effectiveDonation;
  const railTotals = {
    ach:  calculateFee(feeBaseForPreview, 'ach').totalCharge,
    card: calculateFee(feeBaseForPreview, 'card').totalCharge,
  };

  const handlePay = useCallback(async () => {
    if (!fee || checkoutState !== 'idle') return;
    setCheckoutState('loading');
    setInitError(null);

    const partial = fee.allow_partial_payments && partialAmount ? parseFloat(partialAmount) : undefined;

    try {
      const res  = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_token: fee.payment_token, amount: partial, donation_amount: effectiveDonation || undefined,
          rail: isLegacyFeeModel ? undefined : effectiveRail,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.client_secret) {
        setInitError(data.error ?? 'Could not initialise payment. Please try again.');
        setCheckoutState('idle');
        return;
      }
      if (data.configured === false) {
        setInitError('Online payments are not yet configured for this club. Please contact your administrator.');
        setCheckoutState('idle');
        return;
      }

      const promise = loadStripe(data.publishable_key);
      setStripePromise(promise);
      setClientSecret(data.client_secret);
      setChargeAmount(data.charge_amount);
      setPayAmount(data.pay_amount);
      setSurchargePending(!!data.surcharge_pending);
      setPaymentIntentId(data.payment_intent_id ?? null);
      setCheckoutState('ready');
    } catch {
      setInitError('Something went wrong. Please try again.');
      setCheckoutState('idle');
    }
  }, [fee, checkoutState, partialAmount, effectiveDonation, isLegacyFeeModel, effectiveRail]);

  // ── Loading / not found ──────────────────────────────────────────────────────
  if (loading) return (
    <div style={styles.page}>
      <div style={{ color: '#9CA3AF', fontSize: '14px' }}>Loading…</div>
    </div>
  );

  if (notFound) return (
    <div style={styles.page}>
      <div style={{ ...styles.card, textAlign: 'center', padding: '48px 32px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
        <div style={{ fontSize: '18px', fontWeight: '800', color: '#F9FAFB', marginBottom: '8px' }}>Fee not found</div>
        <div style={{ fontSize: '14px', color: '#9CA3AF' }}>This payment link is invalid or has expired.</div>
      </div>
    </div>
  );

  if (!fee) return null;

  const fmt        = (n: number) => formatCurrency(n, fee.currency);
  const symbol     = symbolForCurrency(fee.currency);
  const balance    = Math.max(0, fee.amount_due - fee.discount - fee.amount_paid);
  const isOverdue  = fee.due_date ? new Date(fee.due_date) < new Date() : false;
  const accent     = fee.club_color && fee.club_color !== '#000000' && fee.club_color !== '#ffffff' ? fee.club_color : '#22C55E';
  const alreadyPaid = fee.status === 'paid' || fee.status === 'waived' || balance <= 0;
  const initials   = fee.club_name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const showSuccess = checkoutState === 'success' || paidParam || alreadyPaid;

  const stripeAppearance = {
    theme: 'night' as const,
    variables: {
      colorPrimary: accent,
      colorBackground: '#1C1C1E',
      colorText: '#F9FAFB',
      colorDanger: '#EF4444',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      borderRadius: '10px',
      colorTextPlaceholder: '#6B7280',
    },
    rules: {
      '.Input': { border: '1px solid #374151', boxShadow: 'none', padding: '12px 14px' },
      '.Input:focus': { border: `1px solid ${accent}`, boxShadow: `0 0 0 2px ${accent}30` },
      '.Tab': { border: '1px solid #374151', background: '#111' },
      '.Tab--selected': { border: `1px solid ${accent}`, background: `${accent}15` },
      '.Label': { color: '#9CA3AF', fontSize: '12px', fontWeight: '600' },
    },
  };

  return (
    <div style={styles.page}>
      {/* Club header */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        {fee.club_logo
          // eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up
          ? <img src={fee.club_logo} alt={fee.club_name} style={{ width: '64px', height: '64px', borderRadius: '16px', objectFit: 'cover', display: 'block', margin: '0 auto 10px' }} />
          : <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: '22px', fontWeight: '900', color: '#fff' }}>{initials}</div>
        }
        <div style={{ fontSize: '18px', fontWeight: '800', color: '#F9FAFB', letterSpacing: '-0.3px' }}>{fee.club_name}</div>
      </div>

      <div style={styles.card}>
        <div style={{ height: '4px', background: showSuccess ? '#22C55E' : isOverdue ? '#EF4444' : accent }} />
        <div style={{ padding: '28px' }}>

          {/* Success */}
          {showSuccess && (
            <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#F9FAFB', marginBottom: '8px' }}>
                {alreadyPaid && checkoutState !== 'success' && !paidParam ? 'Already paid' : 'Payment received!'}
              </div>
              <div style={{ fontSize: '14px', color: '#9CA3AF', lineHeight: 1.7 }}>
                {alreadyPaid && checkoutState !== 'success' && !paidParam
                  ? `This fee for ${fee.player_name} has already been settled.`
                  : `Thanks! ${fee.player_name}'s payment for ${fee.description} has been recorded. You'll receive a receipt by email shortly.`
                }
              </div>
            </div>
          )}

          {/* Payment form */}
          {!showSuccess && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                  {isOverdue ? 'Overdue Payment' : 'Fee Notice'}
                </div>
                {fee.installment_number && fee.installment_total && (
                  <div style={{ fontSize: '10px', fontWeight: '700', color: accent, background: `${accent}20`, border: `1px solid ${accent}40`, borderRadius: '5px', padding: '2px 7px', letterSpacing: '0.03em' }}>
                    Instalment {fee.installment_number} of {fee.installment_total}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#F9FAFB', letterSpacing: '-0.4px', marginBottom: '20px', lineHeight: 1.3 }}>
                {fee.description}
              </div>

              {/* Fee summary card */}
              <div style={{ background: '#1C1C1E', border: `1px solid ${isOverdue ? '#7F1D1D' : '#2A2A2A'}`, borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
                <div style={{ height: '2px', background: isOverdue ? '#EF4444' : accent }} />
                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>Balance due</div>
                      <div style={{ fontSize: '32px', fontWeight: '900', color: isOverdue ? '#EF4444' : accent, letterSpacing: '-1px' }}>{fmt(balance)}</div>
                    </div>
                    {fee.due_date && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>
                          {isOverdue ? 'Was due' : 'Due'}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: isOverdue ? '#EF4444' : '#D1D5DB' }}>
                          {fmtDate(fee.due_date)}{isOverdue ? ' · OVERDUE' : ''}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: '600', marginBottom: '2px' }}>Player</div>
                      <div style={{ fontSize: '13px', color: '#D1D5DB', fontWeight: '600' }}>{fee.player_name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: '600', marginBottom: '2px' }}>Team</div>
                      <div style={{ fontSize: '13px', color: '#D1D5DB', fontWeight: '600' }}>{fee.team_name}</div>
                    </div>
                    {fee.amount_paid > 0 && (
                      <div>
                        <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: '600', marginBottom: '2px' }}>Already paid</div>
                        <div style={{ fontSize: '13px', color: '#22C55E', fontWeight: '600' }}>{fmt(fee.amount_paid)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {fee.payee_type === 'coach' ? (
                <div style={{ background: '#1C1C1E', border: '1px solid #2A2A2A', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                    Collected directly by your coach
                  </div>
                  <div style={{ fontSize: '15px', color: '#F9FAFB', lineHeight: 1.6 }}>
                    {fee.payment_instructions ?? 'Contact your coach for payment details.'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '14px' }}>
                    This fee does not go through the club — online payment isn&apos;t available for it.
                  </div>
                </div>
              ) : (
              <>
              {/* Partial amount input — only shown before checkout is ready */}
              {fee.allow_partial_payments && checkoutState === 'idle' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#D1D5DB', display: 'block', marginBottom: '6px' }}>
                    Pay a different amount <span style={{ fontWeight: '400', color: '#6B7280' }}>(optional)</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #374151', borderRadius: '10px', overflow: 'hidden', background: '#1C1C1E' }}>
                    <span style={{ padding: '11px 12px', color: '#6B7280', fontSize: '15px', fontWeight: '700', borderRight: '1px solid #374151' }}>{symbol}</span>
                    <input
                      type="number" min="1" max={balance} step="0.01"
                      placeholder={balance.toFixed(2)}
                      value={partialAmount}
                      onChange={e => setPartialAmount(e.target.value)}
                      style={{ flex: 1, padding: '11px 14px', background: 'transparent', border: 'none', outline: 'none', fontSize: '15px', color: '#F9FAFB', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              )}

              {/* Hardship fund donation */}
              {fee.hardship_fund_enabled && checkoutState === 'idle' && (
                <div style={{ border: '1px solid #2A2A2A', borderRadius: '12px', padding: '16px', marginBottom: '16px', background: '#111' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#9CA3AF', marginBottom: '10px' }}>
                    ❤️ Support a teammate <span style={{ fontWeight: '400', color: '#6B7280' }}>(optional)</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>
                    Add a small donation to help cover fees for a family who needs it.
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
                    {[0, 5, 10, 25].map(amt => (
                      <button key={amt} onClick={() => { setDonationAmount(amt); setCustomDonation(''); }}
                        style={{ padding: '7px 14px', borderRadius: '8px', border: `1.5px solid ${donationAmount === amt && !customDonation ? accent : '#374151'}`, background: donationAmount === amt && !customDonation ? `${accent}20` : 'transparent', color: donationAmount === amt && !customDonation ? accent : '#9CA3AF', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {amt === 0 ? 'None' : `+${symbol}${amt}`}
                      </button>
                    ))}
                    <input
                      type="number" min="1" placeholder={`Custom ${symbol}`}
                      value={customDonation}
                      onChange={e => { setCustomDonation(e.target.value); setDonationAmount(0); }}
                      style={{ width: '90px', padding: '7px 10px', borderRadius: '8px', border: `1.5px solid ${customDonation ? accent : '#374151'}`, background: 'transparent', color: '#F9FAFB', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                  {effectiveDonation > 0 && (
                    <div style={{ fontSize: '12px', color: '#22C55E', marginTop: '10px' }}>
                      ✓ +{fmt(effectiveDonation)} will go to the club hardship fund
                    </div>
                  )}
                </div>
              )}

              {/* Payment method — rail picker (new-model fees only; legacy fees keep the single Pay button unchanged) */}
              {checkoutState === 'idle' && !isLegacyFeeModel && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#D1D5DB', display: 'block', marginBottom: '8px' }}>
                    How would you like to pay?
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(achAvailable ? (['ach', 'card'] as const) : (['card'] as const)).map(r => {
                      const isSelected = effectiveRail === r;
                      const total = fee.stripe_fee_handling === 'pass_on' ? railTotals[r] : feeBaseForPreview;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRail(r)}
                          style={{
                            flex: 1, textAlign: 'left', padding: '14px 16px', borderRadius: '12px',
                            border: `2px solid ${isSelected ? accent : '#2A2A2A'}`,
                            background: isSelected ? `${accent}12` : '#161616',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: isSelected ? accent : '#F3F4F6' }}>
                              {r === 'ach' ? 'Bank account' : 'Card'}
                            </span>
                            {r === 'ach' && (
                              <span style={{ fontSize: '9px', fontWeight: '800', color: accent, background: `${accent}20`, borderRadius: '5px', padding: '2px 6px', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                                LOWER FEE
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '17px', fontWeight: '900', color: '#F9FAFB', letterSpacing: '-0.3px' }}>{fmt(total)}</div>
                          <div style={{ fontSize: '10.5px', color: '#6B7280', marginTop: '2px' }}>
                            {r === 'ach' ? 'Directly from your bank · 1–2 days' : 'Debit or credit · instant'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Init error */}
              {initError && (
                <div style={{ background: '#7F1D1D', border: '1px solid #EF4444', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: '#FCA5A5' }}>
                  {initError}
                </div>
              )}

              {/* Idle state — show Pay button */}
              {checkoutState === 'idle' && (
                <button
                  onClick={handlePay}
                  disabled={fee.allow_partial_payments && !!partialAmount && (parseFloat(partialAmount) <= 0 || parseFloat(partialAmount) > balance)}
                  style={{
                    width: '100%', padding: '16px', borderRadius: '12px', border: 'none',
                    background: accent, color: '#fff', fontSize: '16px', fontWeight: '800',
                    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.2px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}
                >
                  {!isLegacyFeeModel
                    ? `Pay ${fmt(fee.stripe_fee_handling === 'pass_on' ? railTotals[effectiveRail] : feeBaseForPreview)} →`
                    : fee.stripe_fee_handling === 'pass_on'
                      ? `Pay ${fmt(balance)} →`
                      : `Pay ${fmt(fee.allow_partial_payments && partialAmount ? parseFloat(partialAmount) || balance : balance)} →`
                  }
                </button>
              )}

              {/* Loading skeleton */}
              {checkoutState === 'loading' && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#6B7280', fontSize: '14px' }}>
                  <div style={{ width: '24px', height: '24px', border: '2px solid #374151', borderTop: `2px solid ${accent}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
                  Setting up secure payment…
                </div>
              )}

              {/* Embedded card form */}
              {checkoutState === 'ready' && clientSecret && stripePromise && (
                <div style={{ marginTop: '4px' }}>
                  <Elements
                    stripe={stripePromise}
                    options={{ clientSecret, appearance: stripeAppearance, loader: 'auto' }}
                  >
                    <CheckoutForm
                      chargeAmount={chargeAmount}
                      payAmount={payAmount}
                      currency={fee.currency}
                      accent={accent}
                      onSuccess={() => setCheckoutState('success')}
                      surchargePending={surchargePending}
                      paymentToken={fee.payment_token}
                      paymentIntentId={paymentIntentId}
                      clientSecret={clientSecret}
                      clubName={fee.club_name}
                    />
                  </Elements>
                  <button
                    onClick={() => setCheckoutState('idle')}
                    style={{ width: '100%', marginTop: '10px', padding: '8px', background: 'transparent', border: 'none', color: '#6B7280', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    ← Back
                  </button>
                </div>
              )}

              {checkoutState === 'idle' && (
                <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M10 6H2V4a4 4 0 0 1 8 0v2zm1 0V4A5 5 0 0 0 1 4v2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z" fill="#6B7280"/></svg>
                  Secure payment · No account required
                </div>
              )}
              </>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: '#4B5563' }}>
        Powered by <a href="https://pulse-fc.app" style={{ color: '#9CA3AF', textDecoration: 'none', fontWeight: '600' }}>Pulse FC</a>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0A0A0A',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: '48px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  },
  card: {
    background: '#111111',
    border: '1px solid #222222',
    borderRadius: '20px',
    overflow: 'hidden' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    width: '100%',
    maxWidth: '480px',
  },
};
