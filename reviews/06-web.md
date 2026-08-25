# Web Review — Performance for a Live Demo

Scope: Next.js 16 App Router web app (`/web`) — marketing site, club dashboard, and the surfaces a club director could plausibly pull up live in front of a room: homepage, pricing, the dashboard shell and its pages, the club setup wizard (`/onboarding`), and the parent invite flow (`/join`). Every finding below is something that would actually flash, block, or shift on screen during that walkthrough — not a theoretical inefficiency.

Standing fact used throughout: `find app -name "loading.tsx" -o -name "error.tsx" -o -name "not-found.tsx"` returns **zero results** anywhere in `web/app`. The only error boundary in the entire app is `web/app/global-error.tsx` (a top-level catch-all). No route segment has its own `loading.tsx`.

---

## Findings

### 1. Marketing pages block entirely on a live DB query with no loading UI — worst case is a blank tab right after every deploy

**Severity:** Critical
**Location:** `web/app/page.tsx:30-37` (same pattern in `web/app/clubs/page.tsx:6-9`, `web/app/compare/page.tsx:11,328`, and the three `pulse-fc-vs-*` pages)
**Problem:** `Home` is an async Server Component that `await`s a Supabase count query before returning any JSX (`const { count } = await supabaseAdmin().from('clubs')...`), and there is no `loading.tsx` sibling anywhere in `web/app` to give Next.js a Suspense fallback to stream while that await is in flight — so the browser tab shows nothing (not even the nav bar or hero skeleton) until the query resolves. `export const revalidate = 3600` means most requests hit Vercel's ISR cache and this is invisible — but the cache is emptied by every deploy, and this branch (`review/pre-scale-audit`, on top of a "Ship 1.3.2" commit two commits back) is exactly the kind of branch that gets deployed shortly before a demo. The *first* visitor to `/` after that deploy — plausibly the director typing pulsefc.app into the address bar live — is the one who synchronously triggers generation and eats the DB round-trip plus any Vercel cold start, with nothing on screen while it happens.
**Fix:** Add `web/app/loading.tsx` (and one for `/clubs`, `/compare`, the vs-pages) with a static hero skeleton matching the page's above-the-fold layout, so Next streams it immediately via the implicit Suspense boundary while the count query resolves. Alternatively, move the club count into a small client component that fetches `/api/club-count` after mount so the static hero paints immediately regardless of DB latency.
**Effort:** 1 hour (one shared skeleton component reused across the 6 affected pages).

---

### 2. Dashboard shell serializes 5 sequential network round trips before any content renders

**Severity:** Critical
**Location:** `web/components/dashboard/DashboardContext.tsx:89-166` (`load()`), gating `web/app/(dashboard)/layout.tsx:25-38`
**Problem:** Every single page under `/dashboard` — roster, schedule, fees, everything — is blocked behind `DashboardProvider`, whose `load()` runs `auth.getUser()` (a real round trip to Supabase Auth, not a local decode), then `profiles`, then `clubs`, then `subscriptions`, then `teams`, each one `await`ed after the previous completes rather than run in parallel. Nothing in the dashboard shows until all five finish; `web/app/(dashboard)/layout.tsx:25-38` renders a full-page `FlipBoard` loader for that entire span. Over hotel wifi with even modest per-request latency, five serial round trips easily adds up to a second or more of a full-page loading animation before the director sees their own dashboard — on the exact page they're most likely to open first to prove the product works.
**Fix:** Parallelize what doesn't actually depend on the previous result. `clubs` and `subscriptions`/`teams` don't depend on each other once `profile.club_id` is known — fetch them with `Promise.all` instead of three sequential `await`s:
```ts
const [{ data: c }, { data: sub }, teamRows] = await Promise.all([
  supabase.from('clubs').select(...).eq('id', prof.club_id).single(),
  supabase.from('subscriptions').select('plan').eq('club_id', prof.club_id)....maybeSingle(),
  loadTeams(prof), // the existing role-branched teams query
]);
```
That collapses 5 serial round trips to 2 (`getUser` → profile, then the rest in parallel).
**Effort:** 1-2 hours (restructure + retest the role-branching logic that currently reads `prof` before the teams query).

---

### 3. Parent invite page (`/join`) renders a blank page during load — no fallback on its Suspense boundary

**Severity:** High
**Location:** `web/app/join/page.tsx:867-873`
**Problem:**
```tsx
export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  );
}
```
`<Suspense>` has no `fallback` prop, so it defaults to `null`. `JoinContent` is the entire page — background pattern, card, spinner, everything — because it needs `useSearchParams()`. During the window before hydration completes (exactly the "over hotel wifi" case), the boundary renders nothing: a plain white/blank viewport, not even the dark background or the spinner `JoinContent` itself would show once mounted. This is the literal parent-facing invite screen from CLAUDE.md's "Journey 2" — a page a director could easily pull up live ("here's what a parent sees"). Every other page in this codebase using the same `useSearchParams`-in-`Suspense` pattern (`web/app/offer-response/page.tsx:270-277`, `web/app/tryout-registration/page.tsx:627-633`, `web/app/reset-password/page.tsx:387-394`) passes a real `fallback` with a spinner — this file is the one place that pattern was dropped.
**Fix:** Copy the fallback pattern already used in `offer-response/page.tsx:270-276`:
```tsx
<Suspense fallback={
  <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 28, height: 28, border: '2px solid #22C55E33', borderTopColor: '#22C55E', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
  </div>
}>
```
**Effort:** 15 minutes.

