import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'Dugout FC vs SportsEngine — Which is better for your soccer club?',
  description: 'Honest comparison of Dugout FC and SportsEngine for Directors of Coaching and soccer club administrators. AI features, pricing, and multi-team management.',
};

const GREEN = '#22c55e';

type RowStatus = boolean | 'partial';

type ComparisonRow = {
  category: string;
  feature: string;
  dugout: RowStatus;
  dugoutNote: string;
  sportsengine: RowStatus;
  sportsengineNote: string;
};

const rows: ComparisonRow[] = [
  {
    category: 'Purpose',
    feature: 'Built for soccer',
    dugout: true,
    dugoutNote: 'Purpose-built for DOCs and soccer clubs',
    sportsengine: false,
    sportsengineNote: 'Generic platform for any sport — hockey, basketball, football, etc.',
  },
  {
    category: 'Purpose',
    feature: 'Built by a coach',
    dugout: true,
    dugoutNote: 'Founded by a U14 head coach solving his own problem',
    sportsengine: false,
    sportsengineNote: 'Owned by NBC Sports. No coaching background in leadership.',
  },
  {
    category: 'AI features',
    feature: 'AI schedule import',
    dugout: true,
    dugoutNote: 'Upload any PDF, image, or spreadsheet — whole season imported in seconds',
    sportsengine: false,
    sportsengineNote: 'Manual entry only. No AI tools of any kind.',
  },
  {
    category: 'AI features',
    feature: 'AI roster import',
    dugout: true,
    dugoutNote: 'Upload any spreadsheet format — AI maps columns and imports automatically',
    sportsengine: false,
    sportsengineNote: 'No AI-powered import. Manual entry or fixed CSV format.',
  },
  {
    category: 'AI features',
    feature: 'AI lineup builder',
    dugout: true,
    dugoutNote: 'Drag and drop with AI-suggested starting lineup based on confirmed RSVPs',
    sportsengine: false,
    sportsengineNote: 'No lineup builder. Not available on any plan.',
  },
  {
    category: 'AI features',
    feature: 'AI substitution planner',
    dugout: true,
    dugoutNote: 'Automated rotation plan for equal play time, formatted for the sideline',
    sportsengine: false,
    sportsengineNote: 'Not available.',
  },
  {
    category: 'Club management',
    feature: 'Multi-team dashboard',
    dugout: true,
    dugoutNote: 'All teams, schedules, and RSVPs in a single org-level view',
    sportsengine: 'partial',
    sportsengineNote: 'Club-level dashboard available but designed for leagues and associations — complex for a single club.',
  },
  {
    category: 'Club management',
    feature: 'Tryout management',
    dugout: true,
    dugoutNote: 'Registration forms, player ranking, team builder, offer letters, acceptance tracking',
    sportsengine: false,
    sportsengineNote: 'No tryout module on any plan.',
  },
  {
    category: 'Club management',
    feature: 'White-label branding',
    dugout: true,
    dugoutNote: 'Your club logo and brand colors throughout the app',
    sportsengine: false,
    sportsengineNote: 'SportsEngine branding always visible. No white-label option.',
  },
  {
    category: 'Communication',
    feature: 'RSVP system',
    dugout: true,
    dugoutNote: 'Attending or Not Attending only — no maybes. Auto-locks before game time.',
    sportsengine: 'partial',
    sportsengineNote: 'Basic availability tracking but not a dedicated RSVP system with lock dates.',
  },
  {
    category: 'Communication',
    feature: 'Real-time team chat',
    dugout: true,
    dugoutNote: 'Group chat, announcements (coach-only posts), and 1:1 direct messages',
    sportsengine: true,
    sportsengineNote: 'Team messaging available in the mobile app.',
  },
  {
    category: 'Communication',
    feature: 'Push notifications',
    dugout: true,
    dugoutNote: 'RSVP reminders, schedule changes, new messages, announcements',
    sportsengine: true,
    sportsengineNote: 'Push notifications available.',
  },
  {
    category: 'Communication',
    feature: 'Email team via platform',
    dugout: true,
    dugoutNote: 'Email entire team or selected parents directly from announcements',
    sportsengine: true,
    sportsengineNote: 'Email available.',
  },
  {
    category: 'Operations',
    feature: 'Fee collection',
    dugout: true,
    dugoutNote: 'Send invoices, record payments, track who owes what',
    sportsengine: true,
    sportsengineNote: 'Payment processing available. Note: transaction fees apply on top of monthly plan.',
  },
  {
    category: 'Operations',
    feature: 'Attendance tracking',
    dugout: true,
    dugoutNote: 'Per-player attendance history and percentage per event',
    sportsengine: true,
    sportsengineNote: 'Attendance tracking available.',
  },
  {
    category: 'Operations',
    feature: 'Parent mobile app',
    dugout: true,
    dugoutNote: 'iOS app — parents download once and see all team info',
    sportsengine: 'partial',
    sportsengineNote: 'iOS and Android available but the app contains intrusive ads unless removed via a paid upgrade.',
  },
  {
    category: 'Setup & pricing',
    feature: 'Free plan',
    dugout: true,
    dugoutNote: 'Free forever for 1 team up to 12 players. No credit card.',
    sportsengine: false,
    sportsengineNote: 'No free plan. Starts at $79/mo (Express). Free trial only.',
  },
  {
    category: 'Setup & pricing',
    feature: 'Starting price',
    dugout: true,
    dugoutNote: 'Free → $9.99/mo (Team Pro) → $49/mo (Starter). No surprise fees.',
    sportsengine: false,
    sportsengineNote: '$79/mo (Express), $129/mo (Premium), or $2,199/yr (Pro). Plus transaction fees.',
  },
  {
    category: 'Setup & pricing',
    feature: 'Setup time',
    dugout: true,
    dugoutNote: 'Full club live in ~20 minutes. AI handles schedule and roster import.',
    sportsengine: false,
    sportsengineNote: 'Manual data entry required. Complex multi-team setup can take days.',
  },
];

