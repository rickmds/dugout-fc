# Multi-Tenancy Audit — Pulse FC

Scope: app-level tenant scoping (not RLS correctness, not payments/webhooks, not schema design). Read `reviews/00-architecture.md` first for orientation. Every finding below was traced to a specific file/line and confirmed by reading the surrounding call chain — nothing here is inferred from naming alone.

---

## Findings

### 1. Any signed-in user can join any team at any club with zero verification, and it silently reassigns their own club

**Severity:** Critical
**Location:** `app/(auth)/find-team.tsx:79-107` (`handleJoinTeam`)
**Problem:** The "Find your team" screen — reachable from `role-benefits.tsx:40`, `coach-options.tsx:44`, `profile-setup.tsx:111/248`, and `settings.tsx:400/437` (the "leave team" flow routes back here) — lets a user type in any club slug, list its teams, and join one outright:

```ts
const { error: memberErr } = await supabase
  .from('team_members')
  .insert({ team_id: selectedTeamId, profile_id: user.id, role: 'parent' });
...
const { error: profileErr } = await supabase
  .from('profiles')
  .update({ club_id: foundClub.id, role: 'player' })
  .eq('id', user.id);
```

There is no invite token, no invite code, no coach approval — just a slug the user typed and a team they picked. CLAUDE.md's own spec for this journey says "enters club slug **or invite token**" and step 4 says "join with a **code**" — the shipped screen has no code field at all, it's slug-and-tap. Once joined as `parent`, the user is a legitimate `team_members` row on that team, which (per CLAUDE.md's own roster spec) gets them the coach's phone number, other parents' phone numbers by default, team chat, and schedule. It also overwrites `profiles.club_id`/`role` unconditionally — an org_admin or coach who taps into a second club's slug here has their own club membership silently clobbered too.
This is the exact "quietly forgot its tenant filter" shape: the query *has* a `team_id` filter, but that filter is 100% attacker/user-chosen with no server-side check that they were ever invited to it. Two clubs onboarding via the same developer never exercised this path adversarially; club #3 (or any curious/malicious user who knows or guesses a slug like `mds-academy`) will.
**Fix:** Require an invite token/code for this flow, matching what CLAUDE.md actually specifies and what `web/app/join/page.tsx:173` and `web/app/api/accept-invite/route.ts` already do correctly (token-gated, resolved server-side). At minimum, gate the `team_members` insert behind a server-side check (an RPC or API route) that validates a real invite/code exists for that email+team before insert, instead of letting the client insert directly with a self-picked `team_id`.
**Effort:** 2-4 hours (needs a join-code table/flow, or wiring this screen to the existing invite-token mechanism instead).

---

### 2. `invite-staff` edge function grants org_admin/coach on any club with no auth check at all

**Severity:** Critical
**Location:** `supabase/functions/invite-staff/index.ts:16-120`
**Problem:** This function runs with the service-role key (bypasses RLS entirely) and takes `email, role, club_id, team_ids` straight from the request body — no JWT-derived identity check, no comparison of the caller against `club_id` anywhere in the file:

```ts
const { email, full_name, role, club_id, team_ids } = payload;
...
await supabase.from('profiles').upsert(
  { id: userId, club_id, full_name: full_name ?? null, role },   // role can be 'org_admin'
  { onConflict: 'id' },
);
```

Anyone who can reach this endpoint can mint an `org_admin` (or elevate an existing user's role) for **any** `club_id` they supply, or generate a Supabase invite link for an arbitrary email tied to that club. Contrast with the equivalent, currently-used web path (`web/app/api/invite-coach/route.ts:16-18`, `web/lib/coachInvite.ts`), which correctly checks `auth.clubId !== club_id` before doing anything. I could not find this function called anywhere in the current app/web code (`grep -rn "invite-staff"` outside `supabase/functions/` returns nothing) — it appears to have been superseded by `/api/invite-coach` + `/api/staff-resend`. It is still deployed, live Supabase infrastructure though, reachable directly over HTTPS independent of whether the UI links to it.
**Fix:** Delete the function if it's genuinely dead (the safest option, since a superseding secure path already exists), or if it must stay, add the same caller-identity check every other invite path uses: require a bearer JWT, resolve the caller's own `profiles.role`/`club_id`, and reject if `club_id` in the payload doesn't match (unless caller is `app_admin`).
**Effort:** 15 minutes to delete and redeploy; ~1 hour to properly re-secure if it needs to stay.

---

### 3. Onboarding wizard's `create_club` action doesn't check the caller doesn't already have a club — re-invoking it silently relocates an org_admin to a brand-new club

**Severity:** High
**Location:** `web/app/api/onboarding/route.ts:15-59`
**Problem:** `requireRole(req, ['org_admin', 'app_admin'])` at line 8 is the only gate on `action: 'create_club'`. There's no check that `auth.clubId` is null before creating a new club and reassigning the caller to it:

```ts
const { data, error } = await db.from('clubs')
  .insert({ name, slug, primary_color, secondary_color, logo_url, tagline: tagline || null })
  .select().single();
...
await db.from('profiles').upsert({ id: auth.userId, club_id: data.id, role: 'org_admin' });
```

Since a brand-new signup gets `role = 'org_admin'` immediately (per CLAUDE.md, confirmed in `web/app/onboarding/page.tsx:2043-2045`), and that role persists forever, *any* existing org_admin of Club 1 or Club 2 who re-POSTs this action (replayed request, a duplicate tab left open from a previous onboarding session, a bug in the client's resume logic) gets a brand-new Club 3 created **and their own `profiles.club_id` silently switched to it** — orphaning Club 1/2 of its admin with no confirmation dialog, no error, nothing. The frontend does have a resume-guard (`web/app/onboarding/page.tsx:2011-2036`, checks `profile.club_id` and redirects to `/dashboard` if the club already has teams) but that's a client-side convenience, not an enforced invariant — the API itself will happily do it again if asked.
**Fix:** Add a one-line guard before the insert: `if (auth.clubId) return NextResponse.json({ error: 'You already belong to a club.' }, { status: 409 });`
**Effort:** 15 minutes.

---

### 4. `accept_invite` RPC silently switches an existing coach/org_admin's home club — acknowledged in the migration itself, not actually fixed

**Severity:** High
**Location:** `supabase/migrations/20260825000015_accept_invite_club_switch_warning.sql` (function `public.accept_invite`)
**Problem:** The migration's own comment states the bug plainly: *"accept_invite always takes the invite's own club/role when the invite itself is coach/org_admin-scoped, with no check for whether the accepting user already belongs to a DIFFERENT club... their real home club silently switches with no signal anywhere that it happened."* The fix applied in this same migration only adds a non-blocking `warning` string to the JSON response — it does not stop the reassignment:

```sql
if v_role in ('coach', 'org_admin')
   and v_current_role in ('coach', 'org_admin', 'app_admin')
   and v_current_club is not null
   and v_current_club <> v_club_id then
  v_warning := 'Your account was moved from your previous club to this one.';
end if;

update public.profiles
set    role    = case when v_role in ('coach', 'org_admin') then v_role ... end,
       club_id = case when v_role in ('coach', 'org_admin') then v_club_id ... end
where  id = auth.uid();
```

The `update` runs unconditionally regardless of `v_warning`. Any caller of this RPC (`web/app/join/page.tsx:173`, and mobile equivalents) that surfaces `warning` as a toast/banner rather than a blocking confirmation still lets the switch happen before the user can back out. For an operator running multiple clubs during this exact onboarding period (Rick, or any future multi-club coach), accepting a stale/leftover staff invite email from testing is a plausible accident, and it costs the original club its admin with no undo.
**Fix:** Turn the informational warning into a real gate — either require a second RPC call with an explicit `confirm_switch: true` param once the client has shown the warning, or simply refuse the club/role change (`return jsonb_build_object('error', 'You already manage a different club...')`) rather than applying it silently.
**Effort:** 1-2 hours (function change + client confirmation UI on both callers).

---

## Scope areas checked with no findings worth reporting

- **~40 web API routes using `requireRole`** (`staff-list`, `invite-coach`, `staff-resend`, `staff-edit-email`, `send-invite`, `send-fee-reminder`, `send-fee-notification`, `send-payment-confirmation`, `parent-status`, `emergency-broadcast`, `registrations/*`, `tryout/*`, `team/parent-emails`, `fields/close`, `push-event`, `stripe/refund`, `stripe/connect/init`) — all consistently re-derive the target `club_id` server-side from the resource being acted on and compare it against `auth.clubId` before proceeding. This is a real, repeated pattern, not a coincidence.
- **Super-admin app_admin-only routes** (`admin/club-players`, `admin/club-staff`, `admin/delete-club`, `admin/delete-flag`, `admin/broadcast`, `admin/remind-stripe-setup`) — correctly gate on `profiles.role === 'app_admin'` before accepting a client-supplied `clubId`, which is the right pattern for a tool whose entire purpose is cross-club access.
- **Mobile tab/admin screens** (`roster.tsx`, `chat.tsx`, `index.tsx`, `season-stats.tsx`, `guest-activity.tsx`, `evaluation-form.tsx`, `club-calendar.tsx`, `club-import.tsx`, `club-schedule.tsx`) — consistently scope queries off `team.id`/`profile.club_id` from `TeamContext`/`useAuth`, never off the `clubSlug` route param.
- **Edge functions without DB writes** (`import-club`, `import-roster`, `parse-schedule`, `parse-club-schedule`, `suggest-lineup`, `plan-subs`, `write-email`) — pure parsing/generation, no tenancy surface.
- **`event-reminders` cron function** — iterates all clubs by design (it's a platform cron job), scopes push recipients correctly per-team within each iteration.
- **Seed scripts** (`scripts/seed-*.mjs`) — each scopes its deletes/inserts to one named club_id and cleans up after itself; not an "assumes it's the only club" pattern. (They do embed a live service-role key in plaintext, but that's a secrets-hygiene issue, not a tenancy-scoping one, so it's omitted per this review's scope.)
- **Slug reuse after rename** — `web/app/(dashboard)/dashboard/settings/page.tsx:311` lets an org_admin change their club's slug with no reservation/history table, so a freed slug could later be claimed by club #3. Traced where this matters in practice: the mobile app's `ClubSlugGuard` (`app/(app)/[clubSlug]/_layout.tsx:23-39`) and every data-fetching screen key off `team.id`/`profile.club_id`, never off the URL slug, so a stale bookmark pointing at a reassigned slug would show the new club's own (correctly-scoped) data, not a cross-tenant mix. Only the public, low-sensitivity pages (`club-public`, `[clubSlug]/fields`) are slug-keyed, and they're meant to be public. Not flagged as a numbered finding since nothing sensitive leaks — noted here so it isn't rediscovered as a surprise.

---

## What's done well

- **`hooks/useClub.ts`** resolves branding (logo, colors, kit colors) from the *active team's* club, not the profile's home club, specifically so a coach guesting on a second club's team sees that club's branding instead of their own — a deliberate, correct multi-club design decision with a comment explaining why.
- **The web API auth pattern is genuinely disciplined**: `web/lib/apiAuth.ts`'s `requireRole()` re-reads the caller's own `profiles.role`/`club_id` via a JWT-scoped client (so RLS applies) rather than trusting anything from the request, and essentially every route built on top of it (~20+ checked) re-verifies the target resource's `club_id` against that before acting. This is the right pattern, applied consistently — the gaps found above (onboarding, invite-staff) are the exceptions, not the norm.
- **`web/app/super-admin/page.tsx`'s club-detail panel** (`ClubDetailDrawer`, ~line 1528) guards its own async fetches with a `cancelled` flag tied to `club.id` in the `useEffect` dependency array — switching clubs mid-fetch can't paint a stale club's staff/players/notes onto the newly-selected club's panel. This is exactly the race-condition class of bug this audit was worried about, and it's already handled correctly.
- **`app/(app)/[clubSlug]/_layout.tsx`'s `ClubSlugGuard`** is self-aware about its own limits (see its comments) — it treats the URL slug as routing only and explicitly defers to each screen's own `team.id`/`club_id`-scoped queries as the actual boundary, rather than pretending a slug match is a security check.
