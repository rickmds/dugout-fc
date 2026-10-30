import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import PricingCards, { type PricingTier } from '@/components/pricing/PricingCards';
import FaqAccordion from '@/components/pricing/FaqAccordion';
import { supabase } from '@/lib/supabase';
import type { PlanRow, PlanFeatureRow } from '@/lib/plans';
import { theme } from '@/lib/theme';

export const metadata = {
  title: 'Pulse FC Pricing',
  description: 'Simple, transparent plans for clubs of any size. Free to start, no credit card required.',
};

// Shorter than the 3600s other static marketing pages use — a price edited
// in Command Center should show up here within minutes, not up to an hour.
export const revalidate = 300;

// `features` is always overwritten by loadLiveTiers() below from the
// plan_features catalog (Command Center > Billing > Feature board) —
// everything else here (icon, badge, cta, roi) is marketing presentation
// that isn't catalog-managed, so it stays local to this page.
//
// CTA copy is deliberately "Try X free" rather than "Start X" — clicking
// any tier's button runs the same free /onboarding flow regardless of
// which one was clicked (there's no live billing wired to these buttons;
// a club's paid plan is activated manually after signup, not charged here).
const TIERS: PricingTier[] = [
  {
    id: 'free',
    label: 'Free',
    icon: 'Users',
    iconColor: '#64748b',
    badge: null,
    monthly: 0,
    annual: 0,
    teamLimit: '1 team',
    playerLimit: 'Up to 12 players',
    highlight: false,
    cta: 'Get started free',
    ctaHref: '/onboarding',
    roi: null,
    features: [],
  },
  {
    id: 'team_pro',
    label: 'Team Pro',
    icon: 'Zap',
    iconColor: '#f59e0b',
    badge: null,
    monthly: 9.99,
    annual: 99.90,
    teamLimit: '1 team',
    playerLimit: 'Unlimited players',
    highlight: false,
    cta: 'Try Team Pro free',
    ctaHref: '/onboarding',
    roi: null,
    features: [],
  },
  {
    id: 'starter',
    label: 'Starter',
    icon: 'Building2',
    iconColor: theme.green,
    badge: 'Most popular',
    monthly: 49,
    annual: 490,
    teamLimit: 'Up to 25 teams',
    playerLimit: 'Unlimited players',
    highlight: true,
    cta: 'Try Starter free',
    ctaHref: '/onboarding',
    roi: null,
    features: [],
  },
  {
    id: 'club',
    label: 'Club',
    icon: 'Trophy',
    iconColor: '#8b5cf6',
    badge: null,
    monthly: 99,
    annual: 990,
    teamLimit: 'Up to 60 teams',
    playerLimit: 'Unlimited players',
    highlight: false,
    cta: 'Try Club free',
    ctaHref: '/onboarding',
    roi: 'Keep 1 family = paid for itself. Keep 3 = +$3,600 net.',
    features: [],
  },
  {
    id: 'academy',
    label: 'Academy',
    icon: 'Trophy',
    iconColor: '#ef4444',
    badge: null,
    monthly: 179,
    annual: 1790,
    teamLimit: 'Unlimited teams',
    playerLimit: 'Unlimited players',
    highlight: false,
    cta: 'Contact us',
    ctaHref: 'mailto:support@pulse-fc.app?subject=Academy Plan',
    roi: null,
    features: [],
  },
];

// Every tier gets these regardless of catalog state (not feature-gated —
// they're the baseline product). Free and Club additionally get one
// hand-written bullet that doesn't fit the catalog's "minimum tier and up"
// model: Free's lack of custom branding, and tryouts (which stays its own
// flexible per-plan checkbox, not catalog-managed, since the real
// tryouts_enabled data isn't simply cumulative by tier).
const BASELINE_FEATURES = ['Schedule, roster & RSVP', 'Team, group & 1:1 chat', 'Manual lineup builder'];
const TIER_EXTRA_FEATURES: Record<string, string[]> = {
  free: ['Pulse FC branding'],
  club: ['Full tryout management system'],
};

const FAQS = [
  {
    q: 'Can I start with one team and upgrade later?',
    a: "Yes. Start free with up to 12 players and upgrade to Team Pro ($9.99/mo) when you need more players or AI features. No lock-in.",
  },
  {
    q: 'What counts as a team?',
    a: 'Each age group team (e.g. U10 Boys, U12 Girls) counts as one team. A single coach running one squad is one team.',
  },
  {
    q: "What's included in AI features?",
    a: 'AI schedule import (upload any PDF or image), AI roster import (map any spreadsheet), and AI lineup suggester based on confirmed RSVPs. Equal playing time calculator is built-in — instant maths, no AI needed.',
  },
  {
    q: 'Do parents pay anything?',
    a: 'No. Parents download the app and use it for free. Only the club pays for a plan, and only once it\'s actually been activated — see the next question.',
  },
  {
    q: 'What happens when I click a paid plan?',
    a: "Every plan starts with the same free setup — no card required today. We follow up to activate billing on the plan you picked once you're past the free trial, so there's never a surprise charge.",
  },
  {
    q: 'What happens if I go over my team limit?',
    a: "You'll be prompted to upgrade before adding a new team. Existing teams are never affected.",
  },
  {
    q: 'Is there a contract?',
    a: 'No contracts. Monthly plans cancel anytime. Annual plans run for 12 months and are not refunded mid-term.',
  },
];

