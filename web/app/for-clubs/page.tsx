'use client';

import Link from 'next/link';
import Reveal from '@/components/Reveal';
import ContactForm from '@/components/ContactForm';
import NavBar from '@/components/NavBar';

const testimonials = [
  {
    quote: "We lost 11 families last season. When I did exit interviews, three of them said they felt 'out of the loop' on schedules and communications. That's $16,000 in registration fees. Pulse FC paid for itself in the first month.",
    initials: 'J.O.',
    role: 'Club President',
    detail: '18-team club',
  },
  {
    quote: "My biggest fear was coach burnout. I had two great coaches threatening to step down because they were spending 6–8 hours a week on admin that had nothing to do with coaching. That problem is completely gone.",
    initials: 'D.C.',
    role: 'Club Director',
    detail: '14-team club',
  },
  {
    quote: "We compete for families with three other clubs in a 10-mile radius. The club that looks most professional wins the registration. Pulse FC made us look like a professional academy overnight — at a fraction of the cost.",
    initials: 'M.S.',
    role: 'Board Chair',
    detail: '22-team club',
  },
];

const outcomes = [
  {
    metric: 'Parent retention',
    headline: 'Families stay with clubs they feel connected to.',
    body: 'The number one reason families leave is feeling out of the loop. Automated push notifications, pinned announcements, and real-time schedule updates mean parents are never left guessing. Connected parents renew.',
  },
  {
    metric: 'Coach retention',
    headline: 'Your best coaches are drowning in admin. Not anymore.',
    body: 'A coach spending 6 hours a week answering parent messages, updating spreadsheets, and chasing RSVPs is a coach who burns out. Remove the admin and you keep the people your families pay to work with.',
  },
  {
    metric: 'Club reputation',
    headline: 'First impressions are set in week one — not on the pitch.',
    body: 'New families judge your club by how organized it feels before they ever see a training session. A professional invite email, a slick app, and a schedule that just works tells them everything they need to know.',
  },
  {
    metric: 'Competitive edge',
    headline: 'Your competitors already look more professional than you.',
    body: 'If a family is choosing between your club and the one across town, the deciding factor is often the experience — not the coaching. Look like the professional option and you win the registration.',
  },
];

