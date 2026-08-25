# Data Model Review — Pre-Scale Audit

Scope: schema design, indexes, N+1 query patterns, constraints/cascades, denormalization, and migration lock-risk. Excludes RLS policy logic, payment/webhook business logic, multi-tenant query scoping, and general perf/UX. All findings cite real files and lines as of `review/pre-scale-audit`.

---

## Indexes

**Severity: Critical**
**Location:** `app/(app)/[clubSlug]/conversation/[conversationId].tsx:180-185` (and `:218-224`), `app/(app)/[clubSlug]/(tabs)/chat.tsx:204-208, 230-235`; table defined at `supabase/migrations/20240101000000_initial_schema.sql:135-141`
**Problem:** `messages` has never had an index created on it in 169 migrations — not on `conversation_id`, not on `(conversation_id, created_at)`. Every conversation open, every "load earlier" page (`conversation/[conversationId].tsx:181` and `:220`), and the chat-list "last message per conversation" query (`chat.tsx:230`, `select ... in('conversation_id', allConvIds) order by created_at desc`) does a full sequential scan of the entire `messages` table across every club, sorts it, then filters. `messages` is also one of the only tables in this schema that grows unbounded and forever (unlike `players` or `teams`, chat history is never pruned) — this is the single query pattern most guaranteed to get worse every day, not just at the next club.
**Fix:** `create index idx_messages_conversation_created on messages (conversation_id, created_at desc);` — build with `create index concurrently` outside a transaction to avoid locking the table on a live system. Also add `create index idx_conv_participants_profile on conversation_participants (profile_id);` — the existing `unique(conversation_id, profile_id)` index (`20240101000000_initial_schema.sql:132`) can't serve `chat.tsx:206 .eq('profile_id', profile.id)` efficiently since `profile_id` isn't the leading column.
**Effort:** 15 minutes.

**Severity: Critical**
**Location:** `supabase/migrations/20260626000001_registration_forms.sql:16-20` (table def); consumed by `public.submit_registration` in `supabase/migrations/20260825000014_atomic_registration_capacity.sql:24-30`
**Problem:** `registration_submissions` has no index on `form_id` anywhere in the migration history, despite `form_id` being the column every query filters on (`SubmissionsTab.tsx:194 .in('form_id', formIds)`, the public registration page, and the capacity check). Worse: `submit_registration` (added 2026-08-25 specifically to fix a race in seat-capacity checking) takes `pg_advisory_xact_lock(hashtext(p_form_id::text))` and then runs `select count(*) from registration_submissions where form_id = p_form_id and status in ('pending','approved')` *while holding that lock*. Without an index, that count is a sequential scan of the whole table, executed serially (the advisory lock forces one submitter through at a time per form) — the exact scenario in the prompt: a popular registration form during signup season would serialize every parent's submit behind a full-table scan.
**Fix:** `create index concurrently idx_registration_submissions_form_status on registration_submissions (form_id, status);`
**Effort:** 10 minutes.

**Severity: High**
**Location:** `supabase/migrations/20260629000001_fees_system.sql:15-31` (`player_fees`, `fee_payments`); `supabase/migrations/20260817000002_fee_refunds.sql:13-22` (`fee_refunds`)
**Problem:** Across all three money tables, the only index that has ever been created is a partial one on `player_fees.plan_group_id` (`supabase/migrations/20260706000001_fees_payment_plans.sql:7`). `player_fees.team_id` (queried with `.in('team_id', teamIds)` on every org-admin dashboard load — `web/app/(dashboard)/dashboard/_ProDashboard.tsx:214`, `_SimpleDashboard.tsx:143`, `teams/[teamId]/page.tsx:70`, `settings/page.tsx:389`), `player_fees.player_id` (parent "my fees" and the payment portal), `player_fees.status`+`due_date` (the late-fee cron, see N+1 section), `fee_payments.player_fee_id` (every payment-history load), and `fee_refunds.player_fee_id`/`fee_payment_id` all rely on sequential scans today.
**Fix:** `create index concurrently idx_player_fees_team on player_fees(team_id); create index concurrently idx_player_fees_player on player_fees(player_id); create index concurrently idx_player_fees_status_due on player_fees(status, due_date) where due_date is not null; create index concurrently idx_fee_payments_fee on fee_payments(player_fee_id); create index concurrently idx_fee_refunds_fee on fee_refunds(player_fee_id);`
**Effort:** 20 minutes.

