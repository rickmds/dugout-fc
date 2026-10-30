import Link from 'next/link';
import type { Metadata } from 'next';
import NavBar from '@/components/NavBar';
import { theme } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Pulse FC vs SportsEngine — Which is better for your soccer club?',
  description: 'Honest comparison of Pulse FC and SportsEngine for soccer club directors. AI features, pricing transparency, and why SportsEngine is built for leagues, not clubs.',
};

type RowStatus = boolean | 'partial';

type ComparisonRow = {
  category: string;
  feature: string;
  pulse: RowStatus;
  pulseNote: string;
  sportsengine: RowStatus;
  sportsengineNote: string;
};

const rows: ComparisonRow[] = [
  {
    category: 'Purpose',
    feature: 'Built for soccer',
    pulse: true,
    pulseNote: 'Purpose-built for DOCs and soccer clubs',
    sportsengine: false,
    sportsengineNote: 'Generic platform for any sport — hockey, basketball, football, etc.',
  },
  {
    category: 'Purpose',
    feature: 'Built by a coach',
    pulse: true,
    pulseNote: 'Founded by a U14 head coach solving his own problem',
    sportsengine: false,
    sportsengineNote: 'Owned by NBC Sports. No coaching background in leadership.',
  },
  {
    category: 'AI features',
    feature: 'AI schedule import',
    pulse: true,
    pulseNote: 'Upload any PDF, image, or spreadsheet — whole season imported in seconds',
    sportsengine: false,
    sportsengineNote: 'Manual entry only. No AI tools of any kind.',
  },
  {
    category: 'AI features',
    feature: 'AI roster import',
    pulse: true,
    pulseNote: 'Upload any spreadsheet format — AI maps columns and imports automatically',
    sportsengine: false,
    sportsengineNote: 'No AI-powered import. Manual entry or fixed CSV format.',
  },
  {
    category: 'AI features',
    feature: 'AI lineup builder',
    pulse: true,
    pulseNote: 'Drag and drop with AI-suggested starting lineup based on confirmed RSVPs',
    sportsengine: false,
    sportsengineNote: 'No lineup builder. Not available on any plan.',
  },
  {
    category: 'Operations',
    feature: 'Equal playing time calculator',
    pulse: true,
    pulseNote: 'Automatic rotation plan for equal play time — pure maths, works instantly offline, no AI call needed',
    sportsengine: false,
    sportsengineNote: 'Not available.',
  },
  {
    category: 'Club management',
    feature: 'Multi-team dashboard',
    pulse: true,
    pulseNote: 'All teams, schedules, and RSVPs in a single org-level view',
    sportsengine: 'partial',
    sportsengineNote: 'Club-level dashboard exists but designed for leagues — complex for a single club.',
  },
  {
    category: 'Club management',
    feature: 'Tryout management',
    pulse: true,
    pulseNote: 'Registration forms, player ranking, team builder, offer letters, acceptance tracking',
    sportsengine: false,
    sportsengineNote: 'No tryout module on any plan.',
  },
  {
    category: 'Club management',
    feature: 'White-label branding',
    pulse: true,
    pulseNote: 'Your club logo and brand colors throughout the app',
    sportsengine: false,
    sportsengineNote: 'SportsEngine branding always visible. No white-label option.',
  },
  {
    category: 'Communication',
    feature: 'RSVP system',
    pulse: true,
    pulseNote: 'Attending or Not Attending only — no maybes. Auto-locks before game time.',
    sportsengine: 'partial',
    sportsengineNote: 'Basic availability tracking — not a dedicated RSVP system with lock dates.',
  },
  {
    category: 'Communication',
    feature: 'Real-time team chat',
    pulse: true,
    pulseNote: 'Group chat, announcements (coach-only posts), and 1:1 direct messages',
    sportsengine: true,
    sportsengineNote: 'Team messaging available in the mobile app.',
  },
  {
    category: 'Communication',
    feature: 'Push notifications',
    pulse: true,
    pulseNote: 'RSVP reminders, schedule changes, new messages, announcements',
    sportsengine: true,
    sportsengineNote: 'Push notifications available.',
  },
  {
    category: 'Communication',
    feature: 'Automatic change alerts',
    pulse: true,
    pulseNote: 'Time change, location change, or cancellation → instant push to all parents with the exact change highlighted',
    sportsengine: false,
    sportsengineNote: 'No automatic change notifications.',
  },
  {
    category: 'Operations',
    feature: 'Fee collection',
    pulse: true,
    pulseNote: 'Stripe Connect — installment plans, automatic reminders, refunds handled in the app',
    sportsengine: true,
    sportsengineNote: 'Payment processing available — transaction fees apply on top of monthly plan.',
  },
  {
    category: 'Operations',
    feature: 'Attendance tracking',
    pulse: true,
    pulseNote: 'Per-player attendance history — parents notified instantly if child marked absent',
    sportsengine: 'partial',
    sportsengineNote: 'Attendance tracking available — no parent notification if a child is marked absent.',
  },
  {
    category: 'Operations',
    feature: 'Parent mobile app',
    pulse: 'partial',
    pulseNote: 'iOS today, clean with no ads — Android in progress',
    sportsengine: 'partial',
    sportsengineNote: 'iOS and Android available — contains intrusive ads unless removed via paid upgrade.',
  },
  {
    category: 'Operations',
    feature: 'Game scores + season record',
    pulse: true,
    pulseNote: 'Log scores from the sideline via match tracker. Season W/L/D record builds automatically.',
    sportsengine: true,
    sportsengineNote: 'Available — league-focused.',
  },
  {
    category: 'Operations',
    feature: 'Video recordings library',
    pulse: true,
    pulseNote: 'Link any recording to an event — parents get a push notification. All sessions archived in one place.',
    sportsengine: false,
    sportsengineNote: 'Not available.',
  },
  {
    category: 'Operations',
    feature: 'Guest player management',
    pulse: true,
    pulseNote: 'Borrow players from other teams in the club. Conflict detection, G-badge in lineup and match tracker, org admin activity view.',
    sportsengine: false,
    sportsengineNote: 'Not available.',
  },
  {
    category: 'Setup & pricing',
    feature: 'Free plan',
    pulse: true,
    pulseNote: 'Free forever for 1 team up to 12 players. No credit card.',
    sportsengine: false,
    sportsengineNote: 'No free plan. Starts at $79/mo. Free trial only.',
  },
  {
    category: 'Setup & pricing',
    feature: 'Starting price',
    pulse: true,
    pulseNote: 'Free → $9.99/mo (Team Pro) → $49/mo (Starter). No surprise fees.',
    sportsengine: false,
    sportsengineNote: '$79/mo (Express), $129/mo (Premium), or $2,199/yr (Pro). Plus transaction fees.',
  },
  {
    category: 'Setup & pricing',
    feature: 'Setup time',
    pulse: true,
    pulseNote: 'Full club live in ~20 minutes. AI handles schedule and roster import.',
    sportsengine: false,
    sportsengineNote: 'Manual data entry required. Complex multi-team setup can take days.',
  },
];

