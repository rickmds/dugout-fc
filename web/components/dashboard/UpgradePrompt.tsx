'use client';

import { useState } from 'react';
import { Lock, Zap, X } from 'lucide-react';

interface Props {
  feature: string;
  description: string;
  requiredPlan: string;
  compact?: boolean;
}

export default function UpgradePrompt({ feature, description, requiredPlan, compact = false }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (compact) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        background: '#FEF3C7', border: '1px solid #FCD34D',
        borderRadius: '8px', padding: '6px 12px', fontSize: '12px',
        color: '#92400E', fontWeight: '600',
      }}>
        <Lock size={12} />
        {requiredPlan} feature
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      borderRadius: '16px', border: '1px solid #334155',
      padding: '32px', textAlign: 'center', position: 'relative',
    }}>
      <button
        onClick={() => setDismissed(true)}
        style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex' }}
      >
        <X size={16} />
      </button>

      <div style={{
        width: '48px', height: '48px', borderRadius: '14px',
        background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <Lock size={22} color="#fff" />
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#F1F5F9', marginBottom: '8px' }}>
        {feature}
      </h3>
      <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '24px', lineHeight: '1.5', maxWidth: '340px', margin: '0 auto 24px' }}>
        {description}
      </p>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        background: '#1E293B', border: '1px solid #334155',
        borderRadius: '8px', padding: '6px 14px', marginBottom: '20px',
        fontSize: '12px', color: '#94A3B8', fontWeight: '600',
      }}>
        <Zap size={12} color="#F59E0B" />
        Available on {requiredPlan} and above
      </div>

      <div>
        <a
          href="/pricing"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'linear-gradient(135deg, #22C55E, #16A34A)',
            color: '#fff', fontWeight: '700', fontSize: '14px',
            padding: '11px 24px', borderRadius: '10px',
            textDecoration: 'none', boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
          }}
        >
          View pricing & upgrade
        </a>
      </div>
    </div>
  );
}
