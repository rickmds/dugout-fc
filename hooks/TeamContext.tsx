import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { uniqueChannelName } from '../lib/realtime';
import { withTimeout, TIMEOUT } from '../lib/withTimeout';
import type { Database } from '../types/database';

// fetchTeams' queries had no timeout at all — unlike useAuth.tsx's session
// restore and Home's fetchData, which both bound their network calls and
// give the user a Retry affordance when one stalls. If any of fetchTeams'
// queries genuinely stalled (not rejected — stalled, the realistic
// one-bar-LTE failure mode) on a cold launch, `loading` never flipped to
// false and app/index.tsx's `session && teamsLoading` gate kept the user on
// a bare spinner forever, with no error and no retry button — worse than
// the sessionCheckFailed screen right before it in the same cold-start
// path, which at least offers Retry. 10s matches Home's own critical-path
// budget.
const TEAMS_TIMEOUT_MS = 10000;

type TeamRow = Database['public']['Tables']['teams']['Row'];
type ClubRow = Database['public']['Tables']['clubs']['Row'];

// The user's own team_members.role for this specific team — 'org_admin' is
// synthetic (org_admins manage their home club's teams implicitly, with no
// team_members row at all) so callers can treat it like any other role tier
// without a null check. Coach-gated UI should key off this, not the global
// profiles.role, so a coach on team A who's just a parent on team B sees the
// right UI on each.
export type Team = TeamRow & {
  club: ClubRow | null;
  myRole: 'coach' | 'parent' | 'org_admin' | null;
  /** True only for a genuine team_members row — an org_admin's implicit
   * access to every other team in their home club doesn't count. Lets a
   * "pick one team in this club" fallback (ClubSlugGuard) prefer a team
   * someone actually coaches over whichever of their home club's teams
   * happens to have the oldest created_at. */
  hasExplicitMembership: boolean;
};

interface TeamContextValue {
  team: Team | null;
  allTeams: Team[];
  loading: boolean;
  /** A fetch genuinely stalled past TEAMS_TIMEOUT_MS (not a rejected query
   * — those keep whatever's already in state, see fetchTeams). Distinct
   * from "loaded successfully with zero teams" the same way useAuth's
   * sessionCheckFailed is distinct from "confirmed signed out" — lets
   * app/index.tsx offer the same Retry affordance instead of a permanent
   * spinner or a false "you have no teams" state. */
  teamsLoadError: boolean;
  selectTeam: (teamId: string) => Promise<void>;
  /** Pins which team cold launch should land on, distinct from whatever
   * was last viewed — pass null to unpin. Persisted on the profile (not
   * AsyncStorage) so it's the same across devices. */
  setDefaultTeam: (teamId: string | null) => Promise<void>;
  refetch: () => Promise<void>;
  /** The current selection read synchronously — unlike `team`, this is
   * never stale-by-one-render, so a consumer that needs to check "did a
   * switch juuust happen" (ClubSlugGuard) doesn't have to wait on this
   * provider's own next render to find out. */
  getActiveTeamId: () => string | null;
  /** team_ids with at least one unread chat notification (message, DM, or
   * announcement) — lets a team switcher show which team(s) need
   * attention without the user having to visit each one to check. */
  teamsWithUnreadChat: Set<string>;
}

// Supabase's join-cardinality inference for `clubs(*)` isn't guaranteed to
// stay a single object — same defensive normalization used in useAuth.tsx
// for the profiles→clubs join.
function normalizeClub(clubs: ClubRow | ClubRow[] | null | undefined): ClubRow | null {
  if (!clubs) return null;
  return Array.isArray(clubs) ? clubs[0] ?? null : clubs;
}

