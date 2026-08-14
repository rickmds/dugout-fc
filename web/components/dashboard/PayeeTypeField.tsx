'use client';

import { Building2, User } from 'lucide-react';

interface Props {
  value: 'club' | 'coach';
  onChange: (value: 'club' | 'coach') => void;
  instructions: string;
  onInstructionsChange: (text: string) => void;
  primary: string;
}

// Reused across every fee-creation form (individual assign, bulk assign,
// attendance charge modal) so the club-vs-coach choice looks and behaves
// identically everywhere it appears.
export default function PayeeTypeField({ value, onChange, instructions, onInstructionsChange, primary }: Props) {
  const options = [
    { v: 'club' as const, label: 'Club', Icon: Building2, hint: 'Online payment (card)' },
    { v: 'coach' as const, label: 'Coach', Icon: User, hint: 'Cash / Venmo, no online payment' },
  ];

  return (
    <div>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
        Who collects this fee?
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        {options.map(({ v, label, Icon, hint }) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px',
                padding: '10px 12px', borderRadius: '10px',
                border: selected ? `2px solid ${primary}` : '1.5px solid #E2E8F0',
                background: selected ? `${primary}0F` : '#fff',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon size={14} color={selected ? primary : '#64748B'} />
                <span style={{ fontSize: '13px', fontWeight: '700', color: selected ? primary : '#0F172A' }}>{label}</span>
              </div>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>{hint}</span>
            </button>
          );
        })}
      </div>
      {value === 'coach' && (
        <div style={{ marginTop: '10px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>
            How should parents pay you?
          </label>
          <textarea
            value={instructions}
            onChange={e => onInstructionsChange(e.target.value)}
            placeholder="e.g. Venmo @coachmike, or cash at practice"
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '9px 11px', fontSize: '13px', color: '#0F172A', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
          />
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Saved as your default for next time.</div>
        </div>
      )}
    </div>
  );
}
