import { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_RAIL_FEE_CONFIG, mergeClubOverride, type PaymentRail, type RailFeeConfig } from '@/lib/feeCalculator';

type FeeRailRow = {
  rail: PaymentRail;
  charge_rate_pct: number;
  charge_fixed: number;
  charge_cap: number | null;
  cost_rate_pct: number;
  cost_fixed: number;
  cost_cap: number | null;
};

type ClubOverrideRow = {
  card_charge_rate_pct: number | null;
  card_charge_fixed: number | null;
  card_charge_cap: number | null;
  ach_charge_rate_pct: number | null;
  ach_charge_fixed: number | null;
  ach_charge_cap: number | null;
};

// Resolves the real, effective RailFeeConfig for a club: platform_fee_rails
// (Command Center's global card/ACH economics) with any per-club comp rate
// from club_fee_overrides layered on top, field by field — a null override
// field falls back to the platform default for that one field. The
// processor-cost side never varies by club; only what's charged does.
// Falls back to DEFAULT_RAIL_FEE_CONFIG if platform_fee_rails is ever
// empty, so a payment never hard-fails over missing config.
export async function resolveRailFeeConfig(
  supabase: SupabaseClient,
  clubId: string | null | undefined,
): Promise<Record<PaymentRail, RailFeeConfig>> {
  const [{ data: railRows }, { data: overrideRow }] = await Promise.all([
    supabase.from('platform_fee_rails').select('rail, charge_rate_pct, charge_fixed, charge_cap, cost_rate_pct, cost_fixed, cost_cap'),
    clubId
      ? supabase.from('club_fee_overrides').select('card_charge_rate_pct, card_charge_fixed, card_charge_cap, ach_charge_rate_pct, ach_charge_fixed, ach_charge_cap').eq('club_id', clubId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const rows = (railRows ?? []) as FeeRailRow[];
  const override = overrideRow as ClubOverrideRow | null;

  const base: Record<PaymentRail, RailFeeConfig> = { ...DEFAULT_RAIL_FEE_CONFIG };
  for (const row of rows) {
    base[row.rail] = {
      chargeRatePct: row.charge_rate_pct,
      chargeFixed: row.charge_fixed,
      chargeCap: row.charge_cap,
      costRatePct: row.cost_rate_pct,
      costFixed: row.cost_fixed,
      costCap: row.cost_cap,
    };
  }

  return {
    card: mergeClubOverride(base.card, override ? { chargeRatePct: override.card_charge_rate_pct, chargeFixed: override.card_charge_fixed, chargeCap: override.card_charge_cap } : null),
    ach: mergeClubOverride(base.ach, override ? { chargeRatePct: override.ach_charge_rate_pct, chargeFixed: override.ach_charge_fixed, chargeCap: override.ach_charge_cap } : null),
  };
}
