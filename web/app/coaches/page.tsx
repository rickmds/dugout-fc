import Link from 'next/link';
import Reveal from '@/components/Reveal';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { theme } from '@/lib/theme';

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
  { title: 'Callouts and quick polls', body: 'Need water, a ride, or a volunteer? Post a callout and watch responses come in. Need a quick yes/no from the team? A poll takes 20 seconds to set up.' },
  { title: 'Every guardian, handled', body: 'Divorced parents, grandparents picking up, twins on the roster — add every guardian for a player and everyone sees the same schedule.' },
];

export default function CoachesPage() {
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
              For Coaches &amp; Team Managers
            </div>

            <h1
              className="font-extrabold leading-[1.02] tracking-[-0.01em] mb-6"
              style={{ fontSize: 'clamp(34px, 5.2vw, 60px)', color: theme.text, fontFamily: theme.fontDisplay }}
            >
              You didn&apos;t sign up to be a <span style={{ color: theme.green }}>dispatcher</span>.
            </h1>

            <p className="text-[17px] leading-[1.7] mb-8 max-w-xl" style={{ color: theme.textSecondary }}>
              The average volunteer coach spends 6–8 hours a week texting parents, rebuilding lineups from scratch, and chasing RSVPs — time that has nothing to do with coaching, and every reason to make you quit.
            </p>

            <div className="flex flex-wrap gap-3 mb-4">
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 font-bold text-[15px] px-8 py-4 transition-colors"
                style={{ background: theme.green, color: '#fff', borderRadius: theme.radiusBtn, boxShadow: theme.shadowBtn }}
              >
                Get your Saturday back →
              </Link>
              <Link
                href="/players"
                className="inline-flex items-center gap-2 text-[15px] font-medium px-8 py-4 transition-all"
                style={{ color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: theme.radiusBtn }}
              >
                What parents see
              </Link>
            </div>
            <p className="text-[12px]" style={{ color: theme.textMuted }}>Free to start · Set up your team in under 20 minutes</p>
          </Reveal>

          <Reveal delay={100} className="hidden lg:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
            <img src="/screenshots/coachesHomeTB.png" alt="Coach Home screen with attendance, callouts, and polls"
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
                { stat: '6–8 hrs', label: 'Spent on admin every week, unpaid' },
                { stat: '20 min', label: 'Average time to build one lineup by hand' },
                { stat: '1 in 3', label: 'Volunteer coaches who quit from burnout' },
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
            Everything that ate your week,<br />handled from your phone.
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

      {/* Chat screenshot proof */}
      <section style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface }} className="px-6 sm:px-10 py-16">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_340px] gap-12 items-center">
          <div>
            <Reveal>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: theme.textMuted }}>Communication</p>
              <h2
                className="font-extrabold leading-tight mb-6 tracking-tight"
                style={{ fontSize: 'clamp(24px, 3vw, 36px)', color: theme.text, fontFamily: theme.fontDisplay }}
              >
                Even your email gets written for you.
              </h2>
              <p className="text-[15px] leading-[1.7] mb-4" style={{ color: theme.textSecondary }}>
                Need to send parents something longer than a chat message? Jot down a few bullet points, pick a tone, and Pulse FC writes the subject and body for you — you edit and send.
              </p>
              <p className="text-[15px] leading-[1.7]" style={{ color: theme.textSecondary }}>
                It&apos;s the same team chat your parents are already in, just with one more tool for the messages that need more than a sentence.
              </p>
            </Reveal>
          </div>
          <Reveal delay={100}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
            <img src="/screenshots/coachesChatTB.png" alt="Team chat screen"
              style={{ width: '100%', display: 'block', filter: `drop-shadow(${theme.shadowCard})` }} />
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ borderTop: `1px solid ${theme.border}` }} className="px-6 sm:px-10 py-24 text-center">
        <Reveal>
          <h2
            className="font-extrabold leading-[1.02] tracking-tight mb-5 max-w-2xl mx-auto"
            style={{ fontSize: 'clamp(28px, 4.2vw, 50px)', color: theme.text, fontFamily: theme.fontDisplay }}
          >
            Coach the game.<br />Let the app run the rest.
          </h2>
          <p className="text-[14px] mb-10" style={{ color: theme.textMuted }}>Free to start · No credit card required · Live in 20 minutes</p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 font-bold text-[16px] px-10 py-4 transition-colors"
            style={{ background: theme.green, color: '#fff', borderRadius: 18, boxShadow: theme.shadowBtn }}
          >
            Set up your team tonight →
          </Link>
          <p className="text-[12px] mt-6" style={{ color: theme.textMuted }}>
            Coaching within a club already?{' '}
            <Link href="/clubs" className="underline underline-offset-2 transition-colors" style={{ color: theme.textSecondary }}>
              Show your director Pulse FC →
            </Link>
          </p>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}
