import Link from 'next/link';
import type { Metadata } from 'next';
import NavBar from '@/components/NavBar';
import { theme } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Pulse FC vs TeamSnap vs SportsEngine vs PlayMetrics — The Honest Comparison',
  description: 'Side-by-side comparison of Pulse FC, TeamSnap, SportsEngine, and PlayMetrics for soccer club directors. AI features, pricing, and everything that matters.',
};

export const revalidate = 3600;

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
  playmetrics: RowStatus;
  playmetricsNote: string;
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
    playmetrics: false,
    playmetricsNote: 'Multi-sport — soccer, volleyball, rugby, and more',
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
    playmetrics: false,
    playmetricsNote: 'Enterprise club-operations platform, not coach-founded',
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
    playmetrics: false,
    playmetricsNote: 'No AI features found in their public materials',
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
    playmetrics: false,
    playmetricsNote: 'No AI features found in their public materials',
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
    playmetrics: 'partial',
    playmetricsNote: 'Visual lineups, formations, depth charts — no AI suggestions found',
  },
  {
    category: 'Operations',
    feature: 'Equal playing time calculator',
    pulse: true,
    pulseNote: 'Automatic rotation plan for equal play time — pure maths, works instantly offline, no AI call needed',
    teamsnap: false,
    teamsnapNote: 'Not available',
    sportsengine: false,
    sportsengineNote: 'Not available',
    playmetrics: false,
    playmetricsNote: 'Manual sub ordering only — no automated equal-time calculator found',
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
    playmetrics: true,
    playmetricsNote: 'Director Dashboard — real-time view across teams',
  },
  {
    category: 'Club management',
    feature: 'Tryout management',
    pulse: true,
    pulseNote: 'Registration forms, player ranking, team builder, offer letters, acceptance tracking, Stripe-backed fee collection',
    teamsnap: 'partial',
    teamsnapNote: 'Basic registration only',
    sportsengine: false,
    sportsengineNote: 'No tryout module',
    playmetrics: true,
    playmetricsNote: 'Mature tooling — evaluations, filterable scores, drag-and-drop team assignment',
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
    playmetrics: false,
    playmetricsNote: 'No white-label or club-branded app option found',
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
    playmetrics: 'partial',
    playmetricsNote: 'Attendance tracking confirmed — yes/no/maybe RSVP workflow not found',
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
    playmetrics: true,
    playmetricsNote: 'Live chat built into the app',
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
    playmetrics: true,
    playmetricsNote: 'Email, chat, text, alerts, and push notifications',
  },
  {
    category: 'Communication',
    feature: 'Automatic change alerts',
    pulse: true,
    pulseNote: 'Time change, location change, or cancellation → instant push to all parents with the exact change highlighted',
    teamsnap: 'partial',
    teamsnapNote: 'Generic notification only — no change details',
    sportsengine: false,
    sportsengineNote: 'No automatic change notifications',
    playmetrics: true,
    playmetricsNote: 'Time/location changes "updated automatically" per their site',
  },
  {
    category: 'Operations',
    feature: 'Fee collection',
    pulse: true,
    pulseNote: 'Stripe Connect — installment plans, automatic reminders, refunds handled in the app',
    teamsnap: true,
    teamsnapNote: 'Available',
    sportsengine: true,
    sportsengineNote: 'Available — transaction fees apply',
    playmetrics: true,
    playmetricsNote: 'Payment processing available — fee structure not disclosed publicly',
  },
  {
    category: 'Operations',
    feature: 'Attendance tracking',
    pulse: true,
    pulseNote: 'Coach marks present/absent/late in the app — parents notified instantly if child is absent. Full history and streak per player.',
    teamsnap: 'partial',
    teamsnapNote: 'Basic check-in only — no parent notifications for absences',
    sportsengine: 'partial',
    sportsengineNote: 'Available — no parent absence notifications',
    playmetrics: 'partial',
    playmetricsNote: 'Real-time attendance tracking — parent notification behavior not detailed publicly',
  },
  {
    category: 'Operations',
    feature: 'Game scores + season record',
    pulse: true,
    pulseNote: 'Log scores from the sideline via match tracker. Season W/L/D record builds automatically.',
    teamsnap: 'partial',
    teamsnapNote: 'Score logging available — no auto-season record',
    sportsengine: true,
    sportsengineNote: 'Available — league-focused',
    playmetrics: true,
    playmetricsNote: 'Scores + standings shared in real time — league/association focused',
  },
  {
    category: 'Operations',
    feature: 'Video recordings library',
    pulse: true,
    pulseNote: 'Link any recording to an event — parents get a push notification. All sessions archived in one place.',
    teamsnap: false,
    teamsnapNote: 'Not available',
    sportsengine: false,
    sportsengineNote: 'Not available',
    playmetrics: false,
    playmetricsNote: 'Not found in public materials',
  },
  {
    category: 'Operations',
    feature: 'Guest player management',
    pulse: true,
    pulseNote: 'Borrow players from other teams in the club. Conflict detection, G-badge in lineup and match tracker, org admin activity view.',
    teamsnap: false,
    teamsnapNote: 'Not available',
    sportsengine: false,
    sportsengineNote: 'Not available',
    playmetrics: true,
    playmetricsNote: 'Guest player management listed as a feature',
  },
  {
    category: 'Operations',
    feature: 'Parent mobile app',
    pulse: 'partial',
    pulseNote: 'iOS today — Android in progress',
    teamsnap: true,
    teamsnapNote: 'iOS + Android',
    sportsengine: 'partial',
    sportsengineNote: 'iOS + Android — contains ads unless removed via paid upgrade',
    playmetrics: true,
    playmetricsNote: 'iOS + Android',
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
    playmetrics: false,
    playmetricsNote: 'No free plan or trial found in public materials',
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
    playmetrics: false,
    playmetricsNote: 'No public pricing — custom quote via sales call',
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
    playmetrics: false,
    playmetricsNote: 'Demo request + sales conversation required before you can start',
  },
];

