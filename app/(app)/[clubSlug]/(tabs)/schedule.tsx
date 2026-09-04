import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import type { ErrorBoundaryProps } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  SectionList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { toLocalDateStr, todayLocalStr } from '../../../../lib/localDate';
import { withTimeout, TIMEOUT } from '../../../../lib/withTimeout';
import { computeArriveBy } from '../../../../lib/eventTime';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubBadge from '../../../../components/ui/ClubBadge';
import ClubHeader, { headerBtnStyle, headerBtnTextStyle } from '../../../../components/ui/ClubHeader';
import ScheduleSkeleton from '../../../../components/schedule/ScheduleSkeleton';
import { fetchEventWeather, isWeatherForecastable, type WeatherData } from '../../../../lib/weather';
import { fetchDriveTimes } from '../../../../lib/drivetime';
import { getGameResult, RESULT_COLORS, formatTournamentDateRange, formatGameCountdown } from '../../../../lib/tournaments';
import { getCalendarSyncUrls } from '../../../../lib/calendarSync';

type EventType = 'game' | 'training' | 'other';
type Tab = 'upcoming' | 'past' | 'calendar';

type Event = {
  id: string;
  title: string;
  type: EventType;
  team_id: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  duration_minutes: number | null;
  arrival_buffer_minutes: number | null;
  uniform: string | null;
  field_type: 'turf' | 'grass' | null;
  cancelled_at: string | null;
  home_away: string | null;
  score_home: number | null;
  score_away: number | null;
  rsvp_lock_at: string | null;
  video_url: string | null;
  tournament_id: string | null;
  round_label: string | null;
  isGuest?: boolean;
  guestStatus?: 'confirmed' | 'pending';
};

type Tournament = { id: string; name: string; location: string | null; start_date: string | null; end_date: string | null; cancelled_at: string | null };

type TournamentMarker = {
  tournament: Tournament;
  games: Event[];
  gameCount: number;
  dateRange: string;
  wins: number; losses: number; draws: number;
};

// A mixed chronological stream of real events and tournament markers, so a
// dated tournament slots into the schedule at its own start date rather than
// only ever living in a pinned header banner. `date`/`time` are normalized
// across both kinds purely for sorting/grouping — a tournament marker sorts
// to midnight on its start date, ahead of any real event later that day.
type ScheduleItem =
  | { kind: 'event'; date: string; time: string; endDate: string; data: Event }
  | { kind: 'tournament'; date: string; time: string; endDate: string; data: TournamentMarker };

const TEAM_PALETTE = ['#3B82F6', '#22c55e', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];

type RsvpCounts = { attending: number; not_attending: number };
type MyRsvp = 'attending' | 'not_attending' | null;

