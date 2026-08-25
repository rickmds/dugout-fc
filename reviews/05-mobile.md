# Mobile Review — React Native / Expo Client

*Scope: re-render hotspots, list virtualization, image loading, one-bar-LTE behavior, offline/retry, auth cold start, iOS-specific behavior. Ranked by how likely each is to be the thing that pages you at 7am tryout check-in, not by how it reads in a style guide.*

---

### Critical

**Location:** `app/(app)/[clubSlug]/(tabs)/index.tsx:1092-1122` (`handleRsvp`) and `app/(app)/[clubSlug]/event/[eventId].tsx:613-641` (`handleRsvp`)

**Problem:** Both parent-facing RSVP handlers (Home tab's quick-RSVP card and the full event-detail RSVP screen — the actual "I'm coming" tap parents use) swallow a failed insert/delete with only `console.error`; there is no `Alert.alert` and no retry. On a failed request the UI just falls back to unselected with zero explanation, so a parent who tapped "Attending" on shaky LTE has no idea their RSVP didn't save.

**Fix:** Mirror the coach-facing override handlers two functions below (`applyOverride`/`clearOverride` in the same event-detail file, `app/(app)/[clubSlug]/event/[eventId].tsx:670-691`), which already do this correctly:
```ts
const { error } = await supabase.from('event_rsvps').upsert(...);
if (error) {
  Alert.alert('Could not save your RSVP', 'Check your connection and try again.');
  return;
}
```
Apply the same pattern to both parent-facing call sites.

**Effort:** ~30 minutes, two call sites — but this is the single highest-consequence gap for the exact scenario this review is for: 400 parents RSVPing/checking in on congested LTE, with the failure mode being silent rather than loud.

---

### High

**Location:** `app/(app)/[clubSlug]/(tabs)/index.tsx:503-904` (`fetchData`), specifically the critical-path `Promise.all` at line 516-534 and the `catch` at 899-903.

**Problem:** Home's `fetchData()` makes 15+ sequential/dependent Supabase calls with no timeout anywhere in the chain. This codebase already has an established `withTimeout`-race pattern for exactly this class of bug (`hooks/useAuth.tsx:96-101`, reused in `lib/authRouting.ts:19-24`), but it was never applied here. Two concrete failure modes on a stalled (not fully dead) connection: (1) the critical-path `Promise.all` that gates `HomeSkeleton` never resolves or rejects, so the user is stuck on the skeleton indefinitely — no OS-level fetch timeout kicks in quickly, and there's no in-app one; (2) if a request does hard-fail, the outer `catch` only does `console.error('fetchData error', e)` — no `Alert`, no retry affordance — so next event, fees, polls, and guest invites all silently render as if there's simply nothing there, indistinguishable from an empty state.

**Fix:** Wrap the critical-path batch in the project's existing `withTimeout` helper (promote it out of `hooks/useAuth.tsx` into a shared `lib/` util so `authRouting.ts` and `index.tsx` both import it instead of each hand-rolling a copy), and on timeout/error show a small inline "Couldn't load — tap to retry" state instead of an empty-looking screen.

**Effort:** 1-2 hours (shared timeout util + one retry UI state + care not to break the existing `hasLoadedOnceRef` flash-prevention logic).

---

### High

**Location:** `app/(app)/[clubSlug]/admin/events/[eventId]/_layout.tsx:6-9`

**Problem:**
```tsx
<Stack.Screen
  name="match-tracker"
  options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
/>
```
This is the exact pattern already documented as broken for this project: `gestureEnabled: false` does not suppress the iOS interactive-pop (edge-swipe) gesture in this Expo Router setup — a React Native `Modal` is required instead. Match tracker holds live in-memory state (running clock via `tick`, open period tracking, pitch-drag assignments — `app/(app)/[clubSlug]/admin/events/[eventId]/match-tracker.tsx:256-282`) that is only periodically flushed to `game_sessions`/`player_match_periods`. A coach's thumb catching the left edge mid-game backs out of the tracker unintentionally, losing unsaved UI state and having to re-enter/re-sync a live match.

**Fix:** Present `match-tracker` as an actual RN `Modal` component (the pattern this project has already standardized on elsewhere for gesture-blocking screens) rather than a `Stack.Screen` with `presentation: 'fullScreenModal'`.

**Effort:** 1-2 hours — route restructuring plus retesting navigation in/out.

---

### High

**Location:** `hooks/useAuth.tsx:251-255` (`<AuthContext.Provider value={{ ...state, signOut, refreshProfile }}>`) and `hooks/TeamContext.tsx:111-115` (`<TeamContext.Provider value={{ team, allTeams, loading, selectTeam, refetch: fetchTeams }}>`)

**Problem:** Neither provider memoizes its context value, and `signOut`/`refreshProfile` are plain function declarations re-created every render — so every render of `AuthProvider` or `TeamProvider` hands every consumer a brand-new object by reference, forcing a re-render regardless of whether anything meaningful changed. 54 files call `useAuth()`/`useClub()`/`useTeam()` directly (confirmed via grep across `app/` and `components/`), including `memo()`-wrapped list rows like `PlayerCard` (`app/(app)/[clubSlug]/(tabs)/roster.tsx:82-172`) that call `useClub()` internally — so their `memo()` is bypassed since they subscribe to context directly rather than only via props. Critically, `hooks/useAuth.tsx:210-222` refetches profile/club and calls `setState` **on every single app foreground transition** (`AppState` → `'active'`), which is exactly the behavior a parent does constantly at a tryout — checking a text, glancing at the camera, coming back to the app. Each of those triggers a full re-render cascade through every screen currently touching auth/team/club state, at the precise moment device and network resources are already under the most pressure.

**Fix:**
```tsx
const value = useMemo(() => ({ ...state, signOut, refreshProfile }), [state, signOut, refreshProfile]);
// wrap signOut/refreshProfile in useCallback so their identity is stable too
```
Same treatment for `TeamContext.Provider`'s value.

**Effort:** 30-45 minutes, but touches two files 54 others depend on — worth a careful pass, not a blind find-replace.

---

### Medium

**Location:** `app/(app)/[clubSlug]/admin/events/[eventId]/lineup.tsx:193-198` (`onPanResponderMove`), consumed at lines 456-473, 527, 554-574, 714-721 in the same 898-line component.

**Problem:** `onPanResponderMove` calls `setDrag({ fromIdx, pageX, pageY })` on every touch-move event during a drag — potentially 60 times/second while a coach repositions a player. `drag` is read directly in the same top-level component that also renders the full roster panel, all pitch position tokens, and the bottom tab bar; none of that is split into a child memoized on just `drag`. Every finger-move frame during a drag therefore re-renders the entire lineup screen, not just the floating ghost token — this is where dropped frames/stutter would show up while building a lineup pitch-side.

**Fix:** Extract the floating drag-ghost token and the per-slot "is this the drag source" highlight into a small `memo()`-wrapped child that receives only `drag` (and the specific slot's index) as props, so the static roster list and other pitch slots don't re-render on every move event.

**Effort:** 1-2 hours.

---

### Medium

**Location:** `app/(app)/[clubSlug]/gallery.tsx:154-181` (`handleUpload`)

**Problem:** The per-photo upload loop wraps `fetch` (local URI → blob) + storage `upload` + `team_photos` insert in a bare `try { } catch {}`, and treats a storage error as `continue`. If 6 of 10 photos fail mid-batch on a flaky connection, the loop still finishes, the modal closes, and a success haptic fires (`Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`) with no indication that only 4 of 10 photos actually saved.

**Fix:** Track per-photo success/failure through the loop; after it completes, if any failed, show a summary ("7 of 10 uploaded — 3 failed") instead of an unconditional success signal, and keep the failed assets in `pendingAssets` so the user can retry without re-picking from their library.

**Effort:** 1-2 hours.

---

## What's already done well

- **List virtualization is genuinely tuned, not left at defaults.** Roster (`roster.tsx:525-540`), Schedule (`schedule.tsx:943-1004`), Chat (`chat.tsx:475-483, 798-806`), and the conversation thread (`conversation/[conversationId].tsx:420-427`) all set deliberate `initialNumToRender`/`maxToRenderPerBatch`/`windowSize`/`removeClippedSubviews`, and roster additionally computes a real `getItemLayout`. `PlayerCard` is properly `memo()`-wrapped.
- **Image loading is solid.** `expo-image` throughout with `recyclingKey`/`transition`/`contentFit`, explicit `Image.prefetch()` warm-up for roster photos before cards render (`roster.tsx:368-370`), and server-side resize transforms for gallery thumbnails instead of shipping full-resolution images into grid cells (`gallery.tsx:55`, `GalleryCard.tsx:12-16`).
- **Auth cold start has already had a real hardening pass.** `hooks/useAuth.tsx`'s `withTimeout`/`getSessionWithRetry`/`fetchProfileAndClubWithRetry`, the `AsyncStorage` profile cache for instant return-visit rendering, and `lib/authRouting.ts` reusing the same timeout-race pattern for post-login routing are exactly the right shape — this same pattern just needs to be extended to Home's `fetchData` (see High finding above).
- **Coach-side mutations mostly get this right.** RSVP overrides, guest-invite responses, callout deletion, and poll deletion all pair an optimistic update with a real `Alert.alert` + rollback on failure — the parent-facing RSVP path is the outlier, not the norm.
- **`ClubHeader` uses `useSafeAreaInsets()`** rather than a hardcoded status-bar offset, so header layout should hold up across notch/Dynamic Island size differences.
