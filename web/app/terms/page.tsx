import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Pulse FC',
  description: 'Terms and conditions for using the Pulse FC platform.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">
      {/* Nav */}
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between border-b border-[#111] max-w-5xl mx-auto">
        <Link href="/">
          <img src="/logo.png" alt="Pulse FC" style={{ height: '44px', width: 'auto' }} />
          
        </Link>
        <Link href="/" className="text-[#555] text-[13px] hover:text-white transition-colors">← Back</Link>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 sm:px-10 py-16">
        <h1 className="text-4xl font-extrabold text-white mb-3">Terms of Service</h1>
        <p className="text-[#555] text-sm mb-12">Last updated: 23 June 2026</p>

        <Section title="1. Acceptance of terms">
          <p>By creating an account or using the Pulse FC platform (the &ldquo;Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          <p>You can contact us at <a href="mailto:info@pulse-fc.app">info@pulse-fc.app</a>.</p>
        </Section>

        <Section title="2. Who can use Pulse FC">
          <p>You must be at least 18 years old to create an account. By registering, you confirm that you are 18 or older. The Service is intended for use by coaches, club administrators, and parents or guardians of youth soccer players.</p>
          <p>You may not use the Service on behalf of a child under 13 in a way that would collect their personal data directly from them. Player roster data (name, jersey number, position) must be entered by an adult coach or parent.</p>
        </Section>

        <Section title="3. Your account">
          <p>You are responsible for maintaining the security of your account credentials. You must notify us immediately at <a href="mailto:info@pulse-fc.app">info@pulse-fc.app</a> if you suspect unauthorised access to your account.</p>
          <p>You are responsible for all activity that occurs under your account. We are not liable for any loss or damage arising from your failure to keep your credentials secure.</p>
          <p>One account per person. You may not create multiple accounts or share your account with others.</p>
        </Section>

        <Section title="4. Acceptable use">
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Post or transmit any content that is unlawful, abusive, threatening, defamatory, or otherwise objectionable.</li>
            <li>Harass, bully, or intimidate other users, including parents, players, or coaches.</li>
            <li>Upload malicious code, viruses, or anything designed to interfere with the Service.</li>
            <li>Attempt to gain unauthorised access to any part of the Service or another user&apos;s data.</li>
            <li>Use the Service for any commercial purpose other than managing your own soccer club.</li>
            <li>Scrape, copy, or reproduce any part of the Service without our written permission.</li>
          </ul>
          <p>We reserve the right to suspend or terminate any account that violates these terms without notice.</p>
        </Section>

        <Section title="5. Club data and content">
          <p>You retain ownership of all data you enter into the Service — roster information, schedules, messages, and other club content. By entering this data, you grant us a limited licence to store, process, and display it solely for the purpose of providing the Service to your club.</p>
          <p>You are responsible for ensuring you have the right to share any personal data you enter (for example, parent contact details or player information). By entering this data, you confirm you have appropriate consent or a lawful basis to do so.</p>
          <p>We do not claim ownership of your content and will not use it for any purpose beyond operating the Service.</p>
        </Section>

        <Section title="6. AI features">
          <p>The Service includes AI-powered features (schedule import, roster import, lineup suggestions) powered by the Anthropic Claude API. These features are provided as a convenience tool. Output from AI features should be reviewed before use — we make no guarantee that AI suggestions are accurate, complete, or suitable for your purposes.</p>
          <p>You remain responsible for any lineups, schedules, or rosters you publish, regardless of whether AI suggestions were used.</p>
        </Section>

        <Section title="7. Availability and changes">
          <p>We aim to keep the Service available at all times but do not guarantee uninterrupted access. We may perform maintenance, updates, or changes to the Service at any time.</p>
          <p>We reserve the right to modify or discontinue any feature of the Service at any time. We will give reasonable notice of significant changes where possible.</p>
        </Section>

        <Section title="8. Pricing">
          <p>The Service is currently free for founding clubs during the validation period. Pricing, if introduced, will be communicated with at least 30 days&apos; notice. You will never be charged without explicit consent.</p>
        </Section>

        <Section title="9. Termination">
          <p>You may close your account at any time via Settings → Delete Account in the app or by emailing <a href="mailto:info@pulse-fc.app">info@pulse-fc.app</a>.</p>
          <p>We may suspend or terminate your account if you breach these terms, with or without notice depending on the severity of the breach. Upon termination, your right to use the Service ends immediately.</p>
        </Section>

        <Section title="10. Limitation of liability">
          <p>To the maximum extent permitted by law, Pulse FC and its operators are not liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including but not limited to loss of data, loss of revenue, or personal injury.</p>
          <p>Our total liability to you for any claim arising from your use of the Service shall not exceed the amount you paid us in the 12 months preceding the claim (which may be zero during the free period).</p>
          <p>The Service is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied.</p>
        </Section>

        <Section title="11. Governing law">
          <p>These terms are governed by the laws of the State of Maryland, United States, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Maryland.</p>
        </Section>

        <Section title="12. Changes to these terms">
          <p>We may update these terms from time to time. We will notify you of material changes via email or in-app notice. Continued use of the Service after changes are posted constitutes acceptance of the updated terms.</p>
        </Section>

        <Section title="13. Contact">
          <p>Questions about these terms? Contact us at:</p>
          <p className="mt-2">
            <strong>Pulse FC</strong><br />
            <a href="mailto:info@pulse-fc.app">info@pulse-fc.app</a>
          </p>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#111] px-6 sm:px-10 py-8 max-w-5xl mx-auto flex items-center justify-between">
        <img src="/logo.png" alt="Pulse FC" style={{ height: '36px', width: 'auto' }} />
        
        <div className="flex items-center gap-6">
          <Link href="/privacy" className="text-[#555] text-[12px] hover:text-[#bbb] transition-colors">Privacy Policy</Link>
          <p className="text-[#555] text-[12px]">© {new Date().getFullYear()} Pulse FC</p>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-white mb-4">{title}</h2>
      <div className="text-[#888] text-[15px] leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:text-[#22c55e] [&_a]:hover:underline [&_strong]:text-[#ccc]">
        {children}
      </div>
    </section>
  );
}
