'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { type PlanId, PLAN_LIMITS, type PlanLimits } from '@/lib/plans';

export type Profile = {
  id: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
  club_id: string | null;
  payment_instructions: string | null;
};

export type Club = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  contact_email: string | null;
  tagline: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  home_kit_color: string | null;
  away_kit_color: string | null;
  training_kit_color: string | null;
  logo_url: string | null;
  currency: string;
  country: string;
  tryouts_active: boolean;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  stripe_fee_handling: 'absorb' | 'pass_on' | null;
  allow_partial_payments: boolean | null;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarded: boolean | null;
  late_fee_enabled: boolean | null;
  late_fee_type: 'fixed' | 'percent' | null;
  late_fee_amount: number | null;
  late_fee_grace_days: number | null;
  hardship_fund_enabled: boolean | null;
  suspended_at: string | null;
};

export type Team = {
  id: string;
  name: string;
  age_group: string | null;
  gender: string | null;
  season: string | null;
  club_id: string;
};

type DashboardCtx = {
  profile: Profile | null;
  club: Club | null;
  // Every club this profile can fully administer — their home club
  // (profiles.club_id) plus any additional club_admins rows. Coach-only
  // cross-club access doesn't need a switcher entry: loadTeams' coach
  // branch already returns teams across every club a coach belongs to in
  // one flat list, with no per-club "administer this one" concept to pick.
  myClubs: Club[];
  switchClub: (clubId: string) => void;
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

const CLUB_SELECT = 'id, name, slug, website, contact_email, tagline, primary_color, secondary_color, home_kit_color, away_kit_color, training_kit_color, logo_url, currency, country, tryouts_active, latitude, longitude, timezone, stripe_fee_handling, allow_partial_payments, stripe_connect_account_id, stripe_connect_onboarded, late_fee_enabled, late_fee_type, late_fee_amount, late_fee_grace_days, hardship_fund_enabled, suspended_at';

function viewingClubStorageKey(profileId: string) {
  return `pulse_dashboard_viewing_club_${profileId}`;
}

const Ctx = createContext<DashboardCtx | null>(null);

export function useDashboard() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDashboard must be used inside DashboardProvider');
  return ctx;
}

