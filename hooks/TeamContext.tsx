import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import type { Database } from '../types/database';

type Team = Database['public']['Tables']['teams']['Row'];

interface TeamContextValue {
  team: Team | null;
  allTeams: Team[];
  loading: boolean;
  selectTeam: (teamId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const STORAGE_KEY = 'dugout_selected_team_id';

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

    let teams: Team[] = [];

    if (profile.role === 'org_admin') {
      const { data } = await supabase
        .from('teams')
        .select('*')
        .eq('club_id', profile.club_id)
        .order('created_at');
      teams = (data as Team[]) ?? [];
    } else {
      const { data } = await supabase
        .from('team_members')
        .select('teams(*)')
        .eq('profile_id', profile.id);
      teams = ((data ?? [])
        .map((r: any) => r.teams)
        .filter((t: any) => Boolean(t) && t.club_id === profile.club_id) as Team[])
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    }

    setAllTeams(teams);

    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    const valid = teams.find((t) => t.id === saved);
    setSelectedTeamId(valid ? valid.id : (teams[0]?.id ?? null));
    setLoading(false);
  }, [profile?.id, profile?.club_id, profile?.role]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  async function selectTeam(teamId: string) {
    setSelectedTeamId(teamId);
    await AsyncStorage.setItem(STORAGE_KEY, teamId);
  }

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
