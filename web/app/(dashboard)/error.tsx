'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Sits at the same level as (dashboard)/layout.tsx, so Next.js keeps that
// layout (Sidebar, club-suspended check, mobile topbar) mounted and only
// replaces the erroring page's content with this — before this file
// existed, ANY uncaught error on ANY dashboard page (Teams, Fields, Games,
// Reports, ...) bubbled all the way past every route boundary to the
// single root global-error.tsx, which unmounts the entire app including
// the sidebar and nav to a blank screen. One bad row on one tab no longer
// takes down the whole dashboard.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{ height: '100%', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5', padding: '24px' }}>
      <div style={{ maxWidth: '380px', width: '100%', background: '#fff', borderRadius: '16px', padding: '32px 28px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <span style={{ fontSize: '22px' }}>⚽</span>
        </div>
        <h1 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>This page hit a snag</h1>
        <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.5, margin: '0 0 22px' }}>
          We&apos;ve been notified and are looking into it. The rest of your dashboard is unaffected — try this page again, or head to another tab.
        </p>
        <button
          onClick={reset}
          style={{ width: '100%', padding: '11px 0', borderRadius: '10px', border: 'none', background: '#22C55E', color: '#000', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
