# Pulse FC — Architecture Summary

*Written as orientation for the pre-scale review (branch `review/pre-scale-audit`). Solo-developer project, currently 2 live clubs (MDS Academy, Maroons SC, both run by the developer), built for self-serve onboarding of paying clubs beyond those two.*

## What the product actually is today

CLAUDE.md describes a v1 scope (roster, schedule, chat, lineup builder, 4 AI features, no payments). The codebase has grown well past that: **46 tables**, **278 RLS policies** across 62 migration files, and **169 total migrations** since `20240101000000_initial_schema.sql` (first real dated migration `20250617`, most recent `20260825` — i.e. active, continuous development, not a single big-bang schema). Live functionality now includes, beyond the CLAUDE.md v1 list:

- **Payments**: Stripe Connect Express (per-club accounts), PaymentIntents, refunds, hardship contributions, late-fee automation, surcharge handling (`fee_categories`, `fee_payments`, `fee_refunds`, `hardship_contributions`, `registration_installments`).
- **Registration & tryouts**: a full tryout module (rankings, offers, coach assignments, practice slots, waitlists) and a separate "registration hub" (forms, promo codes, waivers, volunteer signups, late invites).
- **Field/facility scheduling**: field closures, availability rules, closure acknowledgements, weather integration.
- **Player development**: evaluations, evaluation batches, reflections, shoutouts, staff certifications.
- **Engagement**: team polls, callouts (urgent broadcasts), photo gallery with likes, guest requests/invites for tryout-adjacent visitors.
- **Ops**: cron-driven reminders (RSVP, fees, cert expiry, event-day), email logs, push subscriptions (both Expo push and web push).

Rebrand note (carried in memory): production domain moved from `dugoutfc.app` to `pulse-fc.app` in July 2026; `app.json` still has `slug: "dugout-fc"` and the iOS project is named `DugoutFC.xcodeproj`/`PulseFC.xcodeproj` inconsistently — cosmetic, but worth flagging once rather than having multiple reviewers rediscover it.

**Read CLAUDE.md for the intended v1 product model and role system — it's still correct on those fundamentals (4 roles, club-scoped multi-tenancy, slug-based routing). Treat its feature list and "no payments in v1" framing as historical, not current.**

## Two applications, one Supabase backend

### Mobile app (root of repo)
- Expo SDK 56 / React Native 0.85 / Expo Router 56 (file-based routing), TypeScript, React 19.2.
- iOS-first (bundle `com.pulsefc.mobile`), built and submitted via EAS/Xcode directly — no Expo Go in this project's workflow.
- Route structure mirrors CLAUDE.md's plan: `app/(auth)/*` for the pre-login flow (welcome → login/register → role-select → role-benefits → create-team/find-team → profile-setup), `app/(app)/[clubSlug]/(tabs)/*` for the four bottom tabs (Home/Schedule/Roster/Chat), and `app/(app)/[clubSlug]/admin/*` for the coach/admin panel — now much larger than the original spec (club-calendar, club-import, evaluation-form, emergency-broadcast, guest-activity, pending-invites, recordings, season-stats, roster-import, schedule-upload, plus the lineup builder and match tracker nested under `admin/events/[eventId]/`).
- State/data: `lib/supabase.ts` (client), `hooks/useAuth.tsx` + `hooks/TeamContext.tsx` (session and club/team context — `TeamContext` resolves a synthetic `org_admin` pseudo-role for club admins who have no `team_members` row), `lib/realtime.ts` (Supabase Realtime for chat), `lib/push.ts`/`hooks/usePushNotifications.ts` (Expo push).
- AI/email/analytics clients (`lib/claude.ts`, `lib/resend.ts`, `lib/posthog.ts`) exist on the mobile side too, alongside the web copies — worth checking whether any of these embed a key that should be server-only.

