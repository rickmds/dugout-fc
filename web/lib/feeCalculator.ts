// Rail-aware payment processing fee calculator.
//
// Replaces the single blended `stripe_surcharge_pct` rate (clubs table) with
// two independently-configured rails. Nothing here is hardcoded as a bare
// number at the call site — every rate, fixed charge, and cap comes in
// through RailFeeConfig, which is designed to become a per-club override
// (see the migration proposal) rather than a global constant. Do not import
// DEFAULT_RAIL_FEE_CONFIG directly into a checkout/settings call site and
// treat it as the permanent rate — it's the fallback for clubs that haven't
// been given (or don't need) an override.
//
// "Cost" fields are Pulse FC's own underlying processor cost, kept
// separately from what's charged so margin is a real, reportable number —
// per the brief, this must never be presented to a payer as the fee.

export type PaymentRail = 'card' | 'ach';

// player_fees.fee_model_version values. A fee row is tagged with whichever
// of these was current at the moment it was created (see migration
// 20260817000001) and keeps using that formula for its whole lifetime —
// this is what stops a global rate change from silently repricing an
// instalment plan a family already agreed to.
export const LEGACY_BLENDED_FEE_MODEL = 'legacy_blended';
export const CURRENT_FEE_MODEL_VERSION = 'v2_rail_2026_08';

export interface RailFeeConfig {
  /** Percentage rate charged to the payer/club, e.g. 0.029 for 2.9%. */
  chargeRatePct: number;
  /** Fixed per-transaction amount added on top of the percentage, in dollars. */
  chargeFixed: number;
  /** Cap on the total charged fee, in dollars — null if uncapped. */
  chargeCap: number | null;
  /** Pulse FC's actual underlying processor cost — percentage rate. Margin-reporting only. */
  costRatePct: number;
  /** Underlying processor fixed cost per transaction, in dollars. Margin-reporting only. */
  costFixed: number;
  /** Cap on the underlying processor cost, in dollars — null if uncapped. */
  costCap: number | null;
}

// Intended as the fallback default once clubs carry their own override row —
// see migration proposal for how existing clubs transition (they do NOT
// silently inherit this; they stay on the legacy blended model until they
// opt in).
//
// Card's chargeFixed is $0.80, not the $0.60 originally specced — raised
// deliberately to a $0.50 margin (was $0.30, break-even-ish against
// Stripe's real $0.30 fixed cost) per 2026-08-17 decision. Small enough
// that it's imperceptible to a payer (e.g. $7.85 -> $8.05 on a $250 fee)
// but no longer literally cost-plus-nothing. ACH is unchanged — it's still
// the actual margin driver; this was a "may as well" on the rail that was
// otherwise pure pass-through, not a strategy shift.
export const DEFAULT_RAIL_FEE_CONFIG: Record<PaymentRail, RailFeeConfig> = {
  card: {
    chargeRatePct: 0.029, chargeFixed: 0.80, chargeCap: null,
    costRatePct:   0.029, costFixed:   0.30, costCap:   null,
  },
  ach: {
    chargeRatePct: 0.015, chargeFixed: 0, chargeCap: 40.00,
    costRatePct:   0.008, costFixed:   0, costCap:   5.00,
  },
};

export interface FeeBreakdown {
  rail: PaymentRail;
  /** The amount being paid for, before any fee — dollars. */
  grossAmount: number;
  /** What's actually charged for processing (post-cap) — dollars. */
  feeCharged: number;
  /** Pulse FC's real underlying processor cost (post-cap) — dollars. Never shown to the payer. */
  platformCost: number;
  /** feeCharged - platformCost. Can go negative if a club's override undercuts real cost — that's a real margin signal, not clamped away. */
  netMargin: number;
  /** grossAmount + feeCharged — what gets debited when the fee is passed on to the payer. */
  totalCharge: number;
}

// Avoids floating-point cents drift (e.g. 7.25 + 0.6 landing on
// 7.850000000000001) without pulling in a decimal library for two-line math.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function applyRateCap(grossAmount: number, ratePct: number, fixed: number, cap: number | null): number {
  const raw = grossAmount * ratePct + fixed;
  return cap != null ? Math.min(raw, cap) : raw;
}

export function calculateFee(
  grossAmount: number,
  rail: PaymentRail,
  config: Record<PaymentRail, RailFeeConfig> = DEFAULT_RAIL_FEE_CONFIG,
): FeeBreakdown {
  const cfg = config[rail];
  const feeCharged   = round2(applyRateCap(grossAmount, cfg.chargeRatePct, cfg.chargeFixed, cfg.chargeCap));
  const platformCost = round2(applyRateCap(grossAmount, cfg.costRatePct, cfg.costFixed, cfg.costCap));

  return {
    rail,
    grossAmount: round2(grossAmount),
    feeCharged,
    platformCost,
    netMargin: round2(feeCharged - platformCost),
    totalCharge: round2(grossAmount + feeCharged),
  };
}
