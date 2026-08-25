# Payments Review — Stripe Connect / Fees / Refunds

Scope: `web/app/api/stripe/*`, `web/app/api/pay/*`, `web/app/api/cron/apply-late-fees`, `web/app/api/cron/fee-reminders`, `web/lib/refunds.ts`, `web/lib/feePayments.ts`, `fee_payments`/`fee_refunds`/`hardship_contributions`/`registration_installments` tables. Standing assumption: webhooks arrive late, out of order, twice, or never.

---

## Findings

### 1. The parent's "Payment received" screen is driven entirely by the client, independent of any DB write — and nothing ever reconciles the two if the webhook is lost

**Severity:** Critical
**Location:** `web/app/pay/[token]/page.tsx:74-81` (`finishPayment`) together with `web/app/api/stripe/webhook/route.ts:186-257` (`handlePaymentComplete`, the *only* place that ever writes `fee_payments`/`player_fees`)
**Problem:** `finishPayment()` calls `stripe.confirmPayment`/`confirmCardPayment` directly against Stripe from the browser, and the instant `paymentIntent?.status === 'succeeded'` comes back, it calls `onSuccess()` and shows "Payment received! ... You'll receive a receipt by email shortly" — with zero server round-trip to confirm the DB was actually updated. The only thing that ever credits `fee_payments`/`player_fees` is the `payment_intent.succeeded` webhook. If that webhook is ever silently dropped (endpoint down during Stripe's ~3-day retry window, non-2xx response that never gets fixed, webhook secret rotated without updating Stripe, etc.), the parent has already seen success and moved on, while the club's fee ledger shows the fee still outstanding forever — and `web/app/api/cron/apply-late-fees/route.ts` will then pile a late fee on top of a fee that was, from the parent's perspective, already paid. I checked every cron under `web/app/api/cron/*` (`fee-reminders`, `apply-late-fees`, `cert-expiry`, `event-day-reminders`, `reflection-prompts`, `rsvp-reminders`) — none of them reconcile `fee_payments` against Stripe's own records. There is no reconciliation job anywhere in the codebase.
**Fix:** Add a synchronous backstop: after the client sees `status === 'succeeded'`, have it call a new `POST /api/stripe/confirm-payment` with the `payment_intent_id`. That route retrieves the PaymentIntent from Stripe server-side (source of truth, not client-supplied data) and, if `status === 'succeeded'`, runs the same crediting path `handlePaymentComplete` already uses — which is already idempotent on `stripe_payment_intent_id`, so calling it twice (once from this route, once later from the webhook if it eventually arrives) is safe by construction. Separately, add a daily cron that lists Stripe PaymentIntents (or Balance Transactions) for each connected account with `metadata.player_fee_id` and `status=succeeded` created in the last 48h, diffs against `fee_payments.stripe_payment_intent_id`, and logs/alerts on any gap — this is the actual reconciliation job the review brief asks whether exists. It does not, today.
**Effort:** 2-3 hours (backstop route + reconciliation cron).

### 2. No dispute/chargeback handling exists anywhere

**Severity:** Critical
**Location:** `web/app/api/stripe/webhook/route.ts` (whole file — no `charge.dispute.*` branch)
**Problem:** Confirmed via full-repo grep that `dispute` never appears in any payments code path. When a parent's bank reverses a charge (`charge.dispute.created`), Stripe immediately debits the disputed amount plus a dispute fee from the connected account's balance — but Pulse FC's DB has no way to find out. `fee_payments`/`player_fees.status` keeps showing the fee as `paid` permanently, no `fee_refunds`-equivalent audit row is created, and no club admin is ever notified that money they thought they had was clawed back. A club could keep treating the player as paid-in-full (and even refuse them a spot for non-payment reasoning that's now wrong) while genuinely being out that money with no record of why.
**Fix:** Handle `charge.dispute.created`, `charge.dispute.closed` (and optionally `charge.dispute.funds_withdrawn`/`funds_reinstated`). On creation: look up `fee_payments` by `payment_intent`, flag the row (e.g. add a `disputed_at`/`dispute_status` column, mirroring how `refunded_amount` already tracks refunds), and notify `org_admin`/`app_admin` the same way `handlePaymentFailed` already notifies parents (reuse the existing notification + push pattern at `webhook/route.ts:161-178`). On `closed`, record win/loss and, if lost, walk `player_fees.amount_paid` back down the same way `applyRefund` does.
**Effort:** 2-4 hours (new columns/migration + two handlers + admin notification).

