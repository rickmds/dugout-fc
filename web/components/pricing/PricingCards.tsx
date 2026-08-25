'use client';

import { useState } from 'react';
import { Check, Zap, Users, Building2, Trophy } from 'lucide-react';

const PRIMARY = '#22c55e';

export type IconName = 'Users' | 'Zap' | 'Building2' | 'Trophy';

// Icon components can't cross the Server -> Client Component boundary as
// props (functions aren't serializable), so the static tier copy carries an
// icon *name* and this map resolves it to the actual component on the client.
const ICONS: Record<IconName, typeof Users> = { Users, Zap, Building2, Trophy };

export type PricingTier = {
  id: string;
  label: string;
  icon: IconName;
  iconColor: string;
  badge: string | null;
  monthly: number;
  annual: number;
  teamLimit: string;
  playerLimit: string;
  highlight: boolean;
  cta: string;
  ctaHref: string;
  roi: string | null;
  features: string[];
};

type BillingCycle = 'monthly' | 'annual';

// The only two things on this page that actually need client-side
// reactivity: the monthly/annual toggle and the price display it drives.
// Everything else (hero copy, value props, FAQ) stays server-rendered.
export default function PricingCards({ tiers }: { tiers: PricingTier[] }) {
  const [billing, setBilling] = useState<BillingCycle>('monthly');

  function monthlyPrice(tier: PricingTier): string {
    if (tier.monthly === 0) return 'Free';
    const price = billing === 'annual' ? tier.annual / 12 : tier.monthly;
    return `$${price % 1 === 0 ? price : price.toFixed(2)}`;
  }

  return (
    <>
      {/* Billing toggle */}
      <div className="flex justify-center px-6 pb-10">
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
          {tiers.map((tier) => {
            const Icon = ICONS[tier.icon];
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
                <div style={{ fontSize: '11px', color: '#444', marginBottom: tier.roi ? '10px' : '20px' }}>
                  {tier.playerLimit}
                </div>
                {tier.roi && (
                  <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: '700', background: '#22c55e0d', border: '1px solid #22c55e20', borderRadius: '8px', padding: '7px 10px', marginBottom: '16px', lineHeight: '1.4' }}>
                    {tier.roi}
                  </div>
                )}

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
    </>
  );
}
