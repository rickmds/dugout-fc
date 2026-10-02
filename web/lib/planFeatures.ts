import { SupabaseClient } from '@supabase/supabase-js';

// Server-side counterpart to useDashboard().hasFeature() — for the small
// number of catalog features actually worth enforcing where the client
// can't be trusted to self-police (a scheduled push send here, not a UI
// button). Same rule as the client: a club's plan has the feature once its
// sort_order is at or above the catalog entry's min_plan's sort_order.
export async function clubHasFeature(supabase: SupabaseClient, clubId: string, key: string): Promise<boolean> {
  const [{ data: feature }, { data: sub }] = await Promise.all([
    supabase.from('plan_features').select('min_plan_id').eq('key', key).eq('is_active', true).maybeSingle(),
    supabase.from('subscriptions').select('plan').eq('club_id', clubId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!feature?.min_plan_id) return false;
  const planId = sub?.plan ?? 'free';

  const { data: plans } = await supabase.from('plans').select('id, sort_order').in('id', [feature.min_plan_id, planId]);
  const minSort = plans?.find(p => p.id === feature.min_plan_id)?.sort_order;
  const planSort = plans?.find(p => p.id === planId)?.sort_order;
  return minSort != null && planSort != null && planSort >= minSort;
}
