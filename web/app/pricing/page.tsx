import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import NavBar from '@/components/NavBar';
import PricingCards, { type PricingTier } from '@/components/pricing/PricingCards';
import FaqAccordion from '@/components/pricing/FaqAccordion';

const PRIMARY = '#22c55e';

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
    features: [
      'Schedule, roster & RSVP',
      'Team, group & 1:1 chat',
      'Manual lineup builder',
      '1 team, up to 12 players',
      'Pulse FC branding',
    ],
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
    cta: 'Start Team Pro',
    ctaHref: '/onboarding',
    roi: null,
    features: [
      'Everything in Free',
      'Unlimited players',
      'Custom club branding',
      'AI schedule import (PDF, image, spreadsheet)',
      'AI roster import (any spreadsheet format)',
      'AI lineup suggester',
      'Match tracker & equal play time',
      'Game scores + season W/L/D record',
      'Automatic change alerts (time/location/cancel → instant push)',
      'Video recordings library',
      'Guest player management',
      'Player attendance history & streaks',
      'Fee collection & tracking',
    ],
  },
  {
    id: 'starter',
    label: 'Starter',
    icon: 'Building2',
    iconColor: PRIMARY,
    badge: 'Most popular',
    monthly: 49,
    annual: 490,
    teamLimit: 'Up to 25 teams',
    playerLimit: 'Unlimited players',
    highlight: true,
    cta: 'Start Starter',
    ctaHref: '/onboarding',
    roi: null,
    features: [
      'Everything in Team Pro',
      'Up to 25 teams across your club',
      'Unified multi-team dashboard',
      'Club-wide attendance & RSVP reporting',
      'AI tools active across every team',
      'Unlimited coaches and staff logins',
      'Club-wide announcement broadcasts',
    ],
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
    cta: 'Start Club',
    ctaHref: '/onboarding',
    roi: 'Keep 1 family = paid for itself. Keep 3 = +$3,600 net.',
    features: [
      'Everything in Starter',
      'Up to 60 teams',
      'Full tryout management system',
      'Public registration forms',
      'Player ranking & drag-and-drop team builder',
      'Offer letters with accept/decline tracking',
      'Waitlist & decline email templates',
      'Club-wide guest activity dashboard',
      'Advanced season reports & export',
    ],
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
    features: [
      'Everything in Club',
      'Unlimited teams',
      'Dedicated onboarding call',
      'Custom subdomain',
      'Early access to new features',
    ],
  },
];

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
    a: 'No. Parents download the app and use it for free. Only the club admin (coach or DOC) pays for a plan.',
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

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {/* Nav */}
      <div style={{ borderBottom: '1px solid #111' }}>
        <NavBar />
      </div>

      {/* Hero */}
      <div className="text-center px-6 pt-16 pb-10">
        <div className="inline-flex items-center gap-2 text-[#22c55e] text-[12px] font-semibold border border-[#22c55e25] bg-[#22c55e0a] px-4 py-2 rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          Simple, transparent pricing
        </div>
        <h1 className="text-white font-extrabold tracking-tight leading-[1.05] mb-4"
          style={{ fontSize: 'clamp(34px, 6vw, 56px)', letterSpacing: '-1px' }}>
          One family leaving pays for<br />a year of Pulse FC.
        </h1>
        <p className="text-[#888] leading-relaxed max-w-md mx-auto mb-10"
          style={{ fontSize: 'clamp(15px, 2.5vw, 18px)' }}>
          Every plan includes full AI tools, unlimited parents, and setup in 20 minutes. No per-team fees. No hidden costs.
        </p>
      </div>

      {/* Billing toggle + pricing cards — the only part of this page that needs client state */}
      <PricingCards tiers={TIERS} />

      {/* Value props strip */}
      <div style={{ borderTop: '1px solid #111', borderBottom: '1px solid #111', background: '#060606', padding: '32px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '32px', justifyContent: 'center' }}>
          {[
            { label: 'No credit card required', sub: 'Free plan available forever' },
            { label: '20-minute setup', sub: 'First team live in minutes' },
            { label: '30-day money-back', sub: 'No questions asked' },
            { label: 'Cancel anytime', sub: 'No long-term contracts' },
          ].map(({ label, sub }) => (
            <div key={label} style={{ textAlign: 'center', minWidth: '140px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#e2e8f0', marginBottom: '3px' }}>{label}</div>
              <div style={{ fontSize: '12px', color: '#555' }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div style={{ background: '#060606', padding: '80px 24px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.18em', textAlign: 'center', marginBottom: '12px' }}>
            Common questions
          </p>
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: '48px', letterSpacing: '-0.3px' }}>
            Everything you need to know
          </h2>
          <FaqAccordion faqs={FAQS} />
        </div>
      </div>

      {/* Footer CTA */}
      <div style={{ borderTop: '1px solid #111', textAlign: 'center', padding: '80px 24px' }}>
        <p style={{ fontSize: '11px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '16px' }}>
          No credit card required
        </p>
        <h2 style={{ fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px', marginBottom: '16px', lineHeight: 1.1 }}>
          Your club deserves better<br />than a WhatsApp group.
        </h2>
        <p style={{ fontSize: '16px', color: '#888', marginBottom: '36px', maxWidth: '380px', margin: '0 auto 36px', lineHeight: '1.6' }}>
          Free plan for 1 team. 20-minute setup. 30-day money-back guarantee.
        </p>
        <Link
          href="/onboarding"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: PRIMARY, color: '#000', fontWeight: '700', fontSize: '15px',
            padding: '14px 32px', borderRadius: '14px', textDecoration: 'none',
          }}
          className="hover:bg-[#1db954] transition-colors"
        >
          Add your club free <ArrowRight size={16} />
        </Link>
        <p style={{ fontSize: '12px', color: '#555', marginTop: '16px' }}>
          Cancel anytime · No credit card · Free plan available
        </p>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #0f0f0f', padding: '28px 24px', maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
        <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          {[
            { href: '/compare', label: 'Compare' },
            { href: '/privacy', label: 'Privacy' },
            { href: '/terms', label: 'Terms' },
            { href: '/dashboard', label: 'Log in' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">
              {label}
            </Link>
          ))}
        </div>
      </footer>

    </div>
  );
}
