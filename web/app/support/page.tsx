import Link from 'next/link';
import type { Metadata } from 'next';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Support — Pulse FC',
  description: 'Get help with Pulse FC — the club and team management app for youth soccer clubs.',
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">
      {/* Nav */}
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between border-b border-[#111] max-w-5xl mx-auto">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
          <img src="/logo.png" alt="Pulse FC" width={44} height={44} style={{ height: '44px', width: 'auto' }} />
        </Link>
        <Link href="/" className="text-[#555] text-[13px] hover:text-white transition-colors">← Back</Link>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 sm:px-10 py-16">
        <h1 className="text-4xl font-extrabold text-white mb-3">Support</h1>
        <p className="text-[#888] text-[15px] leading-relaxed mb-12">
          Need help with Pulse FC? We&apos;re here for coaches, club admins, and parents. Reach out
          directly or send us a message below — we typically reply within one business day.
        </p>

        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-4">Contact us directly</h2>
          <p className="text-[#888] text-[15px] leading-relaxed">
            Email <a href="mailto:support@pulse-fc.app" className="text-[#22c55e] hover:underline">support@pulse-fc.app</a> for
            account issues, billing questions, or anything else — that inbox is checked daily.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-4">Common questions</h2>
          <div className="space-y-6">
            <FAQ q="I forgot my password. How do I get back in?">
              On the app&apos;s login screen, tap &ldquo;Forgot password?&rdquo;, enter the email you signed
              up with, and we&apos;ll send a reset link.
            </FAQ>
            <FAQ q="How do I join my child's team?">
              If your coach sent you an invite email, tap the link on your phone to download the app
              and join automatically. No invite yet? Ask your coach or club admin to add you from
              their roster, or download the app and use &ldquo;Find your team&rdquo; with your club&apos;s
              join code.
            </FAQ>
            <FAQ q="How do I add a second parent or guardian to a player?">
              From the player&apos;s profile in the app, open the Guardians tab and choose &ldquo;Add another
              guardian&rdquo; — they&apos;ll get an email invite to link their own account.
            </FAQ>
            <FAQ q="How do I delete my account?">
              Go to Settings inside the app and choose Delete Account, or email us at{' '}
              <a href="mailto:support@pulse-fc.app" className="text-[#22c55e] hover:underline">support@pulse-fc.app</a>{' '}
              and we&apos;ll take care of it. See our <Link href="/delete-account" className="text-[#22c55e] hover:underline">account deletion page</Link> for details.
            </FAQ>
            <FAQ q="I'm a coach or club admin setting up a new club — where do I start?">
              Head to <Link href="/onboarding" className="text-[#22c55e] hover:underline">pulse-fc.app/onboarding</Link> to
              create your club, add your first team, and invite parents — no involvement from us needed.
            </FAQ>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-4">Send us a message</h2>
          <ContactForm />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#111] px-6 sm:px-10 py-8 max-w-5xl mx-auto flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
        <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto' }} />
        <p className="text-[#555] text-[12px]">© {new Date().getFullYear()} Pulse FC</p>
      </footer>
    </div>
  );
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-white font-bold text-[15px] mb-1.5">{q}</p>
      <p className="text-[#888] text-[14px] leading-relaxed">{children}</p>
    </div>
  );
}
