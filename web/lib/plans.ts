// Plan definitions live in the `plans` table, and what each plan includes
// lives in the `plan_features` catalog (Command Center > Billing) — this
// file only holds the shared shapes + mappers, so every consumer
// (DashboardContext, super-admin, pricing page) agrees on them. Editing a
// plan or dragging a feature to a different tier no longer requires a
// code deploy.

export type PlanId = string;

export interface PlanLimits {
  maxPlayers: number;       // per team — Infinity = unlimited
  maxTeams: number;
  ai: boolean;
  fees: boolean;
  branding: boolean;
  tryouts: boolean;
}

export interface PlanPricing {
  monthly: number;          // dollars
  annual: number;           // dollars (10 months price, by convention)
  label: string;
  description: string;
  teamLimit: string;
  playerLimit: string;
  highlight: boolean;
}

export interface Plan {
  id: PlanId;
  limits: PlanLimits;
  pricing: PlanPricing;
  isActive: boolean;
  sortOrder: number;
}

export type PlanRow = {
  id: string;
  label: string;
  description: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  max_teams: number | null;
  max_players: number | null;
  ai_enabled: boolean;
  tryouts_enabled: boolean;
  team_limit_label: string;
  player_limit_label: string;
  highlight: boolean;
  sort_order: number;
  is_active: boolean;
};

// `fees`/`branding` default false here — only `max*`/`ai`/`tryouts` come
// straight off the plans row. The other two are the only PlanLimits flags
// actually driven by plan_features rather than a `plans` column; call
// applyCatalogGates() after fetching the catalog to fill them in.
export function planFromRow(row: PlanRow): Plan {
  return {
    id: row.id,
    limits: {
      maxPlayers: row.max_players ?? Infinity,
      maxTeams: row.max_teams ?? Infinity,
      ai: row.ai_enabled,
      fees: false,
      branding: false,
      tryouts: row.tryouts_enabled,
    },
    pricing: {
      monthly: row.monthly_price_cents / 100,
      annual: row.annual_price_cents / 100,
      label: row.label,
      description: row.description,
      teamLimit: row.team_limit_label,
      playerLimit: row.player_limit_label,
      highlight: row.highlight,
    },
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

export type PlanFeatureRow = {
  id: string;
  key: string;
  label: string;
  description: string;
  min_plan_id: string | null;
  enforced_as: 'fees' | 'branding' | null;
  sort_order: number;
  is_active: boolean;
};

// Fills in limits.fees/limits.branding on every plan in plansById from the
// feature catalog — a plan has the feature once its sort_order is at or
// above the catalog entry's min_plan's sort_order (cumulative upward,
// same rule the drag-and-drop board visualizes). Mutates in place since
// this always runs right after building plansById, before it's handed to
// a consumer.
export function applyCatalogGates(plansById: Record<string, Plan>, catalog: PlanFeatureRow[]): void {
  const feesEntry = catalog.find(f => f.enforced_as === 'fees' && f.is_active);
  const brandingEntry = catalog.find(f => f.enforced_as === 'branding' && f.is_active);
  const hasTier = (entry: PlanFeatureRow | undefined, plan: Plan) => {
    const minId = entry?.min_plan_id;
    if (!minId) return false;
    const minSort = plansById[minId]?.sortOrder;
    return minSort != null && plan.sortOrder >= minSort;
  };
  for (const plan of Object.values(plansById)) {
    plan.limits.fees = hasTier(feesEntry, plan);
    plan.limits.branding = hasTier(brandingEntry, plan);
  }
}

// Used only before the real plans table has loaded, or if a club's plan id
// doesn't match any row — deliberately matches the old hardcoded 'free'
// tier (the most restrictive real plan), never a silent "everything on."
export const FALLBACK_PLAN_LIMITS: PlanLimits = {
  maxPlayers: Infinity, maxTeams: Infinity, ai: true, fees: true, branding: true, tryouts: true,
};
