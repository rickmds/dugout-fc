import Link from 'next/link';
import Reveal from '@/components/Reveal';
import NavBar from '@/components/NavBar';

export const metadata = {
  title: 'Pulse FC for Coaches',
  description: 'Get your Saturday nights back. Schedule, RSVPs, and lineups off your phone in minutes, not hours.',
};

const features = [
  { title: 'AI schedule import', body: 'Upload whatever PDF, photo, or spreadsheet the league sent you. The whole season is live in 60 seconds — nobody re-types a schedule by hand.' },
  { title: 'One-tap RSVP', body: 'Parents get a push notification and tap once. You see a live headcount without sending a single follow-up text.' },
  { title: 'AI lineup builder', body: 'Drag confirmed players onto a pitch, or let AI suggest a starting XI by position. Built in seconds, not the 20 minutes you used to lose to it.' },
  { title: 'Equal playing time, done for you', body: 'The app calculates target minutes and a sub rotation automatically — no more doing math on the sideline.' },
  { title: 'One team chat, zero noise', body: 'Announcements, RSVPs, and DMs in one place. No more hunting through a group text for the one message that mattered.' },
  { title: 'Runs offline, mid-game', body: 'Match tracker and sub timer work without signal — because that’s exactly when you actually need them.' },
];

export default function CoachesPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      <NavBar />

      {/* Hero */}
      <section className="px-6 sm:px-10 pt-16 pb-14 max-w-4xl mx-auto text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2.5 text-[#22c55e] text-[12px] font-semibold border border-[#22c55e25] bg-[#22c55e0a] px-4 py-2 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] flex-shrink-0" />
            For Coaches &amp; Team Managers
          </div>

          <h1 className="font-extrabold text-white leading-[0.98] tracking-[-0.02em] mb-6"
            style={{ fontSize: 'clamp(36px, 6vw, 72px)' }}>
            You didn&apos;t sign up<br />to be a <span className="text-[#22c55e]">dispatcher</span>.
          </h1>

          <p className="text-[#aaa] text-[17px] leading-[1.7] mb-8 max-w-xl mx-auto">
            The average volunteer coach spends 6–8 hours a week texting parents, rebuilding lineups from scratch, and chasing RSVPs — time that has nothing to do with coaching, and every reason to make you quit.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-4">
            <Link href="/onboarding"
              className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[15px] px-8 py-4 rounded-xl hover:bg-[#1db954] transition-colors">
              Get your Saturday back →
            </Link>
            <Link href="/players"
              className="inline-flex items-center gap-2 text-[#999] text-[15px] font-medium px-8 py-4 rounded-xl border border-[#222] hover:border-[#2e2e2e] hover:text-[#fff] transition-all">
              What parents see
            </Link>
          </div>
          <p className="text-[#888] text-[12px]">Free to start · Set up your team in under 20 minutes</p>
        </Reveal>
      </section>

      {/* Pain strip */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }} className="px-6 sm:px-10 py-16">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden"
              style={{ background: '#141414', border: '1px solid #1a1a1a' }}>
              {[
                { stat: '6–8 hrs', label: 'Spent on admin every week, unpaid' },
                { stat: '20 min', label: 'Average time to build one lineup by hand' },
                { stat: '1 in 3', label: 'Volunteer coaches who quit from burnout' },
              ].map(({ stat, label }) => (
                <div key={label} className="flex flex-col items-center justify-center py-9 px-6 text-center" style={{ background: '#0d0d0d' }}>
                  <span className="text-white font-extrabold leading-none tracking-tight mb-2" style={{ fontSize: 'clamp(30px, 3.5vw, 42px)' }}>{stat}</span>
                  <span className="text-[#888] text-[12px] font-medium">{label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-16 max-w-4xl mx-auto">
        <Reveal>
          <h2 className="font-extrabold text-white leading-tight mb-10 tracking-tight text-center"
            style={{ fontSize: 'clamp(24px, 3vw, 38px)' }}>
            Everything that ate your week,<br />handled from your phone.
          </h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 gap-4">
          {features.map(({ title, body }) => (
            <Reveal key={title}>
              <div className="h-full p-6 rounded-2xl" style={{ background: '#111', border: '1px solid #232323' }}>
                <div className="inline-flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                  <span className="text-[#22c55e] text-[11px] font-bold uppercase tracking-[0.1em]">{title}</span>
                </div>
                <p className="text-[#999] text-[13.5px] leading-[1.65]">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }} className="px-6 sm:px-10 py-24 text-center">
        <Reveal>
          <h2 className="font-extrabold text-white leading-[0.98] tracking-tight mb-5 max-w-2xl mx-auto"
            style={{ fontSize: 'clamp(30px, 4.5vw, 54px)' }}>
            Coach the game.<br />Let the app run the rest.
          </h2>
          <p className="text-[#888] text-[14px] mb-10">Free to start · No credit card required · Live in 20 minutes</p>
          <Link href="/onboarding"
            className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[16px] px-10 py-4 rounded-2xl hover:bg-[#1db954] transition-colors">
            Set up your team tonight →
          </Link>
          <p className="text-[#888] text-[12px] mt-6">
            Coaching within a club already?{' '}
            <Link href="/clubs" className="text-[#777] hover:text-[#aaa] transition-colors underline underline-offset-2">
              Show your director Pulse FC →
            </Link>
          </p>
        </Reveal>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #0f0f0f' }} className="px-6 sm:px-10 py-8 flex items-center justify-between max-w-7xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
        <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto' }} />
        <div className="flex items-center gap-6">
          <Link href="/clubs" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Clubs</Link>
          <Link href="/players" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Players</Link>
          <Link href="/compare" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Compare</Link>
          <Link href="/pricing" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Pricing</Link>
          <Link href="/login" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Log in</Link>
          <p className="text-[#555] text-[12px] hidden sm:block">Built for coaches · © {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}
