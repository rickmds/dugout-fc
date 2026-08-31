'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import {
  LayoutDashboard, Users, UserCog, CalendarDays, MapPin,
  ClipboardList, BarChart2, Settings, LogOut,
  Layers, DollarSign, Target, LayoutGrid,
  FileText, Mail, Megaphone, FileLock2, Award, ChevronRight, ChevronDown, Plus, ShieldCheck, Trophy, Medal,
} from 'lucide-react';
import { useDashboard } from './DashboardContext';
import { contrastText, safeAccent } from '@/lib/colorContrast';

type NavEntry = {
  section?: string;
  href?: string;
  icon?: React.ElementType;
  label?: string;
  exact?: boolean;
  adminOnly?: boolean;
};

const CLUB_NAV: NavEntry[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview', exact: true },
  { section: 'Club' },
  { href: '/dashboard/teams',         icon: Layers,        label: 'Teams' },
  { href: '/dashboard/players',       icon: Users,         label: 'Players' },
  { href: '/dashboard/staff',         icon: UserCog,       label: 'Staff' },
  { href: '/dashboard/fields',        icon: MapPin,        label: 'Fields' },
  { section: 'Schedule' },
  { href: '/dashboard/schedule',      icon: CalendarDays,  label: 'Schedule' },
  { href: '/dashboard/games',         icon: Trophy,        label: 'Game Scheduler' },
  { href: '/dashboard/tournaments',   icon: Medal,         label: 'Tournaments' },
  { section: 'Communicate' },
  { href: '/dashboard/announcements', icon: Megaphone,     label: 'Announcements' },
  { href: '/dashboard/email',         icon: Mail,          label: 'Email' },
  { section: 'Manage' },
  { href: '/dashboard/fees',          icon: DollarSign,    label: 'Fees',           adminOnly: true },
  { href: '/dashboard/registrations',  icon: ClipboardList, label: 'Registrations' },
  { href: '/dashboard/waivers',       icon: FileLock2,     label: 'Waivers' },
  { href: '/dashboard/reports',       icon: BarChart2,     label: 'Reports' },
  { href: '/dashboard/certifications', icon: ShieldCheck,  label: 'Certifications', adminOnly: true },
  { section: 'Develop' },
  { href: '/dashboard/evaluations',   icon: Award,         label: 'Evaluations' },
];

// The sidebar panel itself is a fixed dark navy regardless of a club's
// branding — if a club picks a primary color close to that navy, any
// element using `primary` as its own color (not background) on top of the
// panel becomes unreadable. Fall back to the default accent in that case
// rather than let a club's own brand color make their sidebar illegible.
const SIDEBAR_BG = '#0F172A';
function sidebarSafeAccent(hex: string): string {
  return safeAccent(hex, SIDEBAR_BG);
}

const TRYOUTS_NAV: NavEntry[] = [
  { href: '/dashboard/tryouts',                  icon: Target,        label: 'Dashboard',          exact: true, adminOnly: true },
  { href: '/dashboard/tryouts/players',          icon: Users,         label: 'Player Pool',        adminOnly: true },
  { href: '/dashboard/tryouts/builder',          icon: LayoutGrid,    label: 'Team Builder',       adminOnly: true },
  { href: '/dashboard/tryouts/coaches',          icon: UserCog,       label: 'Coaches',            adminOnly: true },
  { href: '/dashboard/tryouts/rosters',          icon: ClipboardList, label: 'Rosters',            adminOnly: true },
  { href: '/dashboard/tryouts/schedule',         icon: CalendarDays,  label: 'Practice Schedule',  adminOnly: true },
  { href: '/dashboard/tryouts/finances',         icon: DollarSign,    label: 'Finances',           adminOnly: true },
  { section: 'Settings', adminOnly: true },
  { href: '/dashboard/tryouts/fields',             icon: MapPin,        label: 'Fields & Zones',     adminOnly: true },
  { href: '/dashboard/tryouts/settings/teams',   icon: Settings,      label: 'Teams & Tiers',      adminOnly: true },
  { href: '/dashboard/tryouts/settings/form',    icon: FileText,      label: 'Registration Form',  adminOnly: true },
  { href: '/dashboard/tryouts/settings/offers',  icon: Mail,          label: 'Offer Templates',    adminOnly: true },
];