**Severity: Medium**
**Location:** `supabase/migrations/20260813000012_guardians_profile_completion.sql:16-21` (table), `:227-233` (`get_my_guarded_players()`); called from `app/(app)/[clubSlug]/(tabs)/index.tsx:464-468`, `(tabs)/_layout.tsx:68`, `(tabs)/schedule.tsx:217`, `event/[eventId].tsx:466`, `settings.tsx:224`, `sign-waivers.tsx:72`, `guest-request/[requestId].tsx:128`
**Problem:** `player_guardians`' only index is the composite primary key `(player_id, profile_id)`. `get_my_guarded_players()` filters `where profile_id = auth.uid()` — the second column of that PK, so Postgres can't use it as an efficient lookup. This RPC is called on essentially every screen a parent visits (home, schedule, tab layout gating, event detail, waivers), making it the parent-side equivalent of an unindexed dashboard query.
**Fix:** `create index concurrently idx_player_guardians_profile on player_guardians(profile_id);`
**Effort:** 5 minutes.

**Severity: Low**
**Location:** `supabase/migrations/20240101000000_initial_schema.sql:93` vs `supabase/migrations/20260728000001_performance_indexes.sql:10-11`
**Problem:** `event_rsvps` already gets a unique index on `(event_id, player_id)` from its `unique(event_id, player_id)` constraint (line 93 of the initial schema). `idx_event_rsvps_event_player on event_rsvps (event_id, player_id)`, added later, duplicates it column-for-column — every RSVP insert/update now maintains two identical btree indexes for no query benefit.
**Fix:** `drop index if exists idx_event_rsvps_event_player;`
**Effort:** 5 minutes.

---

## Missing constraints and cascades

**Severity: Critical**
**Location:** `supabase/migrations/20260822000001_message_reactions.sql:9` (`profile_id uuid references profiles(id) not null` — no `on delete`); `supabase/migrations/20260819000002_web_push_subscriptions.sql:6` (same); account-deletion RPC at `supabase/migrations/20260619000006_delete_account_rpc.sql:16-29`
**Problem:** `supabase/migrations/20260815000001_fix_profile_delete_fk_blocks.sql` fixed 27 foreign keys to `profiles` after a real production report ("Settings > Delete account error") because they were `NO ACTION` and blocked account deletion. Its own comment lays out the rule going forward: audit-trail columns get `SET NULL`, columns where "profile_id IS the substance of the row" (a specific person's vote/reaction) get `CASCADE`. Two tables created *after* that remediation — `message_reactions` (Aug 22) and `web_push_subscriptions` (Aug 19, actually created before the fix but never included in it) — both reintroduce the identical bug: `profile_id` is exactly the "substance of the row" case the rule says should cascade, but both were left at the implicit `NO ACTION` default. Compounding it, `delete_account()` (the RPC actually wired to the mobile Settings screen, `app/(app)/[clubSlug]/settings.tsx:627`) is a hand-maintained list of seven `delete from ... where profile_id = _uid` statements that was never updated for either table. Right now, any user who has ever reacted to a chat message or has a saved Android/PWA push subscription gets a hard failure trying to delete their account.
**Fix:** `alter table message_reactions drop constraint message_reactions_profile_id_fkey, add constraint message_reactions_profile_id_fkey foreign key (profile_id) references profiles(id) on delete cascade; alter table web_push_subscriptions drop constraint web_push_subscriptions_profile_id_fkey, add constraint web_push_subscriptions_profile_id_fkey foreign key (profile_id) references profiles(id) on delete cascade;` Longer-term: point `delete_account()` at the generalized `_delete_resolving_fk` engine already built for `admin_delete_club/team/player` (`supabase/migrations/20260825000007_generalize_self_healing_delete.sql`) instead of a manually-maintained statement list, so the next new `profile_id`-referencing table doesn't reopen this same bug a third time.
**Effort:** 20 minutes for the two constraints; 1-2 hours to rewire `delete_account()` onto the self-healing engine.

**Severity: Medium**
**Location:** `supabase/migrations/20260825000007_generalize_self_healing_delete.sql:1-8` (comment documents two prior live incidents); root cause at `supabase/migrations/20260710000004_player_evaluations.sql:9-11, 25-28` (`club_id`, `team_id`, `player_id` all `not null` with no `on delete` clause)
**Problem:** Rather than auditing every FK's `ON DELETE` behavior once, the pattern in this codebase has been to discover missing cascades one production error at a time (`admin_delete_club` first, then — per this migration's own comment — "the exact same class of bug... confirmed live" for team-delete and player-delete) and route around it with an increasingly general runtime engine that catches `foreign_key_violation`, introspects `pg_constraint` to find the blocking child table, and recursively deletes there first. It works, and it's genuinely clever, but it only protects the three call sites explicitly wired to it (`admin_delete_club/team/player`). Any future direct `delete from <table>` on an entity with an un-audited child FK — or the account-deletion path above — hits the same wall again.
**Fix:** No urgent action needed given the self-healing engine covers the known admin paths today, but worth a one-time pass setting explicit `on delete cascade`/`set null` on every remaining `NO ACTION` FK (`select conname, conrelid::regclass, confrelid::regclass from pg_constraint where contype='f' and confdeltype='a'` will list them) rather than continuing to expand the runtime-catch engine's reach.
**Effort:** 2-3 hours for a full audit + migration.

