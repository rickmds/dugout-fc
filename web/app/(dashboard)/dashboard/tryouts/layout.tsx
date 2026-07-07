'use client';

import { useDashboard } from '@/components/dashboard/DashboardContext';
import UpgradePrompt from '@/components/dashboard/UpgradePrompt';

export default function TryoutsLayout({ children }: { children: React.ReactNode }) {
  const { canUse } = useDashboard();

  if (!canUse('tryouts')) {
    return (
      <div style={{ padding: '48px 36px', maxWidth: '560px' }}>
        <UpgradePrompt
          feature="Tryout Management"
          description="Run your full tryout season — registration forms, player ranking, team builder, offer letters, and acceptance tracking — all in one place."
          requiredPlan="Club"
        />
      </div>
    );
  }

  return <>{children}</>;
}
