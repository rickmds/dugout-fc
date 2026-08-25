# Security Review — Cross-Club Data Access

*Scope: RLS policies, auth/invite flows, service-role usage, storage policies, client-only checks, exposed env vars, JWT claims. Objective: find a real path from an ordinary MDS Academy user (or an anonymous attacker) to Maroons SC's roster/contact/medical data.*

## Result

**Yes — a real, currently-live path exists.** It does not run through RLS (the `players`/`profiles` RLS itself is in decent shape as of the most recent migrations — see "Already fixed" below). It runs through the invite-acceptance layer, which never verifies that the person redeeming an invite token is the person the invite was actually sent to. Any authenticated user — an MDS Academy coach or parent, no elevated privileges needed — who gets hold of *any* pending Maroons SC invite link (forwarded email, screenshot, shared device, misdirected send — all ordinary, not exotic) can redeem it as themselves and walk away with a real `team_members` row, and in the coach/org_admin case a reassigned `profiles.club_id`, inside Maroons SC. From there, the legitimate (and correctly club-scoped) roster RLS *lets them in on purpose*, because as far as the database is concerned they are now a real Maroons SC coach or club admin. A second, independent path requires no MDS account or authentication at all.

---

## Findings

### 1. `accept_invite()` never checks that the caller is the invited person

**Severity:** Critical
**Location:** `supabase/migrations/20260825000015_accept_invite_club_switch_warning.sql:11-89` (current live definition of `public.accept_invite`); same gap present unbroken since the function's introduction in `supabase/migrations/20250618000002_accept_invite_fn.sql:1-40` and every revision in between (`20260623000003`, `20260813000002`, `20260813000012`, `20260824040000`).
**Problem:** `accept_invite(p_token text)` is `SECURITY DEFINER`, granted to `authenticated`, and takes only a token — it looks up the invite's `team_id`/`team_ids`/`club_id`/`role`, then inserts `team_members` rows and overwrites `profiles.role`/`profiles.club_id` for `auth.uid()`, with **no comparison of `invites.email` to the caller's own authenticated email anywhere in the function**. Whoever calls it, using whatever account they happen to be logged into, becomes the invite. For a `role in ('coach','org_admin')` invite this line is the payload: `club_id = case when v_role in ('coach','org_admin') then v_club_id ... end` (line 78-79) — it unconditionally relocates the caller's own `profiles.club_id` to the target club. Combined with `is_team_member()`'s org_admin branch (any team in `current_user_club_id()`), an attacker who redeems a Maroons org_admin invite gets read access to *every* Maroons team's roster, `get_team_contacts` phones, `player_emergency_contacts`, and `players.medical_notes` — not just one team.

The function's own most-recent comment (`20260825000015_accept_invite_club_switch_warning.sql:4-5`) states *"Not exploitable (it requires the person to knowingly accept a staff invite addressed to their own email)"* — this is factually wrong; nothing in the function or its callers enforces that. Confirmed by reading the actual call site: `web/app/join/page.tsx:155-186` (`handleLogin`) signs the user in with **whatever email/password they type** (line 162-165: `supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })`), then immediately calls `supabase.rpc('accept_invite', { p_token: token })` (line 173) for that session. The `email` field is pre-filled from the invite's `pre_filled_email` (`web/app/join/page.tsx:85`) purely as a UI convenience — it's an ordinary editable `<input>` (line 425-434) with no bearing on what the RPC does. An MDS coach can open a Maroons invite link, type their own MDS credentials into the login form, and the RPC executes as them.

**Reproduction:** obtain any pending, unaccepted `invites.token` for Maroons SC (coach or org_admin role ideally). While logged in as an MDS user, either (a) visit `/join?token=<maroons_token>` → "I already have an account" → log in with your own MDS email/password → the page calls `accept_invite` for you, or (b) call `supabase.rpc('accept_invite', { p_token: '<maroons_token>' })` directly from a browser console / any client holding the MDS user's session. Either way the MDS account gains a `team_members` row (and, for coach/org_admin invites, `profiles.club_id` = Maroons) and can now read Maroons's roster through the app's normal, correctly-scoped screens.