### 3. `hardship_contributions` insert is not idempotent — a redelivered webhook double-counts the donation even though the fee itself is correctly deduped

**Severity:** High
**Location:** `web/app/api/stripe/webhook/route.ts:38-51`
**Problem:**
```ts
await handlePaymentComplete({ ... });
if (club_id && donation_amount && parseFloat(donation_amount) > 0) {
  const supabase = supabaseAdmin();
  await supabase.from('hardship_contributions').insert({ club_id, player_fee_id, amount: parseFloat(donation_amount) });
}
```
`handlePaymentComplete` is correctly idempotent — its `fee_payments` insert hits the unique constraint on `stripe_payment_intent_id` (`supabase/migrations/20260812000003_fee_payments_idempotency.sql`) and returns early on a duplicate delivery. But this caller doesn't check that outcome at all, and `hardship_contributions` (`supabase/migrations/20260806000001_late_fees_hardship.sql`) has **no unique constraint of any kind** — not on payment intent, not on anything. So on a Stripe retry of `payment_intent.succeeded` (realistic here: `handlePaymentComplete` does ~10 sequential DB round-trips plus a synchronous Resend email send before the handler returns 200, which is exactly the kind of slow response that triggers Stripe's own retry), the fee crediting correctly no-ops but the hardship donation gets inserted a second time. Per the comment in `supabase/migrations/20260825000006_hardship_fund_track_usage.sql`, the club's displayed "hardship fund available" balance is `SUM(hardship_contributions.amount)` — so this silently inflates the balance an org admin sees and can waive other families' fees against.
**Fix:** Make `handlePaymentComplete` return whether it actually performed the insert (`{ credited: boolean }`), and only insert into `hardship_contributions` when `credited === true`. Belt-and-suspenders: add a `stripe_payment_intent_id` column to `hardship_contributions` with a unique constraint, same pattern as `fee_payments`.
**Effort:** 30-45 minutes.

### 4. No idempotency key on outbound PaymentIntent/Refund creation calls to Stripe

**Severity:** High
**Location:** `web/app/api/stripe/create-payment-intent/route.ts:200-204`; `web/app/api/stripe/refund/route.ts:105-109`
**Problem:** Neither call sends a Stripe `Idempotency-Key` header (confirmed via repo-wide grep — zero matches for `Idempotency-Key` anywhere in `web/`). For `create-payment-intent`, a client-side network retry (timeout on the fetch, even though the server-side call to Stripe actually succeeded) creates a **second real PaymentIntent** rather than replaying the first. For `refund/route.ts`, the check at line 55 (`refundable = amount - refunded_amount`) is computed from a plain read with no claim/lock before the Stripe call at line 105 — two concurrent refund requests for the same `fee_payment_id` (double-click, or two admins acting at once) both read the same `refunded_amount`, both pass validation, and both hit Stripe's `/v1/refunds` for the same amount. Stripe will happily process both as long as the sum doesn't exceed the original charge — a $50 refund intended once can become two real $50 refunds against a $100 charge.
**Fix:** For refunds specifically, add a `refund_pending boolean default false` column to `fee_payments` and CAS-claim it before calling Stripe — the exact pattern this codebase already uses for late fees (`web/app/api/cron/apply-late-fees/route.ts:59-62`, `.eq('late_fee_applied', false)`):
```ts
const { data: claimed } = await supabase.from('fee_payments')
  .update({ refund_pending: true }).eq('id', payment.id).eq('refund_pending', false).select('id');
if (!claimed?.length) return NextResponse.json({ error: 'A refund is already in progress for this payment.' }, { status: 409 });
// ...call Stripe...
// clear refund_pending in a finally block
```
For `create-payment-intent`, pass a deterministic `Idempotency-Key` derived from `payment_token` + amount + rail (or a client-generated request id threaded through), so a client retry replays rather than duplicates.
**Effort:** 1-2 hours.

### 5. `applyRefund`'s ledger update is a plain read-then-write, not a compare-and-swap, unlike the payment-credit path

