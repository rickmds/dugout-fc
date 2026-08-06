'use client';

import { useEffect, useState } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import SimpleDashboard from './_SimpleDashboard';
import ProDashboard from './_ProDashboard';

const UPGRADE_THRESHOLD = 16; // teams

function prefKey(clubId: string) {
  return `pfc-dash-${clubId}`;
}

// ── Upgrade prompt ────────────────────────────────────────────────────────────
function UpgradePrompt({
  teamCount,
  primary,
  onUpgrade,
  onStay,
}: {
  teamCount: number;
  primary: string;
  onUpgrade: () => void;
  onStay: () => void;
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '560px' }}>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

          {/* Top accent bar */}
          <div style={{ height: '4px', background: `linear-gradient(90deg, ${primary}, ${primary}80)` }} />

          <div style={{ padding: '40px 40px 36px' }}>

            {/* Icon + headline */}
            <div style={{ marginBottom: '28px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', fontSize: '24px' }}>
                🏟️
              </div>
              <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#0D1117', letterSpacing: '-0.5px', lineHeight: 1.2, margin: '0 0 10px' }}>
                You&apos;re running a real organisation now.
              </h1>
              <p style={{ fontSize: '14.5px', color: '#64748B', lineHeight: 1.6, margin: 0 }}>
                You&apos;ve hit <strong style={{ color: '#0D1117' }}>{teamCount} teams</strong>. The standard dashboard was built for clubs just getting started — you&apos;ve outgrown it. Command Centre gives you the visibility to run things at this scale.
              </p>
            </div>

            {/* What's included */}
            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '20px', marginBottom: '28px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>What you&apos;re unlocking</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { icon: '📊', label: 'Club health score', desc: 'Rolled-up view across all your teams' },
                  { icon: '👁️', label: 'Coach activity monitor', desc: 'Spot silent coaches before parents complain' },
                  { icon: '💰', label: 'Fee collection by age group', desc: 'See which cohorts are falling behind' },
                  { icon: '🚨', label: 'Team intervention alerts', desc: 'Triaged by severity so you know who to call' },
                  { icon: '📱', label: 'Parent adoption tracking', desc: 'Per-team app usage rates at a glance' },
                  { icon: '📈', label: 'Year-on-year growth', desc: 'Track whether your club is growing' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '16px', lineHeight: 1, marginTop: '1px', flexShrink: 0 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A', marginBottom: '2px' }}>{item.label}</div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.4 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={onUpgrade}
                style={{ width: '100%', padding: '14px', borderRadius: '10px', background: primary, border: 'none', color: '#fff', fontSize: '14.5px', fontWeight: '800', cursor: 'pointer', letterSpacing: '-0.2px' }}
              >
                Switch to Command Centre
              </button>
              <button
                onClick={onStay}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'none', border: 'none', color: '#94A3B8', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                Keep the simple view for now
              </button>
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '11.5px', color: '#CBD5E1', marginTop: '16px' }}>
          You can switch between views any time from the dashboard header.
        </p>
      </div>
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const { club, teams } = useDashboard();
  const primary    = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const [mode, setMode] = useState<'simple' | 'pro' | 'prompt' | null>(null);

  useEffect(() => {
    if (!club) return;
    const key    = prefKey(club.id);
    const stored = localStorage.getItem(key) as 'simple' | 'pro' | null;
    if (stored) { setMode(stored); return; }
    setMode(teams.length >= UPGRADE_THRESHOLD ? 'prompt' : 'simple');
  }, [club?.id, teams.length]);

  function choose(m: 'simple' | 'pro') {
    if (club) localStorage.setItem(prefKey(club.id), m);
    setMode(m);
  }

  if (!mode) return null;

  if (mode === 'prompt') {
    return (
      <UpgradePrompt
        teamCount={teams.length}
        primary={primary}
        onUpgrade={() => choose('pro')}
        onStay={() => choose('simple')}
      />
    );
  }

  if (mode === 'pro') return <ProDashboard onSwitch={() => choose('simple')} />;
  return <SimpleDashboard onUpgrade={() => choose('pro')} />;
}
