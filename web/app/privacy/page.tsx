import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Dugout FC',
  description: 'How Dugout FC collects, uses, and protects your personal data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">
      {/* Nav */}
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between border-b border-[#111] max-w-5xl mx-auto">
        <Link href="/">
          <div style={{ background: '#fff', borderRadius: '10px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center' }}>
            <img src="/Signature.jpg" alt="Dugout FC" style={{ height: '28px', width: 'auto' }} />
          </div>
        </Link>
        <Link href="/" className="text-[#555] text-[13px] hover:text-white transition-colors">← Back</Link>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 sm:px-10 py-16">
        <h1 className="text-4xl font-extrabold text-white mb-3">Privacy Policy</h1>
        <p className="text-[#555] text-sm mb-12">Last updated: 23 June 2026</p>

        <Section title="1. Who we are">
          <p>Dugout FC (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a soccer club management platform. Our platform is available at dugoutfc.app and through our iOS mobile application.</p>
          <p>You can contact us at <a href="mailto:info@dugoutfc.com" className="text-[#22c55e] hover:underline">info@dugoutfc.com</a>.</p>
        </Section>

        <Section title="2. What data we collect">
          <p>We collect the following categories of personal data:</p>
          <ul>
            <li><strong>Account data:</strong> name, email address, and password (or OAuth tokens if you sign in with Google or Apple).</li>
            <li><strong>Profile data:</strong> profile photo, role within your club (coach, parent, player).</li>
            <li><strong>Club and team data:</strong> club name, logo, brand colours, team names, age groups, and season information you enter during setup.</li>
            <li><strong>Player data:</strong> player names, jersey numbers, positions, and date of birth entered by coaches or parents.</li>
            <li><strong>Event data:</strong> schedules, locations, RSVP responses, lineups, and match notes.</li>
            <li><strong>Communications:</strong> messages sent through the in-app chat and announcements.</li>
            <li><strong>Device data:</strong> push notification tokens to deliver notifications to your device.</li>
            <li><strong>Usage data:</strong> anonymised analytics via PostHog to help us improve the product.</li>
          </ul>
        </Section>

        <Section title="3. How we use your data">
          <p>We use your data solely to provide and improve the Dugout FC service:</p>
          <ul>
            <li>To create and manage your account and club.</li>
            <li>To display schedules, rosters, and availability to the correct team members.</li>
            <li>To send push notifications about events, RSVPs, and messages.</li>
            <li>To send transactional emails (invite emails, schedule confirmations) via Resend.</li>
            <li>To power AI features (schedule import, roster import, lineup suggestions) using the Anthropic Claude API. Your data is sent to Anthropic only to fulfil your specific request and is not used to train their models.</li>
            <li>To generate anonymised analytics that help us understand how the product is used.</li>
          </ul>
          <p>We do not sell your data to third parties. We do not use your data for advertising.</p>
        </Section>

        <Section title="4. Data sharing">
          <p>Your data is shared only with the following third-party services, each necessary to operate the platform:</p>
          <ul>
            <li><strong>Supabase</strong> — database, authentication, file storage, and real-time messaging. Data is stored in the US (East region).</li>
            <li><strong>Anthropic</strong> — powers our AI features. Data sent is limited to the specific content you upload (roster file, schedule, lineup). See <a href="https://www.anthropic.com/privacy" className="text-[#22c55e] hover:underline" target="_blank" rel="noopener noreferrer">Anthropic&apos;s privacy policy</a>.</li>
            <li><strong>Resend</strong> — transactional email delivery for invites and notifications.</li>
            <li><strong>Expo / Apple</strong> — push notification delivery via the Apple Push Notification Service (APNs).</li>
            <li><strong>PostHog</strong> — anonymised product analytics. No personal identifiers are sent.</li>
          </ul>
          <p>Within the platform, data is scoped strictly to your club. Coaches see their team&apos;s data only. Parents see their child&apos;s team only. No data is ever visible across clubs.</p>
        </Section>

        <Section title="5. Data retention">
          <p>We retain your personal data for as long as your account is active. If you delete your account, your personal data is deleted within 30 days. Club and team data may be retained in anonymised form for analytics purposes.</p>
          <p>You can request deletion of your account and data at any time by emailing <a href="mailto:info@dugoutfc.com" className="text-[#22c55e] hover:underline">info@dugoutfc.com</a> or using the Delete Account option in the app settings.</p>
        </Section>

        <Section title="6. Children's privacy">
          <p>Our platform is designed for use by coaches and parents. We do not knowingly collect personal data directly from children under 13. Player roster entries (name, jersey number, position) are entered by coaches or parents, not by the players themselves.</p>
          <p>If you believe we have inadvertently collected personal data from a child under 13, please contact us immediately at <a href="mailto:info@dugoutfc.com" className="text-[#22c55e] hover:underline">info@dugoutfc.com</a>.</p>
        </Section>

        <Section title="7. Your rights">
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you.</li>
            <li>Correct inaccurate data.</li>
            <li>Request deletion of your data.</li>
            <li>Export your data in a portable format.</li>
            <li>Withdraw consent at any time (this will not affect the lawfulness of prior processing).</li>
          </ul>
          <p>To exercise any of these rights, email <a href="mailto:info@dugoutfc.com" className="text-[#22c55e] hover:underline">info@dugoutfc.com</a>. We will respond within 30 days.</p>
        </Section>

        <Section title="8. Security">
          <p>We take security seriously. All data is encrypted in transit (TLS) and at rest. Access to your club data is enforced at the database level using row-level security — it is architecturally impossible for one club&apos;s data to be accessed by another club. We use Supabase Auth for authentication, which follows industry best practices including bcrypt password hashing and secure OAuth flows.</p>
        </Section>

        <Section title="9. Cookies and tracking">
          <p>Our mobile app does not use cookies. Our website (dugoutfc.app) uses only essential cookies required for authentication and session management. We use PostHog for anonymised analytics, which may set a cookie to track sessions. You can opt out of analytics tracking by contacting us.</p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>We may update this policy from time to time. We will notify you of significant changes via email or an in-app notice. The date at the top of this page reflects the most recent update. Continued use of the service after changes are posted constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="11. Contact">
          <p>If you have any questions about this privacy policy or how we handle your data, please contact:</p>
          <p className="mt-2">
            <strong>Dugout FC</strong><br />
            <a href="mailto:info@dugoutfc.com" className="text-[#22c55e] hover:underline">info@dugoutfc.com</a>
          </p>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#111] px-6 sm:px-10 py-8 max-w-5xl mx-auto flex items-center justify-between">
        <div style={{ background: '#fff', borderRadius: '8px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center' }}>
          <img src="/Signature.jpg" alt="Dugout FC" style={{ height: '22px', width: 'auto' }} />
        </div>
        <p className="text-[#555] text-[12px]">© {new Date().getFullYear()} Dugout FC</p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-white mb-4">{title}</h2>
      <div className="text-[#888] text-[15px] leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:text-[#22c55e] [&_strong]:text-[#ccc]">
        {children}
      </div>
    </section>
  );
}
