'use client';

import { DashboardProvider, useDashboard } from '@/components/dashboard/DashboardContext';
import Sidebar from '@/components/dashboard/Sidebar';

function Shell({ children }: { children: React.ReactNode }) {
  const { loading } = useDashboard();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid #22C55E', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div id="dashboard" style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', color: '#0F172A', alignItems: 'flex-start' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <Shell>{children}</Shell>
    </DashboardProvider>
  );
}
