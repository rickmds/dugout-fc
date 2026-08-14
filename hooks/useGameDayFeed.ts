import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const FALLBACK_CLUB_COLOR = '#22C55E';

export type FeedClub = {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
  logo_url: string | null;
};

export type FeedEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  duration_minutes: number | null;
  arrival_buffer_minutes: number | null;
  uniform: string | null;
  home_away: 'home' | 'away' | null;
  rsvp_lock_at: string | null;
  team_id: string;
  team_name: string;
  club: FeedClub | null;
  rsvp_attending: number;
  rsvp_not_attending: number;
  rsvp_tbd: number;
  has_lineup: boolean;
  /** null = view-only (e.g. a parent's team, or a club you're not staff at) */
  my_role: 'coach' | 'org_admin' | null;
};

function localDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveClubColor(hex: string | null | undefined): string {
  if (!hex) return FALLBACK_CLUB_COLOR;
  const h = hex.replace('#', '');
  if (h === '000000' || h === 'ffffff' || h.length !== 6) return FALLBACK_CLUB_COLOR;
  return hex;
}

function normalizeJoin<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

// Correct O(n^2) same-day pairwise overlap check — catches non-adjacent
// clashes too, not just back-to-back ones.
export function detectClashes(events: FeedEvent[]): Set<string> {
  const clashed = new Set<string>();
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      if (a.event_date !== b.event_date || !a.event_time || !b.event_time) continue;
      const [ah, am] = a.event_time.split(':').map(Number);
      const [bh, bm] = b.event_time.split(':').map(Number);
      const aStart = ah * 60 + am, bStart = bh * 60 + bm;
      const aEnd = aStart + (a.duration_minutes ?? 90);
      const bEnd = bStart + (b.duration_minutes ?? 90);
      if (aStart < bEnd && aEnd > bStart) { clashed.add(a.id); clashed.add(b.id); }
    }
  }
  return clashed;
}

export type TeamCoach = { team_id: string; profile_id: string; coach_name: string };
export type GuestCoachStatus = { event_id: string; status: 'pending' | 'confirmed' };
export type CoverageFlag = { level: 'at_risk' | 'needs_attention'; reason: string };

// For an org_admin's club-wide coverage view: flags when the SAME coach is
// assigned to two teams whose games overlap today, unless a guest coach has
// already been arranged (pending or confirmed) to cover at least one of
// them. Same-team pairs are skipped — that's just one team's own coach at
// one game, not a conflict.
export function detectCoachClashes(
  events: FeedEvent[],
  teamCoaches: TeamCoach[],
  guestCoachEventIds: Set<string>,
): Map<string, CoverageFlag> {
  const result = new Map<string, CoverageFlag>();
  const eventsByTeam = new Map<string, FeedEvent[]>();
  for (const e of events) {
    if (!eventsByTeam.has(e.team_id)) eventsByTeam.set(e.team_id, []);
    eventsByTeam.get(e.team_id)!.push(e);
  }

  const coachToEntries = new Map<string, { event: FeedEvent; coachName: string }[]>();
  for (const tc of teamCoaches) {
    const teamEvents = eventsByTeam.get(tc.team_id) ?? [];
    for (const event of teamEvents) {
      if (!coachToEntries.has(tc.profile_id)) coachToEntries.set(tc.profile_id, []);
      coachToEntries.get(tc.profile_id)!.push({ event, coachName: tc.coach_name });
    }
  }

  for (const entries of coachToEntries.values()) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j];
        if (a.event.team_id === b.event.team_id) continue;
        if (!a.event.event_time || !b.event.event_time) continue;
        const [ah, am] = a.event.event_time.split(':').map(Number);
        const [bh, bm] = b.event.event_time.split(':').map(Number);
        const aStart = ah * 60 + am, bStart = bh * 60 + bm;
        const aEnd = aStart + (a.event.duration_minutes ?? 90);
        const bEnd = bStart + (b.event.duration_minutes ?? 90);
        if (!(aStart < bEnd && aEnd > bStart)) continue;
        if (guestCoachEventIds.has(a.event.id) || guestCoachEventIds.has(b.event.id)) continue;

        if (!result.has(a.event.id)) {
          result.set(a.event.id, { level: 'at_risk', reason: `${a.coachName} also coaches ${b.event.team_name} at the same time — no guest coach arranged` });
        }
        if (!result.has(b.event.id)) {
          result.set(b.event.id, { level: 'at_risk', reason: `${b.coachName} also coaches ${a.event.team_name} at the same time — no guest coach arranged` });
        }
      }
    }
  }

  return result;
}

