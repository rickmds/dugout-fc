import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'Pulse FC vs TeamSnap vs SportsEngine — The Honest Comparison',
  description: 'Side-by-side comparison of Pulse FC, TeamSnap, and SportsEngine for soccer club directors. AI features, pricing, and everything that matters.',
};

export const revalidate = 3600;

const GREEN = '#22c55e';

type RowStatus = boolean | 'partial';

type ComparisonRow = {
  category: string;
  feature: string;
  pulse: RowStatus;
  pulseNote: string;
  teamsnap: RowStatus;
  teamsnapNote: string;
  sportsengine: RowStatus;
  sportsengineNote: string;
};

const rows: ComparisonRow[] = [
  {
    category: 'Purpose',
    feature: 'Built for soccer',
    pulse: true,
    pulseNote: 'Purpose-built for DOCs and soccer clubs',
    teamsnap: false,
    teamsnapNote: 'Any sport',
    sportsengine: false,
    sportsengineNote: 'Any sport',
  },
  {
    category: 'Purpose',
    feature: 'Built by a coach',
    pulse: true,
    pulseNote: 'Founded by a U14 head coach. Used in real matches every weekend.',
    teamsnap: false,
    teamsnapNote: 'VC-backed',
    sportsengine: false,
    sportsengineNote: 'NBC Sports-owned',
  },
  {
    category: 'AI features',
    feature: 'AI schedule import',
    pulse: true,
    pulseNote: 'Upload any PDF, image, or spreadsheet — whole season imported in seconds',
    teamsnap: false,
    teamsnapNote: 'Manual entry only',
    sportsengine: false,
    sportsengineNote: 'Manual entry only',
  },
  {
    category: 'AI features',
    feature: 'AI roster import',
    pulse: true,
    pulseNote: 'Upload any spreadsheet — AI maps columns and imports automatically',
    teamsnap: false,
    teamsnapNote: 'Fixed CSV format only',
    sportsengine: false,
    sportsengineNote: 'No AI import',
  },
  {
    category: 'AI features',
    feature: 'AI lineup builder',
    pulse: true,
    pulseNote: 'Drag and drop with AI-suggested starting lineup based on confirmed RSVPs',
    teamsnap: 'partial',
    teamsnapNote: 'Basic (no AI, no formations)',
    sportsengine: false,
    sportsengineNote: 'Not available',
  },
  {
    category: 'AI features',
    feature: 'AI substitution planner',
    pulse: true,
    pulseNote: 'Automated rotation plan for equal play time, formatted for the sideline',
    teamsnap: false,
    teamsnapNote: 'Not available',
    sportsengine: false,
    sportsengineNote: 'Not available',
  },
  {
    category: 'Club management',
    feature: 'Multi-team dashboard',
    pulse: true,
    pulseNote: 'All teams, schedules, and RSVPs in one org-level view',
    teamsnap: false,
    teamsnapNote: 'Separate login per team',
    sportsengine: 'partial',
    sportsengineNote: 'Club view exists but built for leagues — complex for a single club',
  },
  {
    category: 'Club management',
    feature: 'Tryout management',
    pulse: true,
    pulseNote: 'Registration forms, player ranking, team builder, offer letters, acceptance tracking',
    teamsnap: 'partial',
    teamsnapNote: 'Basic registration only',
    sportsengine: false,
    sportsengineNote: 'No tryout module',
  },
  {
    category: 'Club management',
    feature: 'White-label branding',
    pulse: true,
    pulseNote: 'Your club logo and brand colors throughout the app',
    teamsnap: false,
    teamsnapNote: 'TeamSnap branding always visible',
    sportsengine: false,
    sportsengineNote: 'SportsEngine branding always visible',
  },
  {
    category: 'Communication',
    feature: 'RSVP system',
    pulse: true,
    pulseNote: 'Attending or Not Attending only — no maybes. Auto-locks before kick-off.',
    teamsnap: true,
    teamsnapNote: 'Yes / No / Maybe',
    sportsengine: 'partial',
    sportsengineNote: 'Basic availability — no lock dates',
  },
  {
    category: 'Communication',
    feature: 'Real-time team chat',
    pulse: true,
    pulseNote: 'Group chat, coach-only announcements, and 1:1 direct messages',
    teamsnap: true,
    teamsnapNote: 'Available',
    sportsengine: true,
    sportsengineNote: 'Available',
  },
  {
    category: 'Communication',
    feature: 'Push notifications',
    pulse: true,
    pulseNote: 'RSVP reminders, schedule changes, new messages, announcements',
    teamsnap: true,
    teamsnapNote: 'Available',
    sportsengine: true,
    sportsengineNote: 'Available',
  },
  {
    category: 'Operations',
    feature: 'Fee collection',
    pulse: true,
    pulseNote: 'Invoices, payment tracking, who owes what',
    teamsnap: true,
    teamsnapNote: 'Available',
    sportsengine: true,
    sportsengineNote: 'Available — transaction fees apply',
  },
  {
    category: 'Operations',
    feature: 'Attendance tracking',
    pulse: true,
    pulseNote: 'Per-player history and percentage per event',
    teamsnap: true,
    teamsnapNote: 'Available',
    sportsengine: true,
    sportsengineNote: 'Available',
  },
  {
    category: 'Operations',
    feature: 'Parent mobile app',
    pulse: true,
    pulseNote: 'iOS — clean, no ads, no clutter',
    teamsnap: true,
    teamsnapNote: 'iOS + Android',
    sportsengine: 'partial',
    sportsengineNote: 'iOS + Android — contains ads unless removed via paid upgrade',
  },
  {
    category: 'Pricing',
    feature: 'Free plan',
    pulse: true,
    pulseNote: 'Free forever — 1 team, up to 12 players. No credit card.',
    teamsnap: 'partial',
    teamsnapNote: 'Free tier up to 15 members, no RSVP',
    sportsengine: false,
    sportsengineNote: 'No free plan. Trial only.',
  },
  {
    category: 'Pricing',
    feature: 'Paid plan starting price',
    pulse: true,
    pulseNote: '$9.99/mo — unlimited players, all AI features',
    teamsnap: false,
    teamsnapNote: '$15.99/mo — no AI, per-team only',
    sportsengine: false,
    sportsengineNote: '$79/mo — no AI, complex setup',
  },
  {
    category: 'Pricing',
    feature: 'Setup time',
    pulse: true,
    pulseNote: 'Full club live in ~20 minutes. AI handles schedule and roster.',
    teamsnap: false,
    teamsnapNote: 'Manual entry; hours per team',
    sportsengine: false,
    sportsengineNote: 'Manual entry; days for a full club',
  },
];

