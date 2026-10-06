import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useTeam } from './useTeam';

// Mobile's equivalent of web's useDashboard().hasFeature() — same catalog
// tables (plans, plan_features), same rule (a club's plan has a feature
// once its sort_order is at or above the catalog entry's min_plan's
// sort_order). Kept as its own small provider rather than importing
// web/lib/plans.ts directly: the two apps are separate TS projects with
// separate bundlers, not set up to share code across that boundary.
type PlanFeatureRow = { key: string; min_plan_id: string | null; is_active: boolean };

interface PlanContextValue {
  /** false while data is still loading or the club has no matching plan row — fails closed, same as web's FALLBACK_PLAN_LIMITS. */
  hasFeature: (key: string) => boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [sortOrderByPlanId, setSortOrderByPlanId] = useState<Record<string, number>>({});
  const [catalog, setCatalog] = useState<PlanFeatureRow[]>([]);
  const [planByClubId, setPlanByClubId] = useState<Record<string, string>>({});

  const { club: homeClub } = useAuth();
  const { team } = useTeam();
  // Same "whichever club is actually active" rule useClub() uses for
  // branding — a coach on a second club's team is gated by that club's
  // plan, not their home club's.
  const activeClubId = (team?.club as { id?: string } | undefined)?.id ?? (homeClub as { id?: string } | null)?.id ?? null;

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; sets state from a real network call, not derivable at render time
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from('plans').select('id, sort_order'),
      supabase.from('plan_features').select('key, min_plan_id, is_active'),
    ]).then(([{ data: planRows }, { data: featureRows }]) => {
      if (cancelled) return;
      const sortById: Record<string, number> = {};
      for (const p of (planRows ?? []) as { id: string; sort_order: number }[]) sortById[p.id] = p.sort_order;
      setSortOrderByPlanId(sortById);
      setCatalog((featureRows ?? []) as PlanFeatureRow[]);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeClubId || planByClubId[activeClubId] !== undefined) return;
    let cancelled = false;
    supabase.from('subscriptions').select('plan').eq('club_id', activeClubId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call, not derivable at render time
        setPlanByClubId((prev) => ({ ...prev, [activeClubId]: (data as { plan?: string } | null)?.plan ?? 'free' }));
      });
    return () => { cancelled = true; };
  }, [activeClubId, planByClubId]);

  const hasFeature = useCallback((key: string): boolean => {
    if (!activeClubId) return false;
    const planId = planByClubId[activeClubId] ?? 'free';
    const entry = catalog.find((f) => f.key === key && f.is_active);
    if (!entry?.min_plan_id) return false;
    const minSort = sortOrderByPlanId[entry.min_plan_id];
    const planSort = sortOrderByPlanId[planId];
    return minSort != null && planSort != null && planSort >= minSort;
  }, [activeClubId, planByClubId, catalog, sortOrderByPlanId]);

  return (
    <PlanContext.Provider value={{ hasFeature }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within a PlanProvider');
  return ctx;
}