const categories = Array.from(new Set(rows.map(r => r.category)));

function Dot({ value }: { value: RowStatus }) {
  if (value === true) {
    return (
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
          <path d="M1 4.5l3 3 7-7" stroke={theme.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }
  if (value === 'partial') {
    return (
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FBF3E4', border: '1px solid #E8C98F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
          <path d="M1 1h8" stroke="#B8842A" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FBEBEA', border: '1px solid #F0C6C3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 2l6 6M8 2l-6 6" stroke="#C0392B" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

export default function ComparePage() {
  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text }}>

      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${theme.border}` }}><NavBar /></div>

      {/* Hero */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}`, borderRadius: 100, padding: '6px 16px', fontSize: 12, fontWeight: 700, color: theme.greenDark, marginBottom: 28, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          No spin. All four platforms.
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 5.5vw, 52px)', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.08, marginBottom: 20, color: theme.text, fontFamily: theme.fontDisplay }}>
          We put ourselves up against<br />the names that come up.
        </h1>
        <p style={{ fontSize: 18, color: theme.textSecondary, lineHeight: 1.7, maxWidth: 580, margin: '0 auto 16px' }}>
          TeamSnap and SportsEngine handle the basics. PlayMetrics handles a lot more than the basics, for any sport, after a sales call. Pulse FC handles the basics and the parts that eat your evenings — with AI, tryout management, and a price you can see before you talk to anyone.
        </p>
        <p style={{ fontSize: 14, color: theme.textMuted, marginBottom: 48 }}>Make your own call.</p>

        {/* Price shock */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, maxWidth: 820, margin: '0 auto' }}>
          {[
            { name: 'Pulse FC', price: 'Free', sub: 'to start · $9.99/mo for AI', color: theme.green, bg: theme.greenTint, border: `2px solid ${theme.green}`, badge: 'Best value' },
            { name: 'TeamSnap', price: '$15.99', sub: '/mo · no AI · per-team', color: theme.textSecondary, bg: theme.surface, border: `1px solid ${theme.border}`, badge: null },
            { name: 'SportsEngine', price: '$79', sub: '/mo · no AI · complex setup', color: theme.textMuted, bg: theme.surface, border: `1px solid ${theme.border}`, badge: null },
            { name: 'PlayMetrics', price: 'Custom', sub: 'quote · sales call required', color: theme.textMuted, bg: theme.surface, border: `1px solid ${theme.border}`, badge: null },
          ].map(({ name, price, sub, color, bg, border, badge }) => (
            <div key={name} style={{ background: bg, border, borderRadius: 16, padding: '20px 14px', position: 'relative' }}>
              {badge && (
                <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: theme.green, color: '#fff', fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                  {badge}
                </div>
              )}
              <p style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8 }}>{name}</p>
              <p style={{ fontSize: 26, fontWeight: 900, color: theme.text, lineHeight: 1, marginBottom: 6 }}>{price}</p>
              <p style={{ fontSize: 10.5, color: theme.textMuted, lineHeight: 1.5 }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison table */}
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '0 16px 80px', overflowX: 'auto' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: theme.text, textAlign: 'center', marginBottom: 36, letterSpacing: '-0.3px', fontFamily: theme.fontDisplay }}>
          Feature by feature
        </h2>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 145px 145px 145px', gap: 8, marginBottom: 6, minWidth: 880 }}>
          <div />
          <div style={{ background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}`, borderRadius: '10px 10px 0 0', padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: theme.greenDark }}>
            Pulse FC
          </div>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '10px 10px 0 0', padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: theme.textMuted }}>
            TeamSnap
          </div>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '10px 10px 0 0', padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: theme.textMuted }}>
            SportsEngine
          </div>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '10px 10px 0 0', padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: theme.textMuted }}>
            PlayMetrics
          </div>
        </div>

        {categories.map((cat, ci) => (
          <div key={cat} style={{ minWidth: 880 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 145px 145px 145px', gap: 8, marginTop: ci === 0 ? 0 : 20, marginBottom: 4 }}>
              <div style={{ gridColumn: '1 / -1', padding: '6px 4px' }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.16em', margin: 0 }}>{cat}</p>
              </div>
            </div>
            {rows.filter(r => r.category === cat).map((row) => (
              <div key={row.feature} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 145px 145px 145px', gap: 8, marginBottom: 4 }}>
                {/* Feature name */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 8px 12px 4px' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, margin: 0, lineHeight: 1.3 }}>{row.feature}</p>
                </div>
                {/* Pulse */}
                <div style={{ background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Dot value={row.pulse} />
                  <p style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5, margin: 0 }}>{row.pulseNote}</p>
                </div>
                {/* TeamSnap */}
                <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <Dot value={row.teamsnap} />
                  <p style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.4, margin: 0 }}>{row.teamsnapNote}</p>
                </div>
                {/* SportsEngine */}
                <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <Dot value={row.sportsengine} />
                  <p style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.4, margin: 0 }}>{row.sportsengineNote}</p>
                </div>
                {/* PlayMetrics */}
                <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <Dot value={row.playmetrics} />
                  <p style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.4, margin: 0 }}>{row.playmetricsNote}</p>
                </div>
              </div>
            ))}
          </div>
        ))}

        <p style={{ fontSize: 11, color: theme.textMuted, textAlign: 'center', margin: '16px 0 0', lineHeight: 1.6, minWidth: 880 }}>
          PlayMetrics features sourced from their public site as of 2026 — this comparison is about fit, not quality. They&apos;re a well-reviewed platform.
        </p>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '24px 0 0', flexWrap: 'wrap', minWidth: 880 }}>
          {[
            { color: theme.green, bg: theme.greenTint, label: 'Yes / available', icon: '✓' },
            { color: '#B8842A', bg: '#FBF3E4', label: 'Partial / limited', icon: '—' },
            { color: '#C0392B', bg: '#FBEBEA', label: 'Not available', icon: '✗' },
          ].map(({ color, bg, label, icon }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color, fontWeight: 900 }}>{icon}</div>
              <span style={{ fontSize: 12, color: theme.textMuted }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* The verdict */}
      <div style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface, padding: '64px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, color: theme.text, letterSpacing: '-0.3px', marginBottom: 20, lineHeight: 1.1, fontFamily: theme.fontDisplay }}>
            The honest verdict
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, textAlign: 'left', marginTop: 36 }}>
            {[
              {
                name: 'Pulse FC',
                color: theme.greenDark,
                border: `1px solid ${theme.greenTintBorder}`,
                bg: theme.greenTint,
                points: [
                  'Built for soccer clubs — not generic sports',
                  'AI cuts setup from hours to minutes',
                  'Instant change alerts — nobody at the wrong field',
                  'Full tryout management — forms, offers, tracking',
                  'Guest player management across teams',
                  'Free to start — no credit card needed',
                  'Built by a coach who still uses it every weekend',
                ],
              },
              {
                name: 'TeamSnap',
                color: theme.textMuted,
                border: `1px solid ${theme.border}`,
                bg: theme.bg,
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
                color: theme.textMuted,
                border: `1px solid ${theme.border}`,
                bg: theme.bg,
                points: [
                  'Built for leagues and state associations',
                  'No AI features',
                  'Starts at $79/mo — expensive for a club',
                  'Ads in the parent app',
                  'Complex setup — days, not minutes',
                  'NBC Sports owned, not coach-led',
                ],
              },
              {
                name: 'PlayMetrics',
                color: theme.textMuted,
                border: `1px solid ${theme.border}`,
                bg: theme.bg,
                points: [
                  'Genuinely capable multi-sport club ops platform',
                  'No AI features found',
                  'Strong tryouts, evaluations, guest players',
                  'No public pricing — sales call for a quote',
                  'No free plan or trial found',
                  'Not soccer-specific, not coach-founded',
                ],
              },
            ].map(({ name, color, border, bg, points }) => (
              <div key={name} style={{ background: bg, border, borderRadius: 16, padding: '24px 20px' }}>
                <p style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{name}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {points.map(p => (
                    <div key={p} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color, fontWeight: 900, fontSize: 11, marginTop: 1, flexShrink: 0 }}>·</span>
                      <span style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.4 }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deep dives */}
      <div style={{ borderTop: `1px solid ${theme.border}`, padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 20 }}>Want the deep dive?</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { href: '/pulse-fc-vs-teamsnap', label: 'Pulse FC vs TeamSnap' },
            { href: '/pulse-fc-vs-sportsengine', label: 'Pulse FC vs SportsEngine' },
            { href: '/pulse-fc-vs-playmetrics', label: 'Pulse FC vs PlayMetrics' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, textDecoration: 'none', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 18px' }}>
              {label} →
            </Link>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

          {/* Founder note — real, not a fabricated customer testimonial */}
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 20, padding: '28px 32px', marginBottom: 48, textAlign: 'left', boxShadow: theme.shadowCard }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>From the founder</p>
            <p style={{ fontSize: 16, color: theme.text, lineHeight: 1.8, fontWeight: 500, marginBottom: 0 }}>
              I built Pulse FC because I was the coach losing track of who was coming to Saturday&apos;s game. It&apos;s not a VC pitch deck turned into an app — it&apos;s the tool I actually needed, now open for any club to use.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: theme.green, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>RB</div>
              <p style={{ fontSize: 12, color: theme.textMuted, margin: 0 }}>Rick Breheny · Founder, Pulse FC · U14 head coach</p>
            </div>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}`, borderRadius: 100, padding: '5px 14px', fontSize: 11, fontWeight: 700, color: theme.greenDark, marginBottom: 24, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.green, display: 'inline-block' }} />
            Founding club pricing
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 4.2vw, 40px)', fontWeight: 700, color: theme.text, letterSpacing: '-0.3px', lineHeight: 1.1, marginBottom: 16, fontFamily: theme.fontDisplay }}>
            The math is simple.<br />Stop waiting.
          </h2>
          <p style={{ fontSize: 16, color: theme.textSecondary, lineHeight: 1.7, marginBottom: 32 }}>
            Set up tonight, free, no card required. Paid plans activate once we&rsquo;re in touch — never a surprise charge.
          </p>
          <Link href="/onboarding" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: theme.green, color: '#fff', fontWeight: 800, fontSize: 16, padding: '16px 36px', borderRadius: 14, textDecoration: 'none', boxShadow: theme.shadowBtn }}>
            Set up your club tonight →
          </Link>
          <p style={{ fontSize: 12, color: theme.greenDark, marginTop: 16, fontWeight: 600 }}>
            Founding club: 40% off any paid plan, forever, while we onboard our first clubs directly
          </p>
          <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>Free plan available · No credit card · Cancel anytime</p>
          <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 12 }}>Built by Rick Breheny · U14 head coach · still used every Saturday.</p>
        </div>
      </div>

      {/* Footer — cross-links to the deep-dive comparison pages, so not the shared Footer */}
      <footer style={{ borderTop: `1px solid ${theme.border}`, padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto', flexWrap: 'wrap', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
        <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto' }} />
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/pulse-fc-vs-teamsnap" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>vs TeamSnap</Link>
          <Link href="/pulse-fc-vs-sportsengine" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>vs SportsEngine</Link>
          <Link href="/pulse-fc-vs-playmetrics" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>vs PlayMetrics</Link>
          <Link href="/pricing" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>Pricing</Link>
          <Link href="/privacy" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>Terms</Link>
          <Link href="/dashboard" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>Log in</Link>
        </div>
      </footer>
    </div>
  );
}