**Severity:** Medium
**Location:** `web/lib/refunds.ts:72-98`
**Problem:** `handlePaymentComplete` in the webhook explicitly implements a CAS retry loop (`web/app/api/stripe/webhook/route.ts:239-257`) specifically because two concurrent payments on the same fee are a known, documented risk. `applyRefund` — which runs from both the manual refund route and the `charge.refunded` webhook branch, i.e. it is exactly as concurrency-exposed — does not: it reads `payment.refunded_amount` once (line 72-76) and later writes `refunded_amount: round2(Number(payment.refunded_amount ?? 0) + amount)` (line 93-98) with only `.eq('id', feePaymentId)`, no re-assertion of the value it read. Two distinct refund events for the same `fee_payment_id` landing concurrently (e.g. a manual refund via the API route racing a `charge.refunded` webhook for a dashboard-issued refund on the same payment) can lose one increment — `fee_refunds` still has both audit rows (so the true total is recoverable by summing), but `fee_payments.refunded_amount` and `player_fees.amount_paid`/`status` silently drift from it.
**Fix:** Apply the same retry-loop CAS already used at `webhook/route.ts:241-257` to the updates at `refunds.ts:93-98` and `refunds.ts:113`.
**Effort:** 30-45 minutes.

### 6. Manual (cash/check) payment recording has the identical race, with no protection at all

**Severity:** Medium
**Location:** `web/lib/feePayments.ts:18-36` (`recordFeePayment`), `:38-50` (`undoFeePayment`)
**Problem:** `recordFeePayment` takes `currentPaid` as a plain argument captured from the browser's in-memory state when the payment modal was opened, then does `newPaid = currentPaid + amount` and `supabase.from('player_fees').update({ amount_paid: newPaid, ... }).eq('id', feeId)` — no re-read, no CAS guard on `amount_paid`. Two coaches/admins recording a cash payment for the same fee within the same page-load window (or one admin double-clicking through a slow network) both insert a distinct, correct `fee_payments` row, but whichever `player_fees` update lands second overwrites the first's contribution to `amount_paid`, silently under-reporting how much was actually paid. `undoFeePayment` has the same shape of bug.
**Fix:** Same CAS pattern as items 4/5 — re-read `amount_paid` and assert it in the `.eq()` on write, retrying on conflict, or move this logic server-side into a route that does it atomically via a single UPDATE with `amount_paid = amount_paid + $1` instead of computing the new value in JS.
**Effort:** 45 minutes.

### 7. Stripe Connect "onboarded" status is computed two different ways in two different places, and only one of them self-heals

**Severity:** Medium
**Location:** `web/app/api/stripe/connect/return/route.ts:29-32` vs. `web/app/api/stripe/webhook/route.ts:126-136` (`handleAccountUpdated`)
**Problem:** `connect/return` (the one-time redirect after the Express onboarding flow) sets `stripe_connect_onboarded = true` based on `account.details_submitted` alone. The ongoing sync path — `account.updated`, the *only* other place this flag is ever touched — requires `charges_enabled && details_submitted`. If a club finishes the onboarding form (`details_submitted = true`) but Stripe hasn't yet enabled charges (pending verification, which is common and can take days), `connect/return` marks the club onboarded regardless. `create-payment-intent/route.ts:126` gates routing to the connected account purely on `stripe_connect_onboarded`, so this club's payment page will start creating PaymentIntents against an account that can't yet accept charges — every one will fail at Stripe. If the subsequent `account.updated` event that would otherwise flip `charges_enabled` true (and, separately, would flip a *restricted* account back to false) is ever missed, this drift has no other path to correct itself — there's no polling of connected-account status anywhere.
**Fix:** Change the condition at `connect/return/route.ts:29` to `account.charges_enabled && account.details_submitted`, matching `handleAccountUpdated` exactly (or better, extract one shared function both call).
**Effort:** 5-10 minutes.

### 8. The fee-reminders cron filters on a status value that fees are never actually given, so unpaid (not-yet-partial) fees never get reminded

**Severity:** High
**Location:** `web/app/api/cron/fee-reminders/route.ts:17`
**Problem:** `.in('status', ['pending', 'partial'])` — but `player_fees.status` is constrained to `('outstanding','partial','paid','waived','overdue')` with `DEFAULT 'outstanding'` (`supabase/migrations/20260629000001_fees_system.sql:26`). `'pending'` is not a value this column is ever set to anywhere in the codebase (confirmed by grep — the only occurrence of the string `'pending'` near a fee is this one line). Every fee that's been created but never touched by a payment — i.e. the overwhelming majority of unpaid fees — sits at `status = 'outstanding'` and is therefore permanently invisible to this query. The automated reminder pipeline only ever reminds parents who have already made a *partial* payment; parents who haven't paid anything never get a nudge. Nothing surfaces this — the cron runs "successfully" every time, just against an empty/near-empty result set for the common case.
**Fix:** `.in('status', ['outstanding', 'partial'])`.
**Effort:** 2 minutes.

### 9. A `charge.refunded` event with no matching `fee_payments` row is silently dropped with no log

