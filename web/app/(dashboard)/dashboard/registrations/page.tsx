'use client';

import { useState } from 'react';
import { LayoutDashboard, FileText, Users, CreditCard, BarChart3, Settings } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import OverviewTab      from './_components/OverviewTab';
import FormsTab         from './_components/FormsTab';
import SubmissionsTab   from './_components/SubmissionsTab';
import PaymentsTab      from './_components/PaymentsTab';
import ReportsTab       from './_components/ReportsTab';
import SettingsPanel    from './_components/SettingsPanel';

type Tab = 'overview' | 'forms' | 'submissions' | 'payments' | 'reports';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',     label: 'Overview',     icon: <LayoutDashboard size={14} /> },
  { id: 'forms',        label: 'Forms',        icon: <FileText size={14} /> },
  { id: 'submissions',  label: 'Submissions',  icon: <Users size={14} /> },
  { id: 'payments',     label: 'Payments',     icon: <CreditCard size={14} /> },
  { id: 'reports',      label: 'Reports',      icon: <BarChart3 size={14} /> },
];

export default function RegistrationsPage() {
  const { profile } = useDashboard();
  const [tab, setTab]         = useState<Tab>('overview');
  const [showSettings, setShowSettings] = useState(false);
  const isCoachOnly = profile?.role === 'coach';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh', background: '#F8FAFC' }}>

      {/* ── Top nav bar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <div style={{ flex: 1, display: 'flex', gap: '2px', paddingTop: '2px' }}>
          {TABS.filter(t => isCoachOnly ? t.id !== 'payments' && t.id !== 'reports' : true).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '14px 16px', border: 'none', background: 'none', borderBottom: `2px solid ${tab === t.id ? '#0F172A' : 'transparent'}`, fontSize: '13px', fontWeight: tab === t.id ? '700' : '500', color: tab === t.id ? '#0F172A' : '#64748B', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.1s' }}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        {!isCoachOnly && (
          <button onClick={() => setShowSettings(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Settings size={13} /> Settings
          </button>
        )}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'overview'    && <OverviewTab    onNavigate={(t) => setTab(t as Tab)} />}
        {tab === 'forms'       && <FormsTab />}
        {tab === 'submissions' && <SubmissionsTab />}
        {tab === 'payments'    && <PaymentsTab />}
        {tab === 'reports'     && <ReportsTab />}
      </div>

      {/* ── Settings panel ── */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
