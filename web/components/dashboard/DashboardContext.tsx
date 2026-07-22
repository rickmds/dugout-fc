'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { type PlanId, PLAN_LIMITS, type PlanLimits } from '@/lib/plans';

export type Profile = {
  id: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
  club_id: string | null;
};

export type Club = {
  id: string;
  name: string;
  slug: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  currency: string;
  tryouts_active: boolean;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

export type Team = {
  id: string;
  name: string;
  age_group: string | null;
  season: string | null;
};

type DashboardCtx = {
  profile: Profile | null;
  club: Club | null;
  teams: Team[];
  selectedTeamId: string | null;
  setSelectedTeamId: (id: string) => void;
  loading: boolean;
  reload: () => void;
  signOut: () => void;
  plan: PlanId;
  limits: PlanLimits;
  canUse: (feature: keyof PlanLimits) => boolean;
};

const Ctx = createContext<DashboardCtx | null>(null);

export function useDashboard() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDashboard must be used inside DashboardProvider');
  return ctx;
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile]             = useState<Profile | null>(null);
  const [club, setClub]                   = useState<Club | null>(null);
  const [teams, setTeams]                 = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [plan, setPlan]                   = useState<PlanId>('free');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) { router.push('/login'); return; }

    const { data: p } = await supabase
      .from('profiles')
      .select('id, role, full_name, avatar_url, club_id')
      .eq('id', user.id)
      .single();

    if (!p || (p as any).role === 'player') { router.push('/login'); return; }

    const prof = p as Profile;
    setProfile(prof);

    if (prof.club_id) {
      const { data: c } = await supabase
        .from('clubs')
        .select('id, name, slug, primary_color, secondary_color, logo_url, currency, tryouts_active, latitude, longitude, timezone')
        .eq('id', prof.club_id)
        .single();
      if (c) {
        setClub(c as Club);
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan')
          .eq('club_id', (c as Club).id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        setPlan((sub?.plan as PlanId) ?? 'free');
      }
    }

    // Load teams based on role
    let teamRows: Team[] = [];
    if (prof.role === 'org_admin' && prof.club_id) {
      const { data } = await supabase
        .from('teams')
        .select('id, name, age_group, season')
        .eq('club_id', prof.club_id)
        .order('name');
      teamRows = (data ?? []) as Team[];
    } else {
      const { data } = await supabase
        .from('team_members')
        .select('teams(id, name, age_group, season)')
        .eq('profile_id', prof.id)
        .in('role', ['coach', 'org_admin']);
      teamRows = (data ?? []).map((m: any) => m.teams).filter(Boolean) as Team[];
    }

    setTeams(teamRows);
    if (teamRows.length === 1) setSelectedTeamId(teamRows[0].id);

    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const limits = PLAN_LIMITS[plan];
  function canUse(feature: keyof PlanLimits): boolean {
    const val = limits[feature];
    return typeof val === 'boolean' ? val : (val as number) > 0;
  }

  return (
    <Ctx.Provider value={{ profile, club, teams, selectedTeamId, setSelectedTeamId, loading, reload: load, signOut, plan, limits, canUse }}>
      {children}
    </Ctx.Provider>
  );
}