// RSVP-based coverage flag for a single event — coach-clash (if any) always
// wins since it's the more urgent, structural problem.
export function getCoverageFlag(event: FeedEvent, coachClash: CoverageFlag | undefined): CoverageFlag | null {
  if (coachClash) return coachClash;
  if (event.rsvp_not_attending > event.rsvp_attending) {
    return { level: 'at_risk', reason: `${event.rsvp_not_attending} declined vs ${event.rsvp_attending} confirmed` };
  }
  if (event.rsvp_tbd > event.rsvp_attending + event.rsvp_not_attending) {
    return { level: 'needs_attention', reason: `${event.rsvp_tbd} player${event.rsvp_tbd === 1 ? '' : 's'} haven't responded yet` };
  }
  return null;
}

export function groupByDate(events: FeedEvent[]): Record<string, FeedEvent[]> {
  const map: Record<string, FeedEvent[]> = {};
  for (const ev of events) {
    if (!map[ev.event_date]) map[ev.event_date] = [];
    map[ev.event_date].push(ev);
  }
  return map;
}

/** Distinct event_dates present in the feed, ascending. */
export function upcomingDates(events: FeedEvent[]): string[] {
  return [...new Set(events.map((e) => e.event_date))].sort();
}

// One RLS-scoped fetch covers everyone's real visibility — org_admins see
// their whole home club via is_team_coach's role+club_id bypass (no
// team_members row needed), and cross-club guest coaches see whatever
// team_members rows they hold, regardless of club. No client-side team
// pre-filter, so neither case is ever silently dropped.
export function useGameDayFeed(windowDays = 45) {
  const { profile } = useAuth();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [teamCoaches, setTeamCoaches] = useState<TeamCoach[]>([]);
  const [guestCoachStatuses, setGuestCoachStatuses] = useState<GuestCoachStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const today = localDateStr(0);
    const to = localDateStr(windowDays);

    const { data: evs } = await supabase
      .from('events')
      .select('id, title, event_date, event_time, location, address, lat, lng, duration_minutes, arrival_buffer_minutes, uniform, home_away, rsvp_lock_at, team_id')
      .eq('type', 'game')
      .gte('event_date', today)
      .lte('event_date', to)
      .is('cancelled_at', null)
      .order('event_date')
      .order('event_time');

    if (!evs?.length) { setEvents([]); setTeamCoaches([]); setGuestCoachStatuses([]); setLoading(false); return; }

    const teamIds = [...new Set(evs.map((e) => e.team_id))];
    const eventIds = evs.map((e) => e.id);

    const [teamsRes, rsvpRes, lineupRes, playersRes, membershipRes, coachRes, guestCoachRes] = await Promise.all([
      supabase.from('teams').select('id, name, clubs(id, name, slug, primary_color, logo_url)').in('id', teamIds),
      supabase.from('event_rsvps').select('event_id, status').in('event_id', eventIds),
      supabase.from('lineups').select('event_id').in('event_id', eventIds),
      supabase.from('players').select('id, team_id').in('team_id', teamIds),
      supabase.from('team_members').select('team_id, role').eq('profile_id', profile.id),
      // Club-wide coach assignments + guest-coach coverage — only useful for
      // an org_admin's coverage view, but cheap enough to always fetch
      // alongside everything else rather than a second render pass.
      profile.role === 'org_admin'
        ? supabase.from('team_members').select('team_id, profile_id, role, profiles(full_name)').in('team_id', teamIds).eq('role', 'coach')
        : Promise.resolve({ data: [] as any[] }),
      profile.role === 'org_admin'
        ? supabase.from('event_guests').select('event_id, status').in('event_id', eventIds).eq('role', 'coach').in('status', ['pending', 'confirmed'])
        : Promise.resolve({ data: [] as any[] }),
    ]);

    setTeamCoaches(((coachRes.data ?? []) as any[]).map((r) => ({
      team_id: r.team_id,
      profile_id: r.profile_id,
      coach_name: normalizeJoin<any>(r.profiles)?.full_name ?? 'Coach',
    })));
    setGuestCoachStatuses((guestCoachRes.data ?? []) as GuestCoachStatus[]);

    const teamMap = new Map<string, { name: string; club: FeedClub | null }>();
    for (const t of (teamsRes.data ?? []) as any[]) {
      const c = normalizeJoin<any>(t.clubs);
      teamMap.set(t.id, {
        name: t.name,
        club: c ? { id: c.id, name: c.name, slug: c.slug, primary_color: resolveClubColor(c.primary_color), logo_url: c.logo_url } : null,
      });
    }

    const rsvpCounts: Record<string, { attending: number; not_attending: number }> = {};
    for (const r of rsvpRes.data ?? []) {
      if (!rsvpCounts[r.event_id]) rsvpCounts[r.event_id] = { attending: 0, not_attending: 0 };
      if (r.status === 'attending') rsvpCounts[r.event_id].attending++;
      else if (r.status === 'not_attending') rsvpCounts[r.event_id].not_attending++;
    }

    const lineupSet = new Set((lineupRes.data ?? []).map((l) => l.event_id));

    const playerCountByTeam: Record<string, number> = {};
    for (const p of playersRes.data ?? []) {
      playerCountByTeam[p.team_id] = (playerCountByTeam[p.team_id] ?? 0) + 1;
    }

    // My own team_members rows, PLUS an org_admin's unconditional access to
    // every team in their home club (mirrors is_team_coach's RLS bypass —
    // org_admins mostly have no explicit team_members row at all).
    const myRoleByTeam: Record<string, 'coach' | 'org_admin' | null> = {};
    for (const m of (membershipRes.data ?? []) as { team_id: string; role: string }[]) {
      if (m.role === 'coach') myRoleByTeam[m.team_id] = 'coach';
    }
    if (profile.role === 'org_admin') {
      for (const teamId of teamIds) {
        if (myRoleByTeam[teamId] === 'coach') continue; // don't downgrade a team they actually coach
        const info = teamMap.get(teamId);
        if (info?.club?.id === profile.club_id) myRoleByTeam[teamId] = 'org_admin';
      }
    }

    const built: FeedEvent[] = evs.map((e) => {
      const info = teamMap.get(e.team_id);
      const rsvp = rsvpCounts[e.id] ?? { attending: 0, not_attending: 0 };
      const playerCount = playerCountByTeam[e.team_id] ?? 0;
      return {
        id: e.id,
        title: e.title,
        event_date: e.event_date,
        event_time: e.event_time,
        location: e.location,
        address: e.address,
        lat: e.lat,
        lng: e.lng,
        duration_minutes: e.duration_minutes,
        arrival_buffer_minutes: e.arrival_buffer_minutes,
        uniform: e.uniform,
        home_away: e.home_away as 'home' | 'away' | null,
        rsvp_lock_at: e.rsvp_lock_at,
        team_id: e.team_id,
        team_name: info?.name ?? 'Unknown team',
        club: info?.club ?? null,
        rsvp_attending: rsvp.attending,
        rsvp_not_attending: rsvp.not_attending,
        rsvp_tbd: Math.max(0, playerCount - rsvp.attending - rsvp.not_attending),
        has_lineup: lineupSet.has(e.id),
        my_role: myRoleByTeam[e.team_id] ?? null,
      };
    });

    setEvents(built);
    setLoading(false);
  }, [profile?.id, profile?.club_id, profile?.role, windowDays]);

  useEffect(() => { load(); }, [load]);

  return { events, teamCoaches, guestCoachStatuses, loading, reload: load };
}

export { localDateStr };
