import { useEffect, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { PULSE_COLORS } from '../../../constants/colors';
import { useClub } from '../../../hooks/useClub';
import ClubHeader from '../../../components/ui/ClubHeader';
import { useGameDay, useUpcomingGameDates, localDateStr, type GameDayEvent } from '../../../hooks/useGameDay';
import { getDrivingMinutes } from '../../../lib/routes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function subMins(time: string, driveMins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m - driveMins - 15;
  const nh = Math.floor(total / 60);
  const nm = ((total % 60) + 60) % 60;
  const safeH = ((nh % 24) + 24) % 24;
  const ampm = safeH >= 12 ? 'PM' : 'AM';
  return `${safeH % 12 || 12}:${String(nm).padStart(2, '0')} ${ampm}`;
}

function eventEndMins(ev: GameDayEvent): number {
  if (!ev.event_time) return 0;
  const [h, m] = ev.event_time.split(':').map(Number);
  return h * 60 + m + (ev.duration_minutes ?? (ev.type === 'game' ? 90 : 60));
}

function eventStartMins(ev: GameDayEvent): number {
  if (!ev.event_time) return 0;
  const [h, m] = ev.event_time.split(':').map(Number);
  return h * 60 + m;
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

type TravelLeg = {
  minutes: number | null;
  leaveBy: string | null;
  isClash: boolean;
};

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function GameDayScreen() {
  const { primaryColor, rgba } = useClub();
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();

  const { dates, loading: datesLoading } = useUpcomingGameDates(21);
  const [selectedDate, setSelectedDate] = useState(localDateStr(0));
  const { events, loading: eventsLoading } = useGameDay(selectedDate);

  const [currentLoc, setCurrentLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState('Current Location');
  const [legs, setLegs] = useState<TravelLeg[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);

  const spinVal = useRef(new Animated.Value(0)).current;

  // Set initial date once dates load
  useEffect(() => {
    if (!datesLoading && dates.length) {
      const today = localDateStr(0);
      setSelectedDate(dates.includes(today) ? today : dates[0]);
    }
  }, [datesLoading]);

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
    if (!events.length) { setLegs([]); return; }
    computeLegs();
  }, [events, currentLoc]);

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

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const destAddr = ev.address || ev.location;
      const destination = (ev.lat && ev.lng) ? { lat: ev.lat, lng: ev.lng } : (destAddr ?? null);

      let isClash = false;
      if (i > 0 && ev.event_time) {
        isClash = eventStartMins(ev) < eventEndMins(events[i - 1]);
      }

      if (!destination) {
        result.push({ minutes: null, leaveBy: null, isClash });
        continue;
      }

      let origin: { lat: number; lng: number } | string | null = null;
      if (i === 0) {
        origin = currentLoc ?? destAddr ?? null;
      } else {
        const prev = events[i - 1];
        origin = (prev.lat && prev.lng) ? { lat: prev.lat, lng: prev.lng } : (prev.address ?? prev.location ?? null);
      }

      const mins = origin ? await getDrivingMinutes(origin as any, destination as any) : null;
      const leaveBy = (mins !== null && ev.event_time) ? subMins(ev.event_time, mins) : null;

      result.push({ minutes: mins, leaveBy, isClash });
    }

    setLegs(result);
    setLegsLoading(false);
  }

  const spin = spinVal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const totalClashes = legs.filter((l) => l.isClash).length;

  if (datesLoading) {
    return <View style={styles.center}><ActivityIndicator color={primaryColor} size="large" /></View>;
  }

  return (
    <View style={styles.root}>

      <ClubHeader
        title="Game Day"
        subtitle={fmtDate(selectedDate)}
        onBack={() => router.back()}
        right={totalClashes > 0 ? (
          <View style={styles.clashBadge}>
            <Ionicons name="warning" size={11} color="#EF4444" />
            <Text style={styles.clashBadgeText}>{totalClashes}</Text>
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
                style={[styles.dateTab, active && [styles.dateTabActive, { backgroundColor: primaryColor }]]}
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

      {eventsLoading ? (
        <View style={styles.center}><ActivityIndicator color={primaryColor} size="large" /></View>
      ) : events.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIconWrap, { backgroundColor: rgba(0.1) }]}>
            <Ionicons name="calendar-outline" size={28} color={primaryColor} />
          </View>
          <Text style={styles.emptyTitle}>No games on this day</Text>
          <Text style={styles.emptyBody}>Select another date above.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.timeline}>

          {/* Origin node */}
          <View style={[styles.originNode, { borderColor: rgba(0.25), backgroundColor: rgba(0.07) }]}>
            <Ionicons name="locate" size={14} color={primaryColor} />
            <Text style={[styles.originText, { color: primaryColor }]}>Starting from {locationLabel}</Text>
            {legsLoading && (
              <Animated.View style={[styles.syncIcon, { transform: [{ rotate: spin }] }]}>
                <Ionicons name="sync-outline" size={12} color={PULSE_COLORS.ui.muted} />
              </Animated.View>
            )}
          </View>

          {events.map((ev, i) => {
            const leg = legs[i];
            const cfg = ev.type === 'game'
              ? { icon: 'football-outline' as const, color: '#F59E0B' }
              : ev.type === 'training'
              ? { icon: 'barbell-outline' as const, color: '#3B82F6' }
              : { icon: 'pin-outline' as const, color: '#9CA3AF' };

            return (
              <View key={ev.id}>

                {/* Travel leg */}
                {leg && (
                  leg.isClash ? (
                    <View style={styles.clashLeg}>
                      <Ionicons name="warning" size={14} color="#EF4444" />
                      <Text style={styles.clashLegText}>Schedule clash — overlaps with previous game</Text>
                    </View>
                  ) : (
                    <View style={styles.travelLeg}>
                      <View style={styles.travelLegLeft}>
                        <View style={styles.travelLine} />
                        <View style={[styles.travelCarWrap, { backgroundColor: PULSE_COLORS.ui.surface, borderColor: PULSE_COLORS.ui.border }]}>
                          <Ionicons name="car-outline" size={14} color={PULSE_COLORS.ui.textSecondary} />
                        </View>
                        <View style={styles.travelLine} />
                      </View>
                      <View style={styles.travelLegRight}>
                        {leg.minutes !== null ? (
                          <>
                            <Text style={styles.travelMins}>{leg.minutes} min drive</Text>
                            {leg.leaveBy && (
                              <View style={styles.leaveByRow}>
                                <Ionicons name="alarm-outline" size={14} color="#F59E0B" />
                                <Text style={styles.leaveByText}>Leave by {leg.leaveBy}</Text>
                              </View>
                            )}
                          </>
                        ) : (
                          <Text style={styles.travelMins}>No address — can't calculate</Text>
                        )}
                      </View>
                    </View>
                  )
                )}

                {/* Event card */}
                <TouchableOpacity
                  style={styles.eventCard}
                  onPress={() => router.push(`/(app)/${clubSlug}/event/${ev.id}` as any)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.teamStripe, { backgroundColor: ev.team_color }]} />
                  <View style={styles.eventBody}>

                    {/* Pills row */}
                    <View style={styles.pillRow}>
                      <View style={[styles.pill, { backgroundColor: `${ev.team_color}1A` }]}>
                        <View style={[styles.pillDot, { backgroundColor: ev.team_color }]} />
                        <Text style={[styles.pillText, { color: ev.team_color }]}>{ev.team_name}</Text>
                      </View>
                      <View style={[styles.pill, { backgroundColor: `${cfg.color}18` }]}>
                        <Ionicons name={cfg.icon} size={10} color={cfg.color} />
                        <Text style={[styles.pillText, { color: cfg.color }]}>
                          {ev.type.charAt(0).toUpperCase() + ev.type.slice(1)}
                        </Text>
                      </View>
                    </View>

                    {/* Title + time */}
                    <Text style={styles.eventTitle}>{ev.title}</Text>
                    {ev.event_time && (
                      <Text style={[styles.eventTime, { color: primaryColor }]}>{fmt12(ev.event_time)}</Text>
                    )}

                    {/* Location */}
                    {(ev.location || ev.address) && (
                      <View style={styles.locationRow}>
                        <Ionicons name="location-outline" size={12} color={PULSE_COLORS.ui.muted} />
                        <Text style={styles.locationText} numberOfLines={1}>
                          {ev.location ?? ev.address}
                        </Text>
                      </View>
                    )}

                    {/* RSVP + chevron */}
                    <View style={styles.bottomRow}>
                      <View style={styles.rsvpChip}>
                        <Ionicons name="checkmark-circle" size={14} color={PULSE_COLORS.rsvp.attending} />
                        <Text style={[styles.rsvpNum, { color: PULSE_COLORS.rsvp.attending }]}>{ev.rsvp_attending} going</Text>
                      </View>
                      {ev.rsvp_not_attending > 0 && (
                        <View style={styles.rsvpChip}>
                          <Ionicons name="close-circle" size={14} color={PULSE_COLORS.rsvp.not_attending} />
                          <Text style={[styles.rsvpNum, { color: PULSE_COLORS.rsvp.not_attending }]}>{ev.rsvp_not_attending}</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={styles.chevron} />
                    </View>

                  </View>
                </TouchableOpacity>
              </View>
            );
          })}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text },
  headerSub:    { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 2 },
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
  dateTabTextActive: { color: '#fff', fontWeight: '700' },

  timeline: { paddingHorizontal: 16, paddingTop: 16 },

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

  // Event card
  eventCard: {
    flexDirection: 'row',
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    marginBottom: 2,
  },
  teamStripe: { width: 5 },
  eventBody: { flex: 1, padding: 14, gap: 7 },

  pillRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },

  eventTitle: { fontSize: 16, fontWeight: '800', color: PULSE_COLORS.ui.text },
  eventTime: { fontSize: 14, fontWeight: '700', marginTop: -2 },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationText: { fontSize: 12, color: PULSE_COLORS.ui.muted, flex: 1 },

  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  rsvpChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rsvpNum: { fontSize: 12, fontWeight: '700' },
  chevron: { marginLeft: 'auto' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
  emptyBody: { fontSize: 14, color: PULSE_COLORS.ui.muted, textAlign: 'center' },
});
