import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export type GameDayEvent = {
  id: string;
  title: string;
  type: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  duration_minutes: number | null;
  team_id: string;
  team_name: string;
  team_color: string;
  rsvp_attending: number;
  rsvp_not_attending: number;
};

const TEAM_PALETTE = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

export function teamColor(teamId: string): string {
  let h = 0;
  for (const c of teamId) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return TEAM_PALETTE[h % TEAM_PALETTE.length];
}

function localDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useGameDay(date: string) {
  const { profile } = useAuth();
  const [events, setEvents] = useState<GameDayEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    load();
  }, [profile?.id, date]);

  async function load() {
    setLoading(true);
    const memberships = await supabase
      .from('team_members')
      .select('team_id, teams(id, name)')
      .eq('profile_id', profile!.id)
      .in('role', ['coach', 'org_admin']);

    const teams = (memberships.data ?? []).map((m: any) => ({
      id: m.team_id as string,
      name: (m.teams?.name ?? '') as string,
    }));

    if (!teams.length) { setLoading(false); return; }

    const teamIds = teams.map((t) => t.id);

    const { data: evs } = await supabase
      .from('events')
      .select('id, title, type, event_date, event_time, location, address, lat, lng, duration_minutes, team_id')
      .in('team_id', teamIds)
      .eq('event_date', date)
      .is('cancelled_at', null)
      .order('event_time');

    const eventIds = (evs ?? []).map((e: any) => e.id);
    let rsvpMap: Record<string, { attending: number; not_attending: number }> = {};

    if (eventIds.length) {
      const { data: rsvps } = await supabase
        .from('event_rsvps')
        .select('event_id, status')
        .in('event_id', eventIds);

      for (const r of rsvps ?? []) {
        const row = r as { event_id: string; status: string };
        if (!rsvpMap[row.event_id]) rsvpMap[row.event_id] = { attending: 0, not_attending: 0 };
        if (row.status === 'attending') rsvpMap[row.event_id].attending++;
        else if (row.status === 'not_attending') rsvpMap[row.event_id].not_attending++;
      }
    }

    const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));

    setEvents(
      (evs ?? []).map((e: any) => ({
        ...e,
        team_name: teamMap[e.team_id] ?? '',
        team_color: teamColor(e.team_id),
        rsvp_attending: rsvpMap[e.id]?.attending ?? 0,
        rsvp_not_attending: rsvpMap[e.id]?.not_attending ?? 0,
      })),
    );
    setLoading(false);
  }

  return { events, loading, reload: load };
}

export function useUpcomingGameDates(windowDays = 14): { dates: string[]; loading: boolean } {
  const { profile } = useAuth();
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    load();
  }, [profile?.id]);

  async function load() {
    const from = localDateStr(0);
    const to = localDateStr(windowDays);

    const memberships = await supabase
      .from('team_members')
      .select('team_id')
      .eq('profile_id', profile!.id)
      .in('role', ['coach', 'org_admin']);

    const teamIds = (memberships.data ?? []).map((m: any) => m.team_id as string);
    if (!teamIds.length) { setLoading(false); return; }

    const { data: evs } = await supabase
      .from('events')
      .select('event_date')
      .in('team_id', teamIds)
      .gte('event_date', from)
      .lte('event_date', to)
      .is('cancelled_at', null)
      .order('event_date');

    const unique = [...new Set((evs ?? []).map((e: any) => e.event_date as string))];
    setDates(unique);
    setLoading(false);
  }

  return { dates, loading };
}

export { localDateStr };
