'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCog, CalendarDays, MapPin,
  ClipboardList, BarChart2, Settings, LogOut, ChevronRight,
  Layers, Shield, DollarSign, Target, LayoutGrid, Trophy,
} from 'lucide-react';
import { useDashboard } from './DashboardContext';

type NavEntry = {
  section?: string;
  href?: string;
  icon?: React.ElementType;
  label?: string;
  exact?: boolean;
  adminOnly?: boolean;
};

const NAV: NavEntry[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview', exact: true },
  { section: 'Club' },
  { href: '/dashboard/teams',   icon: Layers,        label: 'Teams' },
  { href: '/dashboard/players', icon: Users,         label: 'Players' },
  { href: '/dashboard/staff',   icon: UserCog,       label: 'Staff' },
  { href: '/dashboard/fields',  icon: MapPin,        label: 'Fields' },
  { section: 'Schedule' },
  { href: '/dashboard/schedule', icon: CalendarDays, label: 'Schedule' },
  { section: 'Manage' },
  { href: '/dashboard/forms',   icon: ClipboardList, label: 'Forms' },
  { href: '/dashboard/reports', icon: BarChart2,     label: 'Club Reports' },
  { href: '/dashboard/admin',   icon: Shield,        label: 'Club Administration', adminOnly: true },
  { section: 'Tryouts', adminOnly: true },
  { href: '/dashboard/tryouts',                   icon: Target,      label: 'Overview',     adminOnly: true },
  { href: '/dashboard/tryouts/players',           icon: Users,       label: 'Player Pool',  adminOnly: true },
  { href: '/dashboard/tryouts/builder',           icon: LayoutGrid,  label: 'Team Builder', adminOnly: true },
  { href: '/dashboard/tryouts/rosters',           icon: ClipboardList, label: 'Rosters',    adminOnly: true },
  { href: '/dashboard/tryouts/coaches',           icon: UserCog,     label: 'Coaches',      adminOnly: true },
  { href: '/dashboard/tryouts/schedule',          icon: CalendarDays, label: 'Practice',    adminOnly: true },
  { href: '/dashboard/tryouts/games',             icon: Trophy,      label: 'Games',        adminOnly: true },
  { href: '/dashboard/tryouts/finances',          icon: DollarSign,  label: 'Finances',     adminOnly: true },
  { href: '/dashboard/tryouts/settings/teams',    icon: Settings,    label: 'Tryout Setup', adminOnly: true },
];

function NavItem({ href, icon: Icon, label, exact = false, primary }: {
  href: string; icon: React.ElementType; label: string; exact?: boolean; primary: string;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '7px 10px', borderRadius: '8px', marginBottom: '1px',
          background: active ? `${primary}15` : 'transparent',
          borderLeft: active ? `3px solid ${primary}` : '3px solid transparent',
          cursor: 'pointer', transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <Icon size={15} color={active ? primary : '#64748B'} strokeWidth={active ? 2.5 : 2} />
        <span style={{ fontSize: '13.5px', fontWeight: active ? '700' : '500', color: active ? primary : '#374151', flex: 1 }}>
          {label}
        </span>
        {active && <ChevronRight size={11} color={primary} />}
      </div>
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: '10px', fontWeight: '700', color: '#CBD5E1',
      letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '14px 10px 5px',
    }}>
      {label}
    </div>
  );
}

export default function Sidebar() {
  const { profile, club, signOut } = useDashboard();

  const primary      = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const initials     = (club?.name ?? 'DG').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const userInitials = (profile?.full_name ?? '??').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const isAdmin      = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  return (
    <aside style={{
      width: '228px', height: '100vh', background: '#fff',
      borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column',
      flexShrink: 0, position: 'sticky', top: 0, overflowY: 'auto',
    }}>

      {/* Brand */}
      <div style={{ padding: '18px 14px 12px', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <img src="/Signature.jpg" alt="Dugout FC" style={{ height: '50px', width: 'auto', objectFit: 'contain' }} />
        </div>
        {club && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: '#F8FAFC', borderRadius: '10px', padding: '9px 11px', border: '1px solid #E2E8F0' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '7px', flexShrink: 0,
              background: club.logo_url ? 'transparent' : primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: '800', color: '#fff', overflow: 'hidden',
            }}>
              {club.logo_url
                ? <img src={club.logo_url} alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{club.name}</div>
              <div style={{ fontSize: '10.5px', color: '#94A3B8', textTransform: 'capitalize' }}>{profile?.role?.replace('_', ' ')}</div>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 10px 12px', overflowY: 'auto' }}>
        {NAV.map((item, i) => {
          if (item.section) {
            if (item.adminOnly && !isAdmin) return null;
            return <SectionLabel key={i} label={item.section} />;
          }
          if (!item.href || !item.icon || !item.label) return null;
          if (item.adminOnly && !isAdmin) return null;
          return <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} exact={item.exact} primary={primary} />;
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 10px 12px', borderTop: '1px solid #E2E8F0' }}>
        <NavItem href="/dashboard/settings" icon={Settings} label="Settings" primary={primary} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 10px', marginTop: '2px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '50%', background: primary, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: '700', color: '#fff',
          }}>
            {userInitials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile?.full_name ?? 'Coach'}
            </div>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}
          >
            <LogOut size={14} color="#94A3B8" />
          </button>
        </div>
      </div>
    </aside>
  );
}
