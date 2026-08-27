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
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { PULSE_COLORS } from '../../../constants/colors';
import ClubHeader from '../../../components/ui/ClubHeader';
import {
  useGameDayFeed, localDateStr, detectClashes, upcomingDates, detectCoachClashes, getCoverageFlag,
  type FeedEvent, type CoverageFlag,
} from '../../../hooks/useGameDayFeed';
import { computeArriveBy } from '../../../lib/eventTime';
import { getDrivingMinutes } from '../../../lib/routes';
import { useMapApp } from '../../../hooks/useMapApp';
import { MapPickerModal } from '../../../components/ui/MapPickerModal';

// This screen shows every upcoming game the signed-in user can see —
// their own club's (org_admin/coach) plus any team at another club they've
// been added to as a guest coach — driven entirely by useGameDayFeed, which
// fetches via RLS with no client-side team/club pre-filter. A single event
// list can therefore span more than one club at once, so card accents
// follow each event's OWN club color, never a single page-level color.
const GAME_COLOR = PULSE_COLORS.status.warning;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Targets arrival time (kickoff minus the coach's own "arrive early"
// setting), not kickoff itself — falls back to a flat 15-minute pad only
// when no arrival_buffer_minutes is set, so events with an explicit buffer
// aren't padded twice.
function subMins(time: string, driveMins: number, arrivalBufferMins: number | null): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m - (arrivalBufferMins ?? 15) - driveMins;
  const nh = Math.floor(total / 60);
  const nm = ((total % 60) + 60) % 60;
  const safeH = ((nh % 24) + 24) % 24;
  const ampm = safeH >= 12 ? 'PM' : 'AM';
  return `${safeH % 12 || 12}:${String(nm).padStart(2, '0')} ${ampm}`;
}

