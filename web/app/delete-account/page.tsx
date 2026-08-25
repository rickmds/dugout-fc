import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Delete Your Account — Pulse FC',
  description: 'How to delete your Pulse FC account and what happens to your data.',
};

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">
      {/* Nav */}
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between border-b border-[#111] max-w-5xl mx-auto">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
          <img src="/logo.png" alt="Pulse FC" style={{ height: '44px', width: 'auto' }} />
        </Link>
        <Link href="/" className="text-[#555] text-[13px] hover:text-white transition-colors">← Back</Link>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 sm:px-10 py-16">
        <h1 className="text-4xl font-extrabold text-white mb-3">Delete Your Account</h1>
        <p className="text-[#555] text-sm mb-12">Last updated: 18 August 2026</p>

        <Section title="Option 1 — Delete it yourself in the app">
          <p>This is the fastest way and works immediately:</p>
          <ol>
            <li>Open the Pulse FC app and log in.</li>
            <li>Tap the <strong>Settings</strong> gear icon (top right, from any screen).</li>
            <li>Scroll to the bottom and tap <strong>Delete Account</strong>.</li>
            <li>Confirm when prompted.</li>
          </ol>
          <p>Your account is deleted immediately — there is no waiting period for this method.</p>
        </Section>

        <Section title="Option 2 — Request deletion without the app">
          <p>If you no longer have the app installed, or can&apos;t log in, email us from the address associated with your account:</p>
          <p className="mt-2">
            <a href="mailto:support@pulse-fc.app?subject=Delete%20my%20account" className="text-[#22c55e] hover:underline font-medium">support@pulse-fc.app</a>
          </p>
          <p>Include the email address your account uses. We&apos;ll verify and process the deletion within 30 days.</p>
        </Section>

        <Section title="What gets deleted">
          <p>Deleting your account permanently removes:</p>
          <ul>
            <li>Your profile (name, photo, contact info)</li>
            <li>Your login credentials — you will not be able to sign back in</li>
            <li>Messages you&apos;ve sent in team chat, announcements, and direct messages</li>
            <li>Your RSVP history</li>
            <li>Your push notification tokens and in-app notifications</li>
            <li>Your team memberships and any invites you created</li>
          </ul>
        </Section>

        <Section title="What's retained, and why">
          <p>A few things are kept for reasons that are about the team&apos;s ongoing record, not you personally:</p>
          <ul>
            <li><strong>Roster entries</strong> for your child stay on the team&apos;s roster (name, jersey number, position) so the club&apos;s history isn&apos;t erased for other families — they&apos;re just unlinked from your account and can no longer be edited by you.</li>
            <li><strong>Payment and fee records</strong> tied to your club are retained for the club&apos;s accounting and tax records, as required by law.</li>
            <li><strong>Player reflections and coach shoutouts</strong> tied to your child stay visible to that child&apos;s remaining guardian(s) — only the link identifying who submitted or sent them is removed.</li>
          </ul>
          <p>None of this data is usable to identify you once your account is deleted.</p>
        </Section>

        <Section title="Questions">
          <p>Contact us at <a href="mailto:support@pulse-fc.app" className="text-[#22c55e] hover:underline">support@pulse-fc.app</a>. See our <Link href="/privacy" className="text-[#22c55e] hover:underline">Privacy Policy</Link> for more on how we handle data.</p>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#111] px-6 sm:px-10 py-8 max-w-5xl mx-auto flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
        <img src="/logo.png" alt="Pulse FC" style={{ height: '36px', width: 'auto' }} />
        <p className="text-[#555] text-[12px]">© {new Date().getFullYear()} Pulse FC</p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-white mb-4">{title}</h2>
      <div className="text-[#888] text-[15px] leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2 [&_a]:text-[#22c55e] [&_strong]:text-[#ccc]">
        {children}
      </div>
    </section>
  );
}