const TYPE_CONFIG: Record<EventType, { label: string; color: string; bg: string }> = {
  game:     { label: 'Game',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  training: { label: 'Training', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  other:    { label: 'Other',    color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
};

function getTodayStr() { return todayLocalStr(); }

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function computeEndTime(timeStr: string, durationMins: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + durationMins;
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  const period = endH >= 12 ? 'PM' : 'AM';
  const displayH = endH % 12 || 12;
  return `${displayH}:${String(endM).padStart(2, '0')} ${period}`;
}

// Conservative fallback so an event with no duration set doesn't flip to
// "Past" partway through — errs toward staying "Upcoming" a bit too long
// rather than too short, matching the same fallback already used for the
// reflection-prompt cron's own end-time estimate.
const DEFAULT_EVENT_DURATION_MINUTES = 120;

function eventEndsAt(ev: { event_date: string; event_time: string | null; duration_minutes: number | null }): Date {
  if (!ev.event_time) return new Date(ev.event_date + 'T23:59:59');
  const [h, m] = ev.event_time.split(':').map(Number);
  const durationMins = ev.duration_minutes ?? DEFAULT_EVENT_DURATION_MINUTES;
  const end = new Date(ev.event_date + 'T00:00:00');
  end.setMinutes(end.getMinutes() + h * 60 + m + durationMins);
  return end;
}

// "Upcoming" now means "hasn't ended yet" (start time + duration), not just
// "dated today or later" — a training that ran 6-7:30pm no longer lingers
// under Upcoming/TODAY for the rest of the evening once it's actually over.
function isUpcoming(ev: { event_date: string; event_time: string | null; duration_minutes: number | null }): boolean {
  return eventEndsAt(ev) >= new Date();
}

function isToday(dateStr: string): boolean {
  return dateStr === getTodayStr();
}

// Undated tournaments are this app's stand-in for a knockout/State-Cup
// format (dates unknown until each round is scheduled) — so "still active"
// isn't just "has an upcoming-dated game," it's "hasn't been eliminated
// yet." A dated (round-robin/weekend) tournament plays every game
// regardless of result, so it never needs this — pure date math already
// moves it from Upcoming to Past correctly on its own.
function isKnockoutStillAlive(games: { type: string; event_date: string; event_time: string | null; duration_minutes: number | null; score_home: number | null; score_away: number | null; cancelled_at: string | null }[]): boolean {
  if (games.length === 0) return true; // fresh entry, nothing decided yet
  if (games.some((g) => isUpcoming(g))) return true; // next round already scheduled
  const played = games.filter((g) => !g.cancelled_at);
  if (played.length === 0) return true;
  // games arrive date-ascending, so the last one is the most recently played.
  const result = getGameResult(played[played.length - 1]);
  if (!result) return true; // no score recorded yet — don't assume eliminated on missing data
  return result.label !== 'L';
}

function groupItemsByMonth(items: ScheduleItem[]): { title: string; data: ScheduleItem[] }[] {
  const groups = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const d = new Date(item.date + 'T00:00:00');
    const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = (firstDay + 6) % 7; // Mon-based: 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < offset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export default function ScheduleScreen() {
  const { primaryColor, rgba, secondaryColor, onSecondary, logoUrl, homeKitColor, awayKitColor, trainingKitColor, timezone } = useClub();
  const { team, allTeams, loading: teamLoading, selectTeam } = useTeam();
  const { profile } = useAuth();
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();

  const [events, setEvents] = useState<Event[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, RsvpCounts>>({});
  // event_id -> player_id -> status. A guardian can have more than one
  // player on the same team (e.g. twins) — every RSVP row below is keyed
  // per player rather than assuming a single "my player".
  const [myRsvpsByPlayer, setMyRsvpsByPlayer] = useState<Record<string, Record<string, MyRsvp>>>({});
  const [rsvpSavingId, setRsvpSavingId] = useState<string | null>(null);
  const [myPlayersByTeam, setMyPlayersByTeam] = useState<Map<string, { id: string; full_name: string }[]>>(new Map());
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // Once we've shown real content, later refetches (regaining focus after
  // popping back from an event, toggling filters) shouldn't blank the whole
  // screen back to the skeleton — that unmounts the scroll view, which both
  // flashes and loses scroll position. Only the very first load should.
  const hasLoadedOnceRef = useRef(false);
  useEffect(() => {
    if (!loading) hasLoadedOnceRef.current = true;
  }, [loading]);
  const [refreshing, setRefreshing] = useState(false);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>({});
  const [driveTimeMap, setDriveTimeMap] = useState<Record<string, string>>({});

  const [guestTeamNames, setGuestTeamNames] = useState<Record<string, string>>({});
  const [guestCountsMap, setGuestCountsMap] = useState<Record<string, number>>({});

  const [activeTab, setActiveTab]       = useState<Tab>('upcoming');
  const [showAllTeams, setShowAllTeams] = useState(false);

  const todayDate = new Date();
  const [calYear, setCalYear] = useState(todayDate.getFullYear());
  const [calMonth, setCalMonth] = useState(todayDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(getTodayStr);

  // team.myRole is scoped to the currently-active team's own club (see
  // TeamContext.tsx) — an org_admin at their home club who's just a
  // guest/parent elsewhere must not get coach-level UI there just because
  // profile.role is org_admin globally.
  const isCoach = team?.myRole === 'org_admin' || team?.myRole === 'coach';

  // Same stuck-badge bug as messages/announcements/events — this screen is
  // the real destination for a field_closure push, but nothing cleared
  // that notification row unless the user separately opened the
  // Notification Centre and tapped it there.
  const markFieldClosureNotificationsRead = useCallback(async () => {
    if (!profile) return;
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('profile_id', profile.id)
      .eq('read', false)
      .eq('type', 'field_closure');
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      if (teamLoading) return;
      if (!team) { setLoading(false); return; }
      load();
      markFieldClosureNotificationsRead();
    }, [team?.id, teamLoading, profile?.id, showAllTeams, markFieldClosureNotificationsRead])
  );

  useEffect(() => {
    if (!team?.id || teamLoading) return;
    load();
  }, [team?.id, teamLoading]);

  async function load() {
    if (!team) return;
    setLoading(true);

    // Everyone — coach or parent — defaults to just their active team;
    // the "All Teams" toggle below is how anyone with more than one team
    // opts into a merged view. Previously parents with >1 team (e.g. a
    // guardian whose kid plays for two clubs) were always force-merged
    // with no way to see just one team's schedule at a time.
    const teamIds = showAllTeams ? allTeams.map((t) => t.id) : [team.id];

    const [eventsRes, playersRes, countRes, tournamentsRes] = await Promise.all([
      supabase.from('events')
        .select('id, title, type, team_id, event_date, event_time, location, address, lat, lng, duration_minutes, arrival_buffer_minutes, uniform, field_type, cancelled_at, home_away, score_home, score_away, rsvp_lock_at, video_url, tournament_id, round_label')
        .in('team_id', teamIds).order('event_date').order('event_time'),
      // get_my_guarded_players() checks player_guardians as well as the
      // legacy players.profile_id column — a direct .eq('profile_id', ...)
      // query here missed a second (or later) guardian's own kid entirely,
      // silently hiding their RSVP controls for every one of that child's games.
      // Not deduped to one-per-team — a guardian can have more than one
      // player on the same team (e.g. twins), and each gets their own row.
      profile?.id
        ? (supabase as any).rpc('get_my_guarded_players').select('id, team_id, full_name').in('team_id', teamIds).order('full_name')
        : Promise.resolve({ data: [] }),
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('team_id', team.id),
      supabase.from('tournaments').select('id, name, location, start_date, end_date, cancelled_at').in('team_id', teamIds),
    ]);

    const evs = (eventsRes.data as unknown as Event[]) ?? [];
    setPlayerCount(countRes.count ?? 0);
    setTournaments((tournamentsRes.data as Tournament[]) ?? []);

    const pRows = ((playersRes as any).data ?? []) as { id: string; team_id: string; full_name: string }[];
    const playersByTeam = new Map<string, { id: string; full_name: string }[]>();
    for (const p of pRows) {
      const arr = playersByTeam.get(p.team_id) ?? [];
      arr.push({ id: p.id, full_name: p.full_name });
      playersByTeam.set(p.team_id, arr);
    }
    setMyPlayersByTeam(playersByTeam);

    // Set events immediately so they render even if guest/RSVP loading fails
    setEvents(evs);
    setLoading(false);

    const allPlayerIds = !isCoach ? pRows.map((p) => p.id) : [];
    const [, guestEvs] = await Promise.all([
      evs.length > 0 ? fetchRsvpData(evs, playersByTeam) : Promise.resolve(),
      (async () => {
        try {
          return allPlayerIds.length > 0 ? await loadGuestEvents(evs, allPlayerIds) : ([] as Event[]);
        } catch {
          return [] as Event[];
        }
      })(),
    ]);

    const mergedEvs = [...evs, ...(guestEvs ?? [])].sort((a, b) => {
      const d = a.event_date.localeCompare(b.event_date);
      return d !== 0 ? d : (a.event_time ?? '').localeCompare(b.event_time ?? '');
    });
    if (guestEvs && guestEvs.length > 0) setEvents(mergedEvs);

    fetchContextData(mergedEvs.filter(e => isUpcoming(e) && !e.cancelled_at));
  }

  async function fetchContextData(upcomingEvs: Event[]) {
    // Weather: only events within the 3-day WeatherAPI window
    const weatherEvs = upcomingEvs.filter(e => isWeatherForecastable(e.event_date));
    if (weatherEvs.length > 0) {
      const results = await Promise.all(
        weatherEvs.map(async e => {
          const loc = (e.lat != null && e.lng != null)
            ? `${e.lat},${e.lng}`
            : (e.address ?? e.location ?? '');
          if (!loc) return null;
          const w = await fetchEventWeather(loc, e.event_date, e.event_time ?? null);
          return w ? { id: e.id, w } : null;
        })
      );
      const wMap: Record<string, WeatherData> = {};
      for (const r of results) { if (r) wMap[r.id] = r.w; }
      setWeatherMap(wMap);
    }

    // Drive time: bulk call for upcoming events within 14 days that have a location
    const today = new Date();
    const cutoff = toLocalDateStr(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000));
    const driveEvs = upcomingEvs.filter(e =>
      e.event_date <= cutoff && (e.lat != null || e.address || e.location)
    );
    if (driveEvs.length > 0) {
      const items = driveEvs.map(e => ({
        id: e.id,
        location: (e.lat != null && e.lng != null)
          ? `${e.lat},${e.lng}`
          : (e.address ?? e.location ?? ''),
        eventDate: e.event_date,
        eventTime: e.event_time,
      }));
      const dtMap = await fetchDriveTimes(items, timezone);
      setDriveTimeMap(dtMap);
    }
  }

  async function loadGuestEvents(existingEvs: Event[], playerIds: string[]): Promise<Event[]> {
    const { data: guestEntries } = await supabase
      .from('event_guests')
      .select('event_id, status')
      .in('player_id', playerIds)
      .in('status', ['confirmed', 'pending']);

    const existingIds = new Set(existingEvs.map(e => e.id));
    const guestStatusMap = new Map<string, 'confirmed' | 'pending'>();
    for (const g of (guestEntries ?? []) as { event_id: string; status: string }[]) {
      if (!existingIds.has(g.event_id)) {
        // prefer 'confirmed' if the player has multiple entries somehow
        if (!guestStatusMap.has(g.event_id) || g.status === 'confirmed') {
          guestStatusMap.set(g.event_id, g.status as 'confirmed' | 'pending');
        }
      }
    }
    const guestEventIds = [...guestStatusMap.keys()];

    if (guestEventIds.length === 0) return [];

    const { data: guestEvData } = await supabase
      .from('events')
      .select('id, title, type, team_id, event_date, event_time, location, address, lat, lng, duration_minutes, arrival_buffer_minutes, uniform, field_type, cancelled_at, home_away, score_home, score_away, rsvp_lock_at, video_url, tournament_id, round_label')
      .in('id', guestEventIds);

    const guestEvs: Event[] = ((guestEvData ?? []) as unknown as Event[]).map(e => ({
      ...e,
      isGuest: true,
      guestStatus: guestStatusMap.get(e.id) ?? 'pending',
    }));

    const guestTeamIds = [...new Set(guestEvs.map(e => e.team_id))];
    const { data: teamData } = await supabase.from('teams').select('id, name').in('id', guestTeamIds);
    const teamNameMap: Record<string, string> = {};
    for (const t of (teamData ?? []) as { id: string; name: string }[]) {
      teamNameMap[t.id] = t.name;
    }
    const nameById: Record<string, string> = {};
    for (const e of guestEvs) {
      nameById[e.id] = teamNameMap[e.team_id] ?? 'Guest';
    }
    setGuestTeamNames(prev => ({ ...prev, ...nameById }));

    return guestEvs;
  }

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function fetchRsvpData(evs: Event[], playersByTeam: Map<string, { id: string; full_name: string }[]>) {
    const eventIds = evs.map((e) => e.id);
    const playerIds = [...playersByTeam.values()].flat().map((p) => p.id);

    const [countsRes, myRes, guestRes] = await Promise.all([
      supabase.from('event_rsvps').select('event_id, status').in('event_id', eventIds),
      playerIds.length > 0
        ? supabase.from('event_rsvps').select('event_id, player_id, status').in('event_id', eventIds).in('player_id', playerIds)
        : Promise.resolve({ data: [] }),
      supabase.from('event_guests').select('event_id').in('event_id', eventIds).eq('status', 'confirmed'),
    ]);

    const gCounts: Record<string, number> = {};
    for (const row of (guestRes.data ?? []) as { event_id: string }[]) {
      gCounts[row.event_id] = (gCounts[row.event_id] ?? 0) + 1;
    }
    setGuestCountsMap(gCounts);

    const counts: Record<string, RsvpCounts> = {};
    for (const row of (countsRes.data ?? []) as { event_id: string; status: string }[]) {
      if (!counts[row.event_id]) counts[row.event_id] = { attending: 0, not_attending: 0 };
      if (row.status === 'attending') counts[row.event_id].attending++;
      else if (row.status === 'not_attending') counts[row.event_id].not_attending++;
    }
    setRsvpCounts(counts);

    const mine: Record<string, Record<string, MyRsvp>> = {};
    for (const row of (myRes.data ?? []) as { event_id: string; player_id: string; status: string }[]) {
      (mine[row.event_id] ??= {})[row.player_id] = row.status as MyRsvp;
    }
    setMyRsvpsByPlayer(mine);
  }

  async function handleRsvp(eventId: string, playerId: string, status: 'attending' | 'not_attending') {
    const ev = events.find((e) => e.id === eventId);
    if (ev?.rsvp_lock_at && new Date(ev.rsvp_lock_at) <= new Date()) {
      Alert.alert('RSVP closed', 'The RSVP window for this event has closed. Contact your coach if you need to make a change.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = myRsvpsByPlayer[eventId]?.[playerId] ?? null;
    setRsvpSavingId(playerId);
    try {
      if (current === status) {
        const result = await withTimeout(
          supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('player_id', playerId),
          8000
        );
        if (result === TIMEOUT || result.error) {
          Alert.alert('Could not save your RSVP', 'Check your connection and try again.');
          return;
        }
      } else {
        const result = await withTimeout(
          supabase.from('event_rsvps').upsert(
            { event_id: eventId, player_id: playerId, responded_by: profile?.id, status },
            { onConflict: 'event_id,player_id' }
          ),
          8000
        );
        if (result === TIMEOUT || result.error) {
          Alert.alert('Could not save your RSVP', 'Check your connection and try again.');
          return;
        }
      }
      await fetchRsvpData(events, myPlayersByTeam);
    } catch (e) {
      console.error('handleRsvp error', e);
      Alert.alert('Could not save your RSVP', 'Check your connection and try again.');
    } finally {
      setRsvpSavingId(null);
    }
  }

  function openCreateEvent() {
    router.push(`/(app)/${clubSlug}/create-event` as any);
  }

  function prevCalMonth() {
    setSelectedDate(null);
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }

  function nextCalMonth() {
    setSelectedDate(null);
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  // Navigating straight from a card tap (rather than letting the
  // destination screen notice a team mismatch after mounting and correct
  // itself) — with "All Teams" on, a card can belong to a team in a
  // DIFFERENT club than the one currently active. Pushing with the
  // current (wrong) clubSlug first and fixing it up reactively on the
  // event screen raced against ClubSlugGuard, which was still watching
  // the about-to-be-replaced route and could revert the switch back
  // before the corrective navigation ever landed — the flip-flop this was
  // reported against. Resolving the correct club up front and navigating
  // directly to it means ClubSlugGuard never sees a mismatch in the first
  // place, because the right route is the very first one that mounts.
  function navigateToEvent(eventId: string, eventTeamId: string) {
    const eventTeam = allTeams.find((t) => t.id === eventTeamId);
    if (eventTeam?.club?.slug && eventTeam.club.slug !== clubSlug) {
      selectTeam(eventTeamId);
      router.push(`/(app)/${eventTeam.club.slug}/event/${eventId}` as any);
    } else {
      router.push(`/(app)/${clubSlug}/event/${eventId}` as any);
    }
  }

  // ── Shared event card renderer — thin wrapper narrowing each map down to
  // just this item's own slice before handing off to the memoized
  // component below, so a weather/drive-time update for one event doesn't
  // force every other visible card to re-render too. ──
  function renderCard(item: Event) {
    return (
      <EventCard
        key={item.id}
        item={item}
        isCoach={isCoach}
        isMultiView={isMultiView}
        clubSlug={clubSlug}
        myTeamId={team?.id}
        teamNameMap={teamNameMap}
        tournamentsById={tournamentsById}
        playerCount={playerCount}
        myPlayers={myPlayersByTeam.get(item.team_id) ?? []}
        myRsvpsForItem={myRsvpsByPlayer[item.id]}
        rsvpSavingId={rsvpSavingId}
        homeKitColor={homeKitColor}
        awayKitColor={awayKitColor}
        trainingKitColor={trainingKitColor}
        driveTime={driveTimeMap[item.id]}
        weather={weatherMap[item.id]}
        guestTeamName={guestTeamNames[item.id]}
        guestCount={guestCountsMap[item.id]}
        counts={rsvpCounts[item.id]}
        allTeams={allTeams}
        primaryColor={primaryColor}
        rgba={rgba}
        onRsvp={handleRsvp}
        onPress={() => navigateToEvent(item.id, item.team_id)}
      />
    );
  }


  const teamNameMap = useMemo(
    () => new Map(allTeams.map((t) => [t.id, t.name])),
    [allTeams]
  );
  const isMultiView = showAllTeams;

  const tournamentsById = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t])),
    [tournaments]
  );

  const gamesByTournamentId = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      if (!e.tournament_id) continue;
      const arr = map.get(e.tournament_id) ?? [];
      arr.push(e);
      map.set(e.tournament_id, arr);
    }
    return map;
  }, [events]);

  const buildTournamentMarker = useCallback((t: Tournament): TournamentMarker => {
    const games = gamesByTournamentId.get(t.id) ?? [];
    let wins = 0, losses = 0, draws = 0;
    for (const g of games) {
      const r = getGameResult(g);
      if (!r) continue;
      if (r.label === 'W') wins++; else if (r.label === 'L') losses++; else draws++;
    }
    return {
      tournament: t,
      games,
      gameCount: games.length,
      dateRange: games.length > 0
        ? formatTournamentDateRange(games.map((g) => g.event_date))
        : formatTournamentDateRange([t.start_date, t.end_date]),
      wins, losses, draws,
    };
  }, [gamesByTournamentId]);

  // Undated tournaments (State Cup — dates unknown until each round is
  // scheduled) have no natural chronological slot, so they stay pinned in
  // the Upcoming header instead. Pinned only while still alive in the
  // knockout — a team that keeps winning stays pinned indefinitely between
  // rounds, even though its last played game's date is technically in the
  // past; a loss (or the tournament running out of games) "graduates" it,
  // and its games fall back to showing individually in Past (still
  // trophy-tagged) rather than vanishing along with the card.
  const undatedTournaments = useMemo<TournamentMarker[]>(() =>
    tournaments
      .filter((t) => !t.start_date)
      .filter((t) => !t.cancelled_at)
      .filter((t) => isKnockoutStillAlive(gamesByTournamentId.get(t.id) ?? []))
      .map(buildTournamentMarker),
    [tournaments, gamesByTournamentId, buildTournamentMarker]
  );

  // Dated tournaments (weekend format — the date is known up front) DO get
  // a chronological slot: a special marker card sorted to start_date,
  // alongside every real event. Unlike undated ones, a dated tournament's
  // card never disappears — it just moves from Upcoming to Past by date,
  // same as any event — so its games stay nested inside it permanently.
  const datedTournamentItems = useMemo<Extract<ScheduleItem, { kind: 'tournament' }>[]>(() =>
    tournaments
      .filter((t) => !!t.start_date)
      .filter((t) => !t.cancelled_at)
      .map((t) => ({
        kind: 'tournament' as const,
        date: t.start_date!,
        time: '00:00',
        endDate: t.end_date ?? t.start_date!,
        data: buildTournamentMarker(t),
      })),
    [tournaments, buildTournamentMarker]
  );

  // A game "belongs" to a visible tournament card (dated, or undated-and-
  // still-active) gets nested inside that card instead of also appearing as
  // its own separate row — that's the whole point of the card: one place to
  // see the whole tournament instead of it and its games competing for the
  // same space.
  const tournamentIdsWithCard = useMemo(() => new Set([
    ...undatedTournaments.map((m) => m.tournament.id),
    ...datedTournamentItems.map((item) => item.data.tournament.id),
  ]), [undatedTournaments, datedTournamentItems]);

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const eventItems: ScheduleItem[] = events
      .filter((e) => !e.tournament_id || !tournamentIdsWithCard.has(e.tournament_id))
      .map((e) => ({
        kind: 'event', date: e.event_date, time: e.event_time ?? '00:00', endDate: e.event_date, data: e,
      }));
    return [...eventItems, ...datedTournamentItems].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.time.localeCompare(b.time);
    });
  }, [events, datedTournamentItems, tournamentIdsWithCard]);

  function isItemUpcoming(item: ScheduleItem): boolean {
    return item.kind === 'event'
      ? isUpcoming(item.data)
      : isUpcoming({ event_date: item.endDate, event_time: null, duration_minutes: null });
  }

  // ── Data splits ──
  const upcomingEvents = useMemo(
    () => events.filter((e) => isUpcoming(e)),
    [events]
  );
  // Real events only (no tournament markers) — feeds the Season Record
  // card below, which counts actual game results, not container cards.
  const pastEvents = useMemo(
    () => events.filter((e) => !isUpcoming(e)),
    [events]
  );
  const upcomingScheduleItems = useMemo(
    () => scheduleItems.filter(isItemUpcoming),
    [scheduleItems]
  );
  const pastScheduleItems = useMemo(
    () => scheduleItems.filter((item) => !isItemUpcoming(item)).reverse(),
    [scheduleItems]
  );
  const upcomingSections = useMemo(() => groupItemsByMonth(upcomingScheduleItems), [upcomingScheduleItems]);
  const pastSections     = useMemo(() => groupItemsByMonth(pastScheduleItems), [pastScheduleItems]);

  // Season W/L/D record
  let seasonWins = 0, seasonLosses = 0, seasonDraws = 0;
  for (const g of pastEvents) {
    if (g.cancelled_at) continue;
    const r = getGameResult(g);
    if (!r) continue;
    if (r.label === 'W') seasonWins++;
    else if (r.label === 'L') seasonLosses++;
    else seasonDraws++;
  }
  const hasSeasonRecord = seasonWins + seasonLosses + seasonDraws > 0;

  // Calendar data
  const eventsByDate = new Map<string, Event[]>();
  for (const e of events) {
    if (!eventsByDate.has(e.event_date)) eventsByDate.set(e.event_date, []);
    eventsByDate.get(e.event_date)!.push(e);
  }
  const calDays = buildCalendarDays(calYear, calMonth);
  const calRows: (number | null)[][] = [];
  for (let i = 0; i < calDays.length; i += 7) calRows.push(calDays.slice(i, i + 7));

  const calMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const calMonthEvents = events
    .filter((e) => e.event_date.startsWith(calMonthStr))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  const calDisplayEvents = selectedDate
    ? (eventsByDate.get(selectedDate) ?? [])
    : calMonthEvents;

  const calMonthLabel = new Date(calYear, calMonth, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ── Section list header renderer ──
  function renderSectionHeader(title: string, count: number) {
    return (
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>{title.toUpperCase()}</Text>
        <View style={styles.sectionCountBadge}>
          <Text style={styles.sectionCount}>{count}</Text>
        </View>
      </View>
    );
  }

  // Deliberately nothing like renderCard's striped, badge-row event layout —
  // a tournament is a container, not a single event, and should read that
  // way immediately: a big, unmistakable gold card, its games nested inside
  // rather than also competing for their own separate rows nearby.
  const TOURNAMENT_GAMES_CAP = 4;

  function renderTournamentCard({ tournament, games, gameCount, dateRange, wins, losses, draws }: TournamentMarker) {
    const hasRecord = gameCount > 0;
    // Soonest-upcoming first (what a parent actually wants to see next),
    // padded out with the most recent past games for context if there
    // aren't enough upcoming ones to fill the cap.
    const upcomingGames = games.filter((g) => isUpcoming(g));
    const recentPastGames = games.filter((g) => !isUpcoming(g)).slice().reverse();
    const visibleGames = [...upcomingGames, ...recentPastGames].slice(0, TOURNAMENT_GAMES_CAP);
    const overflowCount = gameCount - visibleGames.length;
    const openTournament = () => router.push(`/(app)/${clubSlug}/tournament/${tournament.id}` as any);

    return (
      <View key={tournament.id} style={styles.tournamentBigCard}>
        <TouchableOpacity style={styles.tournamentBigHeader} onPress={openTournament} activeOpacity={0.8}>
          <View style={styles.tournamentBigIcon}>
            <Text style={{ fontSize: 26 }}>🏆</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tournamentEyebrow}>TOURNAMENT</Text>
            <Text style={styles.tournamentBigName} numberOfLines={1}>{tournament.name}</Text>
            <Text style={styles.tournamentBigMeta} numberOfLines={1}>
              {dateRange}{tournament.location ? ` · ${tournament.location}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#EAB308" />
        </TouchableOpacity>

        {hasRecord && (
          <Text style={styles.tournamentBigRecord}>
            {wins}W · {losses}L · {draws}D · {gameCount} game{gameCount !== 1 ? 's' : ''}
          </Text>
        )}

        {visibleGames.length > 0 ? (
          <View style={styles.tournamentGamesList}>
            {visibleGames.map((g) => {
              const result = !isUpcoming(g) ? getGameResult(g) : null;
              return (
                <TouchableOpacity
                  key={g.id}
                  style={styles.tournamentGameRow}
                  onPress={() => navigateToEvent(g.id, g.team_id)}
                  activeOpacity={0.7}
                >
                  {g.round_label ? (
                    <View style={styles.tournamentGameStage}>
                      <Text style={styles.tournamentGameStageText} numberOfLines={1}>{g.round_label.toUpperCase()}</Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tournamentGameTitle} numberOfLines={1}>{g.title}</Text>
                    <Text style={styles.tournamentGameMeta} numberOfLines={1}>
                      {new Date(g.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {g.event_time ? ` · ${formatTime(g.event_time)}` : ''}
                    </Text>
                  </View>
                  {g.cancelled_at ? (
                    <Text style={[styles.tournamentGameBadge, { color: '#ef4444' }]}>Cancelled</Text>
                  ) : result ? (
                    <Text style={[styles.tournamentGameBadge, { color: RESULT_COLORS[result.label] }]}>
                      {result.label} {result.ourScore}–{result.oppScore}
                    </Text>
                  ) : isUpcoming(g) ? (
                    <Text style={[styles.tournamentGameBadge, { color: primaryColor }]}>
                      {formatGameCountdown(g.event_date)}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
            {overflowCount > 0 && (
              <TouchableOpacity style={styles.tournamentMoreRow} onPress={openTournament}>
                <Text style={[styles.tournamentMoreText, { color: primaryColor }]}>
                  +{overflowCount} more · View full tournament
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity onPress={openTournament}>
            <Text style={styles.tournamentNoGames}>No games yet — tap to add the first one.</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderScheduleItem(item: ScheduleItem) {
    return item.kind === 'event' ? renderCard(item.data) : renderTournamentCard(item.data);
  }

  function handleSyncCalendar() {
    if (!team) return;
    const { base, webcal, google } = getCalendarSyncUrls(team.id);
    Alert.alert(
      'Sync to Calendar',
      `Add ${team.name}'s schedule to your calendar. Updates automatically when events change.`,
      [
        { text: 'Apple Calendar', onPress: () => Linking.openURL(webcal) },
        { text: 'Google Calendar', onPress: () => Linking.openURL(google) },
        { text: 'Copy link', onPress: () => Share.share({ url: base, message: base }) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  if ((teamLoading || loading) && !hasLoadedOnceRef.current) return <ScheduleSkeleton />;

  if (!team) {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={48} color={PULSE_COLORS.ui.muted} />
        <Text style={{ color: PULSE_COLORS.ui.textSecondary, fontSize: 17, fontWeight: '700', marginTop: 16 }}>No teams yet</Text>
        <Text style={{ color: PULSE_COLORS.ui.muted, fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }}>
          {isCoach ? 'Import your club or create a team to get started.' : "Ask your coach for an invite to join a team."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      <ClubHeader
        title="Schedule"
        subtitle={upcomingEvents.length > 0
          ? `${upcomingEvents.length} upcoming event${upcomingEvents.length !== 1 ? 's' : ''}`
          : 'No upcoming events'}
        right={isCoach ? (
          <>
            <TouchableOpacity
              onPress={() => router.push(`/(app)/${clubSlug}/admin/schedule-upload` as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#7C3AED', shadowColor: '#A855F7', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 10, elevation: 6 }}
            >
              <Ionicons name="sparkles" size={13} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>AI</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[headerBtnStyle, { backgroundColor: secondaryColor }]} onPress={openCreateEvent}>
              <Ionicons name="add" size={16} color={onSecondary} />
              <Text style={[headerBtnTextStyle, { color: onSecondary }]}>Add</Text>
            </TouchableOpacity>
          </>
        ) : undefined}
      />

      {/* All-teams toggle — anyone (coach or parent) with more than one team */}
      {allTeams.length > 1 && (
        <View style={styles.allTeamsBar}>
          <TouchableOpacity
            style={[styles.allTeamsBtn, !showAllTeams && [styles.allTeamsBtnActive, { backgroundColor: primaryColor }]]}
            onPress={() => setShowAllTeams(false)}
          >
            <Text style={[styles.allTeamsBtnText, !showAllTeams && styles.allTeamsBtnTextActive]}>
              {team?.name ?? 'This Team'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.allTeamsBtn, showAllTeams && [styles.allTeamsBtnActive, { backgroundColor: primaryColor }]]}
            onPress={() => setShowAllTeams(true)}
          >
            <Ionicons name="layers-outline" size={12} color={showAllTeams ? '#000' : PULSE_COLORS.ui.muted} />
            <Text style={[styles.allTeamsBtnText, showAllTeams && styles.allTeamsBtnTextActive]}>All Teams</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'upcoming', label: 'Upcoming', icon: 'arrow-forward-circle-outline' },
          { key: 'past',     label: 'Past',     icon: 'time-outline' },
          { key: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
        ] as const).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && [styles.tabBtnActive, { borderBottomColor: primaryColor }]]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon as any}
              size={14}
              color={activeTab === tab.key ? primaryColor : PULSE_COLORS.ui.muted}
            />
            <Text style={[styles.tabBtnText, activeTab === tab.key && [styles.tabBtnTextActive, { color: primaryColor }]]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Upcoming tab ── */}
      {activeTab === 'upcoming' && (
        upcomingScheduleItems.length === 0 && undatedTournaments.length === 0 ? (
          <View style={styles.empty}>
            {logoUrl ? <Image source={{ uri: logoUrl }} style={{ position: 'absolute', width: 160, height: 160, opacity: 0.05 }} contentFit="contain" /> : null}
            <View style={[styles.emptyIconWrap, { backgroundColor: rgba(0.1) }]}>
              <Ionicons name="calendar-outline" size={26} color={PULSE_COLORS.ui.muted} />
            </View>
            <Text style={styles.emptyTitle}>No upcoming events</Text>
            <Text style={styles.emptySubtitle}>
              {isCoach ? 'Add your first game or training session.' : "Your coach hasn't scheduled anything yet."}
            </Text>
            {isCoach && (
              <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: primaryColor }]} onPress={openCreateEvent}>
                <Text style={styles.emptyBtnText}>Add First Event</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <SectionList
            sections={upcomingSections}
            keyExtractor={(item) => item.kind === 'event' ? item.data.id : `tournament-${item.data.tournament.id}`}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
            ListHeaderComponent={
              <>
                {undatedTournaments.map((marker) => renderTournamentCard(marker))}
                <TouchableOpacity
                  style={[styles.syncBanner, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.13)' }]}
                  onPress={handleSyncCalendar}
                  activeOpacity={0.75}
                >
                  <View style={[styles.syncIconWrap, { backgroundColor: primaryColor }]}>
                    <Ionicons name="calendar" size={20} color="#ffffff" />
                  </View>
                  <View style={styles.syncBannerText}>
                    <Text style={[styles.syncBannerTitle, { color: '#ffffff' }]}>Sync schedule to calendar</Text>
                    <View style={styles.syncPlatforms}>
                      <Ionicons name="logo-apple" size={11} color={PULSE_COLORS.ui.muted} />
                      <Text style={styles.syncPlatformText}>Apple</Text>
                      <Text style={styles.syncDot}>·</Text>
                      <Ionicons name="logo-google" size={11} color={PULSE_COLORS.ui.muted} />
                      <Text style={styles.syncPlatformText}>Google</Text>
                      <Text style={styles.syncDot}>· Copy link</Text>
                    </View>
                  </View>
                  <View style={[styles.syncChevron, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.6)" />
                  </View>
                </TouchableOpacity>
              </>
            }
            renderSectionHeader={({ section }) => renderSectionHeader(section.title, section.data.length)}
            renderItem={({ item }) => renderScheduleItem(item)}
          />
        )
      )}

      {/* ── Past tab ── */}
      {activeTab === 'past' && (
        pastScheduleItems.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: rgba(0.1) }]}>
              <Ionicons name="time-outline" size={26} color={PULSE_COLORS.ui.muted} />
            </View>
            <Text style={styles.emptyTitle}>No past events</Text>
            <Text style={styles.emptySubtitle}>Completed events will appear here.</Text>
          </View>
        ) : (
          <SectionList
            sections={pastSections}
            keyExtractor={(item) => item.kind === 'event' ? item.data.id : `tournament-${item.data.tournament.id}`}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
            ListHeaderComponent={hasSeasonRecord ? (
              <View style={styles.seasonRecord}>
                <Text style={styles.seasonRecordTitle}>SEASON RECORD</Text>
                <View style={styles.seasonRecordRow}>
                  <View style={styles.seasonStat}>
                    <Text style={[styles.seasonStatNum, { color: '#22c55e' }]}>{seasonWins}</Text>
                    <Text style={styles.seasonStatLabel}>W</Text>
                  </View>
                  <View style={styles.seasonStatSep} />
                  <View style={styles.seasonStat}>
                    <Text style={[styles.seasonStatNum, { color: '#ef4444' }]}>{seasonLosses}</Text>
                    <Text style={styles.seasonStatLabel}>L</Text>
                  </View>
                  <View style={styles.seasonStatSep} />
                  <View style={styles.seasonStat}>
                    <Text style={[styles.seasonStatNum, { color: PULSE_COLORS.ui.muted }]}>{seasonDraws}</Text>
                    <Text style={styles.seasonStatLabel}>D</Text>
                  </View>
                </View>
              </View>
            ) : null}
            renderSectionHeader={({ section }) => renderSectionHeader(section.title, section.data.length)}
            renderItem={({ item }) => renderScheduleItem(item)}
          />
        )
      )}

      {/* ── Calendar tab ── */}
      {activeTab === 'calendar' && (
        <ScrollView
          contentContainerStyle={styles.calScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
        >

          {/* Month navigator */}
          <View style={styles.calNav}>
            <TouchableOpacity style={styles.calNavBtn} onPress={prevCalMonth} disabled={loading} activeOpacity={loading ? 1 : 0.7}>
              <Ionicons name="chevron-back" size={20} color={PULSE_COLORS.ui.text} />
            </TouchableOpacity>
            <Text style={styles.calNavTitle}>{calMonthLabel}</Text>
            <TouchableOpacity style={styles.calNavBtn} onPress={nextCalMonth} disabled={loading} activeOpacity={loading ? 1 : 0.7}>
              <Ionicons name="chevron-forward" size={20} color={PULSE_COLORS.ui.text} />
            </TouchableOpacity>
          </View>

          {/* Day-of-week labels */}
          <View style={styles.calWeekLabels}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <Text key={d} style={styles.calWeekLabel}>{d}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.calGrid}>
            {calRows.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.calRow}>
                {row.map((day, colIdx) => {
                  if (!day) return <View key={`e-${rowIdx}-${colIdx}`} style={styles.calCell} />;
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const hasEvents = eventsByDate.has(dateStr);
                  const isSelected = selectedDate === dateStr;
                  const isTodayCell = isToday(dateStr);
                  const isPastDay = dateStr < getTodayStr();

                  return (
                    <TouchableOpacity
                      key={dateStr}
                      style={styles.calCell}
                      onPress={() => setSelectedDate(isSelected ? null : dateStr)}
                      activeOpacity={hasEvents ? 0.7 : 1}
                    >
                      <View style={[
                        styles.calDayCircle,
                        isSelected && [styles.calDayCircleSelected, { backgroundColor: primaryColor }],
                        isTodayCell && !isSelected && [styles.calDayCircleToday, { borderColor: primaryColor }],
                      ]}>
                        <Text style={[
                          styles.calDayText,
                          isPastDay && !isSelected && styles.calDayTextPast,
                          isTodayCell && !isSelected && [styles.calDayTextToday, { color: primaryColor }],
                          isSelected && styles.calDayTextSelected,
                        ]}>
                          {day}
                        </Text>
                      </View>
                      {hasEvents && (
                        <View style={[styles.calDot, { backgroundColor: primaryColor }, isSelected && styles.calDotSelected]} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Divider + selected day label */}
          <View style={styles.calDivider} />
          <View style={styles.calEventHeader}>
            <Text style={styles.calEventHeaderText}>
              {selectedDate
                ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                : calMonthLabel}
            </Text>
            {selectedDate && (
              <TouchableOpacity onPress={() => setSelectedDate(null)}>
                <Text style={[styles.calClearBtn, { color: primaryColor }]}>Show all</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Events for selected day / month */}
          {calDisplayEvents.length === 0 ? (
            <View style={styles.calEmpty}>
              <Ionicons name="calendar-outline" size={24} color={PULSE_COLORS.ui.border} />
              <Text style={styles.calEmptyText}>
                {selectedDate ? 'No events on this day' : 'No events this month'}
              </Text>
            </View>
          ) : (
            <View style={styles.calEventList}>
              {calDisplayEvents.map((item) => renderCard(item))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

type EventCardProps = {
  item: Event;
  isCoach: boolean;
  isMultiView: boolean;
  clubSlug: string;
  myTeamId: string | undefined;
  teamNameMap: Map<string, string>;
  tournamentsById: Map<string, Tournament>;
  playerCount: number;
  myPlayers: { id: string; full_name: string }[];
  myRsvpsForItem: Record<string, MyRsvp> | undefined;
  rsvpSavingId: string | null;
  homeKitColor: string;
  awayKitColor: string;
  trainingKitColor: string;
  driveTime: string | undefined;
  weather: WeatherData | undefined;
  guestTeamName: string | undefined;
  guestCount: number | undefined;
  counts: RsvpCounts | undefined;
  allTeams: { id: string; name: string }[];
  primaryColor: string;
  rgba: (alpha: number) => string;
  onRsvp: (eventId: string, playerId: string, status: 'attending' | 'not_attending') => void;
  onPress: () => void;
};

const EventCard = memo(function EventCardImpl({
  item, isCoach, isMultiView, clubSlug, myTeamId, teamNameMap, tournamentsById, playerCount,
  myPlayers, myRsvpsForItem, rsvpSavingId, homeKitColor, awayKitColor, trainingKitColor,
  driveTime, weather, guestTeamName, guestCount, counts, allTeams, primaryColor, rgba, onRsvp, onPress,
}: EventCardProps) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.other;
  // A guardian can have more than one player on this team (e.g. twins) —
  // every one of them gets their own status chip and RSVP row below.
  const isMultiPlayer = myPlayers.length > 1;
  const isPast = !isUpcoming(item);
  const today = isToday(item.event_date);
  const isCancelled = !!item.cancelled_at;
  const isGuest = !!item.isGuest;
  const d = new Date(item.event_date + 'T00:00:00');
  const pending = playerCount > 0 && counts != null
    ? Math.max(0, playerCount - counts.attending - counts.not_attending)
    : null;

  const showKitBadge = item.uniform === 'home' || item.uniform === 'away' || item.uniform === 'training';
  const result = isPast ? getGameResult(item) : null;
  const resultColor = result ? RESULT_COLORS[result.label] : null;

  return (
    <TouchableOpacity
      style={[styles.eventCard, (isPast || isCancelled) && styles.eventCardPast]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.typeStripe, {
        backgroundColor: isCancelled ? '#ef4444'
          : (isGuest && item.guestStatus === 'pending') ? '#F59E0B'
          : isGuest ? '#F97316'
          : cfg.color,
      }]} />

      <View style={[
        styles.dateCol,
        item.type === 'game' && item.uniform === 'home' && { backgroundColor: `${homeKitColor}18` },
        item.type === 'game' && item.uniform === 'away' && { backgroundColor: `${awayKitColor}18` },
      ]}>
        <Text style={[styles.dateWday, today && [styles.todayText, { color: primaryColor }]]}>
          {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
        </Text>
        <Text style={[styles.dateDay, today && [styles.todayText, { color: primaryColor }]]}>
          {d.toLocaleDateString('en-US', { day: 'numeric' })}
        </Text>
        <Text style={[styles.dateMon, today && [styles.todayText, { color: primaryColor }]]}>
          {today ? 'TODAY' : d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
        </Text>
        {item.type === 'game' && item.uniform === 'home' && (
          <View style={styles.homeAwayTag}>
            <View style={[styles.homeAwaySwatch, { backgroundColor: homeKitColor }]} />
            <Text style={styles.homeAwayTagText}>HOME</Text>
          </View>
        )}
        {item.type === 'game' && item.uniform === 'away' && (
          <View style={styles.homeAwayTag}>
            <View style={[styles.homeAwaySwatch, { backgroundColor: awayKitColor }]} />
            <Text style={styles.homeAwayTagText}>AWAY</Text>
          </View>
        )}
      </View>

      <View style={styles.eventBody}>

        {/* Badges + drive time all wrap together as one flowing group —
            keeping the drive time pill in a separate space-between
            column meant its reserved width applied to every wrapped
            line, so an overflow badge like "Grass" could end up alone
            on a line with a big stranded gap next to it. */}
        <View style={styles.badgeRow}>
            {isMultiView && item.team_id !== myTeamId && teamNameMap.has(item.team_id) && (
              <View style={[styles.typeBadge, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={[styles.typeText, { color: PULSE_COLORS.ui.textSecondary }]} numberOfLines={1}>
                  {teamNameMap.get(item.team_id)}
                </Text>
              </View>
            )}
            {isCancelled ? (
              <View style={styles.cancelledBadge}>
                <Ionicons name="close-circle" size={11} color="#ef4444" />
                <Text style={styles.cancelledBadgeText}>CANCELLED</Text>
              </View>
            ) : (
              <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.typeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            )}
            {item.tournament_id && tournamentsById.has(item.tournament_id) && (
              <View style={[styles.typeBadge, styles.tournamentBadge]}>
                <Ionicons name="trophy" size={10} color="#EAB308" />
                <Text style={[styles.typeText, { color: '#EAB308' }]} numberOfLines={1}>
                  {tournamentsById.get(item.tournament_id)!.name}
                </Text>
              </View>
            )}
            {isGuest && (
              item.guestStatus === 'pending' ? (
                <View style={[styles.typeBadge, { backgroundColor: 'rgba(245,158,11,0.14)', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <Ionicons name="time-outline" size={10} color="#F59E0B" />
                  <Text style={[styles.typeText, { color: '#F59E0B' }]}>Invite pending</Text>
                </View>
              ) : (
                <View style={[styles.typeBadge, { backgroundColor: 'rgba(249,115,22,0.12)' }]}>
                  <Text style={[styles.typeText, { color: '#F97316' }]}>Guest</Text>
                </View>
              )
            )}
            {item.video_url ? (
              <View style={styles.videoBadge}>
                <Ionicons name="play-circle" size={11} color="#A855F7" />
                <Text style={styles.videoBadgeText}>Video</Text>
              </View>
            ) : null}
            {showKitBadge && !isPast && (() => {
              const kitColor = item.uniform === 'home' ? homeKitColor
                : item.uniform === 'away' ? awayKitColor
                : trainingKitColor;
              const kitLabel = item.uniform === 'home' ? 'Home Kit'
                : item.uniform === 'away' ? 'Away Kit'
                : 'Training Kit';
              return (
                <View style={styles.kitBadge}>
                  <View style={[styles.kitSwatch, { backgroundColor: kitColor }]} />
                  <Text style={[styles.typeText, { color: PULSE_COLORS.ui.textSecondary }]}>{kitLabel}</Text>
                </View>
              );
            })()}
            {item.field_type && !isPast && (
              <View style={[styles.typeBadge, {
                backgroundColor: item.field_type === 'turf' ? 'rgba(59,130,246,0.10)' : rgba(0.07),
              }]}>
                <Text style={[styles.typeText, { color: item.field_type === 'turf' ? '#3B82F6' : '#6EE7B7' }]}>
                  {item.field_type === 'turf' ? 'Turf' : 'Grass'}
                </Text>
              </View>
            )}
            {/* Status chip — "Confirmed" for guests, single-player RSVP status
                for team members. Skipped when there's more than one guarded
                player on this team (e.g. twins) — one small chip can't
                represent two independent statuses, and the full per-child
                rows below already cover that case. */}
            {!isCoach && !isPast && (
              isGuest ? (
                item.guestStatus === 'pending' ? (
                  <View style={[styles.myStatusChip, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
                    <Ionicons name="ellipse-outline" size={11} color="#F59E0B" />
                    <Text style={[styles.myStatusChipText, { color: '#F59E0B' }]}>Respond</Text>
                  </View>
                ) : (
                  <View style={[styles.myStatusChip, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                    <Ionicons name="checkmark-circle" size={11} color={PULSE_COLORS.rsvp.attending} />
                    <Text style={[styles.myStatusChipText, { color: PULSE_COLORS.rsvp.attending }]}>Confirmed</Text>
                  </View>
                )
              ) : (() => {
                if (isMultiPlayer || myPlayers.length === 0) return null;
                const soloStatus = myRsvpsForItem?.[myPlayers[0].id] ?? null;
                if (!soloStatus) return null;
                return (
                  <View style={[
                    styles.myStatusChip,
                    { backgroundColor: soloStatus === 'attending' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }
                  ]}>
                    <Ionicons
                      name={soloStatus === 'attending' ? 'checkmark-circle' : 'close-circle'}
                      size={11}
                      color={soloStatus === 'attending' ? PULSE_COLORS.rsvp.attending : PULSE_COLORS.rsvp.not_attending}
                    />
                    <Text style={[
                      styles.myStatusChipText,
                      { color: soloStatus === 'attending' ? PULSE_COLORS.rsvp.attending : PULSE_COLORS.rsvp.not_attending }
                    ]}>
                      {soloStatus === 'attending' ? 'Going' : "Can't go"}
                    </Text>
                  </View>
                );
              })()
            )}
            {!isPast && !isCancelled && driveTime && (
              <View style={styles.driveTimePill}>
                <Ionicons name="car-outline" size={10} color={PULSE_COLORS.ui.textSecondary} />
                <Text style={styles.driveTimePillText}>{driveTime}</Text>
              </View>
            )}
        </View>

        <Text style={[styles.eventTitle, isPast && { color: PULSE_COLORS.ui.muted }]} numberOfLines={1}>{item.title}</Text>

        {/* Team indicator */}
        {!isCoach && (() => {
          if (isGuest && guestTeamName) {
            return (
              <View style={styles.teamDotRow}>
                <View style={[styles.teamDot, { backgroundColor: '#F97316' }]} />
                <Text style={[styles.teamDotLabel, { color: '#F97316' }]}>{guestTeamName}</Text>
              </View>
            );
          }
          if (allTeams.length <= 1) return null;
          const tIdx = allTeams.findIndex((t) => t.id === item.team_id);
          if (tIdx < 0) return null;
          const tColor = TEAM_PALETTE[tIdx % TEAM_PALETTE.length];
          return (
            <View style={styles.teamDotRow}>
              <View style={[styles.teamDot, { backgroundColor: tColor }]} />
              <Text style={[styles.teamDotLabel, { color: tColor }]}>{allTeams[tIdx].name}</Text>
            </View>
          );
        })()}

        {(item.event_time || item.location) && (
          <Text style={[styles.eventMeta, isPast && { color: PULSE_COLORS.ui.muted }]} numberOfLines={1}>
            {[
              item.event_time
                ? (item.duration_minutes
                    ? `${formatTime(item.event_time)} – ${computeEndTime(item.event_time, item.duration_minutes)}`
                    : formatTime(item.event_time))
                : null,
              (item.event_time && item.arrival_buffer_minutes != null)
                ? `Arrive ${computeArriveBy(item.event_time, item.arrival_buffer_minutes)}`
                : null,
              item.location,
            ].filter(Boolean).join('  ·  ')}
          </Text>
        )}

        {/* Weather */}
        {!isPast && !isCancelled && weather && (
          <View style={styles.contextBlock}>
            <View style={styles.contextWeatherRow}>
              <Text style={styles.contextWeatherEmoji}>{weather.icon}</Text>
              <Text style={styles.contextWeatherTemp}>{weather.temp_f}°F</Text>
              <Text style={styles.contextWeatherCond} numberOfLines={1}>{weather.condition}</Text>
              {weather.precip_chance >= 20 && (
                <View style={styles.contextRainPill}>
                  <Text style={styles.contextRainPillText}>💧 {weather.precip_chance}%</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Coach RSVP summary */}
        {isCoach && !isPast && !isCancelled && (() => {
          const confirmedGuests = guestCount ?? 0;
          const totalGoing = (counts?.attending ?? 0) + confirmedGuests;
          return (
            <View style={styles.rsvpSummaryRow}>
              <View style={styles.rsvpStat}>
                <Ionicons name="checkmark-circle" size={13} color={PULSE_COLORS.rsvp.attending} />
                <Text style={[styles.rsvpStatText, { color: PULSE_COLORS.rsvp.attending }]}>{totalGoing}</Text>
                {confirmedGuests > 0 && (
                  <View style={styles.guestCountPill}>
                    <Text style={styles.guestCountPillText}>+{confirmedGuests}G</Text>
                  </View>
                )}
              </View>
              <View style={styles.rsvpStat}>
                <Ionicons name="close-circle" size={13} color={PULSE_COLORS.rsvp.not_attending} />
                <Text style={[styles.rsvpStatText, { color: PULSE_COLORS.rsvp.not_attending }]}>
                  {counts?.not_attending ?? 0}
                </Text>
              </View>
              {pending != null && pending > 0 && (
                <View style={styles.rsvpStat}>
                  <Ionicons name="ellipse-outline" size={13} color={PULSE_COLORS.ui.muted} />
                  <Text style={[styles.rsvpStatText, { color: PULSE_COLORS.ui.muted }]}>{pending}</Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* Parent RSVP buttons — one row per guarded player on this team, so
            a family with more than one (e.g. twins) gets independent,
            always-visible controls for each rather than picking just one. */}
        {!isCoach && !isGuest && myPlayers.length > 0 && !isPast && !isCancelled && (
          <View style={{ gap: 6, marginTop: 6 }}>
            {myPlayers.map((p) => {
              const status = myRsvpsForItem?.[p.id] ?? null;
              const rsvpLoading = rsvpSavingId === p.id;
              return (
                <View key={p.id} style={isMultiPlayer ? styles.childRsvpRow : undefined}>
                  {isMultiPlayer && (
                    <Text style={styles.childRsvpName} numberOfLines={1}>{p.full_name.split(' ')[0]}</Text>
                  )}
                  <View style={[styles.rsvpRow, { marginTop: 0 }]}>
                    <TouchableOpacity
                      style={[styles.rsvpBtn, status === 'attending' && styles.rsvpBtnGoing]}
                      onPress={() => onRsvp(item.id, p.id, 'attending')}
                      disabled={rsvpLoading}
                    >
                      {rsvpLoading
                        ? <ActivityIndicator size="small" color={status === 'attending' ? '#000' : PULSE_COLORS.ui.muted} />
                        : <>
                            <Ionicons
                              name="checkmark-circle-outline"
                              size={13}
                              color={status === 'attending' ? '#000' : PULSE_COLORS.ui.muted}
                            />
                            <Text style={[styles.rsvpBtnText, status === 'attending' && { color: '#000' }]}>Going</Text>
                          </>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rsvpBtn, status === 'not_attending' && styles.rsvpBtnNotGoing]}
                      onPress={() => onRsvp(item.id, p.id, 'not_attending')}
                      disabled={rsvpLoading}
                    >
                      {rsvpLoading
                        ? <ActivityIndicator size="small" color={status === 'not_attending' ? '#fff' : PULSE_COLORS.ui.muted} />
                        : <>
                            <Ionicons
                              name="close-circle-outline"
                              size={13}
                              color={status === 'not_attending' ? '#fff' : PULSE_COLORS.ui.muted}
                            />
                            <Text style={[styles.rsvpBtnText, status === 'not_attending' && { color: '#fff' }]}>Can't go</Text>
                          </>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Right result column — past games with a score */}
      {isPast && item.type === 'game' && result && resultColor && (
        <View style={[styles.resultCol, { backgroundColor: `${resultColor}12`, borderLeftColor: `${resultColor}30` }]}>
          <Text style={[styles.resultColLabel, { color: resultColor }]}>{result.label}</Text>
          <Text style={[styles.resultColScore, { color: resultColor }]}>
            {result.ourScore}–{result.oppScore}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PULSE_COLORS.ui.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', color: PULSE_COLORS.ui.text },
  subtitle: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary },
  syncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  syncIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  syncBannerText: { flex: 1 },
  syncBannerTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  syncPlatforms: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  syncPlatformText: { fontSize: 11, color: PULSE_COLORS.ui.muted },
  syncDot: { fontSize: 11, color: PULSE_COLORS.ui.muted },
  syncChevron: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tournamentBigCard: {
    borderRadius: 20, padding: 18, marginBottom: 14,
    borderWidth: 1.5, backgroundColor: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.4)',
    shadowColor: '#EAB308', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 3,
  },
  tournamentBigHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tournamentBigIcon: {
    width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(234,179,8,0.16)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.35)',
  },
  tournamentEyebrow: { fontSize: 10, fontWeight: '800', color: '#EAB308', letterSpacing: 1.2, marginBottom: 2 },
  tournamentBigName: { fontSize: 19, fontWeight: '800', color: PULSE_COLORS.ui.text },
  tournamentBigMeta: { fontSize: 12.5, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },
  tournamentBigRecord: { fontSize: 12.5, fontWeight: '700', color: '#EAB308', marginTop: 12 },
  tournamentGamesList: { marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(234,179,8,0.2)', paddingTop: 10 },
  tournamentGameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  tournamentGameStage: {
    backgroundColor: 'rgba(234,179,8,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, maxWidth: 84,
  },
  tournamentGameStageText: { fontSize: 9, fontWeight: '800', color: '#EAB308', letterSpacing: 0.3 },
  tournamentGameTitle: { fontSize: 13.5, fontWeight: '700', color: PULSE_COLORS.ui.text },
  tournamentGameMeta: { fontSize: 11.5, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },
  tournamentGameBadge: { fontSize: 11.5, fontWeight: '800' },
  tournamentMoreRow: { paddingTop: 8, alignItems: 'center' },
  tournamentMoreText: { fontSize: 12.5, fontWeight: '700' },
  tournamentNoGames: { fontSize: 12.5, color: PULSE_COLORS.ui.muted, marginTop: 14, fontStyle: 'italic' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PULSE_COLORS.brand.green,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  addBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },

  // Tab bar
  allTeamsBar: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  allTeamsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: PULSE_COLORS.ui.surface,
  },
  allTeamsBtnActive: { /* backgroundColor set inline */ },
  allTeamsBtnText:       { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.muted },
  allTeamsBtnTextActive: { color: '#000' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.background,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: PULSE_COLORS.brand.green },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  tabBtnTextActive: { color: PULSE_COLORS.brand.green },

  // List
  list: { paddingVertical: 12, paddingHorizontal: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1.2 },
  sectionCountBadge: {
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  sectionCount: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted },

  // Empty states
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', marginBottom: 24, maxWidth: 260, lineHeight: 20 },
  emptyBtn: { backgroundColor: PULSE_COLORS.brand.green, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 20 },
  emptyBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },

  // Event card
  eventCard: {
    flexDirection: 'row', backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, marginBottom: 10, overflow: 'hidden',
  },
  eventCardPast: {},
  typeStripe: { width: 3 },
  dateCol: {
    width: 58, backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 1,
  },
  homeAwayTag: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  // Kit color swatches are always bordered so a black (or any very dark)
  // club kit still reads as a visible shape against the dark theme, instead
  // of relying on the kit color itself as text/icon color — which
  // disappears entirely when that color is black. See homeAwayTagText and
  // the kit badge below, which for the same reason use a fixed readable
  // color rather than the literal kit hex.
  homeAwaySwatch: { width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  homeAwayTagText: { fontSize: 8, fontWeight: '900', letterSpacing: 1, color: PULSE_COLORS.ui.textSecondary },
  dateWday: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.5 },
  dateDay: { fontSize: 22, fontWeight: '800', color: PULSE_COLORS.ui.text, lineHeight: 26 },
  dateMon: { fontSize: 10, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary, letterSpacing: 0.5 },
  todayText: { color: PULSE_COLORS.brand.green },
  eventBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 5 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  driveTimePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
    flexShrink: 0,
  },
  driveTimePillText: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tournamentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(234,179,8,0.12)', maxWidth: 160 },
  kitBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  kitSwatch: { width: 9, height: 9, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  typeText: { fontSize: 11, fontWeight: '700' },
  videoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(168,85,247,0.10)' },
  videoBadgeText: { fontSize: 11, fontWeight: '700', color: '#A855F7' },
  cancelledBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  cancelledBadgeText: { fontSize: 11, fontWeight: '800', color: '#ef4444', letterSpacing: 0.3 },
  resultCol: {
    width: 56, alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1, gap: 3,
  },
  resultColLabel: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  resultColScore: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  // Season record header on Past tab
  seasonRecord: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  seasonRecordTitle: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1.2 },
  seasonRecordRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  seasonStat: { alignItems: 'center', paddingHorizontal: 16 },
  seasonStatNum: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  seasonStatLabel: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.5 },
  seasonStatSep: { width: 1, height: 32, backgroundColor: PULSE_COLORS.ui.border },
  myStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
  },
  myStatusChipText: { fontSize: 11, fontWeight: '700' },
  eventTitle: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  eventMeta: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary },

  // Weather + drive time
  contextBlock: { gap: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border, marginTop: 2 },
  contextWeatherRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contextWeatherEmoji: { fontSize: 13 },
  contextWeatherTemp: { fontSize: 13, fontWeight: '800', color: PULSE_COLORS.ui.text },
  contextWeatherCond: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, flex: 1 },
  contextRainPill: {
    backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  contextRainPillText: { fontSize: 11, fontWeight: '700', color: '#60A5FA' },
  contextDriveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contextDriveText: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.text },
  contextDriveLabel: { fontSize: 12, color: PULSE_COLORS.ui.muted },
  rsvpSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  rsvpStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rsvpStatText: { fontSize: 13, fontWeight: '700' },
  guestCountPill: {
    backgroundColor: 'rgba(249,115,22,0.15)',
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1,
  },
  guestCountPillText: { fontSize: 9, fontWeight: '800', color: '#f97316' },
  rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  childRsvpRow: { gap: 4 },
  childRsvpName: { fontSize: 11.5, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
  rsvpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: 20,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  rsvpBtnGoing: { backgroundColor: PULSE_COLORS.rsvp.attending, borderColor: PULSE_COLORS.rsvp.attending },
  rsvpBtnNotGoing: { backgroundColor: PULSE_COLORS.rsvp.not_attending, borderColor: PULSE_COLORS.rsvp.not_attending },
  rsvpBtnText: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },

  // Calendar
  calScroll: { paddingHorizontal: 16 },
  calNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16,
  },
  calNavBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  calNavTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text },

  calWeekLabels: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
    marginBottom: 4,
  },
  calWeekLabel: {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '600', color: PULSE_COLORS.ui.muted,
  },

  calGrid: { gap: 2 },
  calRow: { flexDirection: 'row' },
  calCell: {
    flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3,
  },
  calDayCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  calDayCircleSelected: { backgroundColor: PULSE_COLORS.brand.green },
  calDayCircleToday: {
    borderWidth: 1.5, borderColor: PULSE_COLORS.brand.green,
  },
  calDayText: { fontSize: 14, fontWeight: '500', color: PULSE_COLORS.ui.text },
  calDayTextPast: { color: PULSE_COLORS.ui.muted },
  calDayTextToday: { color: PULSE_COLORS.brand.green, fontWeight: '700' },
  calDayTextSelected: { color: '#000', fontWeight: '700' },
  calDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: PULSE_COLORS.brand.green,
  },
  calDotSelected: { backgroundColor: '#000' },

  calDivider: { height: 1, backgroundColor: PULSE_COLORS.ui.border, marginVertical: 16 },
  calEventHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  calEventHeaderText: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  calClearBtn: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.brand.green },

  calEmpty: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  calEmptyText: { fontSize: 14, color: PULSE_COLORS.ui.muted },
  calEventList: { gap: 0 },

  teamDotRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -2 },
  teamDot: { width: 6, height: 6, borderRadius: 3 },
  teamDotLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PULSE_COLORS.ui.background, gap: 16 }}>
      <Ionicons name="calendar-outline" size={40} color={PULSE_COLORS.ui.muted} />
      <Text style={{ color: PULSE_COLORS.ui.text, fontSize: 16, fontWeight: '600' }}>Schedule couldn't load</Text>
      <TouchableOpacity onPress={retry} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: PULSE_COLORS.ui.surface }}>
        <Text style={{ color: PULSE_COLORS.ui.text, fontWeight: '700' }}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}