export default function ForClubsPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {/* Nav */}
      <NavBar />

      {/* Hero */}
      <section className="px-6 sm:px-10 pt-20 pb-16 max-w-5xl mx-auto text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2.5 text-[#22c55e] text-[12px] font-semibold border border-[#22c55e25] bg-[#22c55e0a] px-4 py-2 rounded-full mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] flex-shrink-0" />
            For Club Directors &amp; Board Members
          </div>

          <h1 className="font-extrabold text-white leading-[0.95] tracking-[-0.02em] mb-8"
            style={{ fontSize: 'clamp(40px, 6.5vw, 84px)' }}>
            Every family that leaves<br />your club had a reason.<br />
            <span className="text-[#22c55e]">Most were preventable.</span>
          </h1>

          <p className="text-[#aaa] text-[19px] leading-[1.75] mb-6 max-w-2xl mx-auto">
            Poor communication, missed schedules, and disorganized game days cost the average soccer club 4–6 families per season. That's $6,000–$10,000 in lost registration fees — and a reputation that takes years to rebuild.
          </p>
          <p className="text-[#999] text-[16px] mb-12 max-w-xl mx-auto">
            Pulse FC fixes the things that make families leave.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-6">
            <Link href="/onboarding"
              className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[15px] px-8 py-4 rounded-xl hover:bg-[#1db954] transition-colors">
              Add your club free →
            </Link>
            <Link href="/pricing"
              className="inline-flex items-center gap-2 text-[#999] text-[15px] font-medium px-8 py-4 rounded-xl border border-[#222] hover:border-[#2e2e2e] hover:text-[#fff] transition-all">
              View pricing
            </Link>
          </div>
          <p className="text-[#888] text-[12px]">Free to start · 30-day money-back guarantee · Setup in 20 minutes</p>
        </Reveal>
      </section>

      {/* The cost of poor admin */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }}
        className="px-6 sm:px-10 py-20">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-[#777] text-[11px] font-bold uppercase tracking-[0.18em] mb-4">The real cost</p>
            <h2 className="font-extrabold text-white leading-tight mb-16 tracking-tight"
              style={{ fontSize: 'clamp(26px, 3.5vw, 46px)' }}>
              Admin problems are revenue problems.
            </h2>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden"
            style={{ background: '#141414', border: '1px solid #1a1a1a' }}>
            {[
              { stat: '$1,600', label: 'Average annual registration per family', sub: 'per year, per family' },
              { stat: '4–6', label: 'Families the average club loses to poor comms', sub: 'per season' },
              { stat: '$9,600', label: 'Revenue left on the table every season', sub: 'conservative estimate' },
            ].map(({ stat, label, sub }) => (
              <div key={label} className="flex flex-col items-center justify-center py-10 px-6 text-center"
                style={{ background: '#0d0d0d' }}>
                <span className="text-white font-extrabold leading-none tracking-tight mb-2"
                  style={{ fontSize: 'clamp(32px, 4vw, 48px)' }}>{stat}</span>
                <span className="text-[#888] text-[12px] font-medium mb-1">{label}</span>
                <span className="text-[#888] text-[10px]">{sub}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 p-6 rounded-2xl" style={{ background: '#0a1a0a', border: '1px solid #22c55e20' }}>
            <p className="text-[#22c55e] font-bold text-[15px] mb-1">The math is simple.</p>
            <p className="text-[#999] text-[14px] leading-relaxed">
              Pulse FC Club plan costs $99/month — $1,188/year. If it keeps just one family from leaving, you're up $412. If it keeps three, you're up $3,612. The software pays for itself before the season is halfway done.
            </p>
          </div>
        </div>
      </section>

      {/* Business outcomes */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-20 max-w-5xl mx-auto">
        <Reveal>
          <p className="text-[#777] text-[11px] font-bold uppercase tracking-[0.18em] mb-4">What actually changes</p>
          <h2 className="font-extrabold text-white leading-tight mb-16 tracking-tight"
            style={{ fontSize: 'clamp(26px, 3.5vw, 46px)' }}>
            Four things that move the needle<br />for your club.
          </h2>
        </Reveal>

        <div className="grid sm:grid-cols-2 gap-6">
          {outcomes.map((o, i) => (
            <Reveal key={o.metric} delay={i * 100}>
              <div className="h-full p-7 rounded-2xl flex flex-col"
                style={{ background: '#111', border: '1px solid #232323' }}>
                <div className="inline-flex items-center gap-2 mb-5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                  <span className="text-[#22c55e] text-[11px] font-bold uppercase tracking-[0.12em]">{o.metric}</span>
                </div>
                <h3 className="text-white font-extrabold text-[18px] leading-snug mb-3">{o.headline}</h3>
                <p className="text-[#999] text-[14px] leading-[1.7]">{o.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ borderTop: '1px solid #111', borderBottom: '1px solid #111', background: '#060606' }}
        className="px-6 sm:px-10 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.18em] mb-2">What club directors are saying</p>
          <h2 className="text-white font-extrabold mb-12" style={{ fontSize: 'clamp(22px, 2.8vw, 34px)' }}>
            The business case, in their words.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <Reveal key={t.initials} delay={i * 120}>
                <div className="flex flex-col h-full" style={{ background: '#0c0c0c', border: '1px solid #181818', borderRadius: 20, padding: 28 }}>
                  <div className="flex gap-0.5 mb-5">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <span key={s} className="text-[#22c55e] text-[14px]">★</span>
                    ))}
                  </div>
                  <p className="text-[#bbb] text-[15px] leading-[1.75] flex-1 mb-7">&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center gap-3 pt-4" style={{ borderTop: '1px solid #181818' }}>
                    <div className="w-9 h-9 rounded-full bg-[#161616] border border-[#222] flex items-center justify-center text-[10px] font-extrabold text-[#999] flex-shrink-0">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-white font-bold text-[13px] leading-none mb-1">{t.role}</p>
                      <p className="text-[#888] text-[11px]">{t.detail}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* What your coaches get */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-20 max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <p className="text-[#777] text-[11px] font-bold uppercase tracking-[0.18em] mb-4">For your coaching staff</p>
            <h2 className="font-extrabold text-white leading-tight mb-6 tracking-tight"
              style={{ fontSize: 'clamp(24px, 3vw, 40px)' }}>
              You approve the tool.<br />Your coaches actually use it.
            </h2>
            <p className="text-[#999] text-[16px] leading-[1.75] mb-8">
              Most club software gets approved by the board and ignored by the coaching staff. Pulse FC is built from the ground up for the people on the pitch — so adoption is never a battle you have to fight.
            </p>
            <Link href="/"
              className="inline-flex items-center gap-2 text-[#22c55e] text-[14px] font-semibold hover:underline">
              See what coaches experience →
            </Link>
          </Reveal>
          <Reveal delay={150}>
            <div className="flex flex-col gap-4">
              {[
                { title: 'AI schedule import', body: 'Coaches upload any PDF or image. The whole season is imported in 60 seconds. No manual entry.' },
                { title: 'One-tap RSVP for parents', body: 'Parents get a push notification and tap one button. Coaches see live headcounts without asking anyone.' },
                { title: 'AI lineup builder', body: 'Drag confirmed players onto a pitch. AI suggests the starting lineup based on positions and availability.' },
                { title: 'Team chat + announcements', body: 'Coaches post announcements. Parents read them. No group chat, no missed messages, no noise.' },
              ].map(({ title, body }) => (
                <div key={title} className="flex items-start gap-4 p-5 rounded-2xl"
                  style={{ background: '#111', border: '1px solid #232323' }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: '#0e2016', border: '1px solid #22c55e30' }}>
                    <span className="text-[#22c55e] text-[10px] font-extrabold">✓</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-[14px] mb-1">{title}</p>
                    <p className="text-[#999] text-[13px] leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Guarantee */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }}
        className="px-6 sm:px-10 py-20">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-8"
              style={{ background: '#0e2016', border: '1px solid #22c55e30' }}>
              <svg width="24" height="28" viewBox="-2 -2 32 36" fill="none">
                <path d="M14 1L2 6v9c0 8.25 5.14 15.96 12 18 6.86-2.04 12-9.75 12-18V6L14 1z" stroke="#22c55e" strokeWidth="1.8" strokeLinejoin="round" fill="#22c55e12"/>
                <path d="M9 16l3.5 3.5L19 12" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[#22c55e] text-[11px] font-bold uppercase tracking-[0.18em] mb-4">Zero risk</p>
            <h2 className="font-extrabold text-white leading-tight mb-6 tracking-tight"
              style={{ fontSize: 'clamp(24px, 3vw, 40px)' }}>
              30-day full refund.<br />No forms. No questions.
            </h2>
            <p className="text-[#999] text-[17px] leading-[1.75] mb-4">
              Run Pulse FC for 30 days. If it doesn't make your club run more smoothly, retain more families, or free up your coaching staff — email us and we'll refund every cent immediately.
            </p>
            <p className="text-[#999] text-[17px] leading-[1.75]">
              One email to <span className="text-white">info@pulse-fc.app</span> and it's done.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-28 text-center">
        <Reveal>
          <h2 className="font-extrabold text-white leading-[0.95] tracking-tight mb-6 max-w-3xl mx-auto"
            style={{ fontSize: 'clamp(34px, 5vw, 64px)' }}>
            The most professional club<br />wins the registration.
          </h2>
          <p className="text-[#999] text-[18px] mb-4 max-w-lg mx-auto leading-relaxed">
            Set up your whole club in 20 minutes. Your coaches will thank you. Your families will stay.
          </p>
          <p className="text-[#888] text-[14px] mb-12">30-day money-back guarantee · No credit card to start · Cancel anytime</p>
          <Link href="/onboarding"
            className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[16px] px-10 py-4 rounded-2xl hover:bg-[#1db954] transition-colors">
            Add your club free →
          </Link>
          <p className="text-[#888] text-[12px] mt-6">
            Running a large club?{' '}
            <a href="mailto:info@pulse-fc.app?subject=Club enquiry" className="text-[#777] hover:text-[#aaa] transition-colors underline underline-offset-2">
              Email us directly →
            </a>
          </p>
        </Reveal>
      </section>

      {/* Contact */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-20">
        <div className="max-w-lg mx-auto">
          <Reveal>
            <h2 className="font-extrabold text-white mb-2" style={{ fontSize: 'clamp(22px, 2.5vw, 32px)' }}>
              Want to talk it through first?
            </h2>
            <p className="text-[#777] text-[15px] mb-10 leading-relaxed">
              Ask about pricing, onboarding for a large club, or anything else.<br />
              Rick replies personally — usually the same day.
            </p>
          </Reveal>
          <ContactForm />
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #0f0f0f' }} className="px-6 sm:px-10 py-8 flex items-center justify-between max-w-7xl mx-auto">
        <img src="/logo.png" alt="Pulse FC" style={{ height: '36px', width: 'auto' }} />
        
        <div className="flex items-center gap-6">
          <Link href="/compare" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Compare</Link>
          <Link href="/pricing" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Pricing</Link>
          <Link href="/privacy" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Privacy</Link>
          <Link href="/terms" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Terms</Link>
          <Link href="/dashboard" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Log in</Link>
          <p className="text-[#555] text-[12px] hidden sm:block">Built for coaches · © {new Date().getFullYear()}</p>
        </div>
      </footer>

    </div>
  );
}
