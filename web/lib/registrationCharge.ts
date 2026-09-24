import { calculateFee } from './feeCalculator';

// Shared between the on-session checkout (/api/registration/create-payment-intent)
// and the off-session auto-charge cron, so the two paths can never quietly
// diverge on how a registration installment gets priced/routed.

export type RegChargeClub = {
  id: string;
  slug: string | null;
  stripe_fee_handling: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarded: boolean | null;
};

export function buildRegistrationChargeBody(opts: {
  amount: number; currency: string; club: RegChargeClub | null;
  installmentId: string; paymentToken: string; submissionId: string;
}): { body: URLSearchParams; chargeAmount: number } | { error: 'not_configured' } {
  const { amount, currency, club, installmentId, paymentToken, submissionId } = opts;

  const connectAccountId = club?.stripe_connect_onboarded ? (club?.stripe_connect_account_id ?? null) : null;
  if (!connectAccountId) return { error: 'not_configured' };

  const breakdown       = calculateFee(amount, 'card');
  const feeChargedMinor = Math.round(breakdown.feeCharged * 100);
  const baseMinor       = Math.round(amount * 100);
  const chargeAmount    = club?.stripe_fee_handling === 'pass_on' ? baseMinor + feeChargedMinor : baseMinor;

  const body = new URLSearchParams({
    amount: String(chargeAmount),
    currency: currency.toLowerCase(),
    'metadata[registration_installment_id]': installmentId,
    'metadata[payment_token]': paymentToken,
    'metadata[submission_id]': submissionId,
    'metadata[club_id]': club?.id ?? '',
    'metadata[club_slug]': club?.slug ?? '',
    'transfer_data[destination]': connectAccountId,
  });
  if (feeChargedMinor > 0) body.set('application_fee_amount', String(feeChargedMinor));

  return { body, chargeAmount };
}