// Price, limit labels, and the feature list come from the plans table +
// plan_features catalog (Command Center > Billing) — editing either there
// shows up here without a deploy. The rest (icon, badge, cta, roi, the
// handful of bullets in TIER_EXTRA_FEATURES) is marketing presentation
// that lives with this page on purpose, not billing config.
async function loadLiveTiers(): Promise<PricingTier[]> {
  const [{ data: planRows }, { data: featureRows }] = await Promise.all([
    supabase.from('plans').select('*').eq('is_active', true),
    supabase.from('plan_features').select('*').eq('is_active', true).order('sort_order'),
  ]);
  const rows = (planRows ?? []) as PlanRow[];
  const byId: Record<string, PlanRow> = {};
  for (const row of rows) byId[row.id] = row;
  const catalog = (featureRows ?? []) as PlanFeatureRow[];

  return TIERS.map(tier => {
    const row = byId[tier.id];
    if (!row) return tier;
    const catalogFeatures = catalog
      .filter(f => f.min_plan_id && (byId[f.min_plan_id]?.sort_order ?? Infinity) <= row.sort_order)
      .map(f => f.label);
    return {
      ...tier,
      monthly: row.monthly_price_cents / 100,
      annual: row.annual_price_cents / 100,
      teamLimit: row.team_limit_label,
      playerLimit: row.player_limit_label,
      features: [...BASELINE_FEATURES, ...(TIER_EXTRA_FEATURES[tier.id] ?? []), ...catalogFeatures],
    };
  });
}

export default async function PricingPage() {
  const liveTiers = await loadLiveTiers();
  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text }}>

      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${theme.border}` }}>
        <NavBar />
      </div>

      {/* Hero */}
      <div className="text-center px-6 pt-16 pb-6">
        <div
          className="inline-flex items-center gap-2 text-[12px] font-semibold px-4 py-2 rounded-full mb-8"
          style={{ color: theme.greenDark, border: `1px solid ${theme.greenTintBorder}`, background: theme.greenTint }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: theme.green }} />
          Simple, transparent pricing
        </div>
        <h1
          className="font-extrabold tracking-tight leading-[1.05] mb-4"
          style={{ fontSize: 'clamp(32px, 5.5vw, 52px)', color: theme.text, fontFamily: theme.fontDisplay }}
        >
          One family leaving pays for<br />a year of Pulse FC.
        </h1>
        <p className="leading-relaxed max-w-md mx-auto mb-4" style={{ fontSize: 'clamp(15px, 2.5vw, 18px)', color: theme.textSecondary }}>
          Every plan includes full AI tools, unlimited parents, and setup in 20 minutes. No per-team fees. No hidden costs.
        </p>
        <p className="text-[13px] mb-10" style={{ color: theme.textMuted }}>
          No card required today — every plan below starts with the same free setup, and billing only activates once we&apos;re in touch.
        </p>
      </div>

      {/* Billing toggle + pricing cards — the only part of this page that needs client state */}
      <PricingCards tiers={liveTiers} />

      {/* Value props strip */}
      <div style={{ borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, background: theme.surface, padding: '32px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '32px', justifyContent: 'center' }}>
          {[
            { label: 'No credit card required', sub: 'Free plan available forever' },
            { label: '20-minute setup', sub: 'First team live in minutes' },
            { label: 'No surprise charges', sub: "We're in touch before anything's billed" },
            { label: 'Cancel anytime', sub: 'No long-term contracts' },
          ].map(({ label, sub }) => (
            <div key={label} style={{ textAlign: 'center', minWidth: '140px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text, marginBottom: '3px' }}>{label}</div>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div style={{ background: theme.bg, padding: '80px 24px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.18em', textAlign: 'center', marginBottom: '12px' }}>
            Common questions
          </p>
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: '800', color: theme.text, textAlign: 'center', marginBottom: '48px', letterSpacing: '-0.3px', fontFamily: theme.fontDisplay }}>
            Everything you need to know
          </h2>
          <FaqAccordion faqs={FAQS} />
        </div>
      </div>

      {/* Footer CTA */}
      <div style={{ borderTop: `1px solid ${theme.border}`, textAlign: 'center', padding: '80px 24px' }}>
        <p style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '16px' }}>
          No credit card required
        </p>
        <h2 style={{ fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: '800', color: theme.text, letterSpacing: '-0.5px', marginBottom: '16px', lineHeight: 1.1, fontFamily: theme.fontDisplay }}>
          Your club deserves better<br />than a WhatsApp group.
        </h2>
        <p style={{ fontSize: '16px', color: theme.textSecondary, marginBottom: '36px', maxWidth: '380px', margin: '0 auto 36px', lineHeight: '1.6' }}>
          Free plan for 1 team. 20-minute setup. No card required.
        </p>
        <Link
          href="/onboarding"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: theme.green, color: '#fff', fontWeight: '700', fontSize: '15px',
            padding: '14px 32px', borderRadius: '14px', textDecoration: 'none', boxShadow: theme.shadowBtn,
          }}
          className="hover:opacity-90 transition-opacity"
        >
          Add your club free <ArrowRight size={16} />
        </Link>
        <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '16px' }}>
          Cancel anytime · No credit card · Free plan available
        </p>
      </div>

      <Footer />
    </div>
  );
}