**Severity: Low**
**Location:** `supabase/migrations/20260815000001_fix_profile_delete_fk_blocks.sql:19-79`
**Problem:** This migration re-adds 27 foreign key constraints (`drop constraint` + `add constraint ... references profiles(id)`) across 27 different tables in one migration file. Re-adding a FK constraint requires Postgres to validate it against existing data, which takes an `ACCESS EXCLUSIVE` lock on the child table for the scan's duration. Run against small tables at 2-club scale this was invisible; the same pattern against a large table during business hours would not be.
**Fix:** For future bulk constraint changes, add with `not valid` first (near-instant, brief lock) and run `validate constraint` as a separate statement afterward (takes only a `SHARE UPDATE EXCLUSIVE` lock, doesn't block writes) — e.g. `alter table x add constraint x_fk foreign key (...) references profiles(id) on delete set null not valid; alter table x validate constraint x_fk;`
**Effort:** No action needed now; process note for next time.

---

## Denormalization / financial ledger integrity

**Severity: High**
**Location:** `web/lib/feePayments.ts:26-33` (`recordFeePayment`), `web/lib/feePayments.ts:41-48` (`undoFeePayment`), `web/lib/refunds.ts:100-113` (`applyRefund`) — contrast with `web/app/api/stripe/webhook/route.ts:239-257`
**Problem:** `player_fees.amount_paid` is a cached running total with four independent write paths: the Stripe webhook, the two web dashboard fee-recording functions, and the mobile `confirm_fee_payment` RPC (`supabase/migrations/20260813000009_fee_payment_claims.sql:96-107`). Only the webhook protects against concurrent writes — it explicitly re-reads `amount_paid`, computes the new value, and writes with `.eq('amount_paid', prevPaid)` as a compare-and-swap, retrying up to 5 times, with a comment explaining exactly why ("Two payment intents on the same fee... can both succeed at Stripe and land here concurrently"). The other three paths do a plain read-then-write with no such guard: `feePayments.ts:32` and `:48` take `currentPaid` as a parameter (read earlier, by the caller) and unconditionally `.update({amount_paid: newPaid...})`; `refunds.ts:110-113` does the same; `confirm_fee_payment` reads `v_row.amount_paid`, computes `v_new_paid`, and updates with no row lock or CAS. A coach recording a manual payment on the web Fees page at the same moment a parent's Stripe payment lands via webhook — or a parent's claim being confirmed while a refund is also being processed on the same fee — silently drops one of the two writes, under-recording money actually collected, with no error surfaced.
**Fix:** Apply the same compare-and-swap pattern already proven in the webhook to the other three write paths (re-read + `.eq('amount_paid', prevPaid)` + retry-on-miss), or — better long-term — stop storing `amount_paid` as an independently-written cache at all and derive it via a trigger that recomputes `SUM(fee_payments.amount) - SUM(fee_refunds.amount)` on insert/update/delete of either table, removing the need for every call site to get the increment right.
**Effort:** 1-2 hours to add CAS to the three remaining call sites; 3-4 hours for the trigger-based rewrite.

**Severity: Medium**
**Location:** `supabase/migrations/20260817000002_fee_refunds.sql:11, 17`; `supabase/migrations/20260817000003_surcharge_refund_proration.sql:9, 16`; `supabase/migrations/20260817000004_platform_fee_collected.sql:9` — contrast with `supabase/migrations/20260629000001_fees_system.sql:7, 37` (`fee_categories.amount`, `fee_payments.amount`, both `numeric(10,2)`)
**Problem:** The original money columns are consistently `numeric(10,2)`. Every money column added in the Aug 17 refund/surcharge work — `fee_payments.refunded_amount`, `refunded_surcharge`, `platform_fee_collected`, `fee_refunds.amount`, `fee_refunds.surcharge_amount` — is a bare `numeric` with no scale. Application code (`round2()` in `web/lib/refunds.ts:15-17`) rounds to cents before writing, but the database itself no longer enforces that, so a future write path that forgets to round can silently accumulate sub-cent drift in a ledger that other code (the CAS logic above) treats as exact.
**Fix:** `alter table fee_payments alter column refunded_amount type numeric(10,2), alter column refunded_surcharge type numeric(10,2), alter column platform_fee_collected type numeric(10,2); alter table fee_refunds alter column amount type numeric(10,2), alter column surcharge_amount type numeric(10,2);` — cheap on today's row counts (no rewrite needed for numeric scale changes that don't lose data, but confirm row counts stay small before running on the live money tables).
**Effort:** 15 minutes.