**Fix:** compare identity before granting anything. Since the invite carries `email` and the function already has `auth.email()` available in a `security definer` context, add a hard check:
```sql
if lower(coalesce(v_invite_email, '')) <> lower(coalesce(auth.email(), '')) then
  return jsonb_build_object('error', 'This invite was sent to a different email address. Sign in with that account, or contact your club for a new invite.');
end if;
```
(fetch `i.email into v_invite_email` in the existing `select ... into` block). This also fixes the identical gap in the anonymous path, finding #2 below — same email-ownership check needs to land in both places, or better, only in the RPC if #2 is changed to require it be pre-verified.
**Effort:** ~30 minutes (one migration, plus matching the same check into the API route in finding #2).

---

### 2. `/api/accept-invite` lets a fully anonymous caller redeem any club's invite by self-declaring the email

**Severity:** Critical
**Location:** `web/app/api/accept-invite/route.ts:4-30` (and the whole handler through the end of file)
**Problem:** This route requires **no `Authorization` header and no prior account** — it's the "Create my account" branch of the join flow. It reads `{ token, email, password, full_name }` straight from the POST body (line 5), looks up the invite by token only (line 14-24), and then calls `db.auth.admin.createUser({ email, ... })` using the **attacker-supplied `email`**, not `invite.email`. Nothing compares the two. The new account is immediately granted `role`/`club_id` from the invite (`web/app/api/accept-invite/route.ts:33-34, 57-62`) and inserted into `team_members` for the invite's team(s) (line 65-77). This is strictly worse than finding #1: it doesn't even require the attacker to have any Pulse FC account — a single unauthenticated POST with a stolen/leaked token and an email address of the attacker's choosing creates a brand-new account that is a real Maroons SC coach or org_admin from the moment it exists.
**Fix:** require `email` (case-insensitively) to match `invite.email` before calling `auth.admin.createUser`, and reject with a clear error otherwise:
```ts
if (inv.email && inv.email.toLowerCase() !== email.trim().toLowerCase()) {
  return NextResponse.json({ error: 'This invite was sent to a different email address.' }, { status: 403 });
}
```
Place this immediately after the invite is fetched (after line 28), before any account/profile/team_members writes.
**Effort:** ~15 minutes.

---

### 3. `invite-staff` Edge Function grants org_admin/coach access to any club with zero caller authentication

**Severity:** High (Critical if still deployed and reachable — see caveat)
**Location:** `supabase/functions/invite-staff/index.ts:8-14` (payload shape), `:16-36` (no auth check before acting), `:101-104` (privilege grant from unchecked input)
**Problem:** This Edge Function builds a Supabase client with the **service role key** (`index.ts:22-25`) and then, using only a request body it never authenticates (`const { email, full_name, role, club_id, team_ids } = payload;` — no `Authorization` header is read, no `supabase.auth.getUser()` call exists anywhere in the file), upserts a `profiles` row with attacker-chosen `role` (`'org_admin'` is an accepted value per the `Payload` type on line 11) and `club_id` (line 101-104), and inserts `team_members` rows for attacker-chosen `team_ids` (line 118-121). Supabase's platform-level `verify_jwt` gate (the only thing standing between the public internet and this function) accepts the public anon key as a valid JWT — it does not check role or club membership — so this function is reachable by anyone holding the app's public `EXPO_PUBLIC_SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, which is intentionally shipped in the client bundle. Compare this to the properly-guarded live replacement, `web/app/api/invite-coach/route.ts:9-17`, which calls `requireRole()` and then explicitly checks `auth.role !== 'app_admin' && auth.clubId !== club_id` before doing anything — `invite-staff` has none of that.

**Caveat, stated plainly:** I could not find any current caller of `invite-staff` in `web/` or `app/` (grepped both trees) — the staff-invite UI (`web/app/(dashboard)/dashboard/staff/page.tsx:194`) calls `/api/invite-coach` instead, which is the correctly-guarded path. This function looks superseded/orphaned. That does not make it safe: an orphaned Edge Function is still deployed and callable at its stable URL unless explicitly torn down, independent of whether any current frontend code references it. The one real barrier to exploiting it is that the caller needs the target club's internal `club_id` (a UUID, not the public slug) — not trivially discoverable from public pages, but visible in ordinary authenticated responses to *any* member of the target club (e.g., their own `profiles.club_id`), so the practical bar is "get one Maroons club member's session or network traffic," which is a much lower bar than obtaining an invite token.
**Fix:** either delete/undeploy the function if `/api/invite-coach` has fully replaced it, or, if it must stay, add the same identity+role+club check `requireRole`/`invite-coach` already does before touching `profiles`/`team_members`:
```ts
const authHeader = req.headers.get('authorization');
const { data: { user } } = await supabase.auth.getUser(authHeader?.replace('Bearer ', '') ?? '');
if (!user) return new Response('Unauthorized', { status: 401 });
const { data: caller } = await supabase.from('profiles').select('role, club_id').eq('id', user.id).single();
if (caller?.role !== 'app_admin' && !(caller?.role === 'org_admin' && caller.club_id === club_id)) {
  return new Response('Forbidden', { status: 403 });
}
```
**Effort:** 15 minutes to delete if confirmed orphaned; ~30 minutes to add the check if kept.

---

### 4. `players_select` lets any team parent read every teammate's `medical_notes`, not just their own kid's (same-club, not cross-club)

**Severity:** Medium
**Location:** `supabase/migrations/20260825000001_fix_players_select_cross_team_leak.sql:12-16` (current policy: `using (is_team_member(team_id))`); `medical_notes` column added at `supabase/migrations/20260813000012_guardians_profile_completion.sql:208`
**Problem:** This is flagged separately from the cross-club findings above because it's real and current, not because it's the primary objective (it's within one club, not Maroons-via-MDS). Postgres RLS is row-level, not column-level: `players_select`'s `USING` clause grants full-row `SELECT` — including `medical_notes` — to *any* `team_members` row on that team, and `team_members.role` includes `'parent'`, not just `'coach'`. CLAUDE.md states medical notes are "coach-only, always," and `players.is_private` (`supabase/migrations/20260619000005_player_privacy.sql:2`) suggests a privacy control existed at some point — but nothing in the current `players_select` policy checks either `is_private` or the viewer's `team_members.role`. Any parent on a team can read every other kid's `medical_notes` on that team by simply selecting from `players` for their own team_id.
**Fix:** split `medical_notes` out of `players` the same way `20260819000003_player_emergency_contacts.sql` already split `emergency_contact_*` into `player_emergency_contacts` with a coach/guardian-only `SELECT` policy — that migration is the exact template to reuse:
```sql
create table public.player_medical_notes (
  player_id uuid primary key references public.players(id) on delete cascade,
  notes text,
  updated_at timestamptz default now()
);
create policy "player_medical_notes_select" on public.player_medical_notes for select
  using (is_player_guardian(player_id) or exists (select 1 from public.players p where p.id = player_id and is_team_coach(p.team_id)));
```
then backfill from `players.medical_notes` and drop the column, mirroring `20260819000003`'s pattern exactly.
**Effort:** ~1 hour (one migration + one grep-and-swap of the client read/write call sites for `players.medical_notes`).

---

## What's already done well

- **`current_user_role()`/`current_user_club_id()` re-derive from `profiles` on every check** (`supabase/migrations/20240101000000_initial_schema.sql:198-206`) rather than trusting `auth.jwt()` claims — I found zero policies reading `auth.jwt()` directly anywhere in `supabase/migrations/`. This is the right call and avoids an entire class of stale-claim bugs.
- **`web/lib/apiAuth.ts:9-48` (`requireRole`)** validates the bearer token against Supabase Auth with the anon key, then re-reads `profiles.role`/`club_id` through a client scoped to the caller's own JWT (so RLS applies) before authorizing — exactly the right shape, and it's what `/api/invite-coach` correctly uses (contrast with finding #3's `invite-staff`).
- **The team-scoping sweep on 2026-08-16** (`20260816000001`, `20260816000002`, `20260816000003`) found and fixed a real cluster of unscoped `current_user_role() in ('org_admin','app_admin')` checks across `profiles_select_own`, `conv_participants_delete`, `player_match_periods`, fee-claim RPCs, and four storage buckets (`club-logos`, `logos`, `cert-docs`, `registration-docs`) — all confirmed fixed in their current, latest-migration form.
- **Today's own migration pass** (`20260825000001` players cross-team leak, `20260825000009` shoutouts cross-team, `20260825000010` waiver-signature leak, `20260825000002` suspended-club enforcement) shows this is an actively and competently self-audited codebase — several of the bug classes a pentester would normally look for here were already found and closed by the developer within the current review window.
- **Storage bucket policies** (`avatars/players/*`, `photos`, `cert-docs`, `registration-docs`, `logos`/`club-logos`) are all now path-scoped to `club_id`/`team_id`/guardian-or-coach ownership as of `20260816000003` — no open cross-club write/read remains there.