// Role-branched teams query, pulled out so it can run in `Promise.all`
// alongside the clubs/subscriptions fetches instead of after them.
// `clubId` defaults to the profile's home club, but switchClub() passes a
// second club here explicitly — an org_admin (home-club role or a
// club_admins row) gets that club's full team list, same as their own.
async function loadTeams(prof: Profile, clubId?: string | null): Promise<Team[]> {
  // An explicit clubId means switchClub() is calling this for a club from
  // myClubs — by construction (home club, or a club_admins row), the
  // caller is already known to administer it, regardless of what their
  // global home-club role happens to be.
  const effectiveClubId = clubId ?? prof.club_id;
  // app_admin (Rick) needs the identical home-club-scoped branch an
  // org_admin gets — missing this fell through to the team_members branch
  // below, which has NO club filter at all, mixing in team_members rows
  // from every club he coaches at (e.g. Maroons' BU14 Madrid appearing in
  // MDS Academy's own team picker — and worse, editing/removing it from
  // there would have deleted the Maroons row, not an MDS one).
  const asOrgAdmin = clubId ? true : (prof.role === 'org_admin' || prof.role === 'app_admin');
  if (asOrgAdmin && effectiveClubId) {
    const { data } = await supabase
      .from('teams')
      .select('id, name, age_group, gender, season, club_id')
      .eq('club_id', effectiveClubId)
      .order('name');
    return (data ?? []) as Team[];
  }
  const { data } = await supabase
    .from('team_members')
    .select('teams(id, name, age_group, gender, season, club_id)')
    .eq('profile_id', prof.id)
    .in('role', ['coach', 'org_admin']);
  return (data ?? []).map(m => m.teams as unknown as Team | null).filter((t): t is Team => t !== null);
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [profile, setProfile]             = useState<Profile | null>(null);
  const [club, setClub]                   = useState<Club | null>(null);
  const [myClubs, setMyClubs]             = useState<Club[]>([]);
  const [teams, setTeams]                 = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [plan, setPlan]                   = useState<PlanId>('free');

  // The club currently being viewed — starts as the home club, but can be
  // switched to any club in myClubs. Tracked outside `club` state itself
  // so the visibility-change effect below (and switchClub) always know
  // which club's staleness to check, not just the home one.
  const viewingClubIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) { router.push('/login'); return; }

      const { data: p } = await supabase
        .from('profiles')
        .select('id, role, full_name, avatar_url, club_id, payment_instructions')
        .eq('id', user.id)
        .single();

      if (!p) {
        // Authenticated (e.g. a first-time Google/Apple sign-in) but no
        // profiles row exists yet — sending them to /login here creates an
        // infinite bounce, since /login sees the active session and sends
        // them straight back to /dashboard. Send them to onboarding instead
        // so they can create their club and get a profiles row.
        router.push('/onboarding');
        return;
      }
      if ((p as { role: string }).role === 'player') { router.push('/login'); return; }

      const prof = p as Profile;
      setProfile(prof);

      const { data: adminRows } = await supabase.from('club_admins').select('club_id').eq('profile_id', prof.id);
      const allClubIds = [...new Set([
        ...(prof.club_id ? [prof.club_id] : []),
        ...(adminRows ?? []).map(r => r.club_id as string),
      ])];

      // A previously-switched-to club (persisted across reloads), only
      // honored if it's still one this profile actually administers.
      const savedClubId = typeof window !== 'undefined' ? window.localStorage.getItem(viewingClubStorageKey(prof.id)) : null;
      const viewClubId = savedClubId && allClubIds.includes(savedClubId) ? savedClubId : prof.club_id;
      viewingClubIdRef.current = viewClubId;

      // `clubs` (every club this profile administers, in one query),
      // `subscriptions`, and `teams` each only depend on `prof`/`viewClubId`,
      // not each other's results, so fetch them together instead of serially.
      if (viewClubId) {
        const [{ data: clubRows }, { data: sub }, teamRows] = await Promise.all([
          allClubIds.length ? supabase.from('clubs').select(CLUB_SELECT).in('id', allClubIds) : Promise.resolve({ data: [] as Club[] }),
          supabase.from('subscriptions').select('plan').eq('club_id', viewClubId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
          loadTeams(prof, viewClubId === prof.club_id ? null : viewClubId),
        ]);
        const clubsList = (clubRows ?? []) as Club[];
        setMyClubs(clubsList);
        const viewedClub = clubsList.find(c => c.id === viewClubId) ?? null;
        if (viewedClub) setClub(viewedClub);
        setPlan((sub?.plan as PlanId) ?? 'free');
        setTeams(teamRows);
        if (teamRows.length >= 1) {
          setSelectedTeamId(prev => prev ?? teamRows[0].id);
        }
      } else {
        const teamRows = await loadTeams(prof);
        setTeams(teamRows);
        if (teamRows.length >= 1) {
          setSelectedTeamId(prev => prev ?? teamRows[0].id);
        }
      }
    } catch (e) {
      // Only redirect on auth errors, not transient network failures
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('JWT') || msg.includes('401') || msg.includes('not authenticated')) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  const switchClub = useCallback((clubId: string) => {
    if (!profile || clubId === viewingClubIdRef.current) return;
    const target = myClubs.find(c => c.id === clubId);
    if (!target) return; // not a club this profile actually administers
    viewingClubIdRef.current = clubId;
    window.localStorage.setItem(viewingClubStorageKey(profile.id), clubId);
    setClub(target);
    setLoading(true);
    (async () => {
      const [{ data: sub }, teamRows] = await Promise.all([
        supabase.from('subscriptions').select('plan').eq('club_id', clubId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        loadTeams(profile, clubId),
      ]);
      setPlan((sub?.plan as PlanId) ?? 'free');
      setTeams(teamRows);
      setSelectedTeamId(teamRows[0]?.id ?? null);
      setLoading(false);
    })();
  }, [profile, myClubs]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { load(); }, [load]);

  // load() only checks auth once, on mount. If the session dies later —
  // refresh token expired, signed out in another tab, revoked — nothing
  // else here would notice: profile/club/teams stay in state, the page
  // keeps rendering as if logged in, and every action after that just
  // fails silently. Supabase itself fires SIGNED_OUT the moment it gives
  // up on the session, so react to that directly instead of leaving stale
  // UI up.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // The SIGNED_OUT listener above only fires when Supabase's own client
  // decides the session is dead — which requires its background refresh
  // timer to actually run. Browsers throttle or fully pause timers for a
  // backgrounded tab (laptop asleep, tab unfocused for a while), so that
  // timer can simply never get a turn — the session sits stale in memory
  // with nothing pushing an event, and only a manual reload's fresh
  // getUser() call notices. Closing that gap: re-validate with the server
  // the moment the tab is looked at again, instead of waiting on a push
  // that may never come.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) { router.push('/login'); return; }
        // Session-liveness check above doesn't cover a club that got
        // suspended while this tab sat in the background — the suspended
        // block screen only renders off club.suspended_at in state, and
        // nothing else here ever refreshes it after the initial load().
        // Uses the CURRENTLY VIEWED club (which can differ from the home
        // club after switchClub), not profile.club_id — otherwise a
        // switched-to second club's staleness would never get caught.
        const viewingId = viewingClubIdRef.current;
        if (profile && viewingId) {
          supabase.from('clubs').select('suspended_at').eq('id', viewingId).single().then(({ data }) => {
            if (data && data.suspended_at !== club?.suspended_at) {
              setClub(prev => prev ? { ...prev, suspended_at: data.suspended_at } : prev);
            }
          });
          // Same staleness class as club.suspended_at above — a team added
          // in another tab (or the mobile app) never pushes anything to
          // this one, so it just sits missing from the team switcher.
          loadTeams(profile, viewingId === profile.club_id ? null : viewingId).then(setTeams);
        }
      });
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [router, profile, club?.suspended_at]);

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
    <Ctx.Provider value={{ profile, club, myClubs, switchClub, teams, selectedTeamId, setSelectedTeamId, loading, reload: load, signOut, plan, limits, canUse }}>
      {children}
    </Ctx.Provider>
  );
}