---

## Schema design

**Severity: Medium**
**Location:** `supabase/migrations/20260623000002_event_cancellation.sql:1-3` (`cancellation_reason`) vs `supabase/migrations/20260805000001_event_cancellation.sql:1-3` (`cancelled_reason`); orphaned write at `web/app/api/fields/close/route.ts:108`
**Problem:** Two separate migrations, six weeks apart, both add an event-cancellation reason column to `events`, using `add column if not exists` — which only skips a genuinely duplicate name, so both `cancellation_reason` and `cancelled_reason` now exist side by side. Every real UI path (`app/(app)/[clubSlug]/edit-event/[eventId].tsx:717,759`, `web/app/(dashboard)/dashboard/schedule/page.tsx:476,502`, `web/app/(dashboard)/dashboard/fields/page.tsx:816`, `event/[eventId].tsx:1417-1419`, `generate-cancellation-email/index.ts:126,174`) reads and writes `cancellation_reason` — except the field-closure auto-cancel route, which writes `cancelled_reason`. An event auto-cancelled by a field closure gets `cancelled_at` set (so it correctly shows as cancelled) but its reason silently lands in a column nothing displays — the coach/parent-facing cancellation banner renders blank for exactly the automated closure flow where an explanation matters most.
**Fix:** `update events set cancellation_reason = cancelled_reason where cancelled_reason is not null and cancellation_reason is null;` then fix `fields/close/route.ts:108` to write `cancellation_reason`, then `alter table events drop column cancelled_reason;`
**Effort:** 20 minutes.

