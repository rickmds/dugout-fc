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
  is_enforced: boolean;
  sort_order: number;
  is_active: boolean;
};

// The one generic rule every enforced catalog feature uses: a plan has the
// feature once its sort_order is at or above the catalog entry's
// min_plan's sort_order (cumulative upward, same rule the drag-and-drop
// board visualizes) — looked up by the catalog's own `key`, not a
// hardcoded field name, so adding another enforced feature never needs a
// new column or a new case here.
export function planHasCatalogFeature(key: string, planId: string, plansById: Record<string, Plan>, catalog: PlanFeatureRow[]): boolean {
  const entry = catalog.find(f => f.key === key && f.is_active);
  const minId = entry?.min_plan_id;
  if (!minId) return false;
  const minSort = plansById[minId]?.sortOrder;
  const planSort = plansById[planId]?.sortOrder;
  return minSort != null && planSort != null && planSort >= minSort;
}

// Fills in limits.fees/limits.branding on every plan in plansById from the
// feature catalog — the only two PlanLimits flags still driven this way
// (every other enforced feature is looked up directly by key via
// useDashboard().hasFeature(), not added to PlanLimits). Mutates in place
// since this always runs right after building plansById.
export function applyCatalogGates(plansById: Record<string, Plan>, catalog: PlanFeatureRow[]): void {
  for (const plan of Object.values(plansById)) {
    plan.limits.fees = planHasCatalogFeature('fee_collection', plan.id, plansById, catalog);
    plan.limits.branding = planHasCatalogFeature('custom_branding', plan.id, plansById, catalog);
  }
}

// Used only before the real plans table has loaded, or if a club's plan id
// doesn't match any row — deliberately matches the old hardcoded 'free'
// tier (the most restrictive real plan), never a silent "everything on."
export const FALLBACK_PLAN_LIMITS: PlanLimits = {
  maxPlayers: Infinity, maxTeams: Infinity, ai: true, fees: true, branding: true, tryouts: true,
};