const categories = Array.from(new Set(rows.map(r => r.category)));

function StatusIcon({ value }: { value: boolean | 'partial' }) {
  if (value === true) {
    return (
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0e2016', border: '1px solid #22c55e30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
          <path d="M1 4.5l3 3 7-7" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }
  if (value === 'partial') {
    return (
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1a1400', border: '1px solid #f59e0b30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
          <path d="M1 1h8" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1a0808', border: '1px solid #ef444430', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 2l6 6M8 2l-6 6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

export const revalidate = 3600;

export default async function ComparisonPage() {
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
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '72px 24px 48px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 100, padding: '6px 16px', fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 28, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Honest comparison
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1.05, marginBottom: 20, color: '#fff' }}>
          Dugout FC vs SportsEngine
        </h1>
        <p style={{ fontSize: 18, color: '#888', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 48px' }}>
          SportsEngine is built for leagues and state associations. Dugout FC is built for soccer clubs — with AI that handles the admin that eats your evenings.
        </p>

        {/* Quick verdict */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ background: '#0a1a0a', border: `2px solid ${GREEN}`, borderRadius: 16, padding: '24px 20px' }}>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', marginBottom: 12 }}>
              <img src="/Signature.jpg" alt="Dugout FC" style={{ height: '18px', width: 'auto' }} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: GREEN, marginBottom: 4 }}>Built for soccer clubs</p>
            <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>AI features · Free plan · Tryout management · 20-min setup</p>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#444', textAlign: 'center' }}>vs</div>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '24px 20px' }}>
            <div style={{ background: '#e8521a', borderRadius: 8, padding: '4px 10px', display: 'inline-flex', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>SportsEngine</span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#888', marginBottom: 4 }}>Enterprise league software</p>
            <p style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>Any sport · Starts at $79/mo · No AI · Complex setup</p>
          </div>
        </div>
      </div>

      {/* Score summary */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'AI features', dugout: 4, sportsengine: 0 },
            { label: 'Starting price', dugout: 'Free', sportsengine: '$79/mo' },
            { label: 'Free plan', dugout: '✓', sportsengine: '✗' },
          ].map(({ label, dugout, sportsengine }) => (
            <div key={label} style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>{label}</p>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{dugout}</p>
                  <p style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Dugout FC</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#555', lineHeight: 1 }}>{sportsengine}</p>
                  <p style={{ fontSize: 10, color: '#333', marginTop: 4 }}>SportsEngine</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison table */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', textAlign: 'center', marginBottom: 40, letterSpacing: '-0.5px' }}>
          Feature by feature
        </h2>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px 280px', gap: 12, marginBottom: 8, padding: '0 0 0 16px' }}>
          <div />
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: GREEN, padding: '8px 0' }}>Dugout FC</div>
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#555', padding: '8px 0' }}>SportsEngine</div>
        </div>

        {categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8, paddingLeft: 16 }}>{cat}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rows.filter(r => r.category === cat).map((row) => (
                <div key={row.feature} style={{ display: 'grid', gridTemplateColumns: '1fr 280px 280px', gap: 12, alignItems: 'start', background: '#0c0c0c', border: '1px solid #161616', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#ccc', margin: 0, paddingTop: 2 }}>{row.feature}</p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <StatusIcon value={row.dugout} />
                    <p style={{ fontSize: 12, color: row.dugout === true ? '#888' : '#444', lineHeight: 1.5, margin: 0 }}>{row.dugoutNote}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <StatusIcon value={row.sportsengine} />
                    <p style={{ fontSize: 12, color: '#444', lineHeight: 1.5, margin: 0 }}>{row.sportsengineNote}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '8px 0 0', flexWrap: 'wrap' }}>
          {[
            { icon: '✓', color: GREEN, bg: '#0e2016', label: 'Yes / available' },
            { icon: '—', color: '#f59e0b', bg: '#1a1400', label: 'Partial / limited' },
            { icon: '✗', color: '#ef4444', bg: '#1a0808', label: 'Not available' },
          ].map(({ icon, color, bg, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color, fontWeight: 900 }}>{icon}</div>
              <span style={{ fontSize: 12, color: '#555' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Who should use what */}
      <div style={{ borderTop: '1px solid #111', background: '#060606', padding: '64px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', textAlign: 'center', marginBottom: 12, letterSpacing: '-0.5px' }}>
            Which one is right for you?
          </h2>
          <p style={{ fontSize: 15, color: '#888', textAlign: 'center', marginBottom: 48, lineHeight: 1.6 }}>
            SportsEngine is built for state associations running hundreds of teams. Dugout FC is built for the club that just needs to run well.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ background: '#0a1a0a', border: `1px solid ${GREEN}22`, borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: GREEN, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Choose Dugout FC if you…</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Run a soccer club with multiple teams',
                  'Spend too many evenings on admin',
                  'Want AI to handle schedule and roster import',
                  'Need tryout management built in',
                  'Want your club\'s branding, not theirs',
                  'Don\'t want parents seeing ads in the app',
                  'Can\'t justify $79–$129/mo for basic features',
                  'Want a platform built by a coach who uses it too',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ color: GREEN, fontWeight: 900, fontSize: 12, marginTop: 2, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 13, color: '#888', lineHeight: 1.4 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#555', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' }}>SportsEngine might suit you if…</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'You run a state association or large league',
                  'You manage hundreds of teams across multiple sports',
                  'You need league-wide registration and eligibility checks',
                  'You\'re already deeply integrated with their platform',
                  'Your organisation mandates it top-down',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ color: '#444', fontWeight: 900, fontSize: 12, marginTop: 2, flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: 13, color: '#555', lineHeight: 1.4 }}>{item}</span>
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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 100, padding: '5px 14px', fontSize: 11, fontWeight: 700, color: GREEN, marginBottom: 24, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Founding club offer · {remaining} spots remaining
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1, marginBottom: 16 }}>
            Try it free for 30 days.
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
          <p style={{ fontSize: 12, color: '#444', marginTop: 6 }}>
            Free plan available · No credit card · Cancel anytime
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #111', padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: '4px 10px', display: 'inline-flex', alignItems: 'center' }}>
          <img src="/Signature.jpg" alt="Dugout FC" style={{ height: '22px', width: 'auto' }} />
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <Link href="/dugout-vs-teamsnap" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>vs TeamSnap</Link>
          <Link href="/pricing" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Pricing</Link>
          <Link href="/privacy" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Terms</Link>
        </div>
      </footer>

    </div>
  );
}
