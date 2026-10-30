import Link from 'next/link';
import Reveal from '@/components/Reveal';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { theme } from '@/lib/theme';

export const metadata = {
  title: 'Pulse FC for Clubs',
  description: 'See the math on what disorganization actually costs your club — and what changes when every coach and parent uses one app.',
};

export default function ClubsPage() {
  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text }}>

      <NavBar />

      {/* Hero — pain, promise, CTA. Everything a director needs to act, nothing to scroll past. */}
      <section className="px-6 sm:px-10 pt-16 pb-14 max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_380px] gap-12 items-center">
          <Reveal>
            <div
              className="inline-flex items-center gap-2.5 text-[12px] font-semibold px-4 py-2 rounded-full mb-8"
              style={{ color: theme.greenDark, border: `1px solid ${theme.greenTintBorder}`, background: theme.greenTint }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: theme.green }} />
              For Club Directors &amp; Boards
            </div>

            <h1
              className="font-extrabold leading-[1.02] tracking-[-0.01em] mb-6"
              style={{ fontSize: 'clamp(34px, 5.2vw, 60px)', color: theme.text, fontFamily: theme.fontDisplay }}
            >
              Every family that leaves had a reason.<br />
              <span style={{ color: theme.green }}>Most were preventable.</span>
            </h1>

            <p className="text-[17px] leading-[1.7] mb-8 max-w-xl" style={{ color: theme.textSecondary }}>
              Poor communication and disorganized game days cost the average club 4–6 families a season — $6,400 to $9,600 in registration fees, gone to a group text nobody could keep up with.
            </p>

            <div className="flex flex-wrap gap-3 mb-4">
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 font-bold text-[15px] px-8 py-4 transition-colors"
                style={{ background: theme.green, color: '#fff', borderRadius: theme.radiusBtn, boxShadow: theme.shadowBtn }}
              >
                See your club live tonight →
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 text-[15px] font-medium px-8 py-4 transition-all"
                style={{ color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: theme.radiusBtn }}
              >
                View pricing
              </Link>
            </div>
            <p className="text-[12px]" style={{ color: theme.textMuted }}>Free to start · Setup in 20 minutes · No credit card required</p>
          </Reveal>

          <Reveal delay={100} className="hidden lg:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
            <img src="/screenshots/clubsMapTB.png" alt="Event details with location and satellite map"
              style={{ width: '100%', display: 'block', filter: `drop-shadow(${theme.shadowCard})` }} />
          </Reveal>
        </div>
      </section>

      {/* The math, compressed to one strip */}
      <section style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface }} className="px-6 sm:px-10 py-16">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden mb-8"
              style={{ background: theme.border }}>
              {[
                { stat: '4–6', label: 'Families lost per season to poor comms' },
                { stat: '6–8 hrs', label: 'Weekly admin that burns out your best coaches' },
                { stat: '$9,600', label: 'Revenue left on the table every season' },
              ].map(({ stat, label }) => (
                <div key={label} className="flex flex-col items-center justify-center py-9 px-6 text-center" style={{ background: theme.bg }}>
                  <span className="font-extrabold leading-none tracking-tight mb-2" style={{ fontSize: 'clamp(30px, 3.5vw, 42px)', color: theme.text, fontFamily: theme.fontDisplay }}>{stat}</span>
                  <span className="text-[12px] font-medium" style={{ color: theme.textSecondary }}>{label}</span>
                </div>
              ))}
            </div>
            <div className="p-5 rounded-2xl text-center" style={{ background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}` }}>
              <p className="text-[14px] leading-relaxed" style={{ color: theme.textSecondary }}>
                <span style={{ color: theme.greenDark, fontWeight: 700 }}>The math:</span> Pulse FC&apos;s most popular plan is $49/month — $588 a year. The average family pays $1,600 in registration. Keep just one from leaving and you&apos;re already up $1,012, before the season is half over.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* What changes — tight, scannable */}
      <section style={{ borderTop: `1px solid ${theme.border}` }} className="px-6 sm:px-10 py-16 max-w-4xl mx-auto">
        <Reveal>
          <h2
            className="font-extrabold leading-tight mb-10 tracking-tight text-center"
            style={{ fontSize: 'clamp(24px, 3vw, 38px)', color: theme.text, fontFamily: theme.fontDisplay }}
          >
            You approve the tool.<br />Your coaches actually use it.
          </h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { title: 'Families stay', body: 'Push notifications and a live schedule mean parents are never left guessing. Connected families renew.' },
            { title: 'Coaches don’t quit', body: 'Remove 6 hours a week of admin and you keep the people your families are actually paying to work with.' },
            { title: 'You look professional', body: 'New families judge your club before they see a training session. A polished app tells them everything.' },
            { title: 'Live in one night', body: 'AI imports your season schedule and roster from whatever spreadsheet or PDF you already have. No re-typing anything.' },
          ].map(({ title, body }) => (
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

      {/* What's grown since launch — real capability proof, not at original launch */}
      <section style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface }} className="px-6 sm:px-10 py-16">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[380px_1fr] gap-12 items-center">
          <Reveal className="order-2 lg:order-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
            <img src="/screenshots/clubsAdminTB.png" alt="Admin dashboard with attendance and reporting"
              style={{ width: '100%', display: 'block', filter: `drop-shadow(${theme.shadowCard})` }} />
          </Reveal>
          <div className="order-1 lg:order-2">
            <Reveal>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: theme.textMuted }}>Built for running a real club, not just a team</p>
              <h2
                className="font-extrabold leading-tight mb-8 tracking-tight"
                style={{ fontSize: 'clamp(24px, 3vw, 36px)', color: theme.text, fontFamily: theme.fontDisplay }}
              >
                This isn&apos;t just a schedule app anymore.
              </h2>
            </Reveal>
            <div className="flex flex-col gap-5">
              {[
                { title: 'Real payments, not a spreadsheet', body: 'Tryout and registration fees collected online through Stripe, split into your club\'s own account, with installment plans, automatic reminders, and refund handling built in.' },
                { title: 'Staff certifications tracked automatically', body: 'Background checks, SafeSport, coaching licenses — uploaded once, with expiry reminders sent before they lapse, not after.' },
                { title: 'Know your coverage gaps before a parent does', body: 'A club-wide dashboard flags any game missing a coach or a published lineup, days in advance — not Saturday morning.' },
              ].map(({ title, body }) => (
                <Reveal key={title}>
                  <div className="flex gap-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: theme.greenTint, border: `1px solid ${theme.greenTintBorder}` }}>
                      <span style={{ fontSize: 15 }}>✓</span>
                    </div>
                    <div>
                      <p className="font-bold text-[14.5px] mb-1" style={{ color: theme.text }}>{title}</p>
                      <p className="text-[13.5px] leading-[1.6]" style={{ color: theme.textSecondary }}>{body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ borderTop: `1px solid ${theme.border}` }} className="px-6 sm:px-10 py-24 text-center">
        <Reveal>
          <h2
            className="font-extrabold leading-[1.02] tracking-tight mb-5 max-w-2xl mx-auto"
            style={{ fontSize: 'clamp(28px, 4.2vw, 50px)', color: theme.text, fontFamily: theme.fontDisplay }}
          >
            The most professional club<br />wins the registration.
          </h2>
          <p className="text-[14px] mb-10" style={{ color: theme.textMuted }}>No credit card to start · Free while we onboard founding clubs · Cancel anytime</p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 font-bold text-[16px] px-10 py-4 transition-colors"
            style={{ background: theme.green, color: '#fff', borderRadius: 18, boxShadow: theme.shadowBtn }}
          >
            See your club live tonight →
          </Link>
          <p className="text-[12px] mt-6" style={{ color: theme.textMuted }}>
            Running a large club?{' '}
            <a href="mailto:support@pulse-fc.app?subject=Club enquiry" className="underline underline-offset-2 transition-colors" style={{ color: theme.textSecondary }}>
              Email us directly →
            </a>
          </p>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}