// Every team in each given club, tagged 'org_admin' — the club_admins
// equivalent of the home-club "implicit full access, no team_members row
// needed" fetch above, for any additional club(s) reached that way.
//
// Returns null (not []) on failure, and the caller bails the same way the
// primary home/member queries in fetchTeams already do on their own
// failure. This used to return [] here on the theory that a failure was
// "lower stakes" and would "self-correct on the next successful fetch" —
// that was wrong: an admin's OTHER club reached only through this path
// (home club comes through profile.club_id instead) would silently drop
// out of allTeams, resolveSelection would then fall through to a team in
// the (now club-less) remaining list, and that wrong selection becomes
// sticky — the next successful fetch sees a currently-valid selection and
// never corrects it. Concretely: an admin of both Club A (home) and Club
// B (via club_admins) has this query fail for one refresh cycle (e.g. the
// access-token-refresh race on app foreground — see the AppState
// listener below) while viewing Club B — every Club B team vanishes from
// allTeams, the selection silently jumps to a Club A team, and it stays
// there. Not just cosmetic: saving a form from that state can write Club
// A's id onto what the user still thinks is a Club B record.
async function fetchAdminClubTeams(clubIds: string[]): Promise<Team[] | null> {
  if (!clubIds.length) return [];
  const { data, error } = await supabase.from('teams').select('*, clubs(*)').in('club_id', clubIds).order('created_at');
  if (error) return null;
  return ((data ?? []) as any[]).map((t) => ({ ...t, club: normalizeClub(t.clubs), myRole: 'org_admin', hasExplicitMembership: false } as Team));
}

const STORAGE_KEY_PREFIX = 'pulse_selected_team_id';