const categories = Array.from(new Set(rows.map(r => r.category)));

function StatusIcon({ value }: { value: boolean | 'partial' }) {
  if (value === true) {
    return (
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
          <path d="M1 4.5l3 3 7-7" stroke={theme.green} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }
  if (value === 'partial') {
    return (
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#FBF3E4', border: '1px solid #E8C98F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
          <path d="M1 1h8" stroke="#B8842A" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#FBEBEA', border: '1px solid #F0C6C3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 2l6 6M8 2l-6 6" stroke="#C0392B" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

export const revalidate = 3600;

export default function PulseVsSportsEnginePage() {
  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text }}>

      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${theme.border}` }}><NavBar /></div>

      {/* Hero */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '72px 24px 48px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}`, borderRadius: 100, padding: '6px 16px', fontSize: 12, fontWeight: 700, color: theme.greenDark, marginBottom: 28, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Honest comparison
        </div>
        <h1 style={{ fontSize: 'clamp(34px, 5.5vw, 58px)', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.08, marginBottom: 20, color: theme.text, fontFamily: theme.fontDisplay }}>
          Pulse FC vs SportsEngine
        </h1>
        <p style={{ fontSize: 18, color: theme.textSecondary, lineHeight: 1.7, maxWidth: 560, margin: '0 auto 48px' }}>
          SportsEngine is enterprise software for state associations running hundreds of teams. Pulse FC is built for the club that just needs to run well — at a fraction of the cost, with AI built in.
        </p>

        {/* Quick verdict */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ background: theme.greenTint, border: `2px solid ${theme.green}`, borderRadius: 16, padding: '24px 20px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
            <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto', marginBottom: 12 }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: theme.greenDark, marginBottom: 4 }}>Built for soccer clubs</p>
            <p style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>AI features · Free plan · Tryout management · 20-min setup</p>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: theme.textMuted, textAlign: 'center' }}>vs</div>
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: '24px 20px' }}>
            <div style={{ background: '#e8521a', borderRadius: 8, padding: '4px 10px', display: 'inline-flex', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>SportsEngine</span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: theme.textSecondary, marginBottom: 4 }}>Enterprise league software</p>
            <p style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>Any sport · Starts at $79/mo · No AI · Complex setup</p>
          </div>
        </div>
      </div>

      {/* Score summary */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'AI features', pulse: 3, sportsengine: 0 },
            { label: 'Starting price', pulse: 'Free', sportsengine: '$79/mo' },
            { label: 'Free plan', pulse: '✓', sportsengine: '✗' },
          ].map(({ label, pulse, sportsengine }) => (
            <div key={label} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '20px 16px', textAlign: 'center', boxShadow: theme.shadowCard }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>{label}</p>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 900, color: theme.green, lineHeight: 1 }}>{pulse}</p>
                  <p style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>Pulse FC</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 900, color: theme.textMuted, lineHeight: 1 }}>{sportsengine}</p>
                  <p style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>SportsEngine</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison table */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: theme.text, textAlign: 'center', marginBottom: 40, letterSpacing: '-0.3px', fontFamily: theme.fontDisplay }}>
          Feature by feature
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px 280px', gap: 12, marginBottom: 8, padding: '0 0 0 16px' }}>
          <div />
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: theme.greenDark, padding: '8px 0' }}>Pulse FC</div>
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: theme.textMuted, padding: '8px 0' }}>SportsEngine</div>
        </div>

        {categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8, paddingLeft: 16 }}>{cat}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rows.filter(r => r.category === cat).map((row) => (
                <div key={row.feature} style={{ display: 'grid', gridTemplateColumns: '1fr 280px 280px', gap: 12, alignItems: 'start', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: theme.textSecondary, margin: 0, paddingTop: 2 }}>{row.feature}</p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <StatusIcon value={row.pulse} />
                    <p style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5, margin: 0 }}>{row.pulseNote}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <StatusIcon value={row.sportsengine} />
                    <p style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5, margin: 0 }}>{row.sportsengineNote}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '8px 0 0', flexWrap: 'wrap' }}>
          {[
            { icon: '✓', color: theme.green, bg: theme.greenTint, label: 'Yes / available' },
            { icon: '—', color: '#B8842A', bg: '#FBF3E4', label: 'Partial / limited' },
            { icon: '✗', color: '#C0392B', bg: '#FBEBEA', label: 'Not available' },
          ].map(({ icon, color, bg, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color, fontWeight: 900 }}>{icon}</div>
              <span style={{ fontSize: 12, color: theme.textMuted }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Which one */}
      <div style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface, padding: '64px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: theme.text, textAlign: 'center', marginBottom: 12, letterSpacing: '-0.3px', fontFamily: theme.fontDisplay }}>
            Which one is right for you?
          </h2>
          <p style={{ fontSize: 15, color: theme.textSecondary, textAlign: 'center', marginBottom: 48, lineHeight: 1.6 }}>
            SportsEngine is built for state associations running hundreds of teams across multiple sports. Pulse FC is built for the club that just needs to run well.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}`, borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: theme.greenDark, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Choose Pulse FC if you…</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Run a soccer club with multiple teams',
                  'Spend too many evenings on admin',
                  'Want AI to handle schedule and roster import',
                  'Need tryout management built in',
                  'Want your club\'s branding — not SportsEngine\'s — in parents\' pockets',
                  'Don\'t want parents seeing ads in the app',
                  'Can\'t justify $79–$129/mo for basics a $9.99 plan covers',
                  'Want a platform built by a coach who still uses it weekly',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ color: theme.green, fontWeight: 900, fontSize: 12, marginTop: 2, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.4 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' }}>SportsEngine might suit you if…</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'You run a state association or governing body',
                  'You manage hundreds of teams across multiple sports',
                  'You need league-wide registration and eligibility management',
                  'Your organisation mandates the platform top-down',
                  'You\'re already deeply integrated with their infrastructure',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ color: theme.textMuted, fontWeight: 900, fontSize: 12, marginTop: 2, flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.4 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

          {/* Founder note — real, not a fabricated customer testimonial */}
          <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 20, padding: '28px 32px', marginBottom: 48, textAlign: 'left', boxShadow: theme.shadowCard }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>From the founder</p>
            <p style={{ fontSize: 16, color: theme.text, lineHeight: 1.8, fontWeight: 500, marginBottom: 0 }}>
              Enterprise league software is built for a different buyer entirely. A single soccer club doesn&apos;t need a sales call to figure out if it can afford to run its season.
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
          <h2 style={{ fontSize: 'clamp(26px, 4.2vw, 42px)', fontWeight: 700, color: theme.text, letterSpacing: '-0.3px', lineHeight: 1.1, marginBottom: 16, fontFamily: theme.fontDisplay }}>
            A soccer club shouldn&rsquo;t pay $79/mo<br />for league software.
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

      {/* Footer — cross-links to sibling comparison pages, so not the shared Footer */}
      <footer style={{ borderTop: `1px solid ${theme.border}`, padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto', flexWrap: 'wrap', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
        <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto' }} />
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/pulse-fc-vs-teamsnap" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>vs TeamSnap</Link>
          <Link href="/pulse-fc-vs-playmetrics" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>vs PlayMetrics</Link>
          <Link href="/compare" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>Full comparison</Link>
          <Link href="/pricing" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>Pricing</Link>
          <Link href="/privacy" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ fontSize: 12, color: theme.textMuted, textDecoration: 'none' }}>Terms</Link>
        </div>
      </footer>
    </div>
  );
}