function fmtDate(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function fmtDateTab(iso: string): string {
  if (iso === localDateStr(0)) return 'Today';
  if (iso === localDateStr(1)) return 'Tomorrow';
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}

type TravelLeg = { minutes: number | null; leaveBy: string | null; isClash: boolean };

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function GameDayScreen() {
  const router = useRouter();
  const mapApp = useMapApp();

  const { events: allEvents, teamCoaches, guestCoachStatuses, loading: eventsLoading } = useGameDayFeed(45);
  const dates = upcomingDates(allEvents);
  const [selectedDate, setSelectedDate] = useState(localDateStr(0));

  // Pick an initial date once the feed has loaded — mirrors the old
  // per-date-source screens' "default to today, else the soonest date" rule.
  useEffect(() => {
    if (eventsLoading || !dates.length) return;
    const today = localDateStr(0);
    setSelectedDate((prev) => (dates.includes(prev) ? prev : (dates.includes(today) ? today : dates[0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-derive when loading finishes or the date set actually changes
  }, [eventsLoading, dates.join(',')]);

  const dayEvents = useMemo(() => allEvents.filter((e) => e.event_date === selectedDate), [allEvents, selectedDate]);

  // Personal itinerary ("can I physically get there") only makes sense for
  // games someone actually attends themselves — their own coached team, or
  // (for a parent) their own kid's team. An org_admin's club-wide viewing
  // rights ('org_admin'-tagged events) never belong here — otherwise every
  // Saturday with 50 teams playing looks like one giant travel clash.
  const myDayEvents = useMemo(() => dayEvents.filter((e) => e.my_role !== 'org_admin'), [dayEvents]);
  const clashedIds = useMemo(() => detectClashes(myDayEvents), [myDayEvents]);

  // Club-wide coverage — org_admin only, everything myDayEvents excluded.
  const coverageEvents = useMemo(() => dayEvents.filter((e) => e.my_role === 'org_admin'), [dayEvents]);
  const guestCoachEventIds = useMemo(() => new Set(guestCoachStatuses.map((g) => g.event_id)), [guestCoachStatuses]);
  const coachClashes = useMemo(
    () => detectCoachClashes(coverageEvents, teamCoaches, guestCoachEventIds),
    [coverageEvents, teamCoaches, guestCoachEventIds]
  );
  const coverageFlags = useMemo(() => {
    const map = new Map<string, CoverageFlag>();
    for (const e of coverageEvents) {
      const flag = getCoverageFlag(e, coachClashes.get(e.id));
      if (flag) map.set(e.id, flag);
    }
    return map;
  }, [coverageEvents, coachClashes]);
  const sortedCoverageEvents = useMemo(() => {
    const severity = (id: string) => {
      const f = coverageFlags.get(id);
      if (f?.level === 'at_risk') return 0;
      if (f?.level === 'needs_attention') return 1;
      return 2;
    };
    return [...coverageEvents].sort((a, b) => severity(a.id) - severity(b.id));
  }, [coverageEvents, coverageFlags]);
  const coverageFlaggedCount = useMemo(() => [...coverageFlags.values()].filter((f) => f.level === 'at_risk').length, [coverageFlags]);

  const [currentLoc, setCurrentLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState('Current Location');
  const [legs, setLegs] = useState<TravelLeg[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);

  const spinVal = useRef(new Animated.Value(0)).current;

  // Get location once on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCurrentLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (geo) setLocationLabel(geo.city ?? geo.district ?? 'Current Location');
    })();
  }, []);

  useEffect(() => {
    if (!myDayEvents.length) { setLegs([]); return; }
    computeLegs();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- myDayEvents is derived fresh each render; selectedDate+allEvents (its real inputs) plus currentLoc are the true deps
  }, [selectedDate, allEvents, currentLoc]);

  useEffect(() => {
    if (legsLoading) {
      Animated.loop(
        Animated.timing(spinVal, { toValue: 1, duration: 900, useNativeDriver: true }),
      ).start();
    } else {
      spinVal.stopAnimation();
      spinVal.setValue(0);
    }
  }, [legsLoading]);

  async function computeLegs() {
    setLegsLoading(true);
    const result: TravelLeg[] = [];

    for (let i = 0; i < myDayEvents.length; i++) {
      const ev = myDayEvents[i];
      const destAddr = ev.address || ev.location;
      const destination = (ev.lat && ev.lng) ? { lat: ev.lat, lng: ev.lng } : (destAddr ?? null);

      let isClash = false;
      if (i > 0 && ev.event_time) {
        const prev = myDayEvents[i - 1];
        if (prev.event_time) {
          const [ph, pm] = prev.event_time.split(':').map(Number);
          const [eh, em] = ev.event_time.split(':').map(Number);
          const prevEnd = ph * 60 + pm + (prev.duration_minutes ?? 90);
          isClash = (eh * 60 + em) < prevEnd;
        }
      }

      if (!destination) {
        result.push({ minutes: null, leaveBy: null, isClash });
        continue;
      }

      let origin: { lat: number; lng: number } | string | null = null;
      if (i === 0) {
        origin = currentLoc ?? destAddr ?? null;
      } else {
        const prev = myDayEvents[i - 1];
        origin = (prev.lat && prev.lng) ? { lat: prev.lat, lng: prev.lng } : (prev.address ?? prev.location ?? null);
      }

      const mins = origin ? await getDrivingMinutes(origin as any, destination as any) : null;
      const leaveBy = (mins !== null && ev.event_time) ? subMins(ev.event_time, mins, ev.arrival_buffer_minutes) : null;

      result.push({ minutes: mins, leaveBy, isClash });
    }

    setLegs(result);
    setLegsLoading(false);
  }

  const spin = spinVal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const totalClashes = legs.filter((l) => l.isClash).length;
  const noLineupCount = myDayEvents.filter((e) => e.my_role && !e.has_lineup).length;
  const totalTBD = myDayEvents.reduce((s, e) => s + e.rsvp_tbd, 0);
  const headerBadgeCount = totalClashes + coverageFlaggedCount;

  if (eventsLoading) {
    return <View style={styles.center}><ActivityIndicator color={GAME_COLOR} size="large" /></View>;
  }

  return (
    <View style={styles.root}>

      <ClubHeader
        title="Game Day"
        subtitle={dates.length ? fmtDate(selectedDate) : undefined}
        onBack={() => router.back()}
        right={headerBadgeCount > 0 ? (
          <View style={styles.clashBadge}>
            <Ionicons name="warning" size={11} color="#EF4444" />
            <Text style={styles.clashBadgeText}>{headerBadgeCount}</Text>
          </View>
        ) : undefined}
      />

      {/* Date tabs */}
      {dates.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dateTabsScroll}
          contentContainerStyle={styles.dateTabs}
        >
          {dates.map((d) => {
            const active = d === selectedDate;
            return (
              <TouchableOpacity
                key={d}
                style={[styles.dateTab, active && [styles.dateTabActive, { backgroundColor: GAME_COLOR }]]}
                onPress={() => setSelectedDate(d)}
              >
                <Text style={[styles.dateTabText, active && styles.dateTabTextActive]}>
                  {fmtDateTab(d)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {!dates.length ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={PULSE_COLORS.ui.muted} />
          <Text style={styles.emptyTitle}>No upcoming games</Text>
          <Text style={styles.emptyBody}>Nothing on the schedule for any of your teams right now.</Text>
        </View>
      ) : !dayEvents.length ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={PULSE_COLORS.ui.muted} />
          <Text style={styles.emptyTitle}>No games on this day</Text>
          <Text style={styles.emptyBody}>Select another date above.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {myDayEvents.length > 0 && (
            <>
              {(totalClashes > 0 || noLineupCount > 0 || totalTBD > 0) && (
                <NeedsAttentionBanner clashes={totalClashes} noLineup={noLineupCount} tbd={totalTBD} />
              )}

              <View style={[styles.originNode, { borderColor: 'rgba(245,158,11,0.25)', backgroundColor: 'rgba(245,158,11,0.07)' }]}>
                <Ionicons name="locate" size={14} color={GAME_COLOR} />
                <Text style={[styles.originText, { color: GAME_COLOR }]}>Starting from {locationLabel}</Text>
                {legsLoading && (
                  <Animated.View style={[styles.syncIcon, { transform: [{ rotate: spin }] }]}>
                    <Ionicons name="sync-outline" size={12} color={PULSE_COLORS.ui.muted} />
                  </Animated.View>
                )}
              </View>

              {myDayEvents.map((ev, i) => {
                const leg = legs[i];
                return (
                  <View key={ev.id}>
                    {leg && (
                      leg.isClash ? (
                        <View style={styles.clashLeg}>
                          <Ionicons name="warning" size={14} color="#EF4444" />
                          <Text style={styles.clashLegText}>Schedule clash — overlaps with previous game</Text>
                        </View>
                      ) : (
                        <TravelStrip minutes={leg.minutes} leaveBy={leg.leaveBy} isFirst={i === 0} />
                      )
                    )}

                    <GameCard
                      event={ev}
                      clash={clashedIds.has(ev.id)}
                      router={router}
                      onOpenMaps={() => mapApp.open({ query: ev.address ?? ev.location ?? '', lat: ev.lat, lng: ev.lng })}
                    />
                  </View>
                );
              })}
            </>
          )}

          {coverageEvents.length > 0 && (
            <>
              <View style={styles.coverageHeaderRow}>
                <Text style={styles.coverageHeaderLabel}>CLUB COVERAGE</Text>
                <Text style={styles.coverageHeaderCount}>
                  {coverageFlaggedCount > 0 ? `${coverageFlaggedCount} need attention` : 'All teams covered'}
                </Text>
              </View>

              {sortedCoverageEvents.map((ev) => (
                <GameCard
                  key={ev.id}
                  event={ev}
                  clash={false}
                  flag={coverageFlags.get(ev.id) ?? null}
                  router={router}
                  onOpenMaps={() => mapApp.open({ query: ev.address ?? ev.location ?? '', lat: ev.lat, lng: ev.lng })}
                />
              ))}
            </>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      <MapPickerModal
        visible={mapApp.showPicker}
        onConfirm={mapApp.confirm}
        onDismiss={mapApp.dismiss}
      />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NeedsAttentionBanner({ clashes, noLineup, tbd }: { clashes: number; noLineup: number; tbd: number }) {
  const items: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }[] = [];
  if (clashes > 0) items.push({ icon: 'warning-outline', color: '#F59E0B', text: `${clashes} clash${clashes > 1 ? 'es' : ''}` });
  if (noLineup > 0) items.push({ icon: 'grid-outline', color: '#EF4444', text: `${noLineup} no lineup` });
  if (tbd > 0) items.push({ icon: 'help-circle-outline', color: PULSE_COLORS.ui.muted, text: `${tbd} TBD` });

  return (
    <View style={styles.attentionBanner}>
      <Text style={styles.attentionLabel}>NEEDS ATTENTION</Text>
      <View style={styles.attentionRow}>
        {items.map((item, i) => (
          <View key={i} style={styles.attentionChip}>
            <Ionicons name={item.icon} size={13} color={item.color} />
            <Text style={[styles.attentionChipText, { color: item.color }]}>{item.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TravelStrip({ minutes, leaveBy, isFirst }: { minutes: number | null; leaveBy: string | null; isFirst: boolean }) {
  const color = isFirst ? GAME_COLOR : PULSE_COLORS.ui.textSecondary;
  return (
    <View style={styles.travelLeg}>
      <View style={styles.travelLegLeft}>
        <View style={styles.travelLine} />
        <View style={[styles.travelCarWrap, { backgroundColor: PULSE_COLORS.ui.surface, borderColor: PULSE_COLORS.ui.border }]}>
          <Ionicons name={isFirst ? 'navigate-outline' : 'car-outline'} size={14} color={color} />
        </View>
        <View style={styles.travelLine} />
      </View>
      <View style={styles.travelLegRight}>
        {minutes !== null ? (
          <>
            <Text style={styles.travelMins}>{minutes} min drive{isFirst ? ' from here' : ' to next venue'}</Text>
            {leaveBy && (
              <View style={styles.leaveByRow}>
                <Ionicons name="alarm-outline" size={14} color="#F59E0B" />
                <Text style={styles.leaveByText}>Leave by {leaveBy}</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.travelMins}>No address — can't calculate</Text>
        )}
      </View>
    </View>
  );
}

function GameCard({ event, clash, flag, router, onOpenMaps }: {
  event: FeedEvent;
  clash: boolean;
  flag?: CoverageFlag | null;
  router: ReturnType<typeof useRouter>;
  onOpenMaps: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const accent = event.club?.primary_color ?? GAME_COLOR;
  const canManage = event.my_role === 'coach' || event.my_role === 'org_admin';

  function onPressIn() { Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start(); }
  function onPressOut() { Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start(); }

  // null for a tournament game (neutral venue, no home/away concept) —
  // must not default to HOME.
  const homeAwayLabel = event.home_away === 'away' ? 'AWAY' : event.home_away === 'home' ? 'HOME' : null;
  const homeAwayColor = event.home_away === 'away' ? '#60A5FA' : '#22C55E';
  const kitLabel = event.uniform === 'home' ? 'Home Kit'
    : event.uniform === 'away' ? 'Away Kit'
    : event.uniform === 'training' ? 'Training Kit'
    : null;

  const rsvpLock = (() => {
    if (!event.rsvp_lock_at) return null;
    const lockTime = new Date(event.rsvp_lock_at);
    const now = new Date();
    if (lockTime < now) return { label: 'RSVP closed', color: PULSE_COLORS.ui.muted };
    const diffH = (lockTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    const timeStr = lockTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return { label: `RSVP closes ${timeStr}`, color: diffH < 2 ? '#F59E0B' : PULSE_COLORS.ui.muted };
  })();

  const slug = event.club?.slug;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => slug && router.push(`/(app)/${slug}/event/${event.id}` as never)}
        style={[styles.card, clash && styles.cardClash]}
      >
        <View style={[styles.cardBar, { backgroundColor: accent }]} />

        {!event.my_role && (
          <View style={styles.parentChip}>
            <Ionicons name="person-outline" size={10} color="#60A5FA" />
            <Text style={styles.parentChipText}>Parent</Text>
          </View>
        )}

        <View style={styles.cardBody}>
          {flag && (
            <View style={[styles.flagBanner, flag.level === 'at_risk' ? styles.flagBannerRisk : styles.flagBannerAttention]}>
              <Ionicons
                name={flag.level === 'at_risk' ? 'alert-circle' : 'help-circle'}
                size={13}
                color={flag.level === 'at_risk' ? '#EF4444' : '#F59E0B'}
              />
              <Text style={[styles.flagBannerText, { color: flag.level === 'at_risk' ? '#EF4444' : '#F59E0B' }]}>
                {flag.reason}
              </Text>
            </View>
          )}

          <View style={styles.cardTopRow}>
            {homeAwayLabel && <Text style={[styles.homeAwayLabel, { color: homeAwayColor }]}>{homeAwayLabel}</Text>}
            <Text style={styles.teamLabel} numberOfLines={1}>
              {event.team_name}{event.club?.name ? ` · ${event.club.name}` : ''}
            </Text>
            {kitLabel && (
              <View style={styles.kitChip}>
                <Ionicons name="shirt-outline" size={10} color={PULSE_COLORS.ui.muted} />
                <Text style={styles.kitChipText}>{kitLabel}</Text>
              </View>
            )}
          </View>

          <Text style={styles.cardTitle}>{event.title}</Text>

          <View style={styles.cardMetaRow}>
            <Ionicons name="time-outline" size={13} color={PULSE_COLORS.ui.muted} />
            <Text style={styles.cardMeta}>{event.event_time ? fmt12(event.event_time) : 'TBC'}</Text>
            {event.event_time && event.arrival_buffer_minutes != null && (
              <>
                <Text style={styles.cardMetaDivider}>·</Text>
                <Text style={styles.cardMetaArrive}>Arrive {computeArriveBy(event.event_time, event.arrival_buffer_minutes)}</Text>
              </>
            )}
          </View>

          {(event.location || event.address) && (
            <TouchableOpacity onPress={onOpenMaps} style={styles.cardMetaRow} hitSlop={8}>
              <Ionicons name="location-outline" size={13} color={PULSE_COLORS.ui.muted} />
              <Text style={[styles.cardMeta, styles.cardMetaLink]} numberOfLines={1}>
                {event.location || event.address}
              </Text>
              <Ionicons name="open-outline" size={11} color={PULSE_COLORS.ui.border} />
            </TouchableOpacity>
          )}

          {rsvpLock && (
            <View style={styles.cardMetaRow}>
              <Ionicons name="lock-closed-outline" size={13} color={rsvpLock.color} />
              <Text style={[styles.cardMeta, { color: rsvpLock.color }]}>{rsvpLock.label}</Text>
            </View>
          )}

          <View style={styles.cardDivider} />

          <View style={styles.cardBottomRow}>
            <View style={styles.rsvpRow}>
              <RsvpBubble count={event.rsvp_attending} color="#22C55E" label="Going" />
              <RsvpBubble count={event.rsvp_tbd} color="#F59E0B" label="TBD" />
              <RsvpBubble count={event.rsvp_not_attending} color="#EF4444" label="Out" />
            </View>

            <View style={styles.cardActions}>
              {slug && (
                <TouchableOpacity
                  onPress={() => router.push(`/(app)/${slug}/(tabs)/chat` as never)}
                  style={styles.messageBtn}
                  hitSlop={8}
                >
                  <Ionicons name="chatbubble-outline" size={14} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              )}

              {canManage && slug && (
                <TouchableOpacity
                  onPress={() => router.push(`/(app)/${slug}/admin/events/${event.id}/lineup` as never)}
                  style={[
                    styles.lineupChip,
                    event.has_lineup
                      ? { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }
                      : { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' },
                  ]}
                  hitSlop={8}
                >
                  <Ionicons
                    name={event.has_lineup ? 'checkmark-circle' : 'grid-outline'}
                    size={12}
                    color={event.has_lineup ? '#22C55E' : '#EF4444'}
                  />
                  <Text style={[styles.lineupChipText, { color: event.has_lineup ? '#22C55E' : '#EF4444' }]}>
                    {event.has_lineup ? 'Lineup set' : 'No lineup'}
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  clashBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  clashBadgeText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },

  dateTabsScroll: { flexGrow: 0, flexShrink: 0 },
  dateTabs: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  dateTab: {
    height: 36, paddingHorizontal: 16, borderRadius: 18,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dateTabActive:     { borderColor: 'transparent' },
  dateTabText:       { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  dateTabTextActive: { color: '#000', fontWeight: '700' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Needs attention
  attentionBanner: {
    backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    padding: 12, marginBottom: 16,
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

  // Club coverage (org_admin)
  coverageHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, marginBottom: 12,
  },
  coverageHeaderLabel: { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.muted, letterSpacing: 1.2 },
  coverageHeaderCount: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },

  flagBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    borderRadius: 8, borderWidth: 1, padding: 8, marginBottom: 8,
  },
  flagBannerRisk: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' },
  flagBannerAttention: { backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' },
  flagBannerText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 16 },

  originNode: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, marginBottom: 16,
  },
  originText: { fontSize: 12, fontWeight: '700' },
  syncIcon:   { marginLeft: 2 },

  // Travel leg
  travelLeg: { flexDirection: 'row', gap: 12, marginVertical: 4, alignItems: 'stretch', paddingHorizontal: 2 },
  travelLegLeft: { alignItems: 'center', width: 30 },
  travelLine: { flex: 1, width: 1.5, alignSelf: 'center', minHeight: 8, backgroundColor: PULSE_COLORS.ui.border },
  travelCarWrap: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  travelLegRight: { flex: 1, justifyContent: 'center', paddingVertical: 6 },
  travelMins: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  leaveByRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  leaveByText: { fontSize: 14, fontWeight: '800', color: '#F59E0B' },

  // Clash leg
  clashLeg: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 10, padding: 10, marginVertical: 6,
  },
  clashLegText: { fontSize: 13, fontWeight: '600', color: '#EF4444', flex: 1 },

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
  parentChip: {
    position: 'absolute', top: 10, right: 10, zIndex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(96,165,250,0.16)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(96,165,250,0.35)',
    paddingHorizontal: 7, paddingVertical: 2,
  },
  parentChipText: { fontSize: 10, fontWeight: '800', color: '#60A5FA', letterSpacing: 0.2 },

  cardTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },

  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  cardMeta: { fontSize: 12, color: PULSE_COLORS.ui.muted },
  cardMetaDivider: { fontSize: 12, color: PULSE_COLORS.ui.border },
  cardMetaArrive: { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  emptyBody: { fontSize: 14, color: PULSE_COLORS.ui.muted, textAlign: 'center', lineHeight: 20 },
});