**Severity: Medium**
**Location:** `supabase/migrations/20260626000001_registration_forms.sql:17-21` (table def); duplicate handling at `web/app/(dashboard)/dashboard/registrations/_components/SubmissionsTab.tsx:126-168` (`detectDuplicates`)
**Problem:** `registration_submissions.data` is a schemaless `jsonb` blob — name/email live inside it, not as real columns — so there is no database-level way to prevent the same family submitting twice to the same form (double-click, retry after a network blip, or a parent genuinely resubmitting). The `submit_registration` RPC (`20260825000014_atomic_registration_capacity.sql`) correctly serializes against overselling `max_spots`, but does nothing to dedupe identity, because it can't cheaply query into JSON. Instead, `SubmissionsTab.tsx` loads every submission for every form into the browser on each page load and does an O(n²) fingerprint pass client-side (`detectDuplicates`, iterating all submissions per form, then all fingerprint groups) to flag duplicates *after* they've already consumed a capacity slot. At a larger club during a popular signup window, duplicates inflate `max_spots` consumption (falsely waitlisting real families) and the client-side dedupe pass gets slower with every submission.
**Fix:** Add generated columns for the fields that matter and constrain them: `alter table registration_submissions add column email_norm text generated always as (lower(trim(data->>'email'))) stored; create unique index idx_reg_sub_dedupe on registration_submissions(form_id, email_norm) where email_norm is not null and status <> 'declined';` and let the unique-violation path in `submit_registration` return a friendly "already registered" instead of a second row.
**Effort:** 1-2 hours (needs to confirm the field key used for email is consistent across form configs first).

---

## N+1 patterns

**Severity: High**
**Location:** `web/app/api/cron/apply-late-fees/route.ts:22-99`, `web/app/api/cron/rsvp-reminders/route.ts:57-141`, `web/app/api/cron/event-day-reminders/route.ts:27-70`
**Problem:** All three scheduled cron jobs share the same shape: fetch a batch of rows (overdue fees / due-soon events / today's events), then `for (const row of rows)` issue 3-5 sequential Supabase round trips per row — in `apply-late-fees`, per overdue fee: one `player_fees` UPDATE, one `player_guardians` SELECT, one `players` SELECT, one `notifications` INSERT, one `push_tokens` SELECT (`route.ts:59-93`); `rsvp-reminders` does the same shape per event (`route.ts:74-133`); `event-day-reminders` per event (`route.ts:29-63`). These are exactly the automated, unattended jobs that scale directly with club count and registration-season volume — with 12+ clubs each running fee schedules and full game calendars, these loops get proportionally slower every month, and a Vercel serverless function that times out mid-loop leaves some fees updated/reminders sent and others silently skipped for that run (no batching/checkpointing).
**Fix:** Batch each stage: fetch all guardian rows for every affected `player_id` in one `.in('player_id', ids)` call, all push tokens in one `.in('profile_id', ids)` call, and build one multi-row `notifications` insert, instead of one round trip per row. The late-fee route's UPDATE-with-CAS (`route.ts:59-65`) has to stay per-row (it's the correctness-critical idempotency guard), but everything after it — the notification lookup/send — can be hoisted out of the loop and batched.
**Effort:** 2-3 hours across the three routes.

**Severity: Medium**
**Location:** `web/app/(dashboard)/dashboard/registrations/_components/SubmissionsTab.tsx:264-270`
**Problem:** Bulk-moving selected registration submissions to "waitlisted" issues one `UPDATE ... where id = ...` per submission inside `for (const id of ids) { await supabase.from('registration_submissions').update(...).eq('id', id); nextPos += 1; }`, to assign sequential waitlist positions. During registration season, an admin bulk-waitlisting a batch of overflow signups (common right when a form fills up) pays one network round trip per row instead of one.
**Fix:** Since positions are sequential per row, this needs either a small RPC that does the whole batch in one `UPDATE ... FROM (VALUES ...)` statement, or (simplest) drop the position increment into a single `update ... set waitlist_position = waitlist_position_seq` using a window function server-side.
**Effort:** 1 hour.

