# Pre-Scale Action Plan

*Synthesized from `reviews/01-security.md` through `reviews/08-quickwins.md`. No code was changed to produce this document — it's a reading and ranking of the eight findings files only.*

Two things worth knowing before the list: this audit found a **real, live, currently-exploitable cross-club data breach** (not a theoretical one — see #1 below), and it found that pattern **twice, independently**, from two reviewers working in different scopes. That's the headline. Everything else here is real too, but that's the one to read first.

---

## Top 10 — ranked by impact to a paying club ÷ effort

All ten are under an hour of work individually; most are under 20 minutes. This list is deliberately effort-weighted — it's the "fix this today" list. Items that are just as dangerous but take longer (hours, not minutes) are not excluded from urgency, just from *this* list — see the Critical section below, especially #2 (`find-team.tsx`), which is arguably the single worst finding in the whole audit and is not here only because it's a 2-4 hour fix, not a 15-minute one.

| # | Finding | Source | Effort | Why it's here |
|---|---|---|---|---|
| 1 | `web/app/api/cron/fee-reminders/route.ts:17` filters on `status = 'pending'`, a value `player_fees.status` never actually takes — every unpaid (not-yet-partial) fee has *never once* been reminded, for either club, ever | [02-payments.md #8](02-payments.md) | 2 min | Silently breaks revenue collection for every club, today, with a one-line fix. Best ratio in the entire audit. |
| 2 | `/api/accept-invite` (`web/app/api/accept-invite/route.ts:4-30`) lets a fully **anonymous** caller redeem any club's invite by self-declaring the email — no account, no auth, one POST | [01-security.md #2](01-security.md) | 15 min | The single most severe finding in the audit: zero-auth path to becoming a real coach/org_admin in any club. |
| 3 | `supabase/functions/invite-staff` grants org_admin/coach on any `club_id` with **no caller authentication at all** — deployed, live, reachable with just the public anon key | [01-security.md #3](01-security.md) + [03-multitenancy.md #2](03-multitenancy.md) *(same finding, independently confirmed twice)* | 15 min to delete | Superseded by `/api/invite-coach`; appears fully orphaned. Deleting it is the fix. |
| 4 | `accept_invite()` RPC (`supabase/migrations/20260825000015...sql`) never checks that the caller's authenticated email matches `invites.email` before granting `team_members`/`club_id` | [01-security.md #1](01-security.md) | 30 min | Authenticated variant of #2 — an MDS coach with a leaked/forwarded Maroons invite link becomes a real Maroons coach. Same migration fixes both. |
| 5 | `registration_submissions` has no index on `form_id`; `submit_registration` runs a full sequential scan of it **while holding a per-form advisory lock**, serializing every submitter behind that scan | [04-data-model.md, Indexes #2](04-data-model.md) | 10 min | Directly threatens the next popular registration form filling up — parents queued behind a table scan during the exact moment a club needs the product to work. |
| 6 | New self-serve clubs' tryout form defaults to Rick's real personal email, Ben Manning's real email, and Maroons' real street address until the club overwrites it | [08-quickwins.md #2](08-quickwins.md) | 10 min | Directly contradicts "zero involvement from Rick" — a new paying club could publish a form showing *your* contact info to their prospective families. |
| 7 | Web dashboard "onboarding" flow (`web/app/api/onboarding/route.ts:15-59`) doesn't check the caller is club-less before `create_club` — any existing org_admin who re-triggers it gets a brand-new club and has their real club silently swapped out from under them | [03-multitenancy.md #3](03-multitenancy.md) | 15 min | One `if` statement protects the entire self-serve onboarding funnel — the core of the business model — from silent, undetectable corruption. |
| 8 | `web/app/join/page.tsx`'s `<Suspense>` has no `fallback` — the parent-invite link (CLAUDE.md "Journey 2") renders a **blank white screen** until hydration completes | [06-web.md #3](06-web.md) | 15 min | First impression of the product for every invited parent, on exactly the network conditions (mobile, out and about) where it matters most. |
| 9 | `message_reactions` and `web_push_subscriptions` both lack `ON DELETE CASCADE` on `profile_id`, reopening a bug already fixed for 27 other tables in August — **any user who's reacted to a chat message or has a saved push subscription cannot delete their account today** | [04-data-model.md, Constraints #1](04-data-model.md) | 20 min | Live, currently-failing user action, not a future-scale risk. Two `alter table` statements. |
| 10 | Web dashboard's "Remove guardian" button (`web/app/(dashboard)/dashboard/roster/page.tsx:311`) deletes only the `invites` row for an already-joined guardian — it does **not** revoke `team_members`/roster access, and has no confirmation dialog | [08-quickwins.md #1](08-quickwins.md) | 20 min | Real, present-day privacy exposure with a proven fix already shipped on mobile (`revoke_guardian_access` RPC) — just needs porting. |

---

## Everything Critical, regardless of effort

Per the brief: severity trumps effort here. This is every finding rated Critical across all eight reviews (27 total; the `invite-staff` finding is listed once, having been raised independently by two reviewers). Items already in the Top 10 are marked ✅.

| Area | Finding | Location | Effort |
|---|---|---|---|
| ✅ Security | `accept_invite()` no email/identity check | `supabase/migrations/20260825000015...sql` | 30 min |
| ✅ Security | `/api/accept-invite` anonymous account creation | `web/app/api/accept-invite/route.ts` | 15 min |
| ✅ Security/Multitenancy | `invite-staff` unauthenticated privilege grant | `supabase/functions/invite-staff/index.ts` | 15 min |
| **Multitenancy** | Any signed-in user can join **any** team/club with zero invite verification via "Find your team" — silently reassigns their own `club_id` too | `app/(auth)/find-team.tsx:79-107` | **2-4 hrs** — not in Top 10 purely on effort; likely the 2nd-worst finding in the audit |
| Payments | Parent's "Payment received" screen is driven entirely client-side; nothing reconciles the DB against Stripe if the webhook is ever lost — no reconciliation job exists anywhere | `web/app/pay/[token]/page.tsx:74-81` + `web/app/api/stripe/webhook/route.ts` | 2-3 hrs |
| Payments | No dispute/chargeback handling anywhere — a clawed-back charge leaves `player_fees` showing "paid" forever with no admin notification | `web/app/api/stripe/webhook/route.ts` | 2-4 hrs |
| Data-model | `messages` table has **zero indexes** after 169 migrations — every chat load/page is a full-table sequential scan across every club | `supabase/migrations/20240101000000...sql:135-141` | 15 min |
| ✅ Data-model | `registration_submissions` missing index, scanned under an advisory lock | see Top 10 #5 | 10 min |
| ✅ Data-model | `message_reactions`/`web_push_subscriptions` missing `ON DELETE CASCADE` — live account-deletion failure | see Top 10 #9 | 20 min |
| Mobile | Parent-facing RSVP handlers (Home quick-RSVP, event-detail RSVP) swallow failed writes with only `console.error` — no alert, no retry; a parent can tap "Attending" on bad signal and never know it didn't save | `app/(app)/[clubSlug]/(tabs)/index.tsx:1092-1122`, `event/[eventId].tsx:613-641` | 30 min |
| Web | Marketing homepage and 5 sibling pages `await` a live DB query with **zero `loading.tsx`** anywhere in `web/app` — first visitor after any deploy can hit a blank tab | `web/app/page.tsx:30-37` + others | 1 hr |
| Web | Dashboard shell (`DashboardContext`) serializes 5 sequential Supabase round trips before any authenticated content renders | `web/components/dashboard/DashboardContext.tsx:89-166` | 1-2 hrs |
| ✅ Web | `/join` blank Suspense fallback | see Top 10 #8 | 15 min |
| UX | Web onboarding `AuthStep.submit` has no try/catch — a network error on the *first screen of the wizard* leaves the button stuck "Please wait…" forever | `web/app/onboarding/page.tsx:337-358` | 15-30 min |
| UX | Web onboarding `confirm()` (Confirm & go live) re-inserts every already-saved team/player/event on retry after a partial failure — no dedup, unlike the AI-import path | `web/app/onboarding/page.tsx:1113-1204` | 2-4 hrs |
| UX | Nothing stops "Confirm & go live" from succeeding with **zero teams** — coach lands on "Your teams, roster, and schedule are all set up" over "0 teams · 0 players · 0 events" | `web/app/onboarding/page.tsx:897,1116,1757+` | 30-60 min |
| UX | Mobile in-app team creation (`create-team.tsx`) runs 5 sequential, un-timeout-guarded writes with no idempotency — a mid-sequence failure orphans a club record and retrying creates a **second** club | `app/(auth)/create-team.tsx:53-73` | 1-2 hrs |
| UX | Parent fee portal (`pay/portal`) discards query errors — a failed fetch renders the identical UI as "you owe nothing," on the money page | `web/app/pay/portal/page.tsx:46-62` | 30 min |
| UX | ACH/bank-transfer payment (the default, "LOWER FEE" option) gives **zero feedback** after submission — button silently re-enables to an untouched-looking form after real banking details were entered | `web/app/pay/[token]/page.tsx:62-82` | 1-2 hrs |
| UX | `join/page.tsx` signup has no try/catch — dropped connection leaves "Creating account…" spinning forever, typed password lost | `web/app/join/page.tsx:108-133` | 15 min |
| UX | Parent registration submit has no try/catch — the RPC can durably commit (real payment obligation created) while the confirmation screen never appears, inviting a duplicate resubmission | `web/app/register/[token]/page.tsx:154-252` | 30 min |
| UX | Tryout-offer response page has no `.catch()` on its mount fetch — permanent "Loading your offer…" on a network blip | `web/app/offer-response/page.tsx:47-60` | 10 min |
| UX | Guest-invite accept/decline page: no catch on load, no try/finally on the action — stuck "Loading…" and stuck "Confirming…" buttons | `web/app/guest-invite/[guestId]/page.tsx:74-114` | 20 min |
| UX | Coach event creation (`create-event.tsx`) never checks the `error` from the `events` insert — a failed save still navigates back as if it succeeded | `app/(app)/[clubSlug]/create-event.tsx:588-625` | 30-45 min |
| UX | Same screen's Save button is tappable with no team selected (a brand-new zero-team club's own admin empty-state offers this) — tap does nothing, no explanation | `app/(app)/[clubSlug]/create-event.tsx:627` | 20 min |
| UX | Emergency broadcast reports "sent" based on tokens *attempted*, not delivered — a down push endpoint still shows a coach "🚨 Broadcast sent" for a real emergency | `web/lib/expoPush.ts:13-39`, `web/app/api/emergency-broadcast/route.ts:52-74` | 1-2 hrs |
| ✅ Quickwins | "Remove guardian" doesn't revoke access, no confirmation | see Top 10 #10 | 20 min |
| ✅ Quickwins | New-club tryout form leaks Rick's/Maroons' real contact info | see Top 10 #6 | 10 min |

---

## Where two reviewers independently found the same underlying cause

Worth flagging on its own — this is the strongest signal in the audit of what's *actually* broken, as opposed to what one reviewer happened to notice:

1. **`accept_invite()`'s missing identity check** was found by **Security** (as an attacker exploit: redeem someone else's invite, become a coach in their club) and by **Multitenancy** (as an accidental-harm bug: the migration's *own comment admits* it silently switches an existing admin's home club, and only added a non-blocking warning string rather than a real fix). Same function, same root cause — no check that the accepting identity is entitled to what the invite grants — found from two completely different angles. One migration fixes both.
2. **`supabase/functions/invite-staff`** was independently flagged by **Security** and **Multitenancy** as the identical file, same line numbers, same "no auth check before a service-role privilege grant" problem, same conclusion (it's orphaned — `/api/invite-coach` replaced it — just delete it). Two reviewers reading different parts of the codebase landed on the same dead, dangerous file.
3. **`player_fees.amount_paid` missing compare-and-swap on 3 of its 4 write paths** was flagged by **Payments** (as a money-correctness bug: `applyRefund` and manual cash-payment recording can silently drop a concurrent write) and by **Data-model** (as a schema/ledger-integrity bug, same three call sites, same missing pattern). The Stripe webhook already has the fix — a documented CAS retry loop — the other three paths just never got it. One pattern, applied three more places, closes both findings.
4. Smaller pattern, not a formal overlap but worth naming: an established `withTimeout` helper (`hooks/useAuth.tsx`) exists specifically to stop network calls from hanging the UI forever, and it was never propagated to the ~10 places **UX** and **Mobile** independently found stuck-forever spinners (`create-team.tsx`, Home's `fetchData`, `join/page.tsx`, `register/[token]`, `offer-response`, `guest-invite`, and others). This isn't one bug, it's one *missing convention* — worth fixing as a "wrap every mutating fetch in the existing helper" pass rather than chasing each instance individually.

*(The UX reviewer also explicitly cross-referenced rather than re-reported the Mobile RSVP finding and the Web `/join` finding — noted here only to confirm the reviewers' own scoping worked as intended, not as a new overlap.)*

---

## Safe to wait until after the season

Real findings, but none are currently causing an incident and none block this season's operation. Revisit before the *next* big registration push or before onboarding club #3, whichever comes first.

- **Dashboard client-side caching** (Web #5) — no SWR/React-query layer, every navigation re-fetches from scratch. Real UX drag, architectural fix (3-4+ hrs), not urgent at 2 clubs' traffic.
- **Cron N+1 patterns** (Data-model, `apply-late-fees`/`rsvp-reminders`/`event-day-reminders`) — scales with club count × event volume; fine at today's scale, worth batching before club count grows materially.
- **Stripe idempotency keys on PaymentIntent/Refund creation** (Payments #4) and **`applyRefund`/manual-payment CAS hardening** (Payments #5/#6, Data-model overlap above) — real races, low current odds of two concurrent refunds/payments hitting the same fee at 2 clubs' volume. Do before a high-volume registration/payment window, not necessarily before this one ends.
- **`registration_submissions` dedup constraint** (Data-model) — worth having before the next popular form fills up, not urgent today.
- **Cosmetic web polish**: team-detail header layout shift, logo `<img>` width attributes, `NavBar`'s unnecessary `'use client'`, pricing page SSR conversion (Web #6-9) — all cheap, none urgent, good "gap in the schedule" work.
- **`numeric` column scale on new refund/surcharge columns**, **duplicate `cancellation_reason`/`cancelled_reason` columns**, **full FK-cascade audit pass**, **lock-risk process notes for future migrations** (Data-model, various) — housekeeping, not incidents.
- **Lineup-builder drag re-render, gallery upload partial-failure reporting** (Mobile Medium findings) — real but polish-tier, not blocking.
- **The long tail of UX copy/error-message findings** (raw Postgres/Supabase strings surfaced to users, native `alert()` calls, auto-fading error banners — dozens of small instances across `07-ux.md` sections 1, 2, 6, 7) — individually cheap, collectively large; best treated as an ongoing trickle of small fixes rather than a pre-season sprint.
- **"New Batch" dead button on web Evaluations**, **missing contact-sharing toggle in Settings** (Quickwins #3-4) — real gaps, low urgency.
- **`players_select` medical_notes over-exposure to all team parents, not just coaches** (Security #4) — same-club only, not a cross-tenant breach; worth the ~1 hour fix, but not before the items above it.
