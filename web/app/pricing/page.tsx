'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Zap, Users, Building2, Trophy, ArrowRight } from 'lucide-react';
import NavBar from '@/components/NavBar';

const PRIMARY = '#22c55e';

type BillingCycle = 'monthly' | 'annual';

const TIERS = [
  {
    id: 'free',
    label: 'Free',
    icon: Users,
    iconColor: '#64748b',
    badge: null,
    monthly: 0,
    annual: 0,
    teamLimit: '1 team',
    playerLimit: 'Up to 12 players',
    highlight: false,
    cta: 'Get started free',
    ctaHref: '/onboarding',
    features: [
      'Schedule, roster & RSVP',
      'Team, group & 1:1 chat',
      'Manual lineup builder',
      '1 team, up to 12 players',
      'Dugout FC branding',
    ],
  },
  {
    id: 'team_pro',
    label: 'Team Pro',
    icon: Zap,
    iconColor: '#f59e0b',
    badge: null,
    monthly: 9.99,
    annual: 99.90,
    teamLimit: '1 team',
    playerLimit: 'Unlimited players',
    highlight: false,
    cta: 'Start Team Pro',
    ctaHref: '/onboarding',
    features: [
      'Everything in Free',
      'Unlimited players',
      'Custom club branding',
      'AI schedule import',
      'AI roster import',
      'AI lineup suggester',
      'AI substitution planner',
      'Fee collection & tracking',
    ],
  },
  {
    id: 'starter',
    label: 'Starter',
    icon: Building2,
    iconColor: PRIMARY,
    badge: 'Most popular',
    monthly: 49,
    annual: 490,
    teamLimit: 'Up to 25 teams',
    playerLimit: 'Unlimited players',
    highlight: true,
    cta: 'Start Starter',
    ctaHref: '/onboarding',
    features: [
      'Everything in Team Pro',
      'Up to 25 teams',
      'Multi-team dashboard',
    ],
  },
  {
    id: 'club',
    label: 'Club',
    icon: Trophy,
    iconColor: '#8b5cf6',
    badge: null,
    monthly: 99,
    annual: 990,
    teamLimit: 'Up to 60 teams',
    playerLimit: 'Unlimited players',
    highlight: false,
    cta: 'Start Club',
    ctaHref: '/onboarding',
    features: [
      'Everything in Starter',
      'Up to 60 teams',
      'Full tryout management',
      'Tryout registration forms',
      'Offer letters & acceptance',
    ],
  },
  {
    id: 'academy',
    label: 'Academy',
    icon: Trophy,
    iconColor: '#ef4444',
    badge: null,
    monthly: 179,
    annual: 1790,
    teamLimit: 'Unlimited teams',
    playerLimit: 'Unlimited players',
    highlight: false,
    cta: 'Contact us',
    ctaHref: 'mailto:info@dugoutfc.app?subject=Academy Plan',
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
    a: 'AI schedule import (upload any PDF or image), AI roster import (map any spreadsheet), AI lineup suggester based on confirmed RSVPs, and an AI substitution rotation planner for equal play time.',
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
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function monthlyPrice(tier: typeof TIERS[0]): string {
    if (tier.monthly === 0) return 'Free';
    const price = billing === 'annual' ? tier.annual / 12 : tier.monthly;
    return `$${price % 1 === 0 ? price : price.toFixed(2)}`;
  }

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
          The right plan for every club
        </h1>
        <p className="text-[#888] leading-relaxed max-w-md mx-auto mb-10"
          style={{ fontSize: 'clamp(15px, 2.5vw, 18px)' }}>
          Start free. Upgrade when you need more players, AI tools, or tryout management.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex rounded-xl p-1 gap-1" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
          {(['monthly', 'annual'] as BillingCycle[]).map((cycle) => (
            <button
              key={cycle}
              onClick={() => setBilling(cycle)}
              style={{
                padding: '9px 22px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: '700',
                background: billing === cycle ? '#fff' : 'transparent',
                color: billing === cycle ? '#000' : '#555',
                transition: 'all 0.15s', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              {cycle === 'monthly' ? 'Monthly' : (
                <>
                  Annual
                  <span style={{ fontSize: '10px', fontWeight: '800', background: PRIMARY, color: '#000', padding: '2px 8px', borderRadius: '100px' }}>
                    2 months free
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing cards */}
      <div style={{ padding: '0 20px 80px', maxWidth: '1160px', margin: '0 auto' }}>
        <style>{`
          .pricing-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 12px;
          }
          @media (max-width: 1024px) {
            .pricing-grid { grid-template-columns: repeat(3, 1fr); }
          }
          @media (max-width: 700px) {
            .pricing-grid { grid-template-columns: 1fr 1fr; }
          }
          @media (max-width: 480px) {
            .pricing-grid { grid-template-columns: 1fr; }
          }
          .pricing-cta:hover { opacity: 0.88; }
        `}</style>

        <div className="pricing-grid">
          {TIERS.map((tier) => {
            const Icon = tier.icon;
            const annualPerMonth = tier.monthly > 0 ? (tier.annual / 12).toFixed(2) : null;
            const savings = tier.monthly > 0 ? Math.round(((tier.monthly * 12) - tier.annual) / (tier.monthly * 12) * 100) : 0;

            return (
              <div
                key={tier.id}
                style={{
                  background: tier.highlight ? '#0a1a0a' : '#0d0d0d',
                  border: tier.highlight ? `2px solid ${PRIMARY}50` : '1px solid #1a1a1a',
                  borderRadius: '20px', padding: '24px 20px',
                  position: 'relative',
                  boxShadow: tier.highlight
                    ? `0 0 0 1px ${PRIMARY}15, 0 8px 40px rgba(34,197,94,0.14)`
                    : 'none',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                {/* Badge */}
                {tier.badge && (
                  <div style={{
                    position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)',
                    background: PRIMARY, color: '#000', fontSize: '11px', fontWeight: '800',
                    padding: '4px 14px', borderRadius: '100px', whiteSpace: 'nowrap',
                  }}>
                    {tier.badge}
                  </div>
                )}

                {/* Icon + label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                    background: `${tier.iconColor}15`, border: `1px solid ${tier.iconColor}28`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} color={tier.iconColor} />
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#fff', lineHeight: 1 }}>{tier.label}</div>
                    <div style={{ fontSize: '10px', color: '#555', marginTop: '3px' }}>{tier.teamLimit}</div>
                  </div>
                </div>

                {/* Price */}
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ fontSize: '34px', fontWeight: '900', color: '#fff', letterSpacing: '-0.5px' }}>
                    {monthlyPrice(tier)}
                  </span>
                  {tier.monthly > 0 && (
                    <span style={{ fontSize: '13px', color: '#555', marginLeft: '4px' }}>/mo</span>
                  )}
                </div>
                {billing === 'annual' && tier.monthly > 0 && (
                  <div style={{ fontSize: '11px', color: PRIMARY, fontWeight: '600', marginBottom: '4px' }}>
                    ${tier.annual}/yr · save {savings}%
                  </div>
                )}
                {billing === 'monthly' && tier.monthly > 0 && (
                  <div style={{ fontSize: '11px', color: '#555', marginBottom: '4px' }}>
                    ${annualPerMonth}/mo billed annually
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#444', marginBottom: '20px' }}>
                  {tier.playerLimit}
                </div>

                {/* CTA */}
                <a
                  href={tier.ctaHref}
                  className="pricing-cta"
                  style={{
                    display: 'block', textAlign: 'center',
                    padding: '10px 0', borderRadius: '10px',
                    fontWeight: '700', fontSize: '13px', textDecoration: 'none',
                    marginBottom: '20px', transition: 'opacity 0.15s',
                    background: tier.highlight ? PRIMARY : '#141414',
                    color: tier.highlight ? '#000' : '#888',
                    border: tier.highlight ? 'none' : '1px solid #222',
                  }}
                >
                  {tier.cta}
                </a>

                {/* Divider */}
                <div style={{ height: '1px', background: '#181818', marginBottom: '16px' }} />

                {/* Features */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                  {tier.features.map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <Check size={13} color={PRIMARY} style={{ flexShrink: 0, marginTop: '1px' }} />
                      <span style={{ fontSize: '12.5px', color: '#888', lineHeight: '1.45' }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
          {FAQS.map(({ q, a }, i) => (
            <div
              key={q}
              style={{ borderBottom: '1px solid #1a1a1a', cursor: 'pointer' }}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '20px 0', gap: '16px',
              }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#fff', flex: 1 }}>{q}</span>
                <span style={{
                  fontSize: '18px', color: '#555', flexShrink: 0,
                  transform: openFaq === i ? 'rotate(45deg)' : 'none',
                  transition: 'transform 0.2s ease',
                }}>+</span>
              </div>
              {openFaq === i && (
                <div style={{ paddingBottom: '20px' }}>
                  <p style={{ fontSize: '14px', color: '#888', lineHeight: '1.7', margin: 0 }}>{a}</p>
                </div>
              )}
            </div>
          ))}
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
        <div style={{ background: '#fff', borderRadius: '8px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center' }}>
          <img src="/Signature.jpg" alt="Dugout FC" style={{ height: '22px', width: 'auto' }} />
        </div>
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
