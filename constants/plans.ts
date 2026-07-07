export type PlanId = 'free' | 'team_pro' | 'starter' | 'club' | 'academy';

export interface PlanLimits {
  maxPlayers: number;       // per team
  maxTeams: number;
  ai: boolean;
  fees: boolean;
  branding: boolean;        // custom logo + colours
  tryouts: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free:      { maxPlayers: 12,       maxTeams: 1,        ai: false, fees: false, branding: false, tryouts: false },
  team_pro:  { maxPlayers: Infinity, maxTeams: 1,        ai: true,  fees: true,  branding: true,  tryouts: false },
  starter:   { maxPlayers: Infinity, maxTeams: 25,       ai: true,  fees: true,  branding: true,  tryouts: false },
  club:      { maxPlayers: Infinity, maxTeams: 60,       ai: true,  fees: true,  branding: true,  tryouts: true  },
  academy:   { maxPlayers: Infinity, maxTeams: Infinity, ai: true,  fees: true,  branding: true,  tryouts: true  },
};

export interface PlanPricing {
  monthly: number;
  annual: number;           // 10 months price (2 months free)
  label: string;
  description: string;
  teamLimit: string;
  playerLimit: string;
  highlight?: boolean;
}

export const PLAN_PRICING: Record<Exclude<PlanId, 'free'>, PlanPricing> = {
  team_pro: {
    monthly: 9.99,
    annual: 99.90,
    label: 'Team Pro',
    description: 'For single coaches and parent managers',
    teamLimit: '1 team',
    playerLimit: 'Unlimited players',
  },
  starter: {
    monthly: 49,
    annual: 490,
    label: 'Starter',
    description: 'For small clubs with a handful of teams',
    teamLimit: 'Up to 25 teams',
    playerLimit: 'Unlimited players',
    highlight: true,
  },
  club: {
    monthly: 99,
    annual: 990,
    label: 'Club',
    description: 'For established clubs that run tryouts',
    teamLimit: 'Up to 60 teams',
    playerLimit: 'Unlimited players',
  },
  academy: {
    monthly: 179,
    annual: 1790,
    label: 'Academy',
    description: 'For large academies with unlimited scale',
    teamLimit: 'Unlimited teams',
    playerLimit: 'Unlimited players',
  },
};

export const FREE_PLAN_FEATURES = [
  'Schedule, roster & RSVP',
  'Team, group & 1:1 chat',
  'Manual lineup builder',
  '1 team, up to 12 players',
];

export const PLAN_FEATURES: Record<Exclude<PlanId, 'free'>, string[]> = {
  team_pro: [
    'Everything in Free',
    'Unlimited players',
    'Custom club branding',
    'AI schedule import',
    'AI roster import',
    'AI lineup suggester',
    'AI substitution planner',
    'Fee collection & tracking',
  ],
  starter: [
    'Everything in Team Pro',
    'Up to 25 teams',
    'Multi-team dashboard',
  ],
  club: [
    'Everything in Starter',
    'Up to 60 teams',
    'Full tryout management',
    'Tryout registration forms',
    'Offer letters & acceptance tracking',
  ],
  academy: [
    'Everything in Club',
    'Unlimited teams',
    'Dedicated onboarding call',
    'Custom subdomain',
    'Early access to new features',
  ],
};
