// Plan definitions live in the `plans` table (Command Center > Billing) —
// this file only holds the shared shape + the DB-row mapper, so every
// consumer (DashboardContext, super-admin, pricing page) agrees on it.
// There used to be a hardcoded PLAN_LIMITS/PLAN_PRICING/PLAN_FEATURES here;
// editing a plan no longer requires a code deploy.

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
  features: string[];
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
  fees_enabled: boolean;
  branding_enabled: boolean;
  tryouts_enabled: boolean;
  team_limit_label: string;
  player_limit_label: string;
  features: string[];
  highlight: boolean;
  sort_order: number;
  is_active: boolean;
};

export function planFromRow(row: PlanRow): Plan {
  return {
    id: row.id,
    limits: {
      maxPlayers: row.max_players ?? Infinity,
      maxTeams: row.max_teams ?? Infinity,
      ai: row.ai_enabled,
      fees: row.fees_enabled,
      branding: row.branding_enabled,
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
    features: row.features,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

// Used only before the real plans table has loaded, or if a club's plan id
// doesn't match any row — deliberately matches the old hardcoded 'free'
// tier (the most restrictive real plan), never a silent "everything on."
export const FALLBACK_PLAN_LIMITS: PlanLimits = {
  maxPlayers: Infinity, maxTeams: Infinity, ai: true, fees: true, branding: true, tryouts: true,
};
