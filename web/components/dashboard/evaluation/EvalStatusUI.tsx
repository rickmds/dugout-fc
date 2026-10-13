'use client';

// Small shared bits used by both the top-level Evaluations list (periods +
// standalone batches) and the period-detail page (teams within a period) —
// pulled out so the same status/progress visuals don't drift between them.

import { CheckCircle, Clock, AlertCircle } from 'lucide-react';

export const STATUS_CONFIG = {
  in_progress: { label: 'In Progress', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', icon: Clock },
  submitted:   { label: 'Awaiting Approval', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', icon: AlertCircle },
  approved:    { label: 'Approved', color: '#22C55E', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle },
} as const;

export function StatusChip({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '2px 8px', borderRadius: '4px',
      background: cfg.bg, color: cfg.color,
      fontSize: '11px', fontWeight: '700',
    }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

export function ProgressBar({ completed, total, primary }: { completed: number; total: number; primary: string }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '5px', borderRadius: '99px', background: '#E2E8F0', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '99px', background: pct === 100 ? '#22C55E' : primary, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#64748B', whiteSpace: 'nowrap' }}>
        {completed}/{total}
      </span>
    </div>
  );
}
