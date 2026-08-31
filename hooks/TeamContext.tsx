import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import type { Database } from '../types/database';

type TeamRow = Database['public']['Tables']['teams']['Row'];
type ClubRow = Database['public']['Tables']['clubs']['Row'];

// The user's own team_members.role for this specific team — 'org_admin' is
// synthetic (org_admins manage their home club's teams implicitly, with no
// team_members row at all) so callers can treat it like any other role tier
// without a null check. Coach-gated UI should key off this, not the global
// profiles.role, so a coach on team A who's just a parent on team B sees the
// right UI on each.
export type Team = TeamRow & { club: ClubRow | null; myRole: 'coach' | 'parent' | 'org_admin' | null };

interface TeamContextValue {
  team: Team | null;
  allTeams: Team[];
  loading: boolean;
  selectTeam: (teamId: string) => Promise<void>;
  refetch: () => Promise<void>;
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
async function fetchAdminClubTeams(clubIds: string[]): Promise<Team[]> {
  if (!clubIds.length) return [];
  const { data } = await supabase.from('teams').select('*, clubs(*)').in('club_id', clubIds).order('created_at');
  return ((data ?? []) as any[]).map((t) => ({ ...t, club: normalizeClub(t.clubs), myRole: 'org_admin' } as Team));
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
  const { profile } = useAuth();
  const [allTeams, setAllTeams]               = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId]   = useState<string | null>(null);
  const [loading, setLoading]                 = useState(true);

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

  const resolveSelection = useCallback((teams: Team[], saved: string | null) => {
    const current = teams.find((t) => t.id === selectedTeamIdRef.current);
    if (current) return current.id; // already-active selection still valid — leave it alone
    const fromStorage = teams.find((t) => t.id === saved);
    return fromStorage ? fromStorage.id : (teams[0]?.id ?? null);
  }, []);

  const fetchTeams = useCallback(async () => {
    if (!profile?.club_id) {
      setLoading(false);
      return;
    }

    let teams: Team[];

    // club_admins grants the same implicit "every team in this club, no
    // team_members row needed" access as a home-club org_admin, but for a
    // SECOND club — fetched for every profile regardless of profile.role,
    // since a plain coach at their home club can independently be an
    // org_admin of a different club too (not just the reverse).
    const [adminClubsRes, memberRes, saved] = await Promise.all([
      supabase.from('club_admins').select('club_id').eq('profile_id', profile.id),
      supabase.from('team_members').select('role, teams(*, clubs(*))').eq('profile_id', profile.id),
      AsyncStorage.getItem(storageKey(profile.id)),
    ]);
    const adminClubIds = (adminClubsRes.data ?? []).map((r) => r.club_id as string);
    const memberTeams = ((memberRes.data ?? []) as any[])
      .filter((r) => r.teams)
      .map((r: any) => ({ ...r.teams, club: normalizeClub(r.teams.clubs), myRole: r.role } as Team));

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
      const homeRes = await supabase.from('teams').select('*, clubs(*)').eq('club_id', profile.club_id).order('created_at');
      const homeTeams = ((homeRes.data ?? []) as any[]).map((t) => ({ ...t, club: normalizeClub(t.clubs), myRole: 'org_admin' } as Team));
      const extraAdminTeams = await fetchAdminClubTeams(adminClubIds.filter((id) => id !== profile.club_id));
      const byId = new Map<string, Team>();
      // Home-club rows win over an explicit member row for the same team —
      // org_admin's implicit club-wide access shouldn't be shadowed by a
      // lower-tier team_members row that predates them becoming org_admin.
      for (const t of [...memberTeams, ...extraAdminTeams, ...homeTeams]) byId.set(t.id, t);
      teams = [...byId.values()].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      setAllTeams(teams);
      setSelectedTeamId(resolveSelection(teams, saved));
    } else {
      const extraAdminTeams = await fetchAdminClubTeams(adminClubIds);
      const byId = new Map<string, Team>();
      for (const t of [...memberTeams, ...extraAdminTeams]) byId.set(t.id, t);
      teams = [...byId.values()].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      setAllTeams(teams);
      setSelectedTeamId(resolveSelection(teams, saved));
    }

    setLoading(false);
  }, [profile?.id, profile?.club_id, profile?.role, resolveSelection]);

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
    function onAppStateChange(next: AppStateStatus) {
      if (next === 'active') fetchTeamsRef.current();
    }
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

  const selectTeam = useCallback(async (teamId: string) => {
    setSelectedTeamId(teamId);
    if (profile?.id) await AsyncStorage.setItem(storageKey(profile.id), teamId);
  }, [profile?.id]);

  const team = allTeams.find((t) => t.id === selectedTeamId) ?? allTeams[0] ?? null;

  // Without this, every render of TeamProvider (including ones triggered by
  // AuthProvider re-rendering above it) hands every consumer a brand-new
  // object by reference, forcing a re-render regardless of whether team/
  // allTeams/loading actually changed. selectTeam/fetchTeams are already
  // stable via useCallback above, so only `team`/`allTeams`/`loading` need
  // to be in the dependency array.
  const value = useMemo<TeamContextValue>(
    () => ({ team, allTeams, loading, selectTeam, refetch: fetchTeams }),
    [team, allTeams, loading, selectTeam, fetchTeams]
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