**Severity: Low**
**Location:** `web/app/(dashboard)/dashboard/teams/[teamId]/fees/page.tsx:152-168`
**Problem:** "Assign fee to all players" on the per-team fees page inserts one `player_fees` row per player via `for (const pid of playerIds) { await supabase.from('player_fees').insert({...}) }`. The club-wide fees page (`web/app/(dashboard)/dashboard/fees/page.tsx:784-790`) already does this correctly as a chunked bulk insert (`rows.slice(i, i+100)`) — this per-team page regressed to the row-at-a-time version. Bounded by roster size (~15-30), so low urgency, but worth aligning since the right pattern already exists two files away.
**Fix:** Build the full `rows` array first and insert in one (or chunked) call, matching `fees/page.tsx`'s existing pattern.
**Effort:** 20 minutes.

---

## Migrations (lock risk)

**Severity: High**
**Location:** `supabase/migrations/20260817000001_rail_based_fee_model.sql:10-13`; `supabase/migrations/20260805000007_stripe_payments.sql:4-11`
**Problem:** The same three-step pattern — `ADD COLUMN` (nullable), `UPDATE <table> SET col = ... WHERE col IS NULL` (full-table backfill), `ALTER COLUMN ... SET NOT NULL` — was run twice against `player_fees`, a table that by design is written to continuously by parents paying fees (`fee_model_version` in the rail-model migration; `payment_token` in the Stripe migration, which additionally makes it `UNIQUE`). `SET NOT NULL` requires Postgres to scan the whole table to verify no NULLs remain, holding `ACCESS EXCLUSIVE` for the scan — blocking every read and write against `player_fees` for its duration. At today's row counts this was invisible; the exact same migration shape run again post-scale, during a live registration window with concurrent Stripe webhooks and dashboard writes hitting `player_fees`, is the scenario this audit exists to catch.
**Fix:** For the next such change: add the column nullable with no default, backfill in batches (`UPDATE ... WHERE id IN (SELECT id FROM player_fees WHERE col IS NULL LIMIT 1000)` looped, committing between batches) to avoid one giant transaction, then add the constraint as `CHECK (col IS NOT NULL) NOT VALID` followed by a separate `VALIDATE CONSTRAINT` (which takes a much weaker lock and doesn't block concurrent writes) instead of `ALTER COLUMN SET NOT NULL`.
**Effort:** No action needed on the two shipped migrations; process note before the next one on this table.

---

## What's already done well

- **The Stripe webhook's compare-and-swap on `player_fees.amount_paid`** (`web/app/api/stripe/webhook/route.ts:239-257`) and **the late-fee cron's CAS on `late_fee_applied`** (`apply-late-fees/route.ts:59-65`) both correctly anticipate and guard against concurrent-write races, with comments explaining exactly the failure mode being prevented — this is the right pattern, just not applied consistently everywhere it's needed (see Denormalization section).
- **`submit_registration`'s advisory-lock-scoped capacity check** (`20260825000014_atomic_registration_capacity.sql`) closes a genuine overselling race correctly and cheaply (per-form lock, not a global one).
- **Idempotency on Stripe-sourced rows** via `fee_payments_stripe_payment_intent_id_key` (`20260812000003_fee_payments_idempotency.sql`) and `fee_refunds.stripe_refund_id` correctly relies on Postgres treating multiple NULLs as distinct, so manual (non-Stripe) payments are unaffected.
- **The `event_id` foreign keys are consistently and thoughtfully chosen** across every table added over the past two months (`cascade` for rows that are meaningless without their event, `set null` for rows that should survive it) — this is exactly the kind of per-column judgment call that's missing for the `profiles`-referencing FKs.
- **The 2026-08-15 FK remediation** (`fix_profile_delete_fk_blocks.sql`) fixed 27 constraints in one pass with a clearly stated, consistently applied rule (audit-trail columns → `SET NULL`, "profile_id is the substance of the row" → `CASCADE`) — the gap is that the rule wasn't turned into a guardrail (a lint/CI check on new migrations, or routing account deletion through the self-healing engine), so it's already been silently violated twice since.