**Severity:** Low
**Location:** `web/app/api/stripe/webhook/route.ts:84-93` (`handleChargeRefunded`)
**Problem:** `if (!paymentRow) return;` — if a refund webhook arrives for a `payment_intent` that isn't yet (or is no longer, e.g. a data issue) in `fee_payments`, the refund is permanently lost: no record, no retry, no log line to even discover it happened. Combined with finding 1 (no reconciliation job), this refund will never be reflected anywhere in Pulse FC even though Stripe genuinely returned the money.
**Fix:** `console.error('charge.refunded: no matching fee_payments row', { payment_intent: charge.payment_intent })` at minimum, so it's greppable/alertable.
**Effort:** 5 minutes.

### 10. The payment-credit CAS retry loop gives up silently after 5 attempts

**Severity:** Low
**Location:** `web/app/api/stripe/webhook/route.ts:239-257`
**Problem:** The retry loop that reconciles concurrent payments into `player_fees.amount_paid` only logs when Postgres itself returns an error (`if (updateErr) { console.error(...); break; }`). If it instead loses the race 5 times in a row (i.e. sustained write contention on the same fee), the loop just ends — `fee_payments` has the correct row, but `player_fees.amount_paid`/`status` is never updated for that payment, and nothing is logged to indicate it happened.
**Fix:** Add an `else` branch after the loop that logs when the final `claimed` check never succeeded, so this is at least discoverable.
**Effort:** 5 minutes.

### 11. Duplicate `payment_intent.payment_failed` deliveries send duplicate failure notifications

**Severity:** Low
**Location:** `web/app/api/stripe/webhook/route.ts:141-179` (`handlePaymentFailed`)
**Problem:** Unlike `handlePaymentComplete`, this handler has no dedupe at all — it inserts a `notifications` row and sends a push on every invocation. A redelivered `payment_intent.payment_failed` (same causes as elsewhere in this doc — slow handler, transient 5xx) sends the parent a second "❌ Payment failed" push for the same decline.
**Fix:** Low priority given the (harmless) failure mode, but a cheap fix is a short-lived dedupe check (e.g. skip if a `payment_failed` notification for this `player_fee_id` + PI already exists in the last few minutes).
**Effort:** 15-20 minutes.

---

## What's already done well

- **Signature verification is correct and done first.** `web/app/api/stripe/webhook/route.ts:14-19` reads the raw body via `req.text()` (never re-serializes), verifies against `STRIPE_WEBHOOK_SECRET` using HMAC-SHA256 over `${timestamp}.${body}`, enforces Stripe's recommended 300s replay tolerance, and uses a genuine constant-time comparison (`timingSafeEqual`, lines 405-413) — all before any DB write or `JSON.parse`.
- **The core payment-credit path is genuinely idempotent and race-aware.** The unique constraint on `fee_payments.stripe_payment_intent_id` (`20260812000003_fee_payments_idempotency.sql`) plus the explicit CAS retry loop in `handlePaymentComplete` (`webhook/route.ts:239-257`) correctly handles both "same event redelivered" and "two different successful payments on the same fee, concurrently" — the two scenarios this review was specifically asked to trace.
- **Refund recording is idempotent on `stripe_refund_id`** (`fee_refunds.stripe_refund_id unique`, `20260817000002_fee_refunds.sql`), so a refund issued via the app's own API and later echoed back through `charge.refunded` (or a redelivered `charge.refunded`) correctly no-ops instead of double-refunding the ledger.
- **Surcharge/refund proration math is careful about edge cases.** `splitRefundAmount` (`web/lib/refunds.ts`) explicitly special-cases "this refund covers everything still outstanding on both legs" to avoid a proportional-split rounding gap permanently stranding a cent or two unrefunded on either the base or surcharge leg.
- **Late-fee application is properly guarded against double-apply from overlapping cron runs**, using the exact CAS pattern (`.eq('late_fee_applied', false)` on the write) that I'm recommending elsewhere in this report for the refund and manual-payment paths.
- **Connect account creation correctly refuses to proceed on a partial failure** (`connect/init/route.ts:59-71`): if the Stripe account is created but saving its ID to `clubs` fails, the route errors out rather than handing back a working onboarding link for an account the DB doesn't know about — which would have orphaned the account and permanently broken the `account.updated` webhook's ability to find that club.
- **`account.updated` self-heals `stripe_connect_onboarded` in the compliance-hold/restriction direction** (a club that gets restricted stops being offered online payment) — the gap is only the onboarding-completion direction covered in finding 7.
