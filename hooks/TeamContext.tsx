import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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

  const fetchTeams = useCallback(async () => {
    if (!profile?.club_id) {
      setLoading(false);
      return;
    }

    let teams: Team[];

    if (profile.role === 'org_admin') {
      // Org admins implicitly manage every team in their home club (no
      // team_members row needed — RLS grants this by role+club_id), but may
      // ALSO be an explicit team_members guest coach on teams at other
      // clubs. Fetch both and merge, so a cross-club guest team isn't lost.
      const [homeRes, memberRes, saved] = await Promise.all([
        supabase.from('teams').select('*, clubs(*)').eq('club_id', profile.club_id).order('created_at'),
        supabase.from('team_members').select('role, teams(*, clubs(*))').eq('profile_id', profile.id),
        AsyncStorage.getItem(storageKey(profile.id)),
      ]);
      const homeTeams = ((homeRes.data ?? []) as any[]).map((t) => ({ ...t, club: normalizeClub(t.clubs), myRole: 'org_admin' } as Team));
      const memberTeams = ((memberRes.data ?? []) as any[])
        .filter((r) => r.teams)
        .map((r: any) => ({ ...r.teams, club: normalizeClub(r.teams.clubs), myRole: r.role } as Team));
      const byId = new Map<string, Team>();
      // Home-club rows win over an explicit member row for the same team —
      // org_admin's implicit club-wide access shouldn't be shadowed by a
      // lower-tier team_members row that predates them becoming org_admin.
      for (const t of [...memberTeams, ...homeTeams]) byId.set(t.id, t);
      teams = [...byId.values()].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      setAllTeams(teams);
      const valid = teams.find((t) => t.id === saved);
      setSelectedTeamId(valid ? valid.id : (teams[0]?.id ?? null));
    } else {
      const [{ data }, saved] = await Promise.all([
        supabase.from('team_members').select('role, teams(*, clubs(*))').eq('profile_id', profile.id),
        AsyncStorage.getItem(storageKey(profile.id)),
      ]);
      teams = ((data ?? [])
        .filter((r: any) => r.teams)
        .map((r: any) => ({ ...r.teams, club: normalizeClub(r.teams.clubs), myRole: r.role } as Team)))
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      setAllTeams(teams);
      const valid = teams.find((t) => t.id === saved);
      setSelectedTeamId(valid ? valid.id : (teams[0]?.id ?? null));
    }

    setLoading(false);
  }, [profile?.id, profile?.club_id, profile?.role]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const selectTeam = useCallback(async (teamId: string) => {
    setSelectedTeamId(teamId);
    if (profile?.id) await AsyncStorage.setItem(storageKey(profile.id), teamId);
  }, [profile?.id]);

  const team = allTeams.find((t) => t.id === selectedTeamId) ?? allTeams[0] ?? null;

  return (
    <TeamContext.Provider value={{ team, allTeams, loading, selectTeam, refetch: fetchTeams }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useActiveTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useActiveTeam must be used inside TeamProvider');
  return ctx;
}
