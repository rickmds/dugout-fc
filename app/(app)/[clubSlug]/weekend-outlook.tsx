import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { useClub } from '../../../hooks/useClub';
import { PULSE_COLORS } from '../../../constants/colors';
import { fetchEventWeather, isWeatherForecastable, type WeatherData } from '../../../lib/weather';
import { fetchDriveTimes, fetchDriveTimeBetween } from '../../../lib/drivetime';
import * as Location from 'expo-location';
import { useMapApp } from '../../../hooks/useMapApp';
import { MapPickerModal } from '../../../components/ui/MapPickerModal';

// ─── Types ───────────────────────────────────────────────────────────────────

type TeamInfo = {
  id: string;
  name: string;
  clubName: string;
  primaryColor: string;
  slug: string;
};

type WeekendGame = {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  duration_minutes: number | null;
  arrival_buffer_minutes: number | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  uniform: string | null;
  home_away: 'home' | 'away' | null;
  rsvp_lock_at: string | null;
  team_id: string;
  team: TeamInfo;
  rsvp: { going: number; tbd: number; out: number };
  hasLineup: boolean;
  weather: WeatherData | null;
  driveTime: string | null;
  leaveBy: string | null;
  travelFromPrev: string | null;
  travelFromPrevBuffer: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekendDates(offset: number) {
  const now = new Date();
  const day = now.getDay();
  let daysToSat: number;
  if (day === 0) daysToSat = -1;
  else if (day === 6) daysToSat = 0;
  else daysToSat = 6 - day;

  const sat = new Date(now);
  sat.setDate(now.getDate() + daysToSat + offset * 7);
  sat.setHours(0, 0, 0, 0);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);

  const toStr = (d: Date) => d.toISOString().split('T')[0];
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  let label: string;
  if (offset === 0) label = 'This Weekend';
  else if (offset === 1) label = 'Next Weekend';
  else label = `${fmt(sat)} – ${fmt(sun)}`;

  return { sat, sun, satStr: toStr(sat), sunStr: toStr(sun), label };
}