---

### 4. Public field-status page has no revalidation strategy — contradicts its own "auto-refresh every 5 minutes" design

**Severity:** Medium
**Location:** `web/app/[clubSlug]/fields/page.tsx` (whole file — no `export const revalidate` or `export const dynamic`)
**Problem:** This async Server Component queries `clubs`, `tryout_fields`, and `field_closures` directly and renders full HTML — with no dynamic API usage (no `cookies()`/`headers()`) and no `revalidate`/`dynamic` export. Next's default Full Route Cache will render it once per distinct `clubSlug` and then serve that exact HTML to every subsequent visitor indefinitely, until the next deploy. The page's own footer script — `setTimeout(()=>location.reload(),300000)` (line 174) — shows the developer's intent was "field open/closed status refreshes every 5 minutes," but a reload of a statically-cached route just re-serves the same cached snapshot from whenever it was first generated, not fresh closure data. A club director sending parents to this exact URL to check field status before a game is depending on it reflecting closures made minutes ago.
**Fix:** Add `export const dynamic = 'force-dynamic';` (this is closure/status data, not worth even short-lived ISR) at the top of the file, next to the existing `supabase` client instantiation.
**Effort:** 5 minutes.

---

### 5. No shared cache across dashboard pages — every navigation re-fetches from scratch, full loading state each time

**Severity:** Medium
**Location:** Pattern repeats across `web/app/(dashboard)/dashboard/*/page.tsx` — e.g. `roster/page.tsx`, `schedule/page.tsx:223-276` (`loadEvents`), `teams/page.tsx`
**Problem:** There is no SWR, React Query, or any client-side cache/dedupe layer anywhere in `web/package.json` or the codebase (`grep -rn "useSWR|react-query|@tanstack"` returns nothing). Each dashboard page independently owns its data in local `useState`, fetched fresh in a `useEffect` on every mount. `DashboardContext` (profile/club/teams) is a singleton at the layout level and does persist across navigation, but the actual page content — the roster list, the schedule's events + RSVP summaries, fee stats — is discarded and re-fetched from zero every time the route changes, even navigating back to a page visited seconds earlier. In a live click-through ("let me show you the roster... now the schedule... back to the roster to show the RSVP counts"), every click re-triggers that page's loading skeleton and however many round trips its `load()` needs, instead of showing already-fetched data instantly.
**Fix:** This is a real architectural change, not a one-line fix — introduce a thin cache layer (SWR is the smallest diff given the existing `supabase.from(...)` call shapes: wrap each in `useSWR(key, fetcher)` so revisiting a route within its cache window shows cached data instantly while revalidating in the background) starting with the highest-traffic pages (roster, schedule).
**Effort:** 3-4 hours for an initial pass covering roster + schedule; more to cover the full dashboard.

---

### 6. Team detail header renders before data loads — content pop-in shifts the tab bar down

**Severity:** Medium
**Location:** `web/app/(dashboard)/dashboard/teams/[teamId]/layout.tsx:64-71`
**Problem:**
```tsx
<div style={{ fontSize: '22px', ... }}>{team?.name ?? ''}</div>
{(team?.age_group || team?.season) && (
  <div style={{ fontSize: '13px', color: '#64748B', marginTop: '3px' }}>
    {[team.age_group, team.season].filter(Boolean).join(' · ')}
  </div>
)}
```
`team` starts `null` (fetched in a `useEffect` at line 32-35) and this whole subtitle line is conditionally absent while it's null. Once the fetch resolves, the line appears and pushes the tab bar (Summary/Schedule/Roster/Attendance/Forms/Fees/Contact) and all page content below it down by its own height. This header wraps every one of the 7 team-detail tabs, so this shift happens on every team page a coach or director opens.
**Fix:** Reserve the line's height unconditionally instead of conditionally rendering it:
```tsx
<div style={{ fontSize: '13px', color: '#64748B', marginTop: '3px', minHeight: '17px' }}>
  {team ? [team.age_group, team.season].filter(Boolean).join(' · ') : ' '}
</div>
```
**Effort:** 10 minutes.

---

### 7. No `next/image` usage anywhere; logo `<img>` tags set only `height`, leaving `width` to shift in on load

