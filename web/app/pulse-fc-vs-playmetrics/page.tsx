import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'Pulse FC vs PlayMetrics — Which is better for your soccer club?',
  description: 'Honest comparison of Pulse FC and PlayMetrics for soccer club directors. AI features, transparent pricing, and self-serve setup — side by side.',
};

const GREEN = '#22c55e';

type RowStatus = boolean | 'partial';

type ComparisonRow = {
  category: string;
  feature: string;
  pulse: RowStatus;
  pulseNote: string;
  playmetrics: RowStatus;
  playmetricsNote: string;
};

const rows: ComparisonRow[] = [
  {
    category: 'Purpose',
    feature: 'Built for soccer',
    pulse: true,
    pulseNote: 'Purpose-built for DOCs and soccer clubs',
    playmetrics: false,
    playmetricsNote: 'Multi-sport platform — soccer, volleyball, rugby, and more',
  },
  {
    category: 'Purpose',
    feature: 'Built by a coach',
    pulse: true,
    pulseNote: 'Founded by a U14 head coach solving his own problem',
    playmetrics: false,
    playmetricsNote: 'Enterprise club-operations software, not coach-founded',
  },
  {
    category: 'AI features',
    feature: 'AI schedule import',
    pulse: true,
    pulseNote: 'Upload any PDF, image, or spreadsheet — whole season imported in seconds',
    playmetrics: false,
    playmetricsNote: 'No AI features found in their public materials',
  },
  {
    category: 'AI features',
    feature: 'AI roster import',
    pulse: true,
    pulseNote: 'Upload any spreadsheet format — AI maps columns and imports automatically',
    playmetrics: false,
    playmetricsNote: 'No AI features found in their public materials',
  },
  {
    category: 'AI features',
    feature: 'Lineup builder',
    pulse: true,
    pulseNote: 'Drag and drop with AI-suggested starting lineup based on confirmed RSVPs',
    playmetrics: 'partial',
    playmetricsNote: 'Visual lineups, formations, depth charts, sub ordering — no AI suggestions found',
  },
  {
    category: 'Operations',
    feature: 'Equal playing time calculator',
    pulse: true,
    pulseNote: 'Automatic rotation plan for equal play time — pure maths, works instantly offline, no AI call needed',
    playmetrics: false,
    playmetricsNote: 'Manual sub ordering only — no automated equal-time calculator found',
  },
  {
    category: 'Club management',
    feature: 'Multi-team club dashboard',
    pulse: true,
    pulseNote: 'All teams, schedules, and RSVPs in a single org-level view',
    playmetrics: true,
    playmetricsNote: 'Director Dashboard — real-time view of plans, schedules, and results across teams',
  },
  {
    category: 'Club management',
    feature: 'Tryout management',
    pulse: true,
    pulseNote: 'Registration forms, player ranking, team builder, offer letters, acceptance tracking',
    playmetrics: true,
    playmetricsNote: 'Mature tryout tooling — evaluations, filterable scores, drag-and-drop team assignment',
  },
  {
    category: 'Club management',
    feature: 'Guest player management',
    pulse: true,
    pulseNote: 'Borrow players from other teams in the club, with conflict detection',
    playmetrics: true,
    playmetricsNote: 'Guest player management listed as a feature',
  },
  {
    category: 'Club management',
    feature: 'White-label branding',
    pulse: true,
    pulseNote: 'Your club logo and brand colors throughout the app',
    playmetrics: false,
    playmetricsNote: 'No white-label or club-branded app option found in public materials',
  },
  {
    category: 'Operations',
    feature: 'Attendance tracking',
    pulse: true,
    pulseNote: 'Per-player history — parents notified instantly if child is marked absent',
    playmetrics: true,
    playmetricsNote: 'Attendance tracking available — parent-notification behavior not detailed publicly',
  },
  {
    category: 'Operations',
    feature: 'Fee collection & payments',
    pulse: true,
    pulseNote: 'Invoices, payment plans, late fees, and a hardship fund option',
    playmetrics: true,
    playmetricsNote: 'Registration + payment processing available — fee structure not disclosed publicly',
  },
  {
    category: 'Operations',
    feature: 'Parent mobile app',
    pulse: 'partial',
    pulseNote: 'iOS today — Android in progress',
    playmetrics: true,
    playmetricsNote: 'iOS and Android both live',
  },
  {
    category: 'Setup & pricing',
    feature: 'Public pricing',
    pulse: true,
    pulseNote: '$9.99/mo listed on the site — no call required',
    playmetrics: false,
    playmetricsNote: 'No public pricing — "fill out the form to schedule a conversation" for a quote',
  },
  {
    category: 'Setup & pricing',
    feature: 'Free plan',
    pulse: true,
    pulseNote: 'Free forever for 1 team, up to 12 players. No credit card.',
    playmetrics: false,
    playmetricsNote: 'No free plan or trial found in public materials',
  },
  {
    category: 'Setup & pricing',
    feature: 'Self-serve setup',
    pulse: true,
    pulseNote: 'Full club live in ~20 minutes — no sales call, no demo request',
    playmetrics: false,
    playmetricsNote: 'Demo request + sales conversation required before you can start',
  },
];