// Namespaced per user — on a shared device, a previous user's last-selected
// team should never be read into a new session (it's re-validated against
// the new user's own team list either way, so this was never a data leak,
// just a latent footgun for a more sensitive future use of this pattern).
function storageKey(profileId: string) {
  return `${STORAGE_KEY_PREFIX}_${profileId}`;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useAuth();
  const [allTeams, setAllTeams]               = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId]   = useState<string | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [teamsLoadError, setTeamsLoadError]   = useState(false);

  // fetchTeams runs more than once per session — on mount, and again on
  // every foreground/AppState transition (iOS can fire these repeatedly
  // and spuriously while a debugger/Simulator is attached). If it always
  // re-derived the active team from AsyncStorage, one of those spurious
  // refetches could silently overwrite a selection someone else JUST made
  // this session (the admin panel's own cross-club team picker, or
  // ClubSlugGuard reconciling a deep link) with the OLDER persisted value
  // — which that same correction logic would then immediately try to fix
  // again, producing a genuine ping-pong between two clubs. Tracked in a
  // ref (not state) so fetchTeams' own identity doesn't need to depend on
  // the very state it's about to read.
  const selectedTeamIdRef = useRef<string | null>(null);
  useEffect(() => { selectedTeamIdRef.current = selectedTeamId; }, [selectedTeamId]);

  const resolveSelection = useCallback((teams: Team[], saved: string | null, defaultTeamId: string | null) => {
    const current = teams.find((t) => t.id === selectedTeamIdRef.current);
    if (current) return current.id; // already-active selection still valid — leave it alone
    // A selection that was valid a moment ago and is now missing from
    // `teams` reads the same, at this point, as "that team got deleted"
    // — but it's far more often a degraded fetch (see fetchAdminClubTeams
    // above) silently dropping an entire club's teams for one refresh
    // cycle. Keep the existing selection rather than falling through to
    // teams[0] (a different club entirely) on nothing more than "not
    // found in this possibly-incomplete list". Only a genuinely fresh
    // session (nothing selected yet) falls through to default/storage/teams[0].
    if (selectedTeamIdRef.current) return selectedTeamIdRef.current;
    // A deliberately pinned default wins over "last viewed" — that's the
    // whole point of pinning one instead of just relying on whatever was
    // last tapped in the switcher.
    const fromDefault = teams.find((t) => t.id === defaultTeamId);
    if (fromDefault) return fromDefault.id;
    const fromStorage = teams.find((t) => t.id === saved);
    return fromStorage ? fromStorage.id : (teams[0]?.id ?? null);
  }, []);

  const fetchTeams = useCallback(async () => {
    if (!profile?.club_id) {
      setLoading(false);
      return;
    }

    // On cold launch, this runs once with profile still null (the
    // early-return above fires, setting loading false), then again the
    // instant profile populates — but without resetting loading back to
    // true here, that second, REAL fetch ran with loading already reading
    // false the whole time it was in flight. app/index.tsx's `session &&
    // teamsLoading` gate therefore let the redirect logic run against a
    // still-empty allTeams for however long this fetch actually took,
    // landing on club.slug's bare default instead of waiting for the real
    // active team.
    setLoading(true);
    setTeamsLoadError(false);
    let teams: Team[];

    // club_admins grants the same implicit "every team in this club, no
    // team_members row needed" access as a home-club org_admin, but for a
    // SECOND club — fetched for every profile regardless of profile.role,
    // since a plain coach at their home club can independently be an
    // org_admin of a different club too (not just the reverse).
    const firstWave = await withTimeout(Promise.all([
      supabase.from('club_admins').select('club_id').eq('profile_id', profile.id),
      supabase.from('team_members').select('role, teams(*, clubs(*))').eq('profile_id', profile.id),
      AsyncStorage.getItem(storageKey(profile.id)),
    ]), TEAMS_TIMEOUT_MS);
    if (firstWave === TIMEOUT) {
      setTeamsLoadError(true);
      setLoading(false);
      return;
    }
    const [adminClubsRes, memberRes, saved] = firstWave;
    // A transient failure here (a network blip, or an access token that
    // expired while the app was asleep and hasn't refreshed yet — see
    // lib/supabase.ts's AppState-driven startAutoRefresh/stopAutoRefresh)
    // used to be indistinguishable from "this profile genuinely has zero
    // teams": .data on a failed query is null, which ?? [] silently turned
    // into an empty list, wiping allTeams and re-resolving the selection
    // against nothing — the visible "teams flipping" symptom on wake from
    // sleep. Bail out and keep whatever's already in state instead,
    // mirroring useAuth.tsx's identical guard for the exact same failure
    // mode on profile/club.
    if (adminClubsRes.error || memberRes.error) {
      setLoading(false);
      return;
    }
    const adminClubIds = (adminClubsRes.data ?? []).map((r) => r.club_id as string);
    const memberTeams = ((memberRes.data ?? []) as any[])
      .filter((r) => r.teams)
      .map((r: any) => ({ ...r.teams, club: normalizeClub(r.teams.clubs), myRole: r.role, hasExplicitMembership: true } as Team));

    if (profile.role === 'org_admin' || profile.role === 'app_admin') {
      // Org admins implicitly manage every team in their home club (no
      // team_members row needed — RLS grants this by role+club_id), but may
      // ALSO be an explicit team_members guest coach on teams at other
      // clubs. Fetch both and merge, so a cross-club guest team isn't lost.
      //
      // app_admin (Rick) gets the identical treatment for his own home
      // club — RLS already grants app_admin unconditional SELECT on every
      // team regardless of club (current_user_role() = 'app_admin' in the
      // teams policy), but this hook itself only ever asked for that when
      // role was exactly 'org_admin', so a brand-new team never showed up
      // for him here until he was also explicitly added via team_members —
      // a gap that has nothing to do with RLS or staleness, just this
      // branch never having covered his own role. Tagged as 'org_admin'
      // rather than a new tier since "implicit full access to every team
      // in this club" is exactly what that tier already means everywhere
      // else in the app that reads myRole.
      const secondWave = await withTimeout(Promise.all([
        supabase.from('teams').select('*, clubs(*)').eq('club_id', profile.club_id).order('created_at'),
        fetchAdminClubTeams(adminClubIds.filter((id) => id !== profile.club_id)),
      ]), TEAMS_TIMEOUT_MS);
      if (secondWave === TIMEOUT) {
        setTeamsLoadError(true);
        setLoading(false);
        return;
      }
      const [homeRes, extraAdminTeams] = secondWave;
      // extraAdminTeams === null means fetchAdminClubTeams itself failed —
      // bail the same as a home-query failure instead of treating it as
      // "this admin has zero teams at their other club(s) right now" (see
      // fetchAdminClubTeams's own comment for why that used to be wrong).
      if (homeRes.error || extraAdminTeams === null) {
        setLoading(false);
        return;
      }
      const homeTeams = ((homeRes.data ?? []) as any[]).map((t) => ({ ...t, club: normalizeClub(t.clubs), myRole: 'org_admin', hasExplicitMembership: false } as Team));
      // Real membership on a team the org_admin also implicitly manages
      // (their own home club) — tracked before the merge below overwrites
      // that row with the home-club copy, so it isn't lost.
      const explicitMemberIds = new Set(memberTeams.map((t) => t.id));
      const byId = new Map<string, Team>();
      // Home-club rows win over an explicit member row for the same team —
      // org_admin's implicit club-wide access shouldn't be shadowed by a
      // lower-tier team_members row that predates them becoming org_admin.
      for (const t of [...memberTeams, ...extraAdminTeams, ...homeTeams]) byId.set(t.id, t);
      teams = [...byId.values()]
        .map((t) => (explicitMemberIds.has(t.id) ? { ...t, hasExplicitMembership: true } : t))
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      setAllTeams(teams);
      setSelectedTeamId(resolveSelection(teams, saved, profile.default_team_id ?? null));
    } else {
      const extraAdminTeamsResult = await withTimeout(fetchAdminClubTeams(adminClubIds), TEAMS_TIMEOUT_MS);
      if (extraAdminTeamsResult === TIMEOUT) {
        setTeamsLoadError(true);
        setLoading(false);
        return;
      }
      // null means fetchAdminClubTeams itself failed — bail rather than
      // treat it as "this profile has zero teams at their other club(s)
      // right now" (see fetchAdminClubTeams's own comment for why).
      if (extraAdminTeamsResult === null) {
        setLoading(false);
        return;
      }
      const extraAdminTeams = extraAdminTeamsResult;
      const explicitMemberIds = new Set(memberTeams.map((t) => t.id));
      const byId = new Map<string, Team>();
      for (const t of [...memberTeams, ...extraAdminTeams]) byId.set(t.id, t);
      teams = [...byId.values()]
        .map((t) => (explicitMemberIds.has(t.id) ? { ...t, hasExplicitMembership: true } : t))
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      setAllTeams(teams);
      setSelectedTeamId(resolveSelection(teams, saved, profile.default_team_id ?? null));
    }

    setLoading(false);
  }, [profile?.id, profile?.club_id, profile?.role, profile?.default_team_id, resolveSelection]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // A team created elsewhere (the web dashboard, another device) never
  // pushes anything to an already-open app — it just sits missing from the
  // switcher until the app is force-quit and relaunched. Refetch whenever
  // the app returns to the foreground, mirroring useAuth.tsx's identical
  // fix for profile/club staleness. Kept in a ref so this listener doesn't
  // get torn down and resubscribed on every profile change.
  const fetchTeamsRef = useRef(fetchTeams);
  useEffect(() => { fetchTeamsRef.current = fetchTeams; }, [fetchTeams]);

  useEffect(() => {
    async function onAppStateChange(next: AppStateStatus) {
      if (next !== 'active') return;
      // supabase.auth.getSession() silently falls back to the anon key
      // (HTTP 200, not an error) when it's asked for a session before
      // lib/supabase.ts's AppState-driven auto-refresh has had a chance to
      // actually refresh the access token that expired while backgrounded
      // — which, under RLS, makes a club_admins-gated query (not keyed by
      // profile.club_id the way the home club is) look like a genuine
      // "zero rows" success instead of a failure. Waiting for a confirmed
      // session here closes that window at the source, rather than
      // relying solely on fetchTeams' own per-query bail-outs to catch it.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      fetchTeamsRef.current();
    }
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

  const selectTeam = useCallback(async (teamId: string) => {
    // Updated synchronously (not just via the state-watching effect above)
    // so a reader that consults the ref directly right after this call — not
    // the reactive `team` value, which only catches up on this component's
    // next render — sees the new selection immediately. ClubSlugGuard needs
    // exactly this: it and the switcher live in different parts of the
    // tree, and route-param changes (from the navigation the switcher fires
    // right after this) can become visible before React has re-rendered
    // this provider, so a guard reading the stale `team` value from context
    // would see a false mismatch and "correct" a switch that just happened.
    selectedTeamIdRef.current = teamId;
    setSelectedTeamId(teamId);
    if (profile?.id) await AsyncStorage.setItem(storageKey(profile.id), teamId);
  }, [profile?.id]);

  const setDefaultTeam = useCallback(async (teamId: string | null) => {
    if (!profile?.id) return;
    const { error } = await supabase.from('profiles').update({ default_team_id: teamId }).eq('id', profile.id);
    if (error) throw error;
    // Pulls the new value into useAuth's own profile state — resolveSelection
    // reads profile.default_team_id straight from there, not a local copy,
    // so without this the pin wouldn't take effect until the next full
    // session restore.
    await refreshProfile();
  }, [profile?.id, refreshProfile]);

  // Lets a reader (ClubSlugGuard) check the truly-current selection without
  // waiting on this provider's own next render — see selectTeam above.
  const getActiveTeamId = useCallback(() => selectedTeamIdRef.current, []);

  // No `?? allTeams[0]` fallback here on purpose: if selectedTeamId is set
  // but momentarily not found in allTeams (a degraded fetch mid-flight,
  // or just this render landing between the two state updates in
  // fetchTeams), falling through to allTeams[0] can render a DIFFERENT
  // club's team for that render — exactly the "flips to the wrong club"
  // symptom this whole file's defensive comments are about. Only use
  // allTeams[0] when there's definitively no selection yet (first load).
  const team = allTeams.find((t) => t.id === selectedTeamId)
    ?? (selectedTeamId ? null : allTeams[0])
    ?? null;

  // Which teams have an unread chat notification, so a switcher can flag
  // them — independent of which team is currently active, so this fetches
  // and subscribes for the whole profile regardless of `allTeams` loading.
  const [teamsWithUnreadChat, setTeamsWithUnreadChat] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile?.id) { setTeamsWithUnreadChat(new Set()); return; }

    async function fetchUnreadTeams() {
      const { data } = await supabase
        .from('notifications')
        .select('team_id')
        .eq('profile_id', profile!.id)
        .eq('read', false)
        .in('type', ['new_message', 'new_dm', 'new_announcement'])
        .not('team_id', 'is', null);
      setTeamsWithUnreadChat(new Set((data ?? []).map((r) => r.team_id as string)));
    }

    fetchUnreadTeams();

    const sub = supabase
      .channel(uniqueChannelName(`team-switcher-badges-${profile.id}`))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profile.id}`,
      }, fetchUnreadTeams)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [profile?.id]);

  // Without this, every render of TeamProvider (including ones triggered by
  // AuthProvider re-rendering above it) hands every consumer a brand-new
  // object by reference, forcing a re-render regardless of whether team/
  // allTeams/loading actually changed. selectTeam/fetchTeams are already
  // stable via useCallback above, so only `team`/`allTeams`/`loading` need
  // to be in the dependency array.
  const value = useMemo<TeamContextValue>(
    () => ({ team, allTeams, loading, teamsLoadError, selectTeam, setDefaultTeam, refetch: fetchTeams, getActiveTeamId, teamsWithUnreadChat }),
    [team, allTeams, loading, teamsLoadError, selectTeam, setDefaultTeam, fetchTeams, getActiveTeamId, teamsWithUnreadChat]
  );

  return (
    <TeamContext.Provider value={value}>
      {children}
    </TeamContext.Provider>
  );
}

export function useActiveTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useActiveTeam must be used inside TeamProvider');
  return ctx;
}
