'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type TeamMeta = { name: string; age_group: string | null; season: string | null };

const TABS = [
  { label: 'Summary',    suffix: '' },
  { label: 'Schedule',   suffix: '/schedule' },
  { label: 'Roster',     suffix: '/roster' },
  { label: 'Attendance', suffix: '/attendance' },
  { label: 'Forms',      suffix: '/forms' },
  { label: 'Fees',       suffix: '/fees' },
  { label: 'Contact',    suffix: '/contact' },
];

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const { teamId } = useParams<{ teamId: string }>();
  const pathname   = usePathname();
  const { club }   = useDashboard();
  const [team, setTeam] = useState<TeamMeta | null>(null);

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const base    = `/dashboard/teams/${teamId}`;

  useEffect(() => {
    if (!teamId) return;
    supabase.from('teams').select('name, age_group, season').eq('id', teamId).single()
      .then(({ data }) => { if (data) setTeam(data as TeamMeta); });
  }, [teamId]);

  const teamInitials = team?.name
    ? team.name.split(' ').filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '..';

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      {/* Team header + tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ padding: '16px 32px 0' }}>

          {/* Back */}
          <Link
            href="/dashboard/teams"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#64748B', textDecoration: 'none', marginBottom: '12px' }}
          >
            <ChevronLeft size={13} /> All Teams
          </Link>

          {/* Team identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '11px',
              background: primary, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '17px', fontWeight: '800',
              color: '#fff', flexShrink: 0, letterSpacing: '-0.5px',
            }}>
              {teamInitials}
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {team?.name ?? ''}
              </div>
              {(team?.age_group || team?.season) && (
                <div style={{ fontSize: '13px', color: '#64748B', marginTop: '3px' }}>
                  {[team.age_group, team.season].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', overflowX: 'auto', gap: '0', marginBottom: '-1px' }}>
            {TABS.map(({ label, suffix }) => {
              const href   = base + suffix;
              const active = suffix === '' ? pathname === base : pathname.startsWith(href);
              return (
                <Link key={label} href={href} style={{ textDecoration: 'none', flexShrink: 0 }}>
                  <div style={{
                    padding: '9px 18px',
                    borderBottom: active ? `2px solid ${primary}` : '2px solid transparent',
                    fontSize: '13.5px', fontWeight: active ? '700' : '500',
                    color: active ? primary : '#64748B',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'color 0.1s',
                  }}>
                    {label}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ padding: '28px 32px' }}>
        {children}
      </div>
    </div>
  );
}