function timeToMins(time: string | null): number {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function detectClashes(games: WeekendGame[]): Set<string> {
  const clashed = new Set<string>();
  for (let i = 0; i < games.length; i++) {
    for (let j = i + 1; j < games.length; j++) {
      const a = games[i], b = games[j];
      if (a.event_date !== b.event_date) continue;
      const aStart = timeToMins(a.event_time);
      const bStart = timeToMins(b.event_time);
      const aEnd = aStart + (a.duration_minutes ?? 90);
      const bEnd = bStart + (b.duration_minutes ?? 90);
      if (aStart < bEnd && aEnd > bStart) {
        clashed.add(a.id);
        clashed.add(b.id);
      }
    }
  }
  return clashed;
}

function parseDriveMinutes(text: string): number {
  let mins = 0;
  const h = text.match(/(\d+)\s*hour/);
  const m = text.match(/(\d+)\s*min/);
  if (h) mins += parseInt(h[1]) * 60;
  if (m) mins += parseInt(m[1]);
  return mins;
}

function calcLeaveBy(
  eventTime: string | null,
  driveText: string | null,
  arrivalBuffer: number | null,
): string | null {
  if (!eventTime || !driveText) return null;
  const total = timeToMins(eventTime) - parseDriveMinutes(driveText) - (arrivalBuffer ?? 15);
  if (total < 0) return null;
  const dt = new Date();
  dt.setHours(Math.floor(total / 60), total % 60, 0, 0);
  return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtTime(time: string | null): string {
  if (!time) return 'TBC';
  const [h, m] = time.split(':').map(Number);
  const dt = new Date();
  dt.setHours(h, m, 0, 0);
  return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function cleanDriveText(text: string): string {
  return text.replace(/\s+0\s+mins?\.?$/i, '').trim();
}


function fmtRsvpLock(rsvpLockAt: string | null): { label: string; color: string } | null {
  if (!rsvpLockAt) return null;
  const lockTime = new Date(rsvpLockAt);
  const now = new Date();
  if (lockTime < now) return { label: 'RSVP closed', color: PULSE_COLORS.ui.muted };
  const diffMs = lockTime.getTime() - now.getTime();
  const diffH = diffMs / (1000 * 60 * 60);
  const timeStr = lockTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const color = diffH < 2 ? '#F59E0B' : PULSE_COLORS.ui.muted;
  return { label: `RSVP closes ${timeStr}`, color };
}

function fmtDayHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} · ${date}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WeekendOutlook() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [games, setGames] = useState<WeekendGame[]>([]);
  const [loading, setLoading] = useState(true);

  const { session, profile } = useAuth();
  const { primaryColor, rgba } = useClub();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapApp = useMapApp();
  const isCoach = ['coach', 'org_admin', 'app_admin'].includes(profile?.role ?? '');
  const fetchGenRef = useRef(0);

  const { satStr, sunStr, label } = useMemo(
    () => getWeekendDates(weekOffset),
    [weekOffset],
  );

  // Request location permission once at mount so GPS is ready when fetchSecondaryData runs
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [weekOffset]);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  async function fetchData() {
    fetchGenRef.current += 1;
    const gen = fetchGenRef.current;
    setLoading(true);
    setGames([]);
    try {
      const uid = session?.user?.id;
      if (!uid) { setLoading(false); return; }

      // Query events directly — RLS handles access control, no pre-filter needed
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, type, event_date, event_time, duration_minutes, arrival_buffer_minutes, location, address, lat, lng, uniform, home_away, rsvp_lock_at, team_id')
        .eq('type', 'game')
        .in('event_date', [satStr, sunStr])
        .is('cancelled_at', null)
        .order('event_date')
        .order('event_time');

      if (!eventsData?.length) { setLoading(false); return; }

      const eventList = eventsData as any[];
      const teamIds = [...new Set(eventList.map((e) => e.team_id))] as string[];

      const [teamsRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name, clubs(id, name, primary_color, slug)')
          .in('id', teamIds),
      ]);

      const teamMap: Record<string, TeamInfo> = {};
      for (const t of ((teamsRes.data ?? []) as any[])) {
        const club = t.clubs;
        teamMap[t.id] = {
          id: t.id,
          name: t.name,
          clubName: club?.name ?? '',
          primaryColor: club?.primary_color ?? primaryColor,
          slug: club?.slug ?? '',
        };
      }

      const eventIds = eventList.map((e) => e.id);

      const [rsvpRes, playersRes, lineupsRes] = await Promise.all([
        supabase.from('event_rsvps').select('event_id, status').in('event_id', eventIds),
        supabase.from('players').select('id, team_id').in('team_id', teamIds),
        supabase.from('lineups').select('event_id').in('event_id', eventIds),
      ]);

      const rsvpMap: Record<string, { going: number; out: number }> = {};
      for (const r of ((rsvpRes.data ?? []) as any[])) {
        if (!rsvpMap[r.event_id]) rsvpMap[r.event_id] = { going: 0, out: 0 };
        if (r.status === 'attending') rsvpMap[r.event_id].going++;
        else if (r.status === 'not_attending') rsvpMap[r.event_id].out++;
      }

      const playerCountMap: Record<string, number> = {};
      for (const p of ((playersRes.data ?? []) as any[])) {
        playerCountMap[p.team_id] = (playerCountMap[p.team_id] ?? 0) + 1;
      }

      const lineupSet = new Set(((lineupsRes.data ?? []) as any[]).map((l) => l.event_id));

      const built: WeekendGame[] = eventList.map((e) => {
        const r = rsvpMap[e.id] ?? { going: 0, out: 0 };
        const pc = playerCountMap[e.team_id] ?? 0;
        return {
          ...e,
          home_away: e.home_away as 'home' | 'away' | null,
          team: teamMap[e.team_id] ?? {
            id: e.team_id, name: 'Unknown', clubName: '', primaryColor, slug: '',
          },
          rsvp: { going: r.going, out: r.out, tbd: Math.max(0, pc - r.going - r.out) },
          rsvp_lock_at: e.rsvp_lock_at ?? null,
          hasLineup: lineupSet.has(e.id),
          weather: null,
          driveTime: null,
          leaveBy: null,
          travelFromPrev: null,
          travelFromPrevBuffer: null,
        };
      });

      if (gen !== fetchGenRef.current) return;
      setGames(built);
      setLoading(false);
      fetchSecondaryData(built, gen);
    } catch {
      setLoading(false);
    }
  }

  async function fetchSecondaryData(built: WeekendGame[], gen: number) {
    const driveItems = built
      .filter((g) => g.address || g.location)
      .map((g) => ({ id: g.id, location: g.address ?? g.location ?? '' }));

    const weatherItems = built.filter(
      (g) => (g.address || g.location) && isWeatherForecastable(g.event_date),
    );

    // Build inter-game pairs: consecutive games on same day both with a location
    const gamesByDay: Record<string, WeekendGame[]> = {};
    for (const g of built) {
      if (!gamesByDay[g.event_date]) gamesByDay[g.event_date] = [];
      gamesByDay[g.event_date].push(g);
    }
    type InterPair = { nextId: string; origin: string; dest: string; prev: WeekendGame; next: WeekendGame };
    const interPairs: InterPair[] = [];
    for (const day of Object.values(gamesByDay)) {
      const sorted = [...day].sort((a, b) => timeToMins(a.event_time) - timeToMins(b.event_time));
      for (let i = 0; i < sorted.length - 1; i++) {
        const origin = sorted[i].address ?? sorted[i].location;
        const dest   = sorted[i + 1].address ?? sorted[i + 1].location;
        if (origin && dest) {
          interPairs.push({ nextId: sorted[i + 1].id, origin, dest, prev: sorted[i], next: sorted[i + 1] });
        }
      }
    }

    const [driveMap, weatherResults, interResults] = await Promise.all([
      fetchDriveTimes(driveItems),
      Promise.all(
        weatherItems.map(async (g) => {
          const w = await fetchEventWeather(g.address ?? g.location ?? '', g.event_date, g.event_time);
          return { id: g.id, w };
        }),
      ),
      Promise.all(
        interPairs.map(async (p) => {
          const t = await fetchDriveTimeBetween(p.origin, p.dest);
          return { nextId: p.nextId, driveTime: t, prev: p.prev, next: p.next };
        }),
      ),
    ]);

    // Inter-game map: nextGameId -> { driveTime, buffer in minutes }
    const interMap: Record<string, { driveTime: string; buffer: number }> = {};
    for (const { nextId, driveTime, prev, next } of interResults) {
      if (!driveTime) continue;
      const prevEnd   = timeToMins(prev.event_time) + (prev.duration_minutes ?? 90);
      const nextStart = timeToMins(next.event_time);
      const buffer    = nextStart - prevEnd - parseDriveMinutes(driveTime);
      interMap[nextId] = { driveTime, buffer };
    }

    if (gen !== fetchGenRef.current) return;
    const weatherMap: Record<string, WeatherData> = {};
    for (const { id, w } of weatherResults) { if (w) weatherMap[id] = w; }

    setGames((prev) =>
      prev.map((g) => {
        const driveRaw = driveMap[g.id] ?? null;
        const drive = driveRaw ? cleanDriveText(driveRaw) : null;
        const inter = interMap[g.id];
        const interDriveRaw = inter?.driveTime ?? null;
        return {
          ...g,
          driveTime: drive,
          leaveBy: calcLeaveBy(g.event_time, drive, g.arrival_buffer_minutes),
          weather: weatherMap[g.id] ?? null,
          travelFromPrev: interDriveRaw ? cleanDriveText(interDriveRaw) : null,
          travelFromPrevBuffer: inter?.buffer ?? null,
        };
      }),
    );
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const clashedIds = useMemo(() => detectClashes(games), [games]);
  const noLineupCount = games.filter((g) => !g.hasLineup).length;
  const totalTBD = games.reduce((sum, g) => sum + g.rsvp.tbd, 0);
  const clashCount = Math.floor(clashedIds.size / 2);

  const satGames = games.filter((g) => g.event_date === satStr);
  const sunGames = games.filter((g) => g.event_date === sunStr);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekend Outlook</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Week navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => setWeekOffset((o) => o - 1)}
          style={styles.weekNavBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={18} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{label}</Text>
        <TouchableOpacity
          onPress={() => setWeekOffset((o) => o + 1)}
          style={styles.weekNavBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-forward" size={18} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={primaryColor} size="large" />
            <Text style={styles.loadingText}>Loading weekend games…</Text>
          </View>
        ) : games.length === 0 ? (
          <EmptyState label={label} satStr={satStr} sunStr={sunStr} />
        ) : (
          <>
            {(clashCount > 0 || noLineupCount > 0 || totalTBD > 0) && (
              <NeedsAttentionBanner
                clashes={clashCount}
                noLineup={noLineupCount}
                tbd={totalTBD}
              />
            )}

            {satGames.length > 0 && (
              <DaySection
                dateStr={satStr}
                games={satGames}
                clashedIds={clashedIds}
                primaryColor={primaryColor}
                router={router}
                isCoach={isCoach}
                onOpenMaps={(g) => mapApp.open({ query: g.address ?? g.location ?? '', lat: g.lat, lng: g.lng })}
              />
            )}

            {sunGames.length > 0 && (
              <DaySection
                dateStr={sunStr}
                games={sunGames}
                clashedIds={clashedIds}
                primaryColor={primaryColor}
                router={router}
                isCoach={isCoach}
                onOpenMaps={(g) => mapApp.open({ query: g.address ?? g.location ?? '', lat: g.lat, lng: g.lng })}
              />
            )}
          </>
        )}
      </ScrollView>

      <MapPickerModal
        visible={mapApp.showPicker}
        onConfirm={mapApp.confirm}
        onDismiss={mapApp.dismiss}
      />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NeedsAttentionBanner({
  clashes, noLineup, tbd,
}: { clashes: number; noLineup: number; tbd: number }) {
  const items = [];
  if (clashes > 0) items.push({ icon: 'warning-outline', color: '#F59E0B', text: `${clashes} clash${clashes > 1 ? 'es' : ''}` });
  if (noLineup > 0) items.push({ icon: 'grid-outline', color: '#EF4444', text: `${noLineup} no lineup` });
  if (tbd > 0) items.push({ icon: 'help-circle-outline', color: PULSE_COLORS.ui.muted, text: `${tbd} TBD` });

  return (
    <View style={styles.attentionBanner}>
      <Text style={styles.attentionLabel}>NEEDS ATTENTION</Text>
      <View style={styles.attentionRow}>
        {items.map((item, i) => (
          <View key={i} style={styles.attentionChip}>
            <Ionicons name={item.icon as any} size={13} color={item.color} />
            <Text style={[styles.attentionChipText, { color: item.color }]}>{item.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DaySection({
  dateStr, games, clashedIds, primaryColor, router, isCoach, onOpenMaps,
}: {
  dateStr: string;
  games: WeekendGame[];
  clashedIds: Set<string>;
  primaryColor: string;
  router: ReturnType<typeof useRouter>;
  isCoach: boolean;
  onOpenMaps: (game: WeekendGame) => void;
}) {
  const dayClash = games.some((g) => clashedIds.has(g.id));

  return (
    <View style={styles.daySection}>
      <View style={styles.dayHeaderRow}>
        <Text style={styles.dayHeader}>{fmtDayHeader(dateStr)}</Text>
        {dayClash && (
          <View style={styles.clashBadge}>
            <Ionicons name="warning-outline" size={11} color="#F59E0B" />
            <Text style={styles.clashBadgeText}>CLASH</Text>
          </View>
        )}
      </View>

      {games.map((game, index) => (
        <View key={game.id}>
          {index === 0 && game.driveTime != null && (
            <FirstGameDriveStrip driveTime={game.driveTime} leaveBy={game.leaveBy} />
          )}
          {index > 0 && game.travelFromPrev != null && (
            <TravelStrip
              driveTime={game.travelFromPrev}
              buffer={game.travelFromPrevBuffer}
            />
          )}
          <GameCard
            game={game}
            clashes={clashedIds.has(game.id)}
            primaryColor={primaryColor}
            router={router}
            isCoach={isCoach}
            onOpenMaps={onOpenMaps}
          />
        </View>
      ))}
    </View>
  );
}

function FirstGameDriveStrip({ driveTime, leaveBy }: { driveTime: string; leaveBy: string | null }) {
  const color = '#6366F1';
  return (
    <View style={styles.travelStrip}>
      <View style={[styles.travelStripLine, { backgroundColor: color }]} />
      <View style={[styles.travelStripPill, { borderColor: color }]}>
        <Ionicons name="navigate-outline" size={12} color={color} />
        <Text style={[styles.travelStripDrive, { color }]}>{driveTime} from here</Text>
        {leaveBy && (
          <>
            <Text style={[styles.travelStripDot, { color }]}>·</Text>
            <Text style={[styles.travelStripStatus, { color }]}>Leave by {leaveBy}</Text>
          </>
        )}
      </View>
      <View style={[styles.travelStripLine, { backgroundColor: color }]} />
    </View>
  );
}

function TravelStrip({ driveTime, buffer }: { driveTime: string; buffer: number | null }) {
  const color = buffer == null ? '#6366F1'
    : buffer > 15 ? '#22C55E'
    : buffer >= 0 ? '#F59E0B'
    : '#EF4444';

  const statusText = buffer == null ? null
    : buffer > 15 ? `${buffer} min to spare`
    : buffer >= 0 ? `Only ${buffer} min buffer`
    : 'Not enough time';

  return (
    <View style={styles.travelStrip}>
      <View style={[styles.travelStripLine, { backgroundColor: color }]} />
      <View style={[styles.travelStripPill, { borderColor: color }]}>
        <Ionicons name="car-outline" size={12} color={color} />
        <Text style={[styles.travelStripDrive, { color }]}>{driveTime} to next venue</Text>
        {statusText && (
          <>
            <Text style={[styles.travelStripDot, { color }]}>·</Text>
            <Text style={[styles.travelStripStatus, { color }]}>{statusText}</Text>
          </>
        )}
      </View>
      <View style={[styles.travelStripLine, { backgroundColor: color }]} />
    </View>
  );
}

function GameCard({
  game, clashes, primaryColor, router, isCoach, onOpenMaps,
}: {
  game: WeekendGame;
  clashes: boolean;
  primaryColor: string;
  router: ReturnType<typeof useRouter>;
  isCoach: boolean;
  onOpenMaps: (game: WeekendGame) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  }
  function onPressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  }

  const homeAwayLabel = game.home_away === 'away' ? 'AWAY' : 'HOME';
  const homeAwayColor = game.home_away === 'away' ? PULSE_COLORS.ui.muted : primaryColor;

  const kitLabel =
    game.uniform === 'home' ? 'Home Kit'
    : game.uniform === 'away' ? 'Away Kit'
    : game.uniform === 'training' ? 'Training Kit'
    : null;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => router.push(`/(app)/${game.team.slug}/event/${game.id}` as never)}
        style={[styles.card, clashes && styles.cardClash]}
      >
        <View style={[styles.cardBar, { backgroundColor: game.team.primaryColor }]} />

        <View style={styles.cardBody}>
          {/* Top row: home/away · team · club · kit */}
          <View style={styles.cardTopRow}>
            <Text style={[styles.homeAwayLabel, { color: homeAwayColor }]}>{homeAwayLabel}</Text>
            <Text style={styles.teamLabel} numberOfLines={1}>
              {game.team.name}{game.team.clubName ? ` · ${game.team.clubName}` : ''}
            </Text>
            {kitLabel && (
              <View style={styles.kitChip}>
                <Ionicons name="shirt-outline" size={10} color={PULSE_COLORS.ui.muted} />
                <Text style={styles.kitChipText}>{kitLabel}</Text>
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={styles.cardTitle}>{game.title}</Text>

          {/* Time + weather */}
          <View style={styles.cardMetaRow}>
            <Ionicons name="time-outline" size={13} color={PULSE_COLORS.ui.muted} />
            <Text style={styles.cardMeta}>{fmtTime(game.event_time)}</Text>
            {game.weather && (
              <>
                <Text style={styles.cardMetaDot}>·</Text>
                <Text style={styles.cardMeta}>
                  {game.weather.icon} {Math.round(game.weather.temp_f)}°F
                </Text>
                {game.weather.precip_chance >= 20 && (
                  <Text style={[styles.cardMeta, { color: '#60A5FA' }]}>
                    {' '}{game.weather.precip_chance}% rain
                  </Text>
                )}
              </>
            )}
          </View>

          {/* Location — taps to open Maps */}
          {(game.location || game.address) && (
            <TouchableOpacity
              onPress={() => onOpenMaps(game)}
              style={styles.cardMetaRow}
              hitSlop={8}
            >
              <Ionicons name="location-outline" size={13} color={PULSE_COLORS.ui.muted} />
              <Text style={[styles.cardMeta, styles.cardMetaLink]} numberOfLines={1}>
                {game.location || game.address}
              </Text>
              <Ionicons name="open-outline" size={11} color={PULSE_COLORS.ui.border} />
            </TouchableOpacity>
          )}

          {/* RSVP lock */}
          {(() => {
            const lock = fmtRsvpLock(game.rsvp_lock_at);
            if (!lock) return null;
            return (
              <View style={styles.cardMetaRow}>
                <Ionicons name="lock-closed-outline" size={13} color={lock.color} />
                <Text style={[styles.cardMeta, { color: lock.color }]}>{lock.label}</Text>
              </View>
            );
          })()}

          <View style={styles.cardDivider} />

          {/* RSVP + actions */}
          <View style={styles.cardBottomRow}>
            <View style={styles.rsvpRow}>
              <RsvpBubble count={game.rsvp.going} color="#22C55E" label="Going" />
              <RsvpBubble count={game.rsvp.tbd} color="#F59E0B" label="TBD" />
              <RsvpBubble count={game.rsvp.out} color="#EF4444" label="Out" />
            </View>

            <View style={styles.cardActions}>
              {game.team.slug && (
                <TouchableOpacity
                  onPress={() =>
                    router.push(`/(app)/${game.team.slug}/(tabs)/chat` as never)
                  }
                  style={styles.messageBtn}
                  hitSlop={8}
                >
                  <Ionicons name="chatbubble-outline" size={14} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              )}

              {isCoach && game.team.slug && (
                <TouchableOpacity
                  onPress={() =>
                    router.push(`/(app)/${game.team.slug}/admin/events/${game.id}/lineup` as never)
                  }
                  style={[
                    styles.lineupChip,
                    game.hasLineup
                      ? { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }
                      : { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' },
                  ]}
                  hitSlop={8}
                >
                  <Ionicons
                    name={game.hasLineup ? 'checkmark-circle' : 'grid-outline'}
                    size={12}
                    color={game.hasLineup ? '#22C55E' : '#EF4444'}
                  />
                  <Text style={[styles.lineupChipText, { color: game.hasLineup ? '#22C55E' : '#EF4444' }]}>
                    {game.hasLineup ? 'Lineup set' : 'No lineup'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function RsvpBubble({ count, color, label }: { count: number; color: string; label: string }) {
  return (
    <View style={styles.rsvpBubbleWrap}>
      <View style={[styles.rsvpBubble, { backgroundColor: color }]}>
        <Text style={styles.rsvpBubbleNum}>{count}</Text>
      </View>
      <Text style={styles.rsvpBubbleLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ label, satStr, sunStr }: { label: string; satStr: string; sunStr: string }) {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="calendar-outline" size={48} color={PULSE_COLORS.ui.muted} />
      <Text style={styles.emptyTitle}>No games {label.toLowerCase()}</Text>
      <Text style={styles.emptyBody}>
        Checked {satStr} and {sunStr} for game-type events across all your teams.
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, gap: 16,
  },
  weekNavBtn: { padding: 4 },
  weekLabel: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  loadingWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText: { color: PULSE_COLORS.ui.muted, fontSize: 14 },

  // Needs attention
  attentionBanner: {
    backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    padding: 12, marginBottom: 20,
  },
  attentionLabel: {
    fontSize: 10, fontWeight: '700', color: '#F59E0B', letterSpacing: 1.2, marginBottom: 8,
  },
  attentionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  attentionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  attentionChipText: { fontSize: 12, fontWeight: '600' },

  // Day section
  daySection: { marginBottom: 24 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dayHeader: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1.3 },
  clashBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 20,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  clashBadgeText: { fontSize: 9, fontWeight: '800', color: '#F59E0B', letterSpacing: 0.5 },

  // Travel strip (between games and above first game)
  travelStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, marginTop: -4,
  },
  travelStripLine: { flex: 1, height: 1, opacity: 0.4 },
  travelStripPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 9, paddingVertical: 4,
    backgroundColor: PULSE_COLORS.ui.surface,
  },
  travelStripDrive: { fontSize: 11, fontWeight: '600' },
  travelStripDot: { fontSize: 11 },
  travelStripStatus: { fontSize: 11, fontWeight: '700' },

  // Game card
  card: {
    flexDirection: 'row', backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    marginBottom: 12, overflow: 'hidden',
  },
  cardClash: { borderColor: 'rgba(245,158,11,0.5)' },
  cardBar: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 6 },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  homeAwayLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  teamLabel: { flex: 1, fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
  kitChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderRadius: 20,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  kitChipText: { fontSize: 10, color: PULSE_COLORS.ui.muted },

  cardTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },

  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  cardMeta: { fontSize: 12, color: PULSE_COLORS.ui.muted },
  cardMetaDot: { fontSize: 12, color: PULSE_COLORS.ui.border },
  cardMetaLink: { flex: 1, textDecorationLine: 'underline', textDecorationColor: PULSE_COLORS.ui.border },

  cardDivider: { height: 1, backgroundColor: PULSE_COLORS.ui.border, marginVertical: 4 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageBtn: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },

  // RSVP
  rsvpRow: { flexDirection: 'row', gap: 8 },
  rsvpBubbleWrap: { alignItems: 'center', gap: 3 },
  rsvpBubble: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  rsvpBubbleNum: { fontSize: 13, fontWeight: '800', color: '#fff' },
  rsvpBubbleLabel: { fontSize: 9, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  // Lineup chip
  lineupChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
  },
  lineupChipText: { fontSize: 11, fontWeight: '700' },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptyBody: { fontSize: 14, color: PULSE_COLORS.ui.muted, textAlign: 'center', lineHeight: 20 },
});
