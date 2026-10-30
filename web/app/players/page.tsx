import Link from 'next/link';
import Reveal from '@/components/Reveal';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { theme } from '@/lib/theme';

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
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text }}>

      <NavBar />

      {/* Hero */}
      <section className="px-6 sm:px-10 pt-16 pb-14 max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_380px] gap-12 items-center">
          <Reveal>
            <div
              className="inline-flex items-center gap-2.5 text-[12px] font-semibold px-4 py-2 rounded-full mb-8"
              style={{ color: theme.greenDark, border: `1px solid ${theme.greenTintBorder}`, background: theme.greenTint }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: theme.green }} />
              For Parents &amp; Players
            </div>

            <h1
              className="font-extrabold leading-[1.02] tracking-[-0.01em] mb-6"
              style={{ fontSize: 'clamp(34px, 5.2vw, 60px)', color: theme.text, fontFamily: theme.fontDisplay }}
            >
              Stop scrolling a group text to find <span style={{ color: theme.green }}>game time</span>.
            </h1>

            <p className="text-[17px] leading-[1.7] mb-8 max-w-xl" style={{ color: theme.textSecondary }}>
              The field changed, nobody saw the text, and now you&apos;re standing at the wrong park. Pulse FC is the one app your coach actually keeps updated — schedule, RSVP, and team chat, always current.
            </p>

            <div className="flex flex-wrap gap-3 mb-4">
              <Link
                href="/coaches"
                className="inline-flex items-center gap-2 font-bold text-[15px] px-8 py-4 transition-colors"
                style={{ background: theme.green, color: '#fff', borderRadius: theme.radiusBtn, boxShadow: theme.shadowBtn }}
              >
                Show your coach →
              </Link>
              <Link
                href="/clubs"
                className="inline-flex items-center gap-2 text-[15px] font-medium px-8 py-4 transition-all"
                style={{ color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: theme.radiusBtn }}
              >
                On the board? Start here
              </Link>
            </div>
            <p className="text-[12px]" style={{ color: theme.textMuted }}>Free for your team · Your coach sets it up, you just download the app</p>
          </Reveal>

          <Reveal delay={100} className="hidden lg:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
            <img src="/screenshots/playersProfileTB.png" alt="Player profile with season attendance"
              style={{ width: '100%', display: 'block', filter: `drop-shadow(${theme.shadowCard})` }} />
          </Reveal>
        </div>
      </section>

      {/* Pain strip */}
      <section style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface }} className="px-6 sm:px-10 py-16">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden"
              style={{ background: theme.border }}>
              {[
                { stat: '3+', label: 'Group chats the average soccer parent is stuck tracking' },
                { stat: '15 min', label: 'Lost most weeks just confirming where a game actually is' },
                { stat: 'Zero', label: '"wait, is this cancelled?" texts once your coach is on Pulse FC' },
              ].map(({ stat, label }) => (
                <div key={label} className="flex flex-col items-center justify-center py-9 px-6 text-center" style={{ background: theme.bg }}>
                  <span className="font-extrabold leading-none tracking-tight mb-2" style={{ fontSize: 'clamp(30px, 3.5vw, 42px)', color: theme.text, fontFamily: theme.fontDisplay }}>{stat}</span>
                  <span className="text-[12px] font-medium" style={{ color: theme.textSecondary }}>{label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section style={{ borderTop: `1px solid ${theme.border}` }} className="px-6 sm:px-10 py-16 max-w-4xl mx-auto">
        <Reveal>
          <h2
            className="font-extrabold leading-tight mb-10 tracking-tight text-center"
            style={{ fontSize: 'clamp(24px, 3vw, 38px)', color: theme.text, fontFamily: theme.fontDisplay }}
          >
            What you actually get<br />on game day.
          </h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 gap-4">
          {features.map(({ title, body }) => (
            <Reveal key={title}>
              <div className="h-full p-6" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radiusCard, boxShadow: theme.shadowCard }}>
                <div className="inline-flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: theme.green }} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: theme.greenDark }}>{title}</span>
                </div>
                <p className="text-[13.5px] leading-[1.65]" style={{ color: theme.textSecondary }}>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final CTA — the honest one: parents don't sign the club up, coaches do */}
      <section style={{ borderTop: `1px solid ${theme.border}` }} className="px-6 sm:px-10 py-24 text-center">
        <Reveal>
          <h2
            className="font-extrabold leading-[1.02] tracking-tight mb-5 max-w-2xl mx-auto"
            style={{ fontSize: 'clamp(26px, 3.8vw, 46px)', color: theme.text, fontFamily: theme.fontDisplay }}
          >
            You can&apos;t fix the group text.<br />Your coach can.
          </h2>
          <p className="text-[15px] mb-10 max-w-md mx-auto leading-relaxed" style={{ color: theme.textSecondary }}>
            Send them this page. It takes 20 minutes to set up and it&apos;s free for your team.
          </p>
          <Link
            href="/coaches"
            className="inline-flex items-center gap-2 font-bold text-[16px] px-10 py-4 transition-colors"
            style={{ background: theme.green, color: '#fff', borderRadius: 18, boxShadow: theme.shadowBtn }}
          >
            Show your coach →
          </Link>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}
