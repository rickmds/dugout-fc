# Quick Wins — One-Afternoon Fixes

*Scope: small, contained, user-visible fixes only. Nothing here needs a new dependency, a migration, or a multi-file refactor. Six findings, ordered by severity.*

---

### 1. "Remove guardian" on the web dashboard doesn't actually revoke access — and has no confirmation

**Severity:** Critical
**Location:** `web/app/(dashboard)/dashboard/roster/page.tsx:311-315` (`deleteInviteRecord`), wired to the trash-icon button at `web/app/(dashboard)/dashboard/roster/page.tsx:771`

**Problem:** The button is labeled "Remove guardian" and deletes the `invites` row directly:
```ts
async function deleteInviteRecord(id: string) {
  setDeletingInviteId(id);
  await supabase.from('invites').delete().eq('id', id);
  setInvites((prev) => prev.filter((inv) => inv.id !== id));
  setDeletingInviteId(null);
}
```
For a guardian who has already joined the app (`inv.accepted_at` set — the button is shown for these too, see line 748), this deletes only the historical invite record. It does **not** touch `player_guardians` or `team_members`, so the guardian keeps full roster/chat/schedule access — the exact bug the DB migrations `20260814000004_revoke_guardian_invite_rpc.sql` and `20260814000007_revoke_also_drops_team_membership.sql` were written to fix, and which the mobile app already fixed correctly at `app/(app)/[clubSlug]/player/[playerId].tsx:749` by calling the `revoke_guardian_access` RPC. The web dashboard was never updated to match. On top of that, there is no confirmation dialog at all before the delete fires, and the delete's `error` return is never checked, so a failed delete (RLS denial, network blip) still silently clears the row from the UI.

