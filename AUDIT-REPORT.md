# Pulse FC — Codebase Audit (2026-08-12)

Read-only audit across all three surfaces: mobile app (React Native/Expo), web dashboard (Next.js), and the self-serve onboarding wizard. No code was changed as part of this report. `npx tsc --noEmit` is clean (0 errors) on both mobile and web — everything below was found by actually reading the code, not by the type checker. Web has no lint tooling issue (`eslint` runs, 632 pre-existing problems, mostly stylistic — see the Web section). Mobile has no lint tooling configured at all. Neither project has a test suite.

Severity key: **blocker** = crashes or corrupts/exposes data in a normal flow · **high** = broken feature or silent data loss · **medium** = confusing UX or minor inconsistency · **low** = cleanup.

---

## Read this part first — cross-cutting priority order

These are the items worth fixing regardless of which surface you tackle first, ranked by real-world impact. Items 1–4 are live on production right now (they're in already-deployed code, not the new invite-unification build) — they're not blocking the mobile build specifically, but they're actively exploitable/broken today.

1. **[BLOCKER] `player_fees` table is world-readable to anyone with the public anon key** — a fully open RLS policy exposes every club's billing ledger (amounts, statuses, discounts) with no auth at all. *(Web §1/§4)*
2. **[BLOCKER] Stripe webhook has no idempotency protection** — Stripe's at-least-once delivery will double-credit fees and double-send payment confirmations on any retry. *(Web §1/§2)*
3. **[BLOCKER] `is_team_coach()` RLS function isn't scoped by club** — any org_admin on any club (including a brand-new self-serve signup) can write to another club's players/invites/events/RSVPs/messages. Directly contradicts the "data never leaks across clubs" invariant in CLAUDE.md. *(Onboarding §5, but it's a platform-wide RLS bug)*
4. **[BLOCKER] `/api/team/parent-emails` has no real auth check** — any request with a `Bearer` header of any value and an arbitrary `team_id` returns every parent's email/name for that team, any club. *(Web §3)*
5. **[BLOCKER] Brand-new Google/Apple sign-in from `/login` infinite-loops** — a first-time OAuth user with no `profiles` row yet gets bounced `/dashboard` → `/login` → `/dashboard` forever, with zero UI escape. *(Onboarding §3)*
6. **[BLOCKER] `/onboarding` has no resume/dedup logic** — closing the tab after Step 1 permanently orphans that club (no teams, unreachable, no self-serve delete) and lets the user create a second one on return. *(Onboarding §1)*
7. **[HIGH] Real React crash bug** — `web/app/(dashboard)/dashboard/fees/page.tsx` has an early `return` before ~40 hook calls, gated on `profile.role === 'coach'`. Since `profile` loads async, this violates the Rules of Hooks and will throw for any coach who opens the club-wide Fees page. *(Web §6)*
8. **[HIGH] Four unauthenticated, state-mutating/email-sending API routes** — `promote-waitlist`, `registrations/bulk-email`, `registrations/late-invite`, `push-event` have no auth check at all. The bulk-email one is effectively an open phishing relay off `pulse-fc.app`'s sending domain. *(Web §3)*
9. **[HIGH] Onboarding silently drops teams/players/invites/events on insert failure**, then still shows "you're live" — and separately, the invite-sending step ignores every fetch response and always shows "✓ Invites sent" even if every email failed. *(Onboarding §5)*
10. **[HIGH] No handling for "signed up but awaiting email confirmation" in web onboarding** — mobile's `register.tsx` already handles this case correctly; the web wizard doesn't, and a user in this state gets stuck on Step 2 with an opaque "Forbidden" error and no way out. *(Onboarding §3)*

Everything else below is organized by surface, in the same 7-category structure used for each audit pass.

---

## 1. Mobile App (React Native / Expo)

Scope: `/app`, `/hooks`, `/lib`, `/components` (repo root, everything outside `/web`).

### 1.1 Runtime errors / crashes
- `app/(auth)/find-team.tsx:104-114` (medium) — `handleJoinTeam` has no error handling on the join call; on failure the user is routed to `/profile-setup`/Home with no team assigned and no explanation. *Fix: check errors before navigating.*
- No unguarded `.find()`/`[0]`/`JSON.parse` crash risks found in the ~24+ call sites sampled — existing guard patterns (`?.`, `?? null`, try/catch) are used consistently. Not a concern area right now.

### 1.2 Supabase queries/mutations with missing or silent error handling
Roughly 15 of ~40 reviewed write/mutation call sites have no error check at all, concentrated on **destructive or state-changing actions**:
- `app/(app)/[clubSlug]/player/[playerId].tsx:513-518` (blocker) — `handleDelete` removes a player with zero error check; the "cannot be undone" alert can lie if the delete silently fails (RLS/network).
- `app/(app)/[clubSlug]/event/[eventId].tsx:610-615` and `app/(app)/[clubSlug]/edit-event/[eventId].tsx:509-514` (blocker) — same pattern, duplicated, for event deletion.
- `app/(app)/[clubSlug]/coach/[coachId].tsx:162-173` (high) — coach/invite removal, no error check before `router.back()`.
- `app/(app)/[clubSlug]/event/[eventId].tsx:560-573` and `:1022-1035` (high) — RSVP override and attendance-marking update local state regardless of whether the underlying write actually succeeded.
- `app/(app)/[clubSlug]/(tabs)/schedule.tsx:353-376` (high) — RSVP toggle here doesn't check errors at all, unlike the two other independent reimplementations of the same feature in `index.tsx:959-996` and `event/[eventId].tsx:502-531` (both of which do check) — see §1.6 for the duplication angle.
- `app/(app)/[clubSlug]/admin/events/[eventId]/match-tracker.tsx:508-515,714-719` (high, live-game path) — score bump and mid-match formation change both unchecked; a dropped connection during a live game silently loses the update.
- `app/(auth)/find-team.tsx:108-109`, `app/(auth)/create-team.tsx:67,77` (high, first-run paths) — partial write failures here can leave `role='org_admin'` with no `club_id`, or a club with no team_members row for its creator — hard to recover from without support.
- Lower severity: `roster.tsx:340-351` and similar read-path omissions just produce a stale/empty list rather than an error banner — acceptable, not urgent.

### 1.3 Auth / session state bugs
- `hooks/useAuth.tsx:33-47` (`fetchProfileAndClub`) (high) — discards the Supabase error entirely. A transient failure (not "no profile") is indistinguishable from a real empty state, and on the background-revalidate path it can silently overwrite a valid cached profile with `null`, logging the user out of a fine session with no explanation. Same bug class as the login/register stale-cache issue already fixed this session, but in the provider itself.
- No `AppState`/foreground-resume listener on `AuthProvider` — if a coach's role changes or a club gets suspended while the app is merely backgrounded, stale cached access persists until the next full sign-in event or force-quit.
- `hooks/TeamContext.tsx:17,39,48,68` (low) — `pulse_selected_team_id` AsyncStorage key isn't namespaced per-user; shared-device scenario reads the previous user's last-selected team (not exploitable today since it's re-validated against the new user's team list, but fragile).
- `hooks/TeamContext.tsx:27-60` (low) — same error-discarding pattern as `useAuth`; a failed fetch produces a silent empty team list.

### 1.4 White-label club routing
- No hardcoded club-specific data found — `useClub.ts` sources everything from the `clubs` row correctly.
- `app/(app)/[clubSlug]/_layout.tsx` (low/medium, architectural) — there's no centralized guard verifying the URL's `clubSlug` matches the signed-in user's actual club. Every screen checked today happens to intersect its query against the user's own membership before showing data, so it degrades safely to "not found" rather than leaking — but this is enforced by convention per-screen, not centrally, so it's one careless future screen away from a real cross-club leak. *Fix: add a single redirect-if-mismatched guard in `_layout.tsx`.*

### 1.5 `any` types masking real issues
~351 occurrences; ~90% are the same benign pattern (`(supabase as any).from(...)` working around `types/database.ts` not being regenerated for newer tables/columns, plus `as any` on Expo Router dynamic paths). Worth tightening specifically:
- `hooks/useAuth.tsx:42` — the entire joined `profiles + clubs(*)` row is cast to `any` before destructuring; central to every screen, no compile-time protection if the join shape ever changes.
- `app/(app)/[clubSlug]/admin/events/[eventId]/match-tracker.tsx:468` — `const sb = supabase as any;` aliases the whole client for a block of calls (broader than the usual per-call cast), in the same file that also has the weakest error-handling coverage (§1.2).
- `app/(app)/[clubSlug]/event/[eventId].tsx:692` and `index.tsx:330-337` — untyped `any[]` params/casts around guest-RSVP and poll data with no shape enforcement.

### 1.6 Dead code / duplicated logic
- RSVP toggle reimplemented 3x with drift (`index.tsx`, `event/[eventId].tsx`, `schedule.tsx` — the last is the one missing error checks). *Fix: consolidate into one `useRsvp` helper.*
- Destructive delete-with-no-error-check reimplemented 4x (player, event ×2, coach/invite). *Fix: one shared `deleteWithConfirmation` helper.*
- `index.tsx:847-855` — `postCallout` calls the `send-push` edge function directly instead of the existing `lib/push.ts` helper every other push call site uses.

### 1.7 Stripe on mobile
None — confirmed zero Stripe SDK/payment surface on mobile, matching CLAUDE.md's "no payment collection in v1" for the app itself. One related gap: push notifications for `fee_assigned`/`fee_reminder`/`payment_confirmed` route to the generic notifications list with no dedicated screen — not a bug, just worth knowing if the new web payments feature is meant to be mobile-visible soon.

---

## 2. Web Dashboard + Stripe

Scope: `web/app/(dashboard)/`, `web/app/api/`, `web/components/dashboard/`, `web/lib/`.

### 2.1 Stripe integration — error handling and edge cases
- **[blocker]** `web/app/api/stripe/webhook/route.ts` — no idempotency guard on `event.id`, and `fee_payments` has no unique constraint on `stripe_payment_intent_id` either. Any Stripe retry double-credits a fee and double-sends the confirmation email/push. *Fix: dedupe on event id or upsert on payment-intent id before writing.*
- **[high]** `web/app/api/stripe/create-checkout/route.ts` is dead code (no caller anywhere — the live payment page uses `create-payment-intent` exclusively) but if ever reconnected, a Checkout Session fires both webhook events for the same payment and would double-record it with two different amounts. *Fix: delete it.*
- **[high]** Stripe REST calls check for a truthy field but never check `res.ok` (`connect/init/route.ts:39-44,64-68`, `create-payment-intent/route.ts:98-103`) — a non-JSON error response throws uncaught. *Fix: check `res.ok` first.*
- **[high]** Two disconnected "Stripe" UIs in the same dashboard: Settings → Payments (real, functional Connect flow) vs. Registrations → Settings → Stripe (`registrations/_components/SettingsPanel.tsx:687-729`, static, links to the generic `dashboard.stripe.com/register` signup page instead of the platform's own Connect init). A club that's actually connected still sees "not connected" here, and clicking the button would create an unrelated standalone Stripe account. *Fix: remove the stale panel or wire it to the real state.*
- **[medium]** No `payment_intent.payment_failed` or `account.updated` webhook handlers — declined cards produce no record/notification, and a club whose Connect account gets later restricted keeps `stripe_connect_onboarded = true` forever, so the payment page keeps offering online payment it can't actually fulfill.
- **[low]** Webhook signature check isn't constant-time and doesn't enforce the timestamp replay window (`webhook/route.ts:234-253`). No secrets found exposed to the client or logged anywhere.

### 2.2 Supabase queries/mutations with missing or silent error handling
Roughly 19 of ~192 `supabase.from(...)` calls inside `app/api/` actually check `{ error }`. Worst concrete examples:
- **[high]** `web/app/(dashboard)/dashboard/teams/[teamId]/fees/page.tsx:161-183` (`handlePayment`) — manual cash/check payment recording has zero error checks; the modal closes as if the payment was logged even if the write failed.
- **[high]** `web/app/api/stripe/webhook/route.ts:67-81` — the actual money-crediting writes are unchecked inside a `Promise.all`, but the handler still returns `{received:true}` to Stripe either way, so a failed write is permanently lost (Stripe won't retry a 200).
- **[medium]** `web/app/api/cron/apply-late-fees/route.ts:52-55` — unchecked update means a club can silently under-charge late fees with no log or alert.
- Positive note: `web/app/(dashboard)/dashboard/settings/page.tsx`'s save handlers mostly do check errors and toast — better than average, worth using as the reference pattern when fixing the rest.

### 2.3 Auth / silent-failure class of bugs
- **[blocker]** `web/app/api/team/parent-emails/route.ts:5-8` — "auth" is just `authHeader.startsWith('Bearer ')`; the token is never validated and the caller's club is never checked against the requested `team_id`. Any request with any bearer value returns every parent's email/name for any team. *Fix: use `requireRole` + verify the team belongs to the caller's club.*
- **[high]** Four unauthenticated, state-mutating/email-sending routes: `api/registrations/promote-waitlist`, `api/registrations/bulk-email` (arbitrary subject/HTML "from" any club name, to real registrant addresses — an open phishing relay off the platform's sending domain), `api/registrations/late-invite`, `api/push-event` (cross-club push with attacker-chosen content). *Fix: add `requireRole` + ownership checks to all four.*
- **[high]** `web/app/api/send-fee-reminder/route.ts:14-31` and `send-payment-confirmation/route.ts:8-20` correctly gate on `requireRole` but never check that the client-supplied `player_fee_id` actually belongs to the caller's own club — an org_admin of Club A can trigger a reminder email containing Club B's amount and parent's email, sent "from" Club B. *Fix: assert `fee.teams.club_id === auth.clubId` after loading.*
- **[high]** `web/lib/apiAuth.ts:26-29` returns the identical 401 whether the token is genuinely invalid or Supabase Auth itself is unreachable — callers can't distinguish "please log in" from "the backend is having a bad moment." `DashboardContext.tsx:78-84` has the same shape: any transient profile-fetch failure silently bounces an authenticated user to `/login`.
- `admin/delete-club`, `admin/broadcast`, `admin/club-staff` correctly gate on `app_admin` but each hand-rolls its own token/role check with a service-role client instead of reusing `requireRole` — a fourth copy of the same logic (see §2.6).

### 2.4 White-label routing / RLS
- **[blocker]** `player_fees` RLS: `supabase/migrations/20260805000007_stripe_payments.sql:28-31` has `CREATE POLICY "public read fee by payment token" ON player_fees FOR SELECT USING (true)`. The name claims token-scoping; the policy does none — it's `true`, granting unauthenticated SELECT on every column of every row, platform-wide. Postgres RLS policies OR together, so this overrides the existing tighter policies entirely. *Fix: move the payment-page fetch to a server route (service-role, filtered by token) and drop this policy, or scope it via a security-definer RPC keyed on the token.*
- **[medium]** Same exact bug shape on `tryout_assignments` (`supabase/migrations/20260629000002_tryout_module.sql:314-316`) — less sensitive (no financial data) but same root cause and same fix.
- No hardcoded club branding found in real dashboard data logic — the "MDS"/"Maroons SC" strings that exist are all marketing/placeholder content, not a functional bug.

### 2.5 `any` types masking real issues
206 occurrences. Root cause worth fixing directly rather than casting around: `web/components/dashboard/DashboardContext.tsx:16-28`'s `Club` type is missing every payment-related field that the query at line 92 actually fetches (`stripe_connect_onboarded`, `late_fee_*`, `hardship_fund_enabled`, etc.) — this single stale type forces `(club as any).stripe_connect_onboarded`-style casts throughout the payments UI. *Fix: add the missing fields to the `Club` type once.* Riskiest individual instances are all in the Stripe money-path files (`webhook/route.ts`, `create-payment-intent/route.ts`, `send-fee-reminder/route.ts`) where untyped nested-join casts feed directly into charge amounts and outbound parent emails.

### 2.6 Dead code / duplicated logic
- `create-checkout/route.ts` — dead, and its fee math has already drifted from `create-payment-intent/route.ts` (see §2.1).
- Duplicate/contradictory Stripe settings UI (see §2.1).
- Fee-payment recording logic reimplemented independently 3x (manual team-fees page, club-wide fees page, webhook handler) with no shared helper — a future change to the paid/partial threshold has to be made in three places.
- `web/app/super-admin/page.tsx:797` — hardcoded `pFeePct = 0` with a comment saying it must be kept in sync with the real server-side env var; no actual link between them.
- **[high]** `web/app/(dashboard)/dashboard/fees/page.tsx:118-134` — real Rules-of-Hooks violation (early `return` for `role==='coach'` before ~40 hooks run). This is what ESLint's 73 `react-hooks/rules-of-hooks` errors (all isolated to this one file) are actually pointing at — not a style nag, a real crash for any coach opening this page.
- Broader eslint backlog context (632 total, sampled not enumerated): `no-explicit-any` (218) and `no-unused-vars` (96) are cleanup; `no-unescaped-entities` (68) and `no-img-element` (50) are stylistic; `set-state-in-effect` (59) is almost entirely the idiomatic fetch-on-mount pattern, not a real bug in the instances checked; `rules-of-hooks` is the one category that turned out to mask an actual crash.

### 2.7 Onboarding-adjacent overlap
`requireRole`'s silent-401 issue (§2.3) applies equally to `api/onboarding/route.ts`. `lib/emailBranding.ts` is shared between fee-notification emails and onboarding/invite emails — flagged as a shared dependency, not independently audited here since onboarding got its own pass (below).

---

## 3. Onboarding Flow + White-Label Branding

Scope: `web/app/onboarding/page.tsx`, `web/app/join/page.tsx`, `web/app/register/[token]/page.tsx`, `web/app/login/page.tsx`, `web/app/reset-password/page.tsx`, `web/app/api/onboarding/route.ts`, `web/app/api/accept-invite/route.ts`.

### 3.1 Dead ends in the wizard
- **[blocker]** No resume/orphan handling at all — see cross-cutting item 6 above. `POST /api/onboarding`'s `create_club` action only checks slug uniqueness, never "does this authenticated user already own a club," and upserts `profiles.club_id` unconditionally — the first club becomes permanently orphaned with no self-serve way to reach or delete it.
- **[high]** `ClubStep.submit()` (`onboarding/page.tsx:441-453`) has no try/catch around the create-club fetch — a thrown network/JSON error leaves `loading=true` forever with the button stuck on "Creating…" and no error shown.
- **[high]** `ReviewStep.confirm()` — see §3.5, silent partial failure still reaches the "you're live" screen.
- **[medium]** Slug-collision check has a TOCTOU race, and the losing side of a concurrent collision gets a raw Postgres unique-violation message surfaced verbatim instead of the friendly "slug taken" message.
- **[low]** Logo upload has no unsupported-file-type/canvas-failure handling — "Use this logo" can silently no-op.
- **[low]** No timeout on the AI-import stream read loop (mitigated by the visible Back button, so not a true dead end).

### 3.2 Missing validation
- **[high]** Parent/coach email fields in the Review step aren't validated — the confirm button isn't inside a `<form onSubmit>`, so the browser's native email-format check never fires (unlike `join/page.tsx`, which does regex-validate). Garbage strings flow straight to `invites.email` and then to Resend.
- **[medium]** Jersey number: non-numeric input → `parseInt` → `NaN` → silently serializes to `null` with no warning shown in the review row; no floor check on negative numbers.
- AI import failure/timeout handling is actually solid — full try/catch, clear "AI scouting failed, fill in manually" fallback state. No issue there.

### 3.3 Auth state during signup
- **[blocker]** Infinite OAuth redirect loop for first-time Google/Apple sign-ins from `/login` — see cross-cutting item 5. Root cause: `/login`'s OAuth buttons redirect straight to `/dashboard`, which bounces to `/login` on a missing profile row, which immediately bounces back to `/dashboard` because a session exists. No escape without manually navigating to `/onboarding` or signing out.
- **[high]** Web onboarding's `AuthStep` doesn't handle the "signed up but awaiting email confirmation" case (`data.session === null` after `signUp`) — it upserts `profiles` and advances to `ClubStep` regardless, which then 401s on the anonymous-session `create_club` call, stranding the user on Step 2 with an opaque "Forbidden" error and no way forward (can't re-signup with the same email, can't log in unconfirmed). **Confirmed the mobile app already handles this exact case correctly** (`app/(auth)/register.tsx:82-85` + a full "check your email" screen) — this is the clearest example found of the same concept implemented differently across platforms, with the web side actually broken.
- **[medium]** `profiles` upsert error in `AuthStep` is silently discarded — any RLS denial or transient failure here is invisible, and the very next call (`create_club`) fails with no explanation of why.
- **[note]** Web onboarding's signup is email/password only, while CLAUDE.md and both `/login` and mobile `register.tsx` offer Google/Apple too — worth confirming whether that's an intentional simplification for self-serve signup or a gap.

### 3.4 White-label club routing / branding
- No hardcoded specific-club data found in onboarding/join/login/reset-password — branding is pulled dynamically everywhere checked, with a Pulse-FC-green fallback used only when a club has no color set, not another club's identity.
- **[medium]** Branding doesn't apply consistently through the wizard after Step 1 — `UploadStep` and parts of `ReviewStep` (the "Confirm & go live" button, the merge-tool button) are hardcoded to Pulse-FC green regardless of the club's chosen color, even though `ReviewStep` receives `primaryColor` as a prop and doesn't use it in those spots. A club that picks blue or red sees their color in the Step 1 preview, then green for the rest of the wizard, then their color again on Processing/Done. Worth confirming if intentional.
- **[cosmetic]** Placeholder text in `ClubStep` uses Rick's own club as the example (`"MDS Academy"` / `"mds-academy"`) — every third-party self-serve signup sees this. Not a bug, just a "you'll see this a lot" note.

### 3.5 Supabase queries/mutations with missing or silent error handling
- **[high]** `ReviewStep.confirm()` (`onboarding/page.tsx:1035-1131`) — team/player/invite/event inserts are all unchecked for errors; a failed team insert silently skips every player/event that pointed at it, and the wizard still proceeds to the "Done" screen claiming success. The file already has a working pattern for this exact problem (`fileOutcomes`, used during AI import) — it just isn't reused here.
- **[high]** `DoneStep.sendInvites()` (`onboarding/page.tsx:1692-1703`) ignores every fetch response from `/api/send-invite`/`/api/invite-coach` and unconditionally shows "✓ Invites sent" even if every email failed — the server already returns a proper 502 with error detail on Resend failure; the client just doesn't look at it.
- **[blocker, platform-wide]** `is_team_coach()` RLS function (`supabase/migrations/20240101000000_initial_schema.sql:220-228`) grants access based on role alone (`role in ('org_admin','app_admin')`) with no club scoping — unlike `is_team_member()`, which was already patched for this exact issue in `20260623000005_org_admin_full_club_access.sql`. This gates writes on players/invites/events/RSVPs/game_sessions/messages, and it's exactly what `ReviewStep.confirm()` relies on during onboarding. Any org_admin of any club — including one that just self-signed-up — currently passes this check for any other club's team. *Fix: apply the same `t.club_id = current_user_club_id()` scoping that `is_team_member()` already got.*
- **[medium]** `api/accept-invite/route.ts:76-81` — the tail of the function (linking the player record, marking the invite accepted) is unguarded, inconsistent with the rest of the same function, which correctly rolls back the created auth user on earlier failures.
- **[low]** `join/page.tsx:134` — post-signup `signInWithPassword` error is ignored; the UI can show "success" while the web session silently wasn't established.

### 3.6 `any` types masking real issues
- `web/app/api/onboarding/route.ts:82` — untyped `players.map((p: any) => ...)` inside the `create_team`/`add_players` actions, which appear to be **dead code**: the live wizard writes teams/players directly from the client rather than calling this route. Worth confirming and deleting if unused.
- `web/app/api/accept-invite/route.ts:25` — `const inv = invite as any;` hides whether the nested `teams`/`clubs` join comes back as object or array; worth an explicit interface.

### 3.7 Inconsistency vs. mobile's equivalent flows
- Confirmed: the "awaiting email confirmation" divergence above (§3.3) is the clearest concrete case.
- Invite acceptance for an **existing** user is correctly shared (`accept_invite` RPC called from both `join/page.tsx` and mobile `find-team.tsx`). For a **brand-new** user, though, web instead re-implements the same role-mapping logic in TypeScript (`api/accept-invite/route.ts:28`) rather than calling the RPC — currently consistent with the RPC, but it's two hand-maintained copies of the same business rule that will silently drift if invite semantics ever change in only one place.
- `web/app/register/[token]/page.tsx` is unrelated to invite acceptance despite the path name — it's a separate season-registration/payment-forms feature with its own solid error handling. Noting only so it isn't confused with `/join?token=` in any future refactor.

---

## Appendix — raw numbers

| | Mobile | Web |
|---|---|---|
| `tsc --noEmit` errors | 0 | 0 |
| `: any` / `as any` occurrences | ~351 | 206 |
| ESLint errors/warnings | not configured | 450 errors / 182 warnings (632 total) |
| Test suite | none | none |

Dominant ESLint categories on web (sampled, not fully enumerated): `no-explicit-any` (218, cleanup), `no-unused-vars` (96, cleanup), `no-unescaped-entities` (68, stylistic), `no-img-element` (50, stylistic), `set-state-in-effect` (59, mostly idiomatic fetch-on-mount — not bugs in the instances checked), `rules-of-hooks` (73, all in one file — this is the one category that turned out to mask a real crash, see §2.6).