export default function Sidebar() {
  const { profile, club, myClubs, switchClub, signOut } = useDashboard();
  const pathname    = usePathname();
  const router      = useRouter();
  const [clubMenuOpen, setClubMenuOpen] = useState(false);
  const clubMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clubMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (clubMenuRef.current && !clubMenuRef.current.contains(e.target as Node)) setClubMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [clubMenuOpen]);

  const primary     = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  // Everything below is rendered directly on the sidebar's fixed navy
  // panel — use the panel-safe accent, not the raw brand color, so a club
  // can't accidentally make their own sidebar illegible.
  const accent      = sidebarSafeAccent(primary);
  const accentText  = contrastText(accent);
  const initials    = (club?.name ?? 'FC').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const userInitials = (profile?.full_name ?? '??').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const tryoutsActive = club?.tryouts_active ?? false;
  const isTryouts   = pathname.startsWith('/dashboard/tryouts');
  const activeNav   = (isTryouts && tryoutsActive) ? TRYOUTS_NAV : CLUB_NAV;

  const navRef = useRef<HTMLElement>(null);

  // Save scroll position on every scroll
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const onScroll = () => sessionStorage.setItem('sidebar-nav-scroll', String(el.scrollTop));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Restore synchronously before paint after every navigation so there's no visible jump
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem('sidebar-nav-scroll');
    if (saved) el.scrollTop = parseInt(saved, 10);
  }, [pathname]);

  function NavItem({ href, icon: Icon, label, exact = false }: { href: string; icon: React.ElementType; label: string; exact?: boolean }) {
    const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
    return (
      <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '9px',
          padding: '7px 12px', marginBottom: '1px',
          borderRadius: '6px',
          background: active ? `${accent}18` : 'transparent',
          borderLeft: active ? `2px solid ${accent}` : '2px solid transparent',
          transition: 'background 0.12s',
          cursor: 'pointer',
        }}
          onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Icon size={14} color={active ? accent : 'rgba(255,255,255,0.45)'} strokeWidth={active ? 2.5 : 2} />
          <span style={{ fontSize: '13px', fontWeight: active ? '700' : '500', color: active ? '#fff' : 'rgba(255,255,255,0.6)', letterSpacing: active ? '-0.1px' : '0' }}>
            {label}
          </span>
          {active && <ChevronRight size={10} color={accent} style={{ marginLeft: 'auto' }} />}
        </div>
      </Link>
    );
  }

  return (
    <aside id="dash-sidebar" style={{
      width: '220px', height: '100vh',
      background: '#0F172A',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, position: 'sticky', top: 0, overflowY: 'auto',
    }}>

      {/* Brand */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: '18px', fontWeight: '900', color: '#fff', letterSpacing: '1px', display: 'block' }}>
            PULSE<span style={{ color: accent }}>FC</span>
          </span>
          <span style={{ fontSize: '10px', fontWeight: '600', color: 'rgba(255,255,255,0.25)', letterSpacing: '2px', textTransform: 'uppercase', display: 'block', marginTop: '2px' }}>Club Dashboard</span>
        </div>

        {club && (
          <div ref={clubMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => myClubs.length > 1 && setClubMenuOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                background: 'none', border: 'none', padding: 0, margin: 0,
                cursor: myClubs.length > 1 ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <div style={{
                width: '34px', height: '34px', borderRadius: '6px', flexShrink: 0,
                background: club.logo_url ? 'transparent' : accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '800', color: accentText, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                {club.logo_url
                  // eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up
                  ? <img src={club.logo_url} alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{club.name}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'capitalize', letterSpacing: '0.3px' }}>{profile?.role?.replace('_', ' ')}</div>
              </div>
              {myClubs.length > 1 && (
                <ChevronDown size={14} color="rgba(255,255,255,0.35)" style={{ flexShrink: 0, transform: clubMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              )}
            </button>

            {clubMenuOpen && myClubs.length > 1 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
                background: '#1A2436', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.4)', overflow: 'hidden', padding: '4px',
              }}>
                {myClubs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { switchClub(c.id); setClubMenuOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px',
                      background: c.id === club.id ? 'rgba(255,255,255,0.06)' : 'none', border: 'none',
                      borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: c.id === club.id ? '700' : '500', color: c.id === club.id ? '#fff' : 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                  </button>
                ))}
                <Link
                  href="/onboarding?new_club=1"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', marginTop: '2px',
                    borderTop: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none',
                  }}
                  onClick={() => setClubMenuOpen(false)}
                >
                  <Plus size={12} color="rgba(255,255,255,0.5)" />
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>Add another club</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mode toggle — only shown when tryout season is active */}
      {tryoutsActive && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {(['club', 'tryouts'] as const).map(mode => {
              const active = mode === 'club' ? !isTryouts : isTryouts;
              return (
                <button
                  key={mode}
                  onClick={() => router.push(mode === 'tryouts' ? '/dashboard/tryouts' : '/dashboard')}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    fontSize: '12px', fontWeight: '700', letterSpacing: '0.3px',
                    background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: active ? '#fff' : 'rgba(255,255,255,0.35)',
                    transition: 'all 0.15s',
                    textTransform: 'capitalize',
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav ref={navRef} style={{ flex: 1, padding: '8px 8px 12px', overflowY: 'auto' }}>
        {activeNav.map((item, i) => {
          if (item.section) {
            return (
              <div key={i} style={{ padding: '12px 12px 4px', fontSize: '9px', fontWeight: '800', color: 'rgba(255,255,255,0.25)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                {item.section}
              </div>
            );
          }
          if (!item.href || !item.icon || !item.label) return null;
          return <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} exact={item.exact} />;
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/dashboard/settings" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            <Settings size={14} color="rgba(255,255,255,0.45)" strokeWidth={2} />
            <span style={{ fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.6)' }}>Settings</span>
          </div>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 12px', marginTop: '2px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: accent, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: accentText, overflow: 'hidden' }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : userInitials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile?.full_name ?? 'Coach'}
            </div>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '5px', display: 'flex', opacity: 0.4 }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.8'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.4'}
          >
            <LogOut size={14} color="#fff" />
          </button>
        </div>
      </div>
    </aside>
  );
}
