import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubBadge from '../../../../components/ui/ClubBadge';
import ClubHeader, { headerBtnStyle, headerBtnTextStyle } from '../../../../components/ui/ClubHeader';
import { fetchEventWeather, isWeatherForecastable, type WeatherData } from '../../../../lib/weather';
import { fetchDriveTimes } from '../../../../lib/drivetime';

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
  isGuest?: boolean;
  guestStatus?: 'confirmed' | 'pending';
};

const TEAM_PALETTE = ['#3B82F6', '#22c55e', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];

type RsvpCounts = { attending: number; not_attending: number };
type MyRsvp = 'attending' | 'not_attending' | null;

const TYPE_CONFIG: Record<EventType, { label: string; color: string; bg: string }> = {
  game:     { label: 'Game',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  training: { label: 'Training', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  other:    { label: 'Other',    color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
};

function getTodayStr() { return new Date().toISOString().split('T')[0]; }

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

function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') >= today;
}

function isToday(dateStr: string): boolean {
  return dateStr === getTodayStr();
}

function groupByMonth(evs: Event[]): { title: string; data: Event[] }[] {
  const groups = new Map<string, Event[]>();
  for (const e of evs) {
    const d = new Date(e.event_date + 'T00:00:00');
    const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
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

const RESULT_COLORS = { W: '#22c55e', L: '#ef4444', D: '#9ca3af' } as const;

function getGameResult(event: Event): { label: 'W' | 'L' | 'D'; ourScore: number; oppScore: number } | null {
  if (event.type !== 'game' || event.score_home == null || event.score_away == null) return null;
  // Match tracker always writes score_home = our score, score_away = opponent score
  const ourScore = event.score_home;
  const oppScore = event.score_away;
  const label = ourScore > oppScore ? 'W' : ourScore < oppScore ? 'L' : 'D';
  return { label, ourScore, oppScore };
}

export default function ScheduleScreen() {
  const { primaryColor, rgba, secondaryColor, onSecondary, logoUrl, homeKitColor, awayKitColor, trainingKitColor } = useClub();
  const { team, allTeams, loading: teamLoading } = useTeam();
  const { profile } = useAuth();
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();

  const [events, setEvents] = useState<Event[]>([]);
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, RsvpCounts>>({});
  const [myRsvps, setMyRsvps] = useState<Record<string, MyRsvp>>({});
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [playerIdMap, setPlayerIdMap] = useState<Map<string, string>>(new Map()); // team_id -> player_id
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>({});
  const [driveTimeMap, setDriveTimeMap] = useState<Record<string, string>>({});

  const [guestTeamNames, setGuestTeamNames] = useState<Record<string, string>>({});
  const [guestCountsMap, setGuestCountsMap] = useState<Record<string, number>>({});

  const [activeTab, setActiveTab] = useState<Tab>('upcoming');

  const todayDate = new Date();
  const [calYear, setCalYear] = useState(todayDate.getFullYear());
  const [calMonth, setCalMonth] = useState(todayDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(getTodayStr);

  const isCoach = profile?.role === 'org_admin' || profile?.role === 'coach';

  useFocusEffect(
    useCallback(() => {
      if (teamLoading) return;
      if (!team) { setLoading(false); return; }
      load();
    }, [team?.id, teamLoading])
  );

  async function load() {
    if (!team) return;
    setLoading(true);

    // Multi-team: non-coaches with >1 team see merged schedule
    const isMultiTeam = !isCoach && allTeams.length > 1;
    const teamIds = isMultiTeam ? allTeams.map((t) => t.id) : [team.id];

    const [eventsRes, playersRes, countRes] = await Promise.all([
      supabase.from('events')
        .select('id, title, type, team_id, event_date, event_time, location, address, lat, lng, duration_minutes, arrival_buffer_minutes, uniform, field_type, cancelled_at, home_away, score_home, score_away, rsvp_lock_at, video_url')
        .in('team_id', teamIds).order('event_date').order('event_time'),
      profile?.id
        ? supabase.from('players').select('id, team_id').in('team_id', teamIds).eq('profile_id', profile.id)
        : Promise.resolve({ data: [] }),
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('team_id', team.id),
    ]);

    const evs = (eventsRes.data as unknown as Event[]) ?? [];
    setPlayerCount(countRes.count ?? 0);

    const pRows = (playersRes as any).data ?? [];
    const pidMap = new Map<string, string>(pRows.map((p: any) => [p.team_id, p.id]));
    const pid = pidMap.get(team.id) ?? null;
    setPlayerIdMap(pidMap);
    setMyPlayerId(pid);

    // Set events immediately so they render even if guest/RSVP loading fails
    setEvents(evs);
    setLoading(false);

    const allPlayerIds = !isCoach ? [...pidMap.values()] : [];
    const [, guestEvs] = await Promise.all([
      evs.length > 0 ? fetchRsvpData(evs, pidMap) : Promise.resolve(),
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

    fetchContextData(mergedEvs.filter(e => isUpcoming(e.event_date) && !e.cancelled_at));
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
    const cutoff = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const driveEvs = upcomingEvs.filter(e =>
      e.event_date <= cutoff && (e.lat != null || e.address || e.location)
    );
    if (driveEvs.length > 0) {
      const items = driveEvs.map(e => ({
        id: e.id,
        location: (e.lat != null && e.lng != null)
          ? `${e.lat},${e.lng}`
          : (e.address ?? e.location ?? ''),
      }));
      const dtMap = await fetchDriveTimes(items);
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
      .select('id, title, type, team_id, event_date, event_time, location, address, lat, lng, duration_minutes, arrival_buffer_minutes, uniform, field_type, cancelled_at, home_away, score_home, score_away, rsvp_lock_at, video_url')
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

  async function fetchRsvpData(evs: Event[], pidMap: Map<string, string>) {
    const eventIds = evs.map((e) => e.id);
    const playerIds = [...pidMap.values()];

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

    const evTeamMap = new Map(evs.map((e) => [e.id, e.team_id]));
    const mine: Record<string, MyRsvp> = {};
    for (const row of (myRes.data ?? []) as { event_id: string; player_id: string; status: string }[]) {
      const teamId = evTeamMap.get(row.event_id);
      if (teamId && pidMap.get(teamId) === row.player_id) {
        mine[row.event_id] = row.status as MyRsvp;
      }
    }
    setMyRsvps(mine);
  }

  async function handleRsvp(eventId: string, status: 'attending' | 'not_attending') {
    const ev = events.find((e) => e.id === eventId);
    const pid = ev ? (playerIdMap.get(ev.team_id) ?? myPlayerId) : myPlayerId;
    if (!pid) return;
    if (ev?.rsvp_lock_at && new Date(ev.rsvp_lock_at) <= new Date()) {
      Alert.alert('RSVP closed', 'The RSVP window for this event has closed. Contact your coach if you need to make a change.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = myRsvps[eventId];
    if (current === status) {
      await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('player_id', pid);
    } else {
      await supabase.from('event_rsvps').upsert(
        { event_id: eventId, player_id: pid, responded_by: profile?.id, status },
        { onConflict: 'event_id,player_id' }
      );
    }
    await fetchRsvpData(events, playerIdMap);
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

  // ── Shared event card renderer ──
  function renderCard(item: Event) {
    const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.other;
    const counts = rsvpCounts[item.id];
    const myStatus = myRsvps[item.id];
    const isPast = !isUpcoming(item.event_date);
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
        key={item.id}
        style={[styles.eventCard, (isPast || isCancelled) && styles.eventCardPast]}
        onPress={() => router.push(`/(app)/${clubSlug}/event/${item.id}` as any)}
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
              <Text style={[styles.homeAwayTagText, { color: homeKitColor }]}>HOME</Text>
            </View>
          )}
          {item.type === 'game' && item.uniform === 'away' && (
            <View style={styles.homeAwayTag}>
              <Text style={[styles.homeAwayTagText, { color: awayKitColor }]}>AWAY</Text>
            </View>
          )}
        </View>

        <View style={styles.eventBody}>

          {/* Top row: badges (left) + drive time pill (right) */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.badgeRow}>
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
                  <View style={[styles.kitBadge, { backgroundColor: `${kitColor}22` }]}>
                    <Ionicons name="shirt" size={11} color={kitColor} />
                    <Text style={[styles.typeText, { color: kitColor }]}>{kitLabel}</Text>
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
              {/* Status chip — "Confirmed" for guests, RSVP status for team members */}
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
                ) : (playerIdMap.get(item.team_id) ?? myPlayerId) && myStatus ? (
                  <View style={[
                    styles.myStatusChip,
                    { backgroundColor: myStatus === 'attending' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }
                  ]}>
                    <Ionicons
                      name={myStatus === 'attending' ? 'checkmark-circle' : 'close-circle'}
                      size={11}
                      color={myStatus === 'attending' ? PULSE_COLORS.rsvp.attending : PULSE_COLORS.rsvp.not_attending}
                    />
                    <Text style={[
                      styles.myStatusChipText,
                      { color: myStatus === 'attending' ? PULSE_COLORS.rsvp.attending : PULSE_COLORS.rsvp.not_attending }
                    ]}>
                      {myStatus === 'attending' ? 'Going' : "Can't go"}
                    </Text>
                  </View>
                ) : null
              )}
            </View>

            {/* Drive time pill — top right */}
            {!isPast && !isCancelled && driveTimeMap[item.id] && (
              <View style={styles.driveTimePill}>
                <Ionicons name="car-outline" size={10} color={PULSE_COLORS.ui.textSecondary} />
                <Text style={styles.driveTimePillText}>{driveTimeMap[item.id]}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.eventTitle, isPast && { color: PULSE_COLORS.ui.muted }]} numberOfLines={1}>{item.title}</Text>

          {/* Team indicator */}
          {!isCoach && (() => {
            if (isGuest && guestTeamNames[item.id]) {
              return (
                <View style={styles.teamDotRow}>
                  <View style={[styles.teamDot, { backgroundColor: '#F97316' }]} />
                  <Text style={[styles.teamDotLabel, { color: '#F97316' }]}>{guestTeamNames[item.id]}</Text>
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
                item.location,
              ].filter(Boolean).join('  ·  ')}
            </Text>
          )}

          {/* Weather */}
          {!isPast && !isCancelled && weatherMap[item.id] && (
            <View style={styles.contextBlock}>
              <View style={styles.contextWeatherRow}>
                <Text style={styles.contextWeatherEmoji}>{weatherMap[item.id].icon}</Text>
                <Text style={styles.contextWeatherTemp}>{weatherMap[item.id].temp_f}°F</Text>
                <Text style={styles.contextWeatherCond} numberOfLines={1}>{weatherMap[item.id].condition}</Text>
                {weatherMap[item.id].precip_chance >= 20 && (
                  <View style={styles.contextRainPill}>
                    <Text style={styles.contextRainPillText}>💧 {weatherMap[item.id].precip_chance}%</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Coach RSVP summary */}
          {isCoach && !isPast && !isCancelled && (() => {
            const confirmedGuests = guestCountsMap[item.id] ?? 0;
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

          {/* Parent RSVP buttons */}
          {!isCoach && !isGuest && (playerIdMap.get(item.team_id) ?? myPlayerId) && !isPast && !isCancelled && (
            <View style={styles.rsvpRow}>
              <TouchableOpacity
                style={[styles.rsvpBtn, myStatus === 'attending' && styles.rsvpBtnGoing]}
                onPress={() => handleRsvp(item.id, 'attending')}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={13}
                  color={myStatus === 'attending' ? '#000' : PULSE_COLORS.ui.muted}
                />
                <Text style={[styles.rsvpBtnText, myStatus === 'attending' && { color: '#000' }]}>Going</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rsvpBtn, myStatus === 'not_attending' && styles.rsvpBtnNotGoing]}
                onPress={() => handleRsvp(item.id, 'not_attending')}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={13}
                  color={myStatus === 'not_attending' ? '#fff' : PULSE_COLORS.ui.muted}
                />
                <Text style={[styles.rsvpBtnText, myStatus === 'not_attending' && { color: '#fff' }]}>Can't go</Text>
              </TouchableOpacity>
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
  }

  // ── Data splits ──
  const upcomingEvents = events.filter((e) => isUpcoming(e.event_date));
  const pastEvents = events.filter((e) => !isUpcoming(e.event_date)).reverse();
  const upcomingSections = groupByMonth(upcomingEvents);
  const pastSections = groupByMonth(pastEvents);

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

  function handleSyncCalendar() {
    if (!team) return;
    const base = `${process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app'}/api/calendar/${team.id}`;
    const webcal = base.replace('https://', 'webcal://');
    const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
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

  if (teamLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

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
        upcomingEvents.length === 0 ? (
          <View style={styles.empty}>
            {logoUrl ? <Image source={{ uri: logoUrl }} style={{ position: 'absolute', width: 160, height: 160, opacity: 0.05 }} resizeMode="contain" /> : null}
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
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
            ListHeaderComponent={
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
            }
            renderSectionHeader={({ section }) => renderSectionHeader(section.title, section.data.length)}
            renderItem={({ item }) => renderCard(item)}
          />
        )
      )}

      {/* ── Past tab ── */}
      {activeTab === 'past' && (
        pastEvents.length === 0 ? (
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
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
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
            renderItem={({ item }) => renderCard(item)}
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
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PULSE_COLORS.brand.green,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  addBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },

  // Tab bar
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
  homeAwayTag: { marginTop: 4 },
  homeAwayTagText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  dateWday: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.5 },
  dateDay: { fontSize: 22, fontWeight: '800', color: PULSE_COLORS.ui.text, lineHeight: 26 },
  dateMon: { fontSize: 10, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary, letterSpacing: 0.5 },
  todayText: { color: PULSE_COLORS.brand.green },
  eventBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 5 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, flex: 1 },
  driveTimePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
    flexShrink: 0,
  },
  driveTimePillText: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  kitBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
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