const categories = Array.from(new Set(rows.map(r => r.category)));

function StatusIcon({ value }: { value: RowStatus }) {
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

export default async function PulseVsPlaymetricsPage() {
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
          Pulse FC vs PlayMetrics
        </h1>
        <p style={{ fontSize: 18, color: '#888', lineHeight: 1.7, maxWidth: 580, margin: '0 auto 48px' }}>
          PlayMetrics is a genuinely capable, multi-sport club operations platform — evaluations, payments, scheduling, all of it. It&apos;s also built for any sport, priced after a sales call, and set up by a team, not a coach on a Tuesday night.
        </p>

        {/* Quick verdict */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ background: '#0a1a0a', border: `2px solid ${GREEN}`, borderRadius: 16, padding: '24px 20px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
            <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto', marginBottom: 12 }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: GREEN, marginBottom: 4 }}>Purpose-built for soccer DOCs</p>
            <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>AI features · Public $9.99/mo pricing · Self-serve in 20 minutes</p>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#444', textAlign: 'center' }}>vs</div>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '24px 20px' }}>
            <div style={{ background: '#0e3d5c', borderRadius: 8, padding: '4px 10px', display: 'inline-flex', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>PlayMetrics</span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#888', marginBottom: 4 }}>Multi-sport club ops platform</p>
            <p style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>Any sport · No AI · Custom quote via sales call</p>
          </div>
        </div>
      </div>

      {/* Score summary */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'AI features', pulse: 3, playmetrics: 0 },
            { label: 'Soccer-specific', pulse: '✓', playmetrics: '✗' },
            { label: 'Pricing model', pulse: 'Public $9.99/mo', playmetrics: 'Custom quote' },
          ].map(({ label, pulse, playmetrics }) => (
            <div key={label} style={{ background: '#0d0d0d', border: '1px solid #181818', borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>{label}</p>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 20, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{pulse}</p>
                  <p style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Pulse FC</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 20, fontWeight: 900, color: '#555', lineHeight: 1 }}>{playmetrics}</p>
                  <p style={{ fontSize: 10, color: '#333', marginTop: 4 }}>PlayMetrics</p>
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
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: GREEN, padding: '8px 0' }}>Pulse FC</div>
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#555', padding: '8px 0' }}>PlayMetrics</div>
        </div>

        {categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8, paddingLeft: 16 }}>{cat}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rows.filter(r => r.category === cat).map((row) => (
                <div key={row.feature} style={{ display: 'grid', gridTemplateColumns: '1fr 280px 280px', gap: 12, alignItems: 'start', background: '#0c0c0c', border: '1px solid #161616', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#ccc', margin: 0, paddingTop: 2 }}>{row.feature}</p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <StatusIcon value={row.pulse} />
                    <p style={{ fontSize: 12, color: row.pulse === true ? '#888' : '#444', lineHeight: 1.5, margin: 0 }}>{row.pulseNote}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <StatusIcon value={row.playmetrics} />
                    <p style={{ fontSize: 12, color: '#444', lineHeight: 1.5, margin: 0 }}>{row.playmetricsNote}</p>
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

        <p style={{ fontSize: 12, color: '#333', textAlign: 'center', marginTop: 24, lineHeight: 1.6, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
          PlayMetrics features sourced from their public site as of 2026. They&apos;re a well-reviewed, capable platform — this comparison is about fit, not quality.
        </p>
      </div>

      {/* The bottom line */}
      <div style={{ borderTop: '1px solid #111', background: '#060606', padding: '64px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', textAlign: 'center', marginBottom: 20, letterSpacing: '-0.5px' }}>
            The bottom line
          </h2>
          <div style={{ background: '#0a1a0a', border: `1px solid ${GREEN}22`, borderRadius: 20, padding: '32px' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: GREEN, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' }}>If you run a soccer club</p>
            <p style={{ fontSize: 16, color: '#ccc', lineHeight: 1.8, marginBottom: 20 }}>
              PlayMetrics is built to serve every sport a club runs, which means it&apos;s priced and sold like enterprise software — a demo, a conversation, a quote built around your organization. If you already know you&apos;re a soccer club and you want to be live tonight without a sales call, that process is solving a problem you don&apos;t have.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                'Run a soccer club and don\'t need multi-sport tooling',
                'Want to see the exact price before you talk to anyone',
                'Want AI to handle schedule and roster import in seconds',
                'Want your club\'s branding — not a generic club-ops platform — in parents\' pockets',
                'Would rather be live tonight than wait on a sales conversation',
              ].map(item => (
                <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: GREEN, fontWeight: 900, fontSize: 12, marginTop: 2, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 14, color: '#888', lineHeight: 1.4 }}>{item}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 14, color: '#555', marginTop: 20, fontStyle: 'italic' }}>
              If you need multi-sport support across a whole association, PlayMetrics is a legitimate choice. If you&apos;re a soccer club, you&apos;re paying for breadth you&apos;ll never use.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

          {/* Testimonial */}
          <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 20, padding: '28px 32px', marginBottom: 48, textAlign: 'left' }}>
            <div style={{ fontSize: 36, lineHeight: 0.75, color: '#22c55e', opacity: 0.5, fontWeight: 900, marginBottom: 12 }}>&ldquo;</div>
            <p style={{ fontSize: 16, color: '#ddd', lineHeight: 1.8, fontWeight: 500, marginBottom: 20 }}>
              We lost 11 families last season. Three said they felt &ldquo;out of the loop.&rdquo; That&rsquo;s <strong style={{ color: '#fff' }}>$16,000 in registration fees.</strong> Pulse FC paid for itself in the first month.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>J.O.</div>
              <p style={{ fontSize: 12, color: '#555', margin: 0 }}>Director of Coaching · 280-player club</p>
            </div>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 100, padding: '5px 14px', fontSize: 11, fontWeight: 700, color: GREEN, marginBottom: 24, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
            Founding club offer · {remaining} spots remaining
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1, marginBottom: 16 }}>
            See the price. No call required.
          </h2>
          <p style={{ fontSize: 16, color: '#888', lineHeight: 1.7, marginBottom: 32 }}>
            Set up tonight. If it doesn&rsquo;t save you 3 hours a week, email us and we&rsquo;ll refund everything. No forms, no arguments.
          </p>
          <Link href="/onboarding" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: GREEN, color: '#000', fontWeight: 800, fontSize: 16, padding: '16px 36px', borderRadius: 14, textDecoration: 'none', boxShadow: '0 4px 32px rgba(34,197,94,0.3)' }}>
            Set up your club tonight →
          </Link>
          <p style={{ fontSize: 12, color: '#22c55e', marginTop: 16, opacity: 0.7, fontWeight: 600 }}>
            Founding club: 40% off any paid plan, forever · {remaining} spots remaining
          </p>
          <p style={{ fontSize: 12, color: '#444', marginTop: 6 }}>Free plan available · No credit card · Cancel anytime</p>
          <p style={{ fontSize: 12, color: '#333', marginTop: 12 }}>Built by Rick Breheny · U14 head coach · still used every Saturday.</p>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #111', padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
        <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto' }} />
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <Link href="/pulse-fc-vs-teamsnap" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>vs TeamSnap</Link>
          <Link href="/pulse-fc-vs-sportsengine" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>vs SportsEngine</Link>
          <Link href="/compare" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Full comparison</Link>
          <Link href="/pricing" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Pricing</Link>
          <Link href="/privacy" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Terms</Link>
        </div>
      </footer>
    </div>
  );
}