### Web app (`/web`)
- Next.js 16 (App Router), React 19.2, Tailwind 4, deployed on Vercel.
- Three distinct surfaces sharing one Next app: the **marketing site** (`/`, `/pricing`, `/for-clubs`, `/coaches`, `/compare`, three `-vs-` competitor pages), the **club-facing dashboard** (`/(dashboard)`, `/onboarding`, `/[clubSlug]`, `/portal`, `/join`, `/players`, `/schedule`), and the **super-admin console** (`/super-admin`, 1,819 lines — single-file, app_admin-only).
- **~63 API routes** under `web/app/api/`, notably: `ai/*` (schedule/roster/broadcast/evaluation/waiver parsing — matches CLAUDE.md's "route everything through /api/ai" rule, now split into several sub-routes rather than one), `stripe/*` (webhook, Connect onboarding, payment intent, refund, surcharge check), `cron/*` (5 scheduled jobs — late fees, cert expiry, event-day reminders, fee reminders, RSVP reminders), `admin/*` (super-admin actions: delete-club, broadcast, platform-fee-pct), and `tryout/*`.
- Auth pattern for API routes (`web/lib/apiAuth.ts`): `requireRole()` takes the bearer token, validates it against Supabase Auth with the **anon** key (not service role), then re-reads `profiles.role`/`club_id` for that user via a client scoped to their own JWT (so RLS applies) before authorizing. Service-role key usage should be checked per-route rather than assumed absent — this helper is the "good" path but not the only path into these routes.

### Supabase (shared backend)
- Postgres with RLS as the tenancy boundary (`clubs.id` → `profiles.club_id` → filtered everywhere downstream), Supabase Auth (email/password, Google, Apple), Supabase Storage (logos, photos, waivers, docs), Supabase Realtime (chat).
- **13 Edge Functions** (`supabase/functions/`): `import-club`, `import-roster`, `parse-schedule`/`parse-club-schedule` (AI ingestion), `suggest-lineup`, `plan-subs` (AI + pure-math features from CLAUDE.md), `invite-staff`, `send-guest-invite`, `send-push`, `send-team-email`, `write-email`, `generate-cancellation-email`, `event-reminders`.
- Migration history is dense and iterative — many single-purpose patch migrations (`fix_conv_participants_recursion`, `fix_poll_rls`, `fix_poll_votes_rls`, `fix_ack_rls`, `fix_team_members_rls`, `fix_game_session_rls`...). That pattern is itself a signal: RLS recursion/policy bugs have been a recurring category of live bug here, not a one-off — worth the security and data-model reviewers both knowing that history exists before they start.

## Cross-cutting things every reviewer should know going in

1. **Tenancy boundary is `club_id`, enforced primarily by RLS**, with slug (`clubSlug`) as the URL-level routing key on both mobile and web. Any query that filters by slug instead of an authenticated, server-verified `club_id` is a suspect pattern, not just a style issue.
2. **Money is live**: Stripe Connect is wired end-to-end (not stubbed, contrary to CLAUDE.md's subscriptions-table framing). Webhook handling lives at `web/app/api/stripe/webhook/route.ts`.
3. **AI calls** are meant to funnel through `/api/ai*` server routes per CLAUDE.md's rule; this has fragmented into several purpose-specific routes (`generate-broadcast`, `generate-closure`, `generate-evaluation`, `generate-waiver`, `parse-all`, `parse-availability`) plus the original `route.ts` — confirm none of these regressed into a client-side key.
4. **Two roles systems overlap**: a global `profiles.role` (app_admin/org_admin/coach/player) and a per-team `team_members.role` (coach/parent/player), reconciled ad hoc in places like `TeamContext.myRole`. Anywhere code checks one when it should check the other is a plausible bug class.
5. **This audit exists because the app is about to scale past 2 clubs** — the multi-tenancy and data-model reviews in particular should read every finding through "does this survive club #3, #10, #50," not "did this work for MDS and Maroons."

## Repo layout at a glance

```
/app                  Expo Router mobile screens — (auth) + (app)/[clubSlug]/(tabs|admin)
/web/app               Next.js — marketing pages, (dashboard), [clubSlug], super-admin, api/*
/lib, /hooks            mobile-side clients & state (supabase, auth, team context, push, realtime)
/web/lib                web-side clients & business logic (apiAuth, fees, refunds, stripe helpers)
/supabase/migrations   169 files, 46 tables, 278 RLS policies, initial schema 2024-01, active through 2026-08
/supabase/functions    13 edge functions — AI parsing, invites, push, email
/components             shared RN component tree (admin, chat, home, lineup, roster, schedule, reflection, shoutout, ui)
/web/components         web component tree (dashboard/*)
```