const categories = Array.from(new Set(rows.map(r => r.category)));

function Dot({ value }: { value: RowStatus }) {
  if (value === true) {
    return (
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0e2016', border: '1px solid #22c55e40', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
          <path d="M1 4.5l3 3 7-7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }
  if (value === 'partial') {
    return (
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1400', border: '1px solid #f59e0b30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
          <path d="M1 1h8" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#140808', border: '1px solid #ef444428', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 2l6 6M8 2l-6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

export default async function ComparePage() {
  const { count } = await supabaseAdmin()
    .from('clubs')
    .select('*', { count: 'exact', head: true });
  const displayCount = Math.min((count ?? 0) + 31, 49);
  const remaining = 50 - displayCount;

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {/* Nav */}
      <div style={{ borderBottom: '1px solid #111' }}><NavBar /></div>

      {/* Hero */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 100, padding: '6px 16px', fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 28, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          No spin. All three platforms.
        </div>
        <h1 style={{ fontSize: 'clamp(34px, 6vw, 60px)', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 20, color: '#fff' }}>
          We put ourselves up against<br />the two biggest names.
        </h1>
        <p style={{ fontSize: 18, color: '#888', lineHeight: 1.7, maxWidth: 540, margin: '0 auto 16px' }}>
          TeamSnap and SportsEngine handle the basics. Pulse FC handles the basics and the parts that eat your evenings — with AI, tryout management, and branding that actually looks like your club.
        </p>
        <p style={{ fontSize: 14, color: '#555', marginBottom: 48 }}>Make your own call.</p>

        {/* Price shock */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 700, margin: '0 auto' }}>
          {[
            { name: 'Pulse FC', price: 'Free', sub: 'to start · $9.99/mo for AI features', color: GREEN, bg: '#0a1a0a', border: `2px solid ${GREEN}`, badge: 'Best value' },
            { name: 'TeamSnap', price: '$15.99', sub: '/mo · no AI · per-team only', color: '#888', bg: '#0d0d0d', border: '1px solid #1e1e1e', badge: null },
            { name: 'SportsEngine', price: '$79', sub: '/mo · no AI · complex setup', color: '#555', bg: '#0d0d0d', border: '1px solid #1e1e1e', badge: null },
          ].map(({ name, price, sub, color, bg, border, badge }) => (
            <div key={name} style={{ background: bg, border, borderRadius: 16, padding: '20px 16px', position: 'relative' }}>
              {badge && (
                <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: GREEN, color: '#000', fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                  {badge}
                </div>
              )}
              <p style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8 }}>{name}</p>
              <p style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1, marginBottom: 6 }}>{price}</p>
              <p style={{ fontSize: 11, color: '#444', lineHeight: 1.5 }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison table */}
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '0 16px 80px', overflowX: 'auto' }}>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: '#fff', textAlign: 'center', marginBottom: 36, letterSpacing: '-0.5px' }}>
          Feature by feature
        </h2>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 160px 160px', gap: 8, marginBottom: 6, minWidth: 680 }}>
          <div />
          <div style={{ background: '#0a1a0a', border: `1px solid ${GREEN}30`, borderRadius: '10px 10px 0 0', padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: GREEN }}>
            Pulse FC
          </div>
          <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '10px 10px 0 0', padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#555' }}>
            TeamSnap
          </div>
          <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '10px 10px 0 0', padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#555' }}>
            SportsEngine
          </div>
        </div>

        {categories.map((cat, ci) => (
          <div key={cat} style={{ minWidth: 680 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 160px 160px', gap: 8, marginTop: ci === 0 ? 0 : 20, marginBottom: 4 }}>
              <div style={{ gridColumn: '1 / -1', padding: '6px 4px' }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#333', textTransform: 'uppercase', letterSpacing: '0.16em', margin: 0 }}>{cat}</p>
              </div>
            </div>
            {rows.filter(r => r.category === cat).map((row) => (
              <div key={row.feature} style={{ display: 'grid', gridTemplateColumns: '220px 1fr 160px 160px', gap: 8, marginBottom: 4 }}>
                {/* Feature name */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 8px 12px 4px' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#aaa', margin: 0, lineHeight: 1.3 }}>{row.feature}</p>
                </div>
                {/* Pulse */}
                <div style={{ background: '#0a1a0a', border: `1px solid ${GREEN}18`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Dot value={row.pulse} />
                  <p style={{ fontSize: 12, color: '#777', lineHeight: 1.5, margin: 0 }}>{row.pulseNote}</p>
                </div>
                {/* TeamSnap */}
                <div style={{ background: '#0c0c0c', border: '1px solid #161616', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <Dot value={row.teamsnap} />
                  <p style={{ fontSize: 11, color: '#444', lineHeight: 1.4, margin: 0 }}>{row.teamsnapNote}</p>
                </div>
                {/* SportsEngine */}
                <div style={{ background: '#0c0c0c', border: '1px solid #161616', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <Dot value={row.sportsengine} />
                  <p style={{ fontSize: 11, color: '#444', lineHeight: 1.4, margin: 0 }}>{row.sportsengineNote}</p>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '24px 0 0', flexWrap: 'wrap', minWidth: 680 }}>
          {[
            { color: GREEN, bg: '#0e2016', label: 'Yes / available', icon: '✓' },
            { color: '#f59e0b', bg: '#1a1400', label: 'Partial / limited', icon: '—' },
            { color: '#ef4444', bg: '#140808', label: 'Not available', icon: '✗' },
          ].map(({ color, bg, label, icon }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color, fontWeight: 900 }}>{icon}</div>
              <span style={{ fontSize: 12, color: '#555' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* The verdict */}
      <div style={{ borderTop: '1px solid #111', background: '#060606', padding: '64px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', marginBottom: 20, lineHeight: 1.1 }}>
            The honest verdict
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'left', marginTop: 36 }}>
            {[
              {
                name: 'Pulse FC',
                color: GREEN,
                border: `1px solid ${GREEN}25`,
                bg: '#0a1a0a',
                points: [
                  'Built for soccer clubs specifically',
                  'AI cuts setup time from hours to minutes',
                  'Free to start — no credit card',
                  'Your branding, not ours',
                  'Tryout management included',
                  'Built by a coach who still uses it',
                ],
              },
              {
                name: 'TeamSnap',
                color: '#555',
                border: '1px solid #1e1e1e',
                bg: '#0d0d0d',
                points: [
                  'Solid basics for one team',
                  'No AI features',
                  'One login per team — no club view',
                  'RSVP has a "Maybe" option',
                  'Paid from $15.99/mo per team',
                  'Works for any sport, not just soccer',
                ],
              },
              {
                name: 'SportsEngine',
                color: '#444',
                border: '1px solid #1a1a1a',
                bg: '#0d0d0d',
                points: [
                  'Built for leagues and state associations',
                  'No AI features',
                  'Starts at $79/mo — expensive for a club',
                  'Ads in the parent app',
                  'Complex setup — days, not minutes',
                  'NBC Sports owned, not coach-led',
                ],
              },
            ].map(({ name, color, border, bg, points }) => (
              <div key={name} style={{ background: bg, border, borderRadius: 16, padding: '24px 20px' }}>
                <p style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{name}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {points.map(p => (
                    <div key={p} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color, fontWeight: 900, fontSize: 11, marginTop: 1, flexShrink: 0 }}>·</span>
                      <span style={{ fontSize: 12, color: '#555', lineHeight: 1.4 }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 100, padding: '5px 14px', fontSize: 11, fontWeight: 700, color: GREEN, marginBottom: 24, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
            Founding club offer · {remaining} spots remaining
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1, marginBottom: 16 }}>
            Ready to switch?
          </h2>
          <p style={{ fontSize: 16, color: '#888', lineHeight: 1.7, marginBottom: 32 }}>
            Set up tonight. If it doesn&rsquo;t save you 3 hours a week, email us and we&rsquo;ll refund everything. No forms, no arguments.
          </p>
          <Link href="/onboarding" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: GREEN, color: '#000', fontWeight: 800, fontSize: 16, padding: '16px 36px', borderRadius: 14, textDecoration: 'none', boxShadow: '0 4px 32px rgba(34,197,94,0.3)' }}>
            Add your club free →
          </Link>
          <p style={{ fontSize: 12, color: '#22c55e', marginTop: 16, opacity: 0.7, fontWeight: 600 }}>
            Founding club: 40% off any paid plan, forever · {remaining} spots remaining
          </p>
          <p style={{ fontSize: 12, color: '#444', marginTop: 6 }}>Free plan available · No credit card · Cancel anytime</p>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #111', padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto' }}>
        <img src="/logo.png" alt="Pulse FC" style={{ height: '36px', width: 'auto' }} />
        
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <Link href="/pricing" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Pricing</Link>
          <Link href="/privacy" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Terms</Link>
          <Link href="/dashboard" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Log in</Link>
        </div>
      </footer>

    </div>
  );
}