**Fix:** Mirror the mobile implementation. Branch on `inv.accepted_at`: if set, call `supabase.rpc('revoke_guardian_access', { p_player_id, p_profile_id })` (need the guardian's profile id — resolve via `accepted_by` or an email lookup, same as the RPC does server-side); if not set, the existing raw `invites` delete is fine since there's nothing else to clean up. Wrap both paths in a `window.confirm(...)` (the pattern already used elsewhere on this same page, e.g. `handleDeleteCategory` in `fees/page.tsx:870`), and check the returned `error`/`result.error` before updating local state, restoring it on failure.

**Effort:** ~20 minutes.

---

### 2. New clubs' public tryout form defaults to Rick's personal email and Maroons' real address

**Severity:** Critical
**Location:** `web/app/(dashboard)/dashboard/tryouts/settings/form/page.tsx:41-73` (`MAROONS_DEFAULT`), loaded as initial state at line 374 and rendered publicly at `web/app/tryout-registration/page.tsx:473-474`

**Problem:** Any club that turns on tryout registration starts from `MAROONS_DEFAULT` until they save their own config (`useState<FormConfig>(MAROONS_DEFAULT)` at line 374, only overwritten once a `tryout_form_config` row exists for that club). Most of the seed text is templated with `{{clubName}}`, but three fields are not and are Maroons-specific verbatim:
```ts
locationText: 'Superdome Sports, 134 Hopper Ave, Waldwick, NJ 07463',
sessionScheduleText: `Saturday, April 11, 2026 (Boys & Girls) ...`,
contactText: 'Boys Program: Rick Breheny – rick@maroonssoccer.com\nGirls Program: Ben Manning – ben@maroonssoccer.com',
```
If a self-serve club (per CLAUDE.md's "zero involvement from Rick" onboarding model) enables the tryout module and publishes the form without noticing these three fields, their prospective players' families see Rick's and Ben Manning's real personal emails and Maroons' street address as "their" club's tryout contact info and venue.

**Fix:** Replace those three literal values with neutral placeholders that make it obvious they need to be filled in, e.g.:
```ts
locationText: '',
sessionScheduleText: '',
contactText: '',
```
(or short bracketed prompts like `'[Add your tryout venue address]'`). The settings page already renders empty-safe inputs for these (`config.locationText` etc. bind directly to `<input>`/`<textarea>`), and the public page already guards rendering on truthiness (`{f?.contactText && (...)}` at `web/app/tryout-registration/page.tsx:473`), so blanking them removes the leak without needing any other change. Keep the templated fields (`formTitle`, `welcomeText`, etc.) as-is — those are legitimate generic starting copy.

**Effort:** ~10 minutes.

---

### 3. "New Batch" button on the web evaluations dashboard does nothing

**Severity:** Medium
**Location:** `web/app/(dashboard)/dashboard/evaluations/page.tsx:124`

**Problem:**
```tsx
<button ... onClick={() => {/* TODO: open new batch modal */}}>
  <Plus size={14} /> New Batch
</button>
```
An org admin viewing the web dashboard's Evaluations page and clicking the primary "New Batch" CTA gets zero feedback — no modal, no navigation, no error. The mobile app already has full batch creation (`app/(app)/[clubSlug]/admin/evaluations.tsx:112-141`, `createBatch`), so this looks like a regression or an unfinished port, not a stub that was never meant to ship.

**Fix:** Given the full creation flow needs a team picker (this page is club-wide, unlike the mobile screen which is already team-scoped) plus season/period labels, building the whole modal may run past 30 minutes. The honest 30-minute fix is either (a) disable the button and add a tooltip/caption "Create new evaluation batches from the Pulse FC app for now," or (b) wire a minimal `prompt()`-free inline form (team select + season + period text inputs, insert into `evaluation_batches`, then route into the existing `[batchId]` detail page to fill in the rest) using the same three fields the mobile `createBatch` uses. Either removes the silent dead-click; (b) is preferable if the team-picker dropdown already exists elsewhere on the page to reuse.

**Effort:** ~15 minutes for option (a), ~25-30 minutes for option (b).

---

### 4. No way to change "share my contact with team parents" after initial signup

**Severity:** Medium
**Location:** `app/(app)/[clubSlug]/settings.tsx` (toggle absent — should sit in the `PROFILE` section near the phone field at line 1061); only implementation is `app/(auth)/profile-setup.tsx:45,192,287-290`

**Problem:** CLAUDE.md documents this explicitly: "each parent can opt out ('coach only') via `profiles.share_contact_with_team`, set during profile completion **or in Settings**." Only the profile-completion screen actually has the toggle — `grep` for `share_contact_with_team` across `app/` and `components/` returns exactly one file, `profile-setup.tsx`. `settings.tsx` has no reference to it at all, and doesn't link back to `profile-setup.tsx` either. A parent who enabled sharing during onboarding (or had it default to shared, per its `?? true` default) and later decides they don't want their phone number visible to other team parents has no in-app way to change it — their only option is contacting the coach/admin to do it for them via the DB.

**Fix:** Add one `Switch` row to the `PROFILE` section of `settings.tsx`, right next to the existing phone-number row (~line 1061), following the exact pattern already used for notification toggles at lines 1312-1318:
```tsx
<Switch
  value={shareContact}
  onValueChange={(v) => { setShareContact(v); supabase.from('profiles').update({ share_contact_with_team: v }).eq('id', profile.id); }}
  trackColor={{ false: PULSE_COLORS.ui.border, true: primaryColor }}
  thumbColor="#fff"
/>
```
with local state initialized from `profile?.share_contact_with_team ?? true`, same default as onboarding.

**Effort:** ~20 minutes.

---

### 5. Gallery photo delete doesn't wait for or check the delete result

**Severity:** Low
**Location:** `app/(app)/[clubSlug]/gallery.tsx:214-227`

**Problem:**
```ts
onPress: () => {
  setPhotos(prev => prev.filter(p => p.id !== photo.id));
  offsetRef.current = Math.max(0, offsetRef.current - 1);
  if (viewerVisible) setViewerVisible(false);
  supabase.storage.from('photos').remove([photo.storage_path]);
  (supabase as any).from('team_photos').delete().eq('id', photo.id);
},
```
Both calls are fired without `await` and without checking `error`. The RLS policy on `team_photos` (`"Coaches and uploaders can delete photos"`, `supabase/migrations/20260728000002_photo_gallery.sql:75`) only allows a coach or the original uploader to delete — so if this ever runs for a photo the current user isn't allowed to delete, or the delete fails for any other reason, the photo silently reappears next time the gallery reloads, with no error shown to the user who just watched it "delete" successfully.

**Fix:**
```ts
onPress: async () => {
  const snapshot = photos;
  setPhotos(prev => prev.filter(p => p.id !== photo.id));
  if (viewerVisible) setViewerVisible(false);
  const { error } = await (supabase as any).from('team_photos').delete().eq('id', photo.id);
  if (error) { setPhotos(snapshot); Alert.alert('Error', 'Could not delete photo.'); return; }
  offsetRef.current = Math.max(0, offsetRef.current - 1);
  supabase.storage.from('photos').remove([photo.storage_path]);
},
```

**Effort:** ~10 minutes.

---

### 6. Announcement delete in Chat tab doesn't check for failure either

**Severity:** Low
**Location:** `app/(app)/[clubSlug]/(tabs)/chat.tsx:712-719`

**Problem:** Same pattern as #5:
```ts
async function handleDelete(id: string) {
  Alert.alert('Delete announcement', 'Remove this announcement?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      await supabase.from('announcements').delete().eq('id', id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    }},
  ]);
}
```
The confirmation dialog is present and correct, but the delete's `error` is discarded, so a denied/failed delete still removes the announcement from the visible list. The home tab's `handleDeletePoll` (`app/(app)/[clubSlug]/(tabs)/index.tsx:971-976`) shows the correct pattern already in the same codebase — it checks `error`, rolls back the optimistic update, and alerts.

**Fix:**
```ts
onPress: async () => {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) { Alert.alert('Error', 'Could not delete announcement.'); return; }
  setAnnouncements((prev) => prev.filter((a) => a.id !== id));
}
```

**Effort:** ~5 minutes.

---

## What's already done well

- Destructive-action confirmation is the norm, not the exception: event delete, poll delete, staff removal (two-step confirm with an explicit "Remove this staff member?" panel in `web/app/(dashboard)/dashboard/staff/page.tsx:598-615`), waiver delete, and the mobile app's own guardian-removal flow (`player/[playerId].tsx:739-760`) all confirm, check `error`, and roll back on failure. The two silent-failure spots found here (#5, #6) are the exception against an otherwise consistent pattern, which made them easy to spot by contrast.
- Percentage/rate calculations across the app (RSVP rates, attendance, fee collection, playing-time bars) are consistently guarded against division by zero — every instance checked (`event/[eventId].tsx`, `player/[playerId].tsx`, `season-stats.tsx`, `_ProDashboard.tsx`, `super-admin/page.tsx`) ternaries out the zero-denominator case rather than risking a `NaN%` on screen.
- Empty states are genuinely thoughtful, not boilerplate: `recordings.tsx`, `pending-invites.tsx`, and `notifications.tsx` all distinguish "nothing here yet" from "you're all caught up" with different copy and iconography for each.
- The recent guardian-invite bug class (first-wins `.find()` picking an arbitrary invite instead of the accepted one, fixed in commit `7b59aa0`) was checked for recurrence in the sibling files (`web/app/(dashboard)/dashboard/roster/page.tsx`, `app/(app)/[clubSlug]/player/[playerId].tsx`) and the fix pattern (`.some()`/`.find()` keyed on `accepted_by`) is applied correctly and consistently in both — it wasn't a one-off patch that missed other call sites.
