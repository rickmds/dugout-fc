import { useState, useCallback } from 'react';
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
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { DUGOUT_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubBadge from '../../../../components/ui/ClubBadge';

type EventType = 'game' | 'training' | 'other';
type Tab = 'upcoming' | 'past' | 'calendar';

type Event = {
  id: string;
  title: string;
  type: EventType;
  event_date: string;
  event_time: string | null;
  location: string | null;
  duration_minutes: number | null;
  arrival_buffer_minutes: number | null;
  uniform: string | null;
  field_type: 'turf' | 'grass' | null;
  cancelled_at: string | null;
};

type RsvpCounts = { attending: number; not_attending: number };
type MyRsvp = 'attending' | 'not_attending' | null;

const TYPE_CONFIG: Record<EventType, { label: string; color: string; bg: string }> = {
  game:     { label: 'Game',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  training: { label: 'Training', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  other:    { label: 'Other',    color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
};

const TODAY_STR = new Date().toISOString().split('T')[0];

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
  return dateStr === TODAY_STR;
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

export default function ScheduleScreen() {
  const { primaryColor, rgba, secondaryColor } = useClub();
  const { team, loading: teamLoading } = useTeam();
  const { profile } = useAuth();
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();

  const [events, setEvents] = useState<Event[]>([]);
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, RsvpCounts>>({});
  const [myRsvps, setMyRsvps] = useState<Record<string, MyRsvp>>({});
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>('upcoming');

  const todayDate = new Date();
  const [calYear, setCalYear] = useState(todayDate.getFullYear());
  const [calMonth, setCalMonth] = useState(todayDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(TODAY_STR);

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

    const [eventsRes, playerRes, countRes] = await Promise.all([
      supabase.from('events')
        .select('id, title, type, event_date, event_time, location, duration_minutes, arrival_buffer_minutes, uniform, field_type, cancelled_at')
        .eq('team_id', team.id).order('event_date').order('event_time'),
      profile?.id
        ? supabase.from('players').select('id').eq('team_id', team.id).eq('profile_id', profile.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('team_id', team.id),
    ]);

    const evs = (eventsRes.data as unknown as Event[]) ?? [];
    setEvents(evs);
    setPlayerCount(countRes.count ?? 0);

    const pid = (playerRes as any).data?.id ?? null;
    setMyPlayerId(pid);

    if (evs.length > 0) {
      await fetchRsvpData(evs.map((e) => e.id), pid);
    }
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function fetchRsvpData(eventIds: string[], pid: string | null) {
    const [countsRes, myRes] = await Promise.all([
      supabase.from('event_rsvps').select('event_id, status').in('event_id', eventIds),
      pid
        ? supabase.from('event_rsvps').select('event_id, status').in('event_id', eventIds).eq('player_id', pid)
        : Promise.resolve({ data: [] }),
    ]);

    const counts: Record<string, RsvpCounts> = {};
    for (const row of (countsRes.data ?? []) as { event_id: string; status: string }[]) {
      if (!counts[row.event_id]) counts[row.event_id] = { attending: 0, not_attending: 0 };
      if (row.status === 'attending') counts[row.event_id].attending++;
      else if (row.status === 'not_attending') counts[row.event_id].not_attending++;
    }
    setRsvpCounts(counts);

    const mine: Record<string, MyRsvp> = {};
    for (const row of (myRes.data ?? []) as { event_id: string; status: string }[]) {
      mine[row.event_id] = row.status as MyRsvp;
    }
    setMyRsvps(mine);
  }

  async function handleRsvp(eventId: string, status: 'attending' | 'not_attending') {
    if (!myPlayerId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = myRsvps[eventId];
    if (current === status) {
      await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('player_id', myPlayerId);
    } else {
      await supabase.from('event_rsvps').upsert(
        { event_id: eventId, player_id: myPlayerId, responded_by: profile?.id, status },
        { onConflict: 'event_id,player_id' }
      );
    }
    await fetchRsvpData(events.map((e) => e.id), myPlayerId);
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
    const d = new Date(item.event_date + 'T00:00:00');
    const pending = playerCount > 0 && counts != null
      ? Math.max(0, playerCount - counts.attending - counts.not_attending)
      : null;

    const showHomeAway = item.type === 'game' && (item.uniform === 'home' || item.uniform === 'away');

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.eventCard, (isPast || isCancelled) && styles.eventCardPast]}
        onPress={() => router.push(`/(app)/${clubSlug}/event/${item.id}` as any)}
        activeOpacity={0.75}
      >
        <View style={[styles.typeStripe, { backgroundColor: isCancelled ? '#ef4444' : cfg.color }]} />

        <View style={styles.dateCol}>
          <Text style={[styles.dateWday, today && [styles.todayText, { color: primaryColor }]]}>
            {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
          </Text>
          <Text style={[styles.dateDay, today && [styles.todayText, { color: primaryColor }]]}>
            {d.toLocaleDateString('en-US', { day: 'numeric' })}
          </Text>
          <Text style={[styles.dateMon, today && [styles.todayText, { color: primaryColor }]]}>
            {today ? 'TODAY' : d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
          </Text>
        </View>

        <View style={styles.eventBody}>

          {/* Badge row — left-aligned, wrapping */}
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
            {showHomeAway && (
              <View style={[styles.typeBadge, {
                backgroundColor: item.uniform === 'home' ? rgba(0.10) : 'rgba(139,92,246,0.10)',
              }]}>
                <Text style={[styles.typeText, { color: item.uniform === 'home' ? primaryColor : '#8B5CF6' }]}>
                  {item.uniform === 'home' ? 'Home' : 'Away'}
                </Text>
              </View>
            )}
            {item.field_type && (
              <View style={[styles.typeBadge, {
                backgroundColor: item.field_type === 'turf' ? 'rgba(59,130,246,0.10)' : rgba(0.07),
              }]}>
                <Text style={[styles.typeText, { color: item.field_type === 'turf' ? '#3B82F6' : '#6EE7B7' }]}>
                  {item.field_type === 'turf' ? 'Turf' : 'Grass'}
                </Text>
              </View>
            )}
            {/* My RSVP status — only for parents */}
            {!isCoach && myPlayerId && !isPast && myStatus && (
              <View style={[
                styles.myStatusChip,
                { backgroundColor: myStatus === 'attending' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }
              ]}>
                <Ionicons
                  name={myStatus === 'attending' ? 'checkmark-circle' : 'close-circle'}
                  size={11}
                  color={myStatus === 'attending' ? DUGOUT_COLORS.rsvp.attending : DUGOUT_COLORS.rsvp.not_attending}
                />
                <Text style={[
                  styles.myStatusChipText,
                  { color: myStatus === 'attending' ? DUGOUT_COLORS.rsvp.attending : DUGOUT_COLORS.rsvp.not_attending }
                ]}>
                  {myStatus === 'attending' ? 'Going' : "Can't go"}
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.eventTitle, isPast && { color: DUGOUT_COLORS.ui.muted }]} numberOfLines={1}>{item.title}</Text>

          {(item.event_time || item.location) && (
            <Text style={[styles.eventMeta, isPast && { color: DUGOUT_COLORS.ui.muted }]} numberOfLines={1}>
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

          {/* Coach RSVP summary */}
          {isCoach && !isPast && !isCancelled && (
            <View style={styles.rsvpSummaryRow}>
              <View style={styles.rsvpStat}>
                <Ionicons name="checkmark-circle" size={13} color={DUGOUT_COLORS.rsvp.attending} />
                <Text style={[styles.rsvpStatText, { color: DUGOUT_COLORS.rsvp.attending }]}>
                  {counts?.attending ?? 0}
                </Text>
              </View>
              <View style={styles.rsvpStat}>
                <Ionicons name="close-circle" size={13} color={DUGOUT_COLORS.rsvp.not_attending} />
                <Text style={[styles.rsvpStatText, { color: DUGOUT_COLORS.rsvp.not_attending }]}>
                  {counts?.not_attending ?? 0}
                </Text>
              </View>
              {pending != null && pending > 0 && (
                <View style={styles.rsvpStat}>
                  <Ionicons name="ellipse-outline" size={13} color={DUGOUT_COLORS.ui.muted} />
                  <Text style={[styles.rsvpStatText, { color: DUGOUT_COLORS.ui.muted }]}>{pending}</Text>
                </View>
              )}
            </View>
          )}

          {/* Parent RSVP buttons */}
          {!isCoach && myPlayerId && !isPast && !isCancelled && (
            <View style={styles.rsvpRow}>
              <TouchableOpacity
                style={[styles.rsvpBtn, myStatus === 'attending' && styles.rsvpBtnGoing]}
                onPress={() => handleRsvp(item.id, 'attending')}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={13}
                  color={myStatus === 'attending' ? '#000' : DUGOUT_COLORS.ui.muted}
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
                  color={myStatus === 'not_attending' ? '#fff' : DUGOUT_COLORS.ui.muted}
                />
                <Text style={[styles.rsvpBtnText, myStatus === 'not_attending' && { color: '#fff' }]}>Can't go</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // ── Data splits ──
  const upcomingEvents = events.filter((e) => isUpcoming(e.event_date));
  const pastEvents = events.filter((e) => !isUpcoming(e.event_date)).reverse();
  const upcomingSections = groupByMonth(upcomingEvents);
  const pastSections = groupByMonth(pastEvents);

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
    const base = `https://dugoutfc.app/api/calendar/${team.id}`;
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
        <Ionicons name="calendar-outline" size={48} color={DUGOUT_COLORS.ui.muted} />
        <Text style={{ color: DUGOUT_COLORS.ui.textSecondary, fontSize: 17, fontWeight: '700', marginTop: 16 }}>No teams yet</Text>
        <Text style={{ color: DUGOUT_COLORS.ui.muted, fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }}>
          {isCoach ? 'Import your club or create a team to get started.' : "Ask your coach for an invite to join a team."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ClubBadge size={38} />
          <View>
            <Text style={styles.title}>Schedule</Text>
            <Text style={styles.subtitle}>
              {upcomingEvents.length > 0
                ? `${upcomingEvents.length} upcoming event${upcomingEvents.length !== 1 ? 's' : ''}`
                : 'No upcoming events'}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {isCoach && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }]}
              onPress={() => router.push(`/(app)/${clubSlug}/admin/schedule-upload` as any)}
            >
              <Ionicons name="sparkles-outline" size={15} color="#F59E0B" />
              <Text style={[styles.addBtnText, { color: '#F59E0B' }]}>AI Import</Text>
            </TouchableOpacity>
          )}
          {isCoach && (
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: primaryColor }]} onPress={openCreateEvent}>
              <Ionicons name="add" size={16} color="#000" />
              <Text style={styles.addBtnText}>Add Event</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
              color={activeTab === tab.key ? primaryColor : DUGOUT_COLORS.ui.muted}
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
            <View style={[styles.emptyIconWrap, { backgroundColor: rgba(0.1) }]}>
              <Ionicons name="calendar-outline" size={26} color={DUGOUT_COLORS.ui.muted} />
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
                style={[styles.syncBanner, { backgroundColor: rgba(0.07), borderColor: rgba(0.22) }]}
                onPress={handleSyncCalendar}
                activeOpacity={0.75}
              >
                <View style={[styles.syncIconWrap, { backgroundColor: rgba(0.18) }]}>
                  <Ionicons name="calendar" size={20} color={primaryColor} />
                </View>
                <View style={styles.syncBannerText}>
                  <Text style={[styles.syncBannerTitle, { color: primaryColor }]}>Sync schedule to calendar</Text>
                  <View style={styles.syncPlatforms}>
                    <Ionicons name="logo-apple" size={11} color={DUGOUT_COLORS.ui.muted} />
                    <Text style={styles.syncPlatformText}>Apple</Text>
                    <Text style={styles.syncDot}>·</Text>
                    <Ionicons name="logo-google" size={11} color={DUGOUT_COLORS.ui.muted} />
                    <Text style={styles.syncPlatformText}>Google</Text>
                    <Text style={styles.syncDot}>· Copy link</Text>
                  </View>
                </View>
                <View style={[styles.syncChevron, { backgroundColor: rgba(0.12) }]}>
                  <Ionicons name="chevron-forward" size={14} color={primaryColor} />
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
              <Ionicons name="time-outline" size={26} color={DUGOUT_COLORS.ui.muted} />
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
              <Ionicons name="chevron-back" size={20} color={DUGOUT_COLORS.ui.text} />
            </TouchableOpacity>
            <Text style={styles.calNavTitle}>{calMonthLabel}</Text>
            <TouchableOpacity style={styles.calNavBtn} onPress={nextCalMonth} disabled={loading} activeOpacity={loading ? 1 : 0.7}>
              <Ionicons name="chevron-forward" size={20} color={DUGOUT_COLORS.ui.text} />
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
                  const isPastDay = dateStr < TODAY_STR;

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
              <Ionicons name="calendar-outline" size={24} color={DUGOUT_COLORS.ui.border} />
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
  container: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DUGOUT_COLORS.ui.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', color: DUGOUT_COLORS.ui.text },
  subtitle: { fontSize: 13, color: DUGOUT_COLORS.ui.textSecondary },
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
  syncPlatformText: { fontSize: 11, color: DUGOUT_COLORS.ui.muted },
  syncDot: { fontSize: 11, color: DUGOUT_COLORS.ui.muted },
  syncChevron: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DUGOUT_COLORS.brand.green,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  addBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.background,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: DUGOUT_COLORS.brand.green },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: DUGOUT_COLORS.ui.muted },
  tabBtnTextActive: { color: DUGOUT_COLORS.brand.green },

  // List
  list: { paddingVertical: 12, paddingHorizontal: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, letterSpacing: 1.2 },
  sectionCountBadge: {
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
  },
  sectionCount: { fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.ui.muted },

  // Empty states
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DUGOUT_COLORS.ui.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: DUGOUT_COLORS.ui.textSecondary, textAlign: 'center', marginBottom: 24, maxWidth: 260, lineHeight: 20 },
  emptyBtn: { backgroundColor: DUGOUT_COLORS.brand.green, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 20 },
  emptyBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },

  // Event card
  eventCard: {
    flexDirection: 'row', backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 14, marginBottom: 10, overflow: 'hidden',
  },
  eventCardPast: {},
  typeStripe: { width: 3 },
  dateCol: {
    width: 58, backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 1,
  },
  dateWday: { fontSize: 10, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, letterSpacing: 0.5 },
  dateDay: { fontSize: 22, fontWeight: '800', color: DUGOUT_COLORS.ui.text, lineHeight: 26 },
  dateMon: { fontSize: 10, fontWeight: '600', color: DUGOUT_COLORS.ui.textSecondary, letterSpacing: 0.5 },
  todayText: { color: DUGOUT_COLORS.brand.green },
  eventBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 5 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeText: { fontSize: 11, fontWeight: '700' },
  cancelledBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  cancelledBadgeText: { fontSize: 11, fontWeight: '800', color: '#ef4444', letterSpacing: 0.3 },
  myStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
  },
  myStatusChipText: { fontSize: 11, fontWeight: '700' },
  eventTitle: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  eventMeta: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary },
  rsvpSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  rsvpStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rsvpStatText: { fontSize: 13, fontWeight: '700' },
  rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  rsvpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: 20,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
  },
  rsvpBtnGoing: { backgroundColor: DUGOUT_COLORS.rsvp.attending, borderColor: DUGOUT_COLORS.rsvp.attending },
  rsvpBtnNotGoing: { backgroundColor: DUGOUT_COLORS.rsvp.not_attending, borderColor: DUGOUT_COLORS.rsvp.not_attending },
  rsvpBtnText: { fontSize: 12, fontWeight: '700', color: DUGOUT_COLORS.ui.textSecondary },

  // Calendar
  calScroll: { paddingHorizontal: 16 },
  calNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16,
  },
  calNavBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  calNavTitle: { fontSize: 17, fontWeight: '700', color: DUGOUT_COLORS.ui.text },

  calWeekLabels: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
    marginBottom: 4,
  },
  calWeekLabel: {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '600', color: DUGOUT_COLORS.ui.muted,
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
  calDayCircleSelected: { backgroundColor: DUGOUT_COLORS.brand.green },
  calDayCircleToday: {
    borderWidth: 1.5, borderColor: DUGOUT_COLORS.brand.green,
  },
  calDayText: { fontSize: 14, fontWeight: '500', color: DUGOUT_COLORS.ui.text },
  calDayTextPast: { color: DUGOUT_COLORS.ui.muted },
  calDayTextToday: { color: DUGOUT_COLORS.brand.green, fontWeight: '700' },
  calDayTextSelected: { color: '#000', fontWeight: '700' },
  calDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: DUGOUT_COLORS.brand.green,
  },
  calDotSelected: { backgroundColor: '#000' },

  calDivider: { height: 1, backgroundColor: DUGOUT_COLORS.ui.border, marginVertical: 16 },
  calEventHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  calEventHeaderText: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  calClearBtn: { fontSize: 13, fontWeight: '600', color: DUGOUT_COLORS.brand.green },

  calEmpty: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  calEmptyText: { fontSize: 14, color: DUGOUT_COLORS.ui.muted },
  calEventList: { gap: 0 },
});
