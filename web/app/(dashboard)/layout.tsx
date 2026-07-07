'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { DashboardProvider, useDashboard } from '@/components/dashboard/DashboardContext';
import Sidebar from '@/components/dashboard/Sidebar';
import { Menu, X } from 'lucide-react';

function Shell({ children }: { children: React.ReactNode }) {
  const { loading } = useDashboard();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar on every navigation
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

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
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ─── Mobile layout ─────────────────────────────────────────── */
        @media (max-width: 768px) {
          /* Sidebar slides in as a drawer */
          #dash-sidebar {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            height: 100vh !important;
            transform: translateX(${sidebarOpen ? '0' : '-100%'});
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 300 !important;
            box-shadow: ${sidebarOpen ? '4px 0 32px rgba(0,0,0,0.18)' : 'none'};
          }
          /* Show mobile topbar */
          #dash-mob-bar { display: flex !important; }
          /* Main area shifted down below the fixed topbar */
          #dash-main { padding-top: 52px; }
          /* All sticky page headers sit below the mobile topbar */
          #dash-main [style*="sticky"] { top: 52px !important; }
          /* Wider padding reset for content areas */
          #dash-main [style*="32px"] { }
        }
      `}</style>

      {/* ── Mobile topbar ─── hidden on desktop via display:none, overridden by CSS on mobile */}
      <div id="dash-mob-bar" style={{
        display: 'none', position: 'fixed', top: 0, left: 0, right: 0, height: '52px',
        background: '#fff', borderBottom: '1px solid #E2E8F0', zIndex: 200,
        alignItems: 'center', padding: '0 16px', gap: '12px',
      }}>
        <button
          onClick={() => setSidebarOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          {sidebarOpen ? <X size={20} color="#374151" /> : <Menu size={20} color="#374151" />}
        </button>
        <img src="/Signature.jpg" alt="Dugout FC" style={{ height: '26px', width: 'auto', objectFit: 'contain' }} />
      </div>

      {/* ── Mobile backdrop ── always in DOM; invisible + non-interactive on desktop */}
      <div
        onClick={() => setSidebarOpen(false)}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 299,
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      <Sidebar />
      <main id="dash-main" style={{ flex: 1, minWidth: 0 }}>
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
