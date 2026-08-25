import Link from 'next/link';
import Reveal from '@/components/Reveal';
import NavBar from '@/components/NavBar';

export const metadata = {
  title: 'Pulse FC for Parents & Players',
  description: 'One app for schedule, RSVP, and team chat — no more scrolling a group text to find out where the game actually is.',
};

const features = [
  { title: 'Schedule that’s always current', body: 'Field change at 6pm the night before a game? You get a push notification the second your coach updates it — not a screenshot buried in a group text.' },
  { title: 'RSVP in one tap', body: 'Attending or not — no maybes, no reply-all. Your coach sees the headcount instantly and so do you.' },
  { title: 'Team chat that doesn’t bury things', body: 'Announcements, team chat, and direct messages live in their own tabs. The pinned post about uniform color is never twelve scrolls back.' },
  { title: 'Everyone’s contact info, in one place', body: 'Need to arrange a carpool? Other team parents’ numbers are right there — no more asking the coach to play middleman.' },
];

export default function PlayersPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      <NavBar />

      {/* Hero */}
      <section className="px-6 sm:px-10 pt-16 pb-14 max-w-4xl mx-auto text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2.5 text-[#22c55e] text-[12px] font-semibold border border-[#22c55e25] bg-[#22c55e0a] px-4 py-2 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] flex-shrink-0" />
            For Parents &amp; Players
          </div>

          <h1 className="font-extrabold text-white leading-[0.98] tracking-[-0.02em] mb-6"
            style={{ fontSize: 'clamp(36px, 6vw, 72px)' }}>
            Stop scrolling a group text<br />to find <span className="text-[#22c55e]">game time</span>.
          </h1>

          <p className="text-[#aaa] text-[17px] leading-[1.7] mb-10 max-w-xl mx-auto">
            The field changed, nobody saw the text, and now you&apos;re standing at the wrong park. Pulse FC is the one app your coach actually keeps updated — schedule, RSVP, and team chat, always current.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-4">
            <Link href="/coaches"
              className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[15px] px-8 py-4 rounded-xl hover:bg-[#1db954] transition-colors">
              Show your coach →
            </Link>
            <Link href="/clubs"
              className="inline-flex items-center gap-2 text-[#999] text-[15px] font-medium px-8 py-4 rounded-xl border border-[#222] hover:border-[#2e2e2e] hover:text-[#fff] transition-all">
              On the board? Start here
            </Link>
          </div>
          <p className="text-[#888] text-[12px]">Free for your team · Your coach sets it up, you just download the app</p>
        </Reveal>
      </section>

      {/* Features */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }} className="px-6 sm:px-10 py-16 max-w-4xl mx-auto">
        <Reveal>
          <h2 className="font-extrabold text-white leading-tight mb-10 tracking-tight text-center"
            style={{ fontSize: 'clamp(24px, 3vw, 38px)' }}>
            What you actually get<br />on game day.
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

      {/* Final CTA — the honest one: parents don't sign the club up, coaches do */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-24 text-center">
        <Reveal>
          <h2 className="font-extrabold text-white leading-[0.98] tracking-tight mb-5 max-w-2xl mx-auto"
            style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>
            You can&apos;t fix the group text.<br />Your coach can.
          </h2>
          <p className="text-[#999] text-[15px] mb-10 max-w-md mx-auto leading-relaxed">
            Send them this page. It takes 20 minutes to set up and it&apos;s free for your team.
          </p>
          <Link href="/coaches"
            className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[16px] px-10 py-4 rounded-2xl hover:bg-[#1db954] transition-colors">
            Show your coach →
          </Link>
        </Reveal>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #0f0f0f' }} className="px-6 sm:px-10 py-8 flex items-center justify-between max-w-7xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
        <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto' }} />
        <div className="flex items-center gap-6">
          <Link href="/clubs" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Clubs</Link>
          <Link href="/coaches" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Coaches</Link>
          <Link href="/compare" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Compare</Link>
          <Link href="/pricing" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Pricing</Link>
          <Link href="/login" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Log in</Link>
          <p className="text-[#555] text-[12px] hidden sm:block">Built for coaches · © {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}
