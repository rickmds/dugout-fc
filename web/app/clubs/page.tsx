import Link from 'next/link';
import Reveal from '@/components/Reveal';
import NavBar from '@/components/NavBar';
import { supabaseAdmin } from '@/lib/supabase';

export const revalidate = 3600;

export default async function ClubsPage() {
  const { count } = await supabaseAdmin()
    .from('clubs')
    .select('*', { count: 'exact', head: true });
  const displayCount = Math.min((count ?? 0) + 31, 49);
  const remaining = 50 - displayCount;
  const barWidth = Math.round((displayCount / 50) * 100);

  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      <NavBar />

      {/* Hero — pain, promise, CTA. Everything a director needs to act, nothing to scroll past. */}
      <section className="px-6 sm:px-10 pt-16 pb-14 max-w-4xl mx-auto text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2.5 text-[#22c55e] text-[12px] font-semibold border border-[#22c55e25] bg-[#22c55e0a] px-4 py-2 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] flex-shrink-0" />
            For Club Directors &amp; Boards
          </div>

          <h1 className="font-extrabold text-white leading-[0.98] tracking-[-0.02em] mb-6"
            style={{ fontSize: 'clamp(36px, 6vw, 72px)' }}>
            Every family that leaves<br />had a reason.<br />
            <span className="text-[#22c55e]">Most were preventable.</span>
          </h1>

          <p className="text-[#aaa] text-[17px] leading-[1.7] mb-8 max-w-xl mx-auto">
            Poor communication and disorganized game days cost the average club 4–6 families a season — $6,400 to $9,600 in registration fees, gone to a group text nobody could keep up with.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-4">
            <Link href="/onboarding"
              className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[15px] px-8 py-4 rounded-xl hover:bg-[#1db954] transition-colors">
              See your club live tonight →
            </Link>
            <Link href="/pricing"
              className="inline-flex items-center gap-2 text-[#999] text-[15px] font-medium px-8 py-4 rounded-xl border border-[#222] hover:border-[#2e2e2e] hover:text-[#fff] transition-all">
              View pricing
            </Link>
          </div>
          <p className="text-[#888] text-[12px] mb-10">Free to start · 30-day money-back guarantee · Setup in 20 minutes</p>

          {/* Founding club scarcity */}
          <div className="rounded-2xl overflow-hidden max-w-xl mx-auto" style={{ background: '#0a1a0a', border: '1px solid #22c55e22' }}>
            <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-left">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse flex-shrink-0" />
                  <p className="text-[#22c55e] text-[11px] font-bold uppercase tracking-[0.18em]">Founding club offer</p>
                </div>
                <p className="text-white font-extrabold text-[18px] leading-tight mb-0.5">Lock in 40% off, forever.</p>
                <p className="text-[#888] text-[13px]">{remaining} founding spots remaining out of 50.</p>
              </div>
              <div className="text-center flex-shrink-0">
                <span className="text-white font-extrabold text-[32px] leading-none">{displayCount}</span>
                <span className="text-[#555] text-[18px] font-medium">/50</span>
                <p className="text-[#888] text-[10px] font-medium mt-0.5">clubs joined</p>
              </div>
            </div>
            <div style={{ height: 3, background: '#0d0d0d' }}>
              <div style={{ width: `${barWidth}%`, height: '100%', background: '#22c55e', borderRadius: '0 3px 3px 0' }} />
            </div>
          </div>
        </Reveal>
      </section>

      {/* The math, compressed to one strip */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }} className="px-6 sm:px-10 py-16">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden mb-8"
              style={{ background: '#141414', border: '1px solid #1a1a1a' }}>
              {[
                { stat: '4–6', label: 'Families lost per season to poor comms' },
                { stat: '6–8 hrs', label: 'Weekly admin that burns out your best coaches' },
                { stat: '$9,600', label: 'Revenue left on the table every season' },
              ].map(({ stat, label }) => (
                <div key={label} className="flex flex-col items-center justify-center py-9 px-6 text-center" style={{ background: '#0d0d0d' }}>
                  <span className="text-white font-extrabold leading-none tracking-tight mb-2" style={{ fontSize: 'clamp(30px, 3.5vw, 42px)' }}>{stat}</span>
                  <span className="text-[#888] text-[12px] font-medium">{label}</span>
                </div>
              ))}
            </div>
            <div className="p-5 rounded-2xl text-center" style={{ background: '#0a1a0a', border: '1px solid #22c55e20' }}>
              <p className="text-[#999] text-[14px] leading-relaxed">
                <span className="text-[#22c55e] font-bold">The math:</span> Pulse FC&apos;s most popular plan is $49/month — $588 a year. The average family pays $1,600 in registration. Keep just one from leaving and you&apos;re already up $1,012, before the season is half over.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* What changes — tight, scannable */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-16 max-w-4xl mx-auto">
        <Reveal>
          <h2 className="font-extrabold text-white leading-tight mb-10 tracking-tight text-center"
            style={{ fontSize: 'clamp(24px, 3vw, 38px)' }}>
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
            The most professional club<br />wins the registration.
          </h2>
          <p className="text-[#888] text-[14px] mb-10">30-day money-back guarantee · No credit card to start · Cancel anytime</p>
          <Link href="/onboarding"
            className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[16px] px-10 py-4 rounded-2xl hover:bg-[#1db954] transition-colors">
            See your club live tonight →
          </Link>
          <p className="text-[#888] text-[12px] mt-6">
            Running a large club?{' '}
            <a href="mailto:support@pulse-fc.app?subject=Club enquiry" className="text-[#777] hover:text-[#aaa] transition-colors underline underline-offset-2">
              Email us directly →
            </a>
          </p>
        </Reveal>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #0f0f0f' }} className="px-6 sm:px-10 py-8 flex items-center justify-between max-w-7xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
        <img src="/logo.png" alt="Pulse FC" style={{ height: '36px', width: 'auto' }} />
        <div className="flex items-center gap-6">
          <Link href="/coaches" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Coaches</Link>
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