**Severity:** Medium
**Location:** `web/components/NavBar.tsx:22` (rendered on every marketing page — 9 usages via `grep -rl NavBar`), and the identical pattern repeated in `web/app/page.tsx:221`, `web/app/(dashboard)/layout.tsx:103`, `web/app/onboarding/page.tsx:366,387`, `web/app/login/page.tsx:145`, and ~15 more locations
**Problem:** Every logo image in the app is a bare `<img src="/logo.png" style={{ height: '64px', width: 'auto' }} />` — only one dimension is ever fixed, so the browser has no reserved width until the image's natural dimensions are known. `NavBar.tsx:22` is the worst instance because it's a `justify-content: space-between` flex row present on literally every marketing page load: as the logo's real width resolves, the nav links and "Sign up" button to its right shift horizontally. On a cold cache (exactly the first-visit, hotel-wifi demo scenario — no prior visit to warm the browser cache for `/logo.png`), this is a real, measurable layout shift on the very first thing rendered on every page. `next.config.ts` also has no `images.remotePatterns` configured, and there is no actual `next/image` usage in the codebase despite ~15 ESLint-disable comments citing it as the reason plain `<img>` was used instead.
**Fix:** Set explicit `width` and `height` attributes (not just `style`) on the small, fixed set of local logo images (`/logo.png`, `/app-store-badge.svg`) so the browser reserves the box before the image loads — these are static files in `/public` with known dimensions, so this doesn't require `next/image` or remote pattern config at all:
```tsx
<img src="/logo.png" alt="Pulse FC" width={173} height={64} style={{ height: '64px', width: 'auto' }} />
```
(substitute the real intrinsic aspect ratio of `/public/logo.png`). For dynamic club-logo/avatar URLs from Supabase Storage, the existing `width: '100%', height: '100%'` inside a fixed-size parent (already done correctly in `components/dashboard/Sidebar.tsx:162,229`) is the right pattern — just apply it consistently instead of the `height`-only pattern used elsewhere.
**Effort:** 30 minutes for the ~20 static-logo occurrences.

---

### 8. `NavBar` is a client component with zero client-side behavior

**Severity:** Low
**Location:** `web/components/NavBar.tsx:1`
**Problem:** The file opens with `'use client'` but contains no `useState`, `useEffect`, or event handler of any kind — every interactive-looking bit (`:hover` color changes) is done with a CSS class. It's pure static markup (`Link`s and an `<img>`). Because it's forced into the client boundary, every one of the 9 marketing pages that imports it (`app/page.tsx`, `app/clubs/page.tsx`, `app/coaches/page.tsx`, `app/players/page.tsx`, `app/pricing/page.tsx`, `app/compare/page.tsx`, the three `-vs-` pages) has to hydrate this component's JS on the client instead of it staying pure server-rendered HTML with nothing to hydrate.
**Fix:** Remove `'use client'` from `web/components/NavBar.tsx`. Nothing in the file requires it.
**Effort:** 5 minutes.

---

### 9. Pricing page is entirely client-rendered for the sake of one toggle

**Severity:** Low
**Location:** `web/app/pricing/page.tsx:1-3`
**Problem:** The whole 456-line page — every tier card, every feature list, all static copy — is marked `'use client'` because of a single `useState<BillingCycle>('monthly')` toggle for monthly/annual pricing. None of the `TIERS` data or surrounding marketing content needs to be client-side; only the toggle and the price numbers that read off it do.
**Fix:** Convert the page back to a Server Component and extract just the billing-cycle toggle + the price display into a small client island (`<PricingToggle tiers={TIERS} />`), passing the static tier copy in as props/children rendered server-side.
**Effort:** 45 minutes.

---

## What's already done well

- **Heavy libraries are kept off the client bundle correctly.** `exceljs` (large) is only ever imported in `web/app/api/ai/parse-all/route.ts`, a server-only route — never shipped to the browser. `pdfjs-dist` (`app/(dashboard)/dashboard/fields/page.tsx:1604`) and `qrcode` (`app/(dashboard)/dashboard/fees/page.tsx:296`) are both loaded via dynamic `await import(...)` at the point of use rather than statically, so they don't bloat the initial page bundle for pages that don't need them.
- **Stripe is scoped correctly.** `@stripe/stripe-js`/`@stripe/react-stripe-js` are imported in exactly one file (`app/pay/[token]/page.tsx`), so Next's automatic route-based code splitting keeps that entire SDK out of every other page's bundle.
- **Fonts avoid FOIT.** `web/app/layout.tsx` uses `next/font/google` with `display: 'swap'` and a `variable`, which is the correct pattern for avoiding invisible-text flashes and unnecessary layout-shifting font swaps.
- **Marketing-page ISR is already in place** on the pages that hit the DB (`app/page.tsx`, `clubs`, `compare`, the three `-vs-` pages all set `export const revalidate = 3600`) — the caching *policy* is right; finding #1 above is about the missing loading UI for the cache-miss case, not the caching choice itself.
- **The dashboard's own component-level skeletons are well built** where they're used — e.g. the shimmer `Sk` component and per-tile skeletons in `_SimpleDashboard.tsx:63-65,266-` show real placeholder UI instead of a blank gap while that page's own data loads, and the outer `FlipBoard` full-page loader (`app/(dashboard)/layout.tsx:25-38`) is only shown once per session (`initialLoaded` gate) rather than on every navigation.
