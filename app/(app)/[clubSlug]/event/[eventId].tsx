import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { DUGOUT_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import { useMapApp } from '../../../../hooks/useMapApp';
import { MapPickerModal } from '../../../../components/ui/MapPickerModal';
import { MatchTrackerContent } from '../admin/events/[eventId]/match-tracker';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

function LocationMap({
  lat, lng, address, onPress,
}: {
  lat: number | null;
  lng: number | null;
  address: string | null;
  onPress: () => void;
}) {
  const { primaryColor } = useClub();
  const [drivingTime, setDrivingTime] = useState<string | null>(null);
  const [imgError, setImgError]       = useState(false);
  const [imgLoaded, setImgLoaded]     = useState(false);

  useEffect(() => {
    if (!PLACES_KEY) return;
    fetchDrivingTime();
  }, []);

  async function fetchDrivingTime() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const origin = `${pos.coords.latitude},${pos.coords.longitude}`;
      const dest = lat != null && lng != null
        ? `${lat},${lng}`
        : encodeURIComponent(address ?? '');
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${dest}&mode=driving&key=${PLACES_KEY}`
      );
      const json = await res.json();
      const text = json.rows?.[0]?.elements?.[0]?.duration?.text;
      if (text) setDrivingTime(text);
    } catch { /* silently fail */ }
  }

  if (!PLACES_KEY || imgError) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={mapStyles.fallback}>
        <Ionicons name="map-outline" size={22} color={DUGOUT_COLORS.ui.muted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[mapStyles.fallbackAddress, { color: primaryColor }]} numberOfLines={2}>{address ?? 'View on map'}</Text>
          <Text style={mapStyles.fallbackHint}>Tap to get directions</Text>
        </View>
        <Ionicons name="open-outline" size={16} color={primaryColor} />
      </TouchableOpacity>
    );
  }

  const center = lat != null && lng != null
    ? `${lat},${lng}`
    : encodeURIComponent(address ?? '');
  const marker = lat != null && lng != null ? `&markers=color:red|${lat},${lng}` : '';
  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=16&size=600x340&maptype=satellite${marker}&key=${PLACES_KEY}`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={mapStyles.wrapper}>
      {!imgLoaded && (
        <View style={mapStyles.skeleton}>
          <ActivityIndicator color={DUGOUT_COLORS.ui.muted} />
        </View>
      )}
      <Image
        source={{ uri: mapUrl }}
        style={[mapStyles.image, !imgLoaded && { opacity: 0 }]}
        resizeMode="cover"
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgError(true)}
      />
      {imgLoaded && (
        <>
          <View style={mapStyles.directionsHint}>
            <Ionicons name="navigate-outline" size={12} color="rgba(255,255,255,0.9)" />
            <Text style={mapStyles.directionsText}>Get directions</Text>
          </View>
          {drivingTime && (
            <View style={mapStyles.badge}>
              <Ionicons name="car-outline" size={13} color="#fff" />
              <Text style={mapStyles.badgeText}>{drivingTime}</Text>
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const mapStyles = StyleSheet.create({
  wrapper: {
    height: 190,
    overflow: 'hidden',
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
  },
  skeleton: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
  },
  image: { width: '100%', height: '100%' },
  directionsHint: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  directionsText: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600' },
  badge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: DUGOUT_COLORS.ui.surface,
  },
  fallbackAddress: { fontSize: 14, fontWeight: '600', color: DUGOUT_COLORS.brand.green },
  fallbackHint: { fontSize: 12, color: DUGOUT_COLORS.ui.muted },
});

type EventType = 'game' | 'training' | 'other';
type RsvpStatus = 'attending' | 'not_attending';

type EventDetail = {
  id: string;
  title: string;
  type: EventType;
  event_date: string;
  event_time: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  duration_minutes: number | null;
  arrival_buffer_minutes: number | null;
  field_type: string | null;
  field_notes: string | null;
  uniform: string | null;
  notes: string | null;
  coach_notes: string | null;
  rsvp_lock_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

type Player = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
};

type RsvpRow = { player_id: string; status: RsvpStatus };

type MatchStatRow = Player & { seconds: number };

const TYPE_CONFIG: Record<EventType, { label: string; color: string; bg: string }> = {
  game:     { label: 'Game',     color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  training: { label: 'Training', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  other:    { label: 'Other',    color: '#9CA3AF', bg: 'rgba(156,163,175,0.15)' },
};

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
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

function computeArriveBy(timeStr: string, bufferMins: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = h * 60 + m - bufferMins;
  const normalized = ((totalMins % 1440) + 1440) % 1440;
  const arrH = Math.floor(normalized / 60);
  const arrM = normalized % 60;
  const period = arrH >= 12 ? 'PM' : 'AM';
  const displayH = arrH % 12 || 12;
  return `${displayH}:${String(arrM).padStart(2, '0')} ${period}`;
}

function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') >= today;
}

function rsvpDeadlineLabel(lockAt: string): string {
  const lock = new Date(lockAt);
  const now = new Date();
  const diffMs = lock.getTime() - now.getTime();
  if (diffMs <= 0) return 'RSVP closed';
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffH >= 48) return `Closes in ${Math.floor(diffH / 24)}d`;
  if (diffH > 0) return `Closes in ${diffH}h ${diffM}m`;
  return `Closes in ${diffM}m`;
}

export default function EventDetailScreen() {
  const { primaryColor, rgba } = useClub();
  const { eventId, clubSlug } = useLocalSearchParams<{ eventId: string; clubSlug: string }>();
  const { team, loading: teamLoading } = useTeam();
  const { profile } = useAuth();
  const router = useRouter();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<RsvpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'details' | 'availability'>('details');
  const [activeRsvpTab, setActiveRsvpTab] = useState<'attending' | 'not_attending' | 'none'>('attending');
  const [deleting, setDeleting] = useState(false);
  const [matchStats, setMatchStats] = useState<MatchStatRow[] | null>(null);
  const [matchTrackerOpen, setMatchTrackerOpen] = useState(false);

  // Cancellation modal state
  type CancelStep = 'reason' | 'preview';
  const [cancelVisible, setCancelVisible]   = useState(false);
  const [cancelStep, setCancelStep]         = useState<CancelStep>('reason');
  const [cancelReason, setCancelReason]     = useState('');
  const [cancelSubject, setCancelSubject]   = useState('');
  const [cancelBody, setCancelBody]         = useState('');
  const [cancelGenerating, setCancelGenerating] = useState(false);
  const [cancelSending, setCancelSending]   = useState(false);
  const [cancelEditMode, setCancelEditMode] = useState(false);
  const [isUncancel, setIsUncancel]         = useState(false);

  const isCoach = profile?.role === 'org_admin' || profile?.role === 'coach';
  const mapApp = useMapApp();

  useEffect(() => {
    if (teamLoading || !team || !profile || !eventId) return;
    load();
  }, [team?.id, teamLoading, profile?.id, eventId]);

  async function load() {
    if (!team || !profile || !eventId) return;

    const [eventRes, playersRes, rsvpsRes, playerRes, sessionRes] = await Promise.all([
      supabase.from('events')
        .select('id,title,type,event_date,event_time,location,address,lat,lng,duration_minutes,arrival_buffer_minutes,field_type,field_notes,uniform,notes,coach_notes,rsvp_lock_at,cancelled_at,cancellation_reason')
        .eq('id', eventId).single(),
      supabase.from('players').select('id,full_name,jersey_number,position')
        .eq('team_id', team.id).order('jersey_number'),
      supabase.from('event_rsvps').select('player_id,status').eq('event_id', eventId),
      supabase.from('players').select('id').eq('team_id', team.id)
        .eq('profile_id', profile.id).maybeSingle(),
      supabase.from('game_sessions').select('id')
        .eq('event_id', eventId).eq('status', 'full_time').maybeSingle(),
    ]);

    setEvent(eventRes.data as unknown as EventDetail);
    setPlayers((playersRes.data ?? []) as Player[]);
    setRsvps((rsvpsRes.data ?? []) as RsvpRow[]);

    const pid = (playerRes.data as any)?.id ?? null;
    setMyPlayerId(pid);
    if (pid) {
      const mine = (rsvpsRes.data ?? []).find((r: any) => r.player_id === pid);
      setMyStatus((mine?.status as RsvpStatus) ?? null);
    }

    // Load match stats if game is complete
    const sessionId = (sessionRes.data as any)?.id ?? null;
    if (sessionId) {
      const { data: periodsData } = await supabase
        .from('player_match_periods')
        .select('player_id, on_at, off_at')
        .eq('event_id', eventId);

      const totals = new Map<string, number>();
      for (const p of periodsData ?? []) {
        if (!p.off_at) continue;
        const secs = Math.max(0, (new Date(p.off_at).getTime() - new Date(p.on_at).getTime()) / 1000);
        totals.set(p.player_id, (totals.get(p.player_id) ?? 0) + secs);
      }

      const attendingIds = new Set(
        (rsvpsRes.data ?? [])
          .filter((r: any) => r.status === 'attending')
          .map((r: any) => r.player_id as string),
      );

      const allPlayers = (playersRes.data ?? []) as Player[];
      const stats: MatchStatRow[] = allPlayers
        .map((p) => ({ ...p, seconds: totals.get(p.id) ?? 0 }))
        .filter((p) => p.seconds > 0 || attendingIds.has(p.id))
        .sort((a, b) => b.seconds - a.seconds);

      if (stats.length > 0) setMatchStats(stats);
    }

    setLoading(false);
  }

  async function handleRsvp(status: RsvpStatus) {
    if (!myPlayerId || !eventId) return;
    setRsvpSaving(true);

    if (myStatus === status) {
      await supabase.from('event_rsvps').delete()
        .eq('event_id', eventId).eq('player_id', myPlayerId);
      setMyStatus(null);
      setRsvps((prev) => prev.filter((r) => r.player_id !== myPlayerId));
    } else {
      await supabase.from('event_rsvps').upsert(
        { event_id: eventId, player_id: myPlayerId, responded_by: profile?.id, status },
        { onConflict: 'event_id,player_id' }
      );
      setMyStatus(status);
      setRsvps((prev) => {
        const filtered = prev.filter((r) => r.player_id !== myPlayerId);
        return [...filtered, { player_id: myPlayerId, status }];
      });
    }
    setRsvpSaving(false);
  }

  function handleCoachOverride(playerId: string, playerName: string, currentStatus: RsvpStatus | null) {
    if (!eventId) return;
    const options = ['✅ Mark as Going', '❌ Mark as Can\'t go'];
    if (currentStatus !== null) options.push('⬜ Clear RSVP');
    options.push('Cancel');

    Alert.alert(
      playerName,
      'Override RSVP for this player',
      [
        {
          text: '✅ Going',
          onPress: () => applyOverride(playerId, 'attending'),
        },
        {
          text: "❌ Can't go",
          onPress: () => applyOverride(playerId, 'not_attending'),
        },
        ...(currentStatus !== null ? [{
          text: '⬜ Clear RSVP',
          onPress: () => clearOverride(playerId),
        }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  }

  async function applyOverride(playerId: string, status: RsvpStatus) {
    if (!eventId) return;
    await supabase.from('event_rsvps').upsert(
      { event_id: eventId, player_id: playerId, responded_by: profile?.id, status },
      { onConflict: 'event_id,player_id' }
    );
    setRsvps((prev) => [...prev.filter((r) => r.player_id !== playerId), { player_id: playerId, status }]);
  }

  async function clearOverride(playerId: string) {
    if (!eventId) return;
    await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('player_id', playerId);
    setRsvps((prev) => prev.filter((r) => r.player_id !== playerId));
  }

  function openEdit() {
    if (!event) return;
    router.push(`/(app)/${clubSlug}/edit-event/${event.id}` as any);
  }

  function openLineup() {
    if (!event) return;
    router.push(`/(app)/${clubSlug}/admin/events/${event.id}/lineup` as any);
  }

  async function openMatchTracker() {
    if (!event) return;
    const { data: lineup } = await supabase
      .from('lineups').select('id').eq('event_id', event.id).limit(1).maybeSingle();
    if (!lineup) {
      Alert.alert(
        'Complete your lineup first',
        'Set up the lineup before opening the Match Tracker.',
        [
          { text: 'Go to Lineup Builder', onPress: openLineup },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }
    setMatchTrackerOpen(true);
  }

  function confirmDelete() {
    Alert.alert('Delete Event', `Delete "${event?.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: handleDelete },
    ]);
  }

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    await supabase.from('events').delete().eq('id', event.id);
    router.back();
  }

  function openCancelModal(uncancel = false) {
    setCancelReason('');
    setCancelSubject('');
    setCancelBody('');
    setCancelStep('reason');
    setCancelEditMode(false);
    setIsUncancel(uncancel);
    setCancelVisible(true);
  }

  async function handleGenerateEmail() {
    if (!cancelReason.trim() || !event) return;
    setCancelGenerating(true);
    const { data, error } = await supabase.functions.invoke('generate-cancellation-email', {
      body: {
        mode: 'generate',
        is_reinstatement: isUncancel,
        event_title: event.title,
        event_date: formatDay(event.event_date),
        event_time: event.event_time ?? null,
        event_type: event.type,
        team_name: team?.name ?? 'your team',
        reason: cancelReason.trim(),
      },
    });
    setCancelGenerating(false);
    if (error || !data?.subject) {
      Alert.alert('AI unavailable', 'Could not generate email. Check your connection and try again.');
      return;
    }
    setCancelSubject(data.subject);
    setCancelBody(data.body);
    setCancelStep('preview');
  }

  async function handleConfirmCancel() {
    if (!event || !team) return;
    setCancelSending(true);
    const { error } = await supabase.functions.invoke('generate-cancellation-email', {
      body: {
        mode: isUncancel ? 'confirm_uncancel' : 'confirm',
        event_id: event.id,
        team_id: team.id,
        reason: cancelReason.trim(),
        email_subject: cancelSubject,
        email_body: cancelBody,
        coach_name: profile?.full_name ?? 'Coach',
        team_name: team.name,
      },
    });
    setCancelSending(false);
    if (error) {
      Alert.alert('Error', `Could not ${isUncancel ? 'reinstate' : 'cancel'} the event. Please try again.`);
      return;
    }
    setCancelVisible(false);
    setEvent((prev) => prev
      ? { ...prev, cancelled_at: isUncancel ? null : new Date().toISOString() }
      : prev
    );
    Alert.alert(
      isUncancel ? 'Event reinstated' : 'Event cancelled',
      isUncancel ? 'Parents have been notified — the event is back on.' : 'Parents have been notified by email.'
    );
  }

  function openMaps() {
    if (!event) return;
    mapApp.open({
      query: event.address ?? event.location ?? '',
      lat: event.lat,
      lng: event.lng,
    });
  }

  if (teamLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Event not found.</Text>
      </View>
    );
  }

  const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.other;
  const upcoming = isUpcoming(event.event_date);

  const rsvpMap = new Map(rsvps.map((r) => [r.player_id, r.status]));
  const attending = players.filter((p) => rsvpMap.get(p.id) === 'attending');
  const notAttending = players.filter((p) => rsvpMap.get(p.id) === 'not_attending');
  const noResponse = players.filter((p) => !rsvpMap.has(p.id));
  const rsvpTabData = activeRsvpTab === 'attending' ? attending
    : activeRsvpTab === 'not_attending' ? notAttending
    : noResponse;

  const confirmedPct = players.length > 0 ? attending.length / players.length : 0;
  const maxStatSeconds = matchStats ? Math.max(...matchStats.map((p) => p.seconds)) : 0;
  const hasLocation = !!(event.location || event.address);
  const hasMap = !!(event.lat || event.address);
  const hasFieldInfo = !!event.field_notes;
  const rsvpClosed = event.rsvp_lock_at ? new Date(event.rsvp_lock_at) <= new Date() : false;
  const deadlineLabel = event.rsvp_lock_at ? rsvpDeadlineLabel(event.rsvp_lock_at) : null;

  function switchToAvailability(tab: 'attending' | 'not_attending' | 'none') {
    setActiveRsvpTab(tab);
    setActiveMainTab('availability');
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={DUGOUT_COLORS.ui.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Details</Text>
        {isCoach ? (
          <TouchableOpacity style={styles.backBtn} onPress={openEdit} disabled={deleting}>
            <Ionicons name="pencil-outline" size={20} color={primaryColor} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Main tab bar — coaches only */}
      {isCoach && (
        <View style={styles.mainTabBar}>
          <TouchableOpacity
            style={[styles.mainTab, activeMainTab === 'details' && [styles.mainTabActive, { borderBottomColor: primaryColor }]]}
            onPress={() => setActiveMainTab('details')}
          >
            <Text style={[styles.mainTabText, activeMainTab === 'details' && [styles.mainTabTextActive, { color: primaryColor }]]}>
              Details
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainTab, activeMainTab === 'availability' && [styles.mainTabActive, { borderBottomColor: primaryColor }]]}
            onPress={() => setActiveMainTab('availability')}
          >
            <Text style={[styles.mainTabText, activeMainTab === 'availability' && [styles.mainTabTextActive, { color: primaryColor }]]}>
              Availability
            </Text>
            {players.length > 0 && (
              <View style={[
                styles.mainTabBadge,
                activeMainTab === 'availability' && [styles.mainTabBadgeActive, { backgroundColor: rgba(0.15) }],
              ]}>
                <Text style={[
                  styles.mainTabBadgeText,
                  activeMainTab === 'availability' && [styles.mainTabBadgeTextActive, { color: primaryColor }],
                ]}>
                  {attending.length}/{players.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Details tab ── */}
      {activeMainTab === 'details' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Cancelled banner */}
          {event.cancelled_at && (
            <View style={styles.cancelledBanner}>
              <Ionicons name="close-circle" size={18} color="#ef4444" />
              <Text style={styles.cancelledBannerText}>This event has been cancelled</Text>
            </View>
          )}

          {/* Type badge + title */}
          <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.typeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={[styles.title, event.cancelled_at ? styles.titleCancelled : null]}>{event.title}</Text>

          {/* ── Event meta card ── */}
          <View style={styles.metaCard}>

            {/* Date + time */}
            <View style={styles.metaRow}>
              <View style={styles.metaIconWrap}>
                <Ionicons name="calendar-outline" size={17} color={DUGOUT_COLORS.ui.muted} />
              </View>
              <View style={styles.metaTextBlock}>
                <Text style={styles.metaPrimary}>{formatDay(event.event_date)}</Text>
                {event.event_time && (
                  <Text style={styles.metaSecondary}>
                    {formatTime(event.event_time)}
                    {event.duration_minutes
                      ? ` – ${computeEndTime(event.event_time, event.duration_minutes)}`
                      : ''}
                  </Text>
                )}
              </View>
            </View>

            {/* Arrive by */}
            {event.arrival_buffer_minutes != null && event.event_time && (
              <>
                <View style={styles.metaDivider} />
                <View style={styles.metaRow}>
                  <View style={styles.metaIconWrap}>
                    <Ionicons name="walk-outline" size={17} color={DUGOUT_COLORS.ui.muted} />
                  </View>
                  <View style={styles.metaTextBlock}>
                    <Text style={styles.metaLabel}>Arrive by</Text>
                    <Text style={styles.metaPrimary}>
                      {computeArriveBy(event.event_time, event.arrival_buffer_minutes)}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Location */}
            {hasLocation && (
              <>
                <View style={styles.metaDivider} />
                <TouchableOpacity style={styles.metaRow} onPress={openMaps} activeOpacity={0.7}>
                  <View style={styles.metaIconWrap}>
                    <Ionicons name="location-outline" size={17} color={DUGOUT_COLORS.ui.muted} />
                  </View>
                  <View style={[styles.metaTextBlock, { flex: 1 }]}>
                    <Text style={[styles.metaPrimary, { color: primaryColor }]} numberOfLines={2}>
                      {event.location ?? event.address}
                    </Text>
                    {event.address && event.location && event.address !== event.location && (
                      <Text style={styles.metaSecondary} numberOfLines={1}>{event.address}</Text>
                    )}
                  </View>
                  <Ionicons name="open-outline" size={14} color={primaryColor} />
                </TouchableOpacity>
              </>
            )}

            {/* Satellite map — edge-to-edge within card */}
            {hasMap && (
              <LocationMap
                lat={event.lat}
                lng={event.lng}
                address={event.address ?? event.location}
                onPress={openMaps}
              />
            )}

            {/* Field info */}
            {hasFieldInfo && (
              <>
                {!hasMap && <View style={styles.metaDivider} />}
                <View style={styles.metaRow}>
                  <View style={styles.metaIconWrap}>
                    <Ionicons name="layers-outline" size={17} color={DUGOUT_COLORS.ui.muted} />
                  </View>
                  <Text style={styles.metaPrimary}>{event.field_notes}</Text>
                </View>
              </>
            )}

            {/* Uniform / kit */}
            {event.uniform && (
              <>
                <View style={styles.metaDivider} />
                <View style={styles.metaRow}>
                  <View style={styles.metaIconWrap}>
                    <Ionicons name="shirt-outline" size={17} color={DUGOUT_COLORS.ui.muted} />
                  </View>
                  <View style={[styles.uniformChip, { backgroundColor: rgba(0.12), borderColor: rgba(0.25) }]}>
                    <Text style={[styles.uniformChipText, { color: primaryColor }]}>
                      {event.uniform.charAt(0).toUpperCase() + event.uniform.slice(1)} kit
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Surface */}
            {event.field_type && (
              <>
                <View style={styles.metaDivider} />
                <View style={styles.metaRow}>
                  <View style={styles.metaIconWrap}>
                    <Ionicons name="football-outline" size={17} color={DUGOUT_COLORS.ui.muted} />
                  </View>
                  <View style={[styles.uniformChip, {
                    backgroundColor: event.field_type === 'turf' ? 'rgba(59,130,246,0.12)' : rgba(0.10),
                  }]}>
                    <Text style={[styles.uniformChipText, {
                      color: event.field_type === 'turf' ? '#3B82F6' : primaryColor,
                    }]}>
                      {event.field_type === 'turf' ? 'Turf' : 'Grass'}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Team message */}
          {event.notes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Team Message</Text>
              <View style={styles.notesBox}>
                <Text style={styles.notesText}>{event.notes}</Text>
              </View>
            </View>
          )}

          {/* Coach notes */}
          {isCoach && event.coach_notes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Coach Notes</Text>
              <View style={[styles.notesBox, styles.coachNotesBox]}>
                <View style={styles.coachNotesHeader}>
                  <Ionicons name="lock-closed-outline" size={13} color={DUGOUT_COLORS.ui.muted} />
                  <Text style={styles.coachOnlyTag}>Coach only</Text>
                </View>
                <Text style={styles.notesText}>{event.coach_notes}</Text>
              </View>
            </View>
          )}

          {/* Parent RSVP */}
          {!isCoach && myPlayerId && upcoming && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Your RSVP</Text>
                {deadlineLabel && (
                  <Text style={[styles.deadlineLabel, rsvpClosed && styles.deadlineLabelClosed]}>
                    {deadlineLabel}
                  </Text>
                )}
              </View>
              {myStatus && (
                <View style={[
                  styles.statusChip,
                  { backgroundColor: myStatus === 'attending' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }
                ]}>
                  <Ionicons
                    name={myStatus === 'attending' ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={myStatus === 'attending' ? DUGOUT_COLORS.rsvp.attending : DUGOUT_COLORS.rsvp.not_attending}
                  />
                  <Text style={[
                    styles.statusChipText,
                    { color: myStatus === 'attending' ? DUGOUT_COLORS.rsvp.attending : DUGOUT_COLORS.rsvp.not_attending }
                  ]}>
                    {myStatus === 'attending' ? "You're going" : "You can't make it"}
                  </Text>
                </View>
              )}
              {!rsvpClosed && (
                <View style={styles.rsvpRow}>
                  <TouchableOpacity
                    style={[styles.rsvpBtn, myStatus === 'attending' && styles.rsvpBtnGoing]}
                    onPress={() => handleRsvp('attending')}
                    disabled={rsvpSaving}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={16}
                      color={myStatus === 'attending' ? '#000' : DUGOUT_COLORS.ui.muted}
                    />
                    {rsvpSaving && myStatus !== 'attending'
                      ? <ActivityIndicator size="small" color="#000" />
                      : <Text style={[styles.rsvpBtnText, myStatus === 'attending' && { color: '#000' }]}>Going</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rsvpBtn, myStatus === 'not_attending' && styles.rsvpBtnNotGoing]}
                    onPress={() => handleRsvp('not_attending')}
                    disabled={rsvpSaving}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={16}
                      color={myStatus === 'not_attending' ? '#fff' : DUGOUT_COLORS.ui.muted}
                    />
                    {rsvpSaving && myStatus !== 'not_attending'
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={[styles.rsvpBtnText, myStatus === 'not_attending' && { color: '#fff' }]}>Can't go</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {!isCoach && !myPlayerId && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>RSVP</Text>
              <Text style={styles.noPlayerText}>No player linked to your account. Contact your coach.</Text>
            </View>
          )}

          {/* Coach — attendance summary */}
          {isCoach && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Attendance</Text>

              {players.length > 0 && (
                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(confirmedPct * 100)}%`, backgroundColor: primaryColor }]} />
                  </View>
                  <Text style={styles.progressLabel}>
                    {attending.length} of {players.length} confirmed
                  </Text>
                </View>
              )}

              <View style={styles.summaryRow}>
                <TouchableOpacity style={styles.summaryPill} onPress={() => switchToAvailability('attending')} activeOpacity={0.7}>
                  <Text style={[styles.summaryNum, { color: DUGOUT_COLORS.rsvp.attending }]}>{attending.length}</Text>
                  <Text style={styles.summaryLabel}>Going</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.summaryPill} onPress={() => switchToAvailability('not_attending')} activeOpacity={0.7}>
                  <Text style={[styles.summaryNum, { color: DUGOUT_COLORS.rsvp.not_attending }]}>{notAttending.length}</Text>
                  <Text style={styles.summaryLabel}>Can't go</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.summaryPill} onPress={() => switchToAvailability('none')} activeOpacity={0.7}>
                  <Text style={[styles.summaryNum, { color: DUGOUT_COLORS.ui.muted }]}>{noResponse.length}</Text>
                  <Text style={styles.summaryLabel}>No reply</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.viewBreakdownBtn} onPress={() => setActiveMainTab('availability')}>
                <Text style={[styles.viewBreakdownText, { color: primaryColor }]}>View full breakdown</Text>
                <Ionicons name="chevron-forward" size={13} color={primaryColor} />
              </TouchableOpacity>
            </View>
          )}

          {/* Coach actions */}
          {isCoach && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Actions</Text>
              <TouchableOpacity style={styles.actionBtn} onPress={openLineup} activeOpacity={0.7}>
                <View style={[styles.actionBtnIcon, { backgroundColor: rgba(0.1) }]}>
                  <Ionicons name="grid-outline" size={17} color={primaryColor} />
                </View>
                <Text style={styles.actionBtnText}>Lineup Builder</Text>
                <Ionicons name="chevron-forward" size={16} color={DUGOUT_COLORS.ui.border} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnBorderTop]} onPress={openMatchTracker} activeOpacity={0.7}>
                <View style={[styles.actionBtnIcon, { backgroundColor: rgba(0.1) }]}>
                  <Ionicons name="timer-outline" size={17} color={primaryColor} />
                </View>
                <Text style={styles.actionBtnText}>Match Tracker</Text>
                <Ionicons name="chevron-forward" size={16} color={DUGOUT_COLORS.ui.border} />
              </TouchableOpacity>
            </View>
          )}

          {/* Match Stats — coach only, games only, after full_time */}
          {isCoach && matchStats && event.type === 'game' && (
            <View style={styles.section}>
              <View style={styles.statsSectionHeader}>
                <Text style={styles.sectionTitle}>Match Stats</Text>
                <View style={styles.coachOnlyChip}>
                  <Ionicons name="lock-closed-outline" size={11} color={DUGOUT_COLORS.ui.muted} />
                  <Text style={styles.coachOnlyTag}>Coach only</Text>
                </View>
              </View>
              <View style={styles.playerCard}>
                {matchStats.map((p, i) => {
                  const pct = maxStatSeconds > 0 ? p.seconds / maxStatSeconds : 0;
                  const mins = Math.floor(p.seconds / 60);
                  const label = p.seconds < 60 ? `<1'` : `${mins}'`;
                  return (
                    <View key={p.id}>
                      {i > 0 && <View style={styles.playerDivider} />}
                      <View style={styles.statRow}>
                        <View style={styles.jerseyBadge}>
                          <Text style={styles.jerseyNum}>{p.jersey_number ?? '—'}</Text>
                        </View>
                        <View style={styles.statInfo}>
                          <View style={styles.statNameRow}>
                            <Text style={styles.playerName}>{p.full_name}</Text>
                            <Text style={styles.statMins}>{label}</Text>
                          </View>
                          <View style={styles.statBarTrack}>
                            <View style={[styles.statBarFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: primaryColor }]} />
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Danger zone */}
          {isCoach && (
            <View style={styles.dangerSection}>
              {event.cancelled_at && (
                <TouchableOpacity style={styles.dangerCard} onPress={() => openCancelModal(true)} activeOpacity={0.7}>
                  <View style={[styles.dangerCardIcon, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                    <Ionicons name="refresh-circle-outline" size={20} color="#22c55e" />
                  </View>
                  <View style={styles.dangerCardText}>
                    <Text style={[styles.dangerCardTitle, { color: '#22c55e' }]}>Reinstate Event</Text>
                    <Text style={styles.dangerCardSub}>AI writes an "event is back on" email to parents</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={DUGOUT_COLORS.ui.border} />
                </TouchableOpacity>
              )}
              {!event.cancelled_at && (
                <TouchableOpacity style={[styles.dangerCard, event.cancelled_at ? styles.dangerCardBorderTop : undefined]} onPress={() => openCancelModal()} activeOpacity={0.7}>
                  <View style={styles.dangerCardIcon}>
                    <Ionicons name="close-circle-outline" size={20} color="#f97316" />
                  </View>
                  <View style={styles.dangerCardText}>
                    <Text style={styles.dangerCardTitle}>Cancel Event</Text>
                    <Text style={styles.dangerCardSub}>AI writes a cancellation email to all parents</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={DUGOUT_COLORS.ui.border} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.dangerCard, !event.cancelled_at && styles.dangerCardBorderTop]}
                onPress={confirmDelete}
                disabled={deleting}
                activeOpacity={0.7}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={DUGOUT_COLORS.status.error} style={{ marginRight: 12 }} />
                ) : (
                  <View style={[styles.dangerCardIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Ionicons name="trash-outline" size={20} color={DUGOUT_COLORS.status.error} />
                  </View>
                )}
                <View style={styles.dangerCardText}>
                  <Text style={[styles.dangerCardTitle, { color: DUGOUT_COLORS.status.error }]}>Delete Event</Text>
                  <Text style={styles.dangerCardSub}>Permanently removes this event</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <MapPickerModal
        visible={mapApp.showPicker}
        onConfirm={mapApp.confirm}
        onDismiss={mapApp.dismiss}
      />

      {/* ── Cancellation modal ── */}
      <Modal visible={cancelVisible} transparent animationType="slide" onRequestClose={() => setCancelVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKAV}>
            <View style={styles.modalSheet}>

              {/* Header */}
              <View style={styles.modalHeader}>
                {cancelStep === 'preview' ? (
                  <TouchableOpacity onPress={() => setCancelStep('reason')} style={styles.modalBackBtn}>
                    <Ionicons name="chevron-back" size={20} color={DUGOUT_COLORS.ui.textSecondary} />
                    <Text style={styles.modalBackText}>Back</Text>
                  </TouchableOpacity>
                ) : <View style={{ width: 60 }} />}
                <Text style={styles.modalTitle}>
                  {isUncancel
                    ? (cancelStep === 'reason' ? 'Reinstate Event' : 'Review Email')
                    : (cancelStep === 'reason' ? 'Cancel Event' : 'Review Email')}
                </Text>
                <TouchableOpacity onPress={() => setCancelVisible(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={DUGOUT_COLORS.ui.textSecondary} />
                </TouchableOpacity>
              </View>

              {cancelStep === 'reason' ? (
                /* ── Step 1: Reason ── */
                <>
                  <Text style={styles.modalHint}>
                    {isUncancel
                      ? "What's changed? AI will write an upbeat \"event is back on\" email to all parents."
                      : 'Type your reason below — AI will write a professional email to parents automatically.'}
                  </Text>
                  <TextInput
                    style={styles.modalTextArea}
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    placeholder="e.g. Field is waterlogged due to heavy rain overnight"
                    placeholderTextColor={DUGOUT_COLORS.ui.muted}
                    multiline
                    textAlignVertical="top"
                    autoFocus
                    returnKeyType="default"
                  />
                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, { backgroundColor: '#f97316' }, (!cancelReason.trim() || cancelGenerating) && { opacity: 0.4 }]}
                    onPress={handleGenerateEmail}
                    disabled={!cancelReason.trim() || cancelGenerating}
                  >
                    {cancelGenerating
                      ? <><ActivityIndicator size="small" color="#fff" /><Text style={styles.modalPrimaryBtnText}>Writing email…</Text></>
                      : <><Ionicons name="sparkles" size={16} color="#fff" /><Text style={styles.modalPrimaryBtnText}>{isUncancel ? 'Write reinstatement email' : 'Write cancellation email'}</Text></>
                    }
                  </TouchableOpacity>
                </>
              ) : (
                /* ── Step 2: Preview ── */
                <>
                  <View style={styles.emailPreviewCard}>
                    <View style={styles.emailPreviewHeader}>
                      <Text style={styles.emailPreviewTo}>To: All parents</Text>
                      {!cancelEditMode && (
                        <TouchableOpacity onPress={() => setCancelEditMode(true)}>
                          <Text style={styles.emailEditLink}>Edit</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {cancelEditMode ? (
                      <>
                        <TextInput
                          style={styles.emailSubjectInput}
                          value={cancelSubject}
                          onChangeText={setCancelSubject}
                          placeholderTextColor={DUGOUT_COLORS.ui.muted}
                        />
                        <TextInput
                          style={styles.emailBodyInput}
                          value={cancelBody}
                          onChangeText={setCancelBody}
                          multiline
                          textAlignVertical="top"
                          placeholderTextColor={DUGOUT_COLORS.ui.muted}
                        />
                      </>
                    ) : (
                      <>
                        <Text style={styles.emailSubjectPreview}>{cancelSubject}</Text>
                        <Text style={styles.emailBodyPreview}>{cancelBody}</Text>
                      </>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, { backgroundColor: isUncancel ? '#22c55e' : '#ef4444' }, cancelSending && { opacity: 0.4 }]}
                    onPress={handleConfirmCancel}
                    disabled={cancelSending}
                  >
                    {cancelSending
                      ? <><ActivityIndicator size="small" color="#fff" /><Text style={styles.modalPrimaryBtnText}>Cancelling event…</Text></>
                      : <><Ionicons name="send" size={15} color="#fff" /><Text style={styles.modalPrimaryBtnText}>{isUncancel ? 'Reinstate event & notify parents' : 'Cancel event & notify parents'}</Text></>
                    }
                  </TouchableOpacity>
                </>
              )}

            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Availability tab (coaches only) ── */}
      {activeMainTab === 'availability' && isCoach && (
        <View style={{ flex: 1 }}>

          {/* Stats header */}
          <View style={styles.availHeader}>
            <View style={styles.availStats}>
              <View style={styles.availStat}>
                <Text style={[styles.availStatNum, { color: DUGOUT_COLORS.rsvp.attending }]}>{attending.length}</Text>
                <Text style={styles.availStatLabel}>Going</Text>
              </View>
              <View style={styles.availStatDivider} />
              <View style={styles.availStat}>
                <Text style={[styles.availStatNum, { color: DUGOUT_COLORS.rsvp.not_attending }]}>{notAttending.length}</Text>
                <Text style={styles.availStatLabel}>Can't go</Text>
              </View>
              <View style={styles.availStatDivider} />
              <View style={styles.availStat}>
                <Text style={[styles.availStatNum, { color: DUGOUT_COLORS.ui.muted }]}>{noResponse.length}</Text>
                <Text style={styles.availStatLabel}>Pending</Text>
              </View>
            </View>
            {players.length > 0 && (
              <View style={styles.availProgressTrack}>
                <View style={[styles.availProgressFill, { width: `${Math.round(confirmedPct * 100)}%`, backgroundColor: primaryColor }]} />
              </View>
            )}
          </View>

          {/* Segmented filter */}
          <View style={styles.segmentedWrap}>
            <View style={styles.segmented}>
              {([
                { key: 'attending',     label: 'Going' },
                { key: 'not_attending', label: "Can't go" },
                { key: 'none',          label: 'Pending' },
              ] as const).map((tab, i) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.segment,
                    activeRsvpTab === tab.key && [styles.segmentActive, { backgroundColor: primaryColor }],
                    i === 2 && styles.segmentLast,
                  ]}
                  onPress={() => setActiveRsvpTab(tab.key)}
                >
                  <Text style={[styles.segmentText, activeRsvpTab === tab.key && styles.segmentTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Coach override hint */}
          <Text style={styles.overrideHint}>Tap the icon next to any player to override their RSVP</Text>

          {/* Player list */}
          <ScrollView contentContainerStyle={styles.availScroll} showsVerticalScrollIndicator={false}>
            {rsvpTabData.length === 0 ? (
              <View style={styles.emptyAvailability}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons
                    name={
                      activeRsvpTab === 'attending' ? 'checkmark-circle-outline' :
                      activeRsvpTab === 'not_attending' ? 'close-circle-outline' : 'time-outline'
                    }
                    size={26}
                    color={DUGOUT_COLORS.ui.muted}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {activeRsvpTab === 'attending' ? 'No confirmations yet' :
                   activeRsvpTab === 'not_attending' ? 'No one has declined' :
                   'All players have responded'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeRsvpTab === 'attending' ? 'Players will appear here once they RSVP going.' :
                   activeRsvpTab === 'not_attending' ? 'No players have declined this event.' :
                   'Every player on the roster has submitted their availability.'}
                </Text>
              </View>
            ) : (
              <View style={styles.playerCard}>
                {rsvpTabData.map((p, i) => (
                  <View key={p.id}>
                    {i > 0 && <View style={styles.playerDivider} />}
                    <View style={styles.playerRow}>
                      <View style={[
                        styles.jerseyBadge,
                        activeRsvpTab === 'attending' && [styles.jerseyBadgeGoing, { backgroundColor: rgba(0.12) }],
                        activeRsvpTab === 'not_attending' && styles.jerseyBadgeNotGoing,
                      ]}>
                        <Text style={[
                          styles.jerseyNum,
                          activeRsvpTab === 'attending' && { color: DUGOUT_COLORS.rsvp.attending },
                          activeRsvpTab === 'not_attending' && { color: DUGOUT_COLORS.rsvp.not_attending },
                        ]}>
                          {p.jersey_number ?? '—'}
                        </Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={styles.playerName}>{p.full_name}</Text>
                        {p.position && (
                          <Text style={styles.playerPosition}>{p.position}</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleCoachOverride(p.id, p.full_name, rsvps.find((r) => r.player_id === p.id)?.status ?? null)}
                        style={styles.overrideBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {activeRsvpTab === 'attending' && (
                          <Ionicons name="checkmark-circle" size={20} color={DUGOUT_COLORS.rsvp.attending} />
                        )}
                        {activeRsvpTab === 'not_attending' && (
                          <Ionicons name="close-circle" size={20} color={DUGOUT_COLORS.rsvp.not_attending} />
                        )}
                        {activeRsvpTab === 'none' && (
                          <Ionicons name="ellipse-outline" size={20} color={DUGOUT_COLORS.ui.muted} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}

      {/* Match Tracker — rendered as a Modal so there is no navigation swipe gesture */}
      <Modal
        visible={matchTrackerOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setMatchTrackerOpen(false)}
      >
        {event && (
          <MatchTrackerContent
            eventId={event.id}
            clubSlug={clubSlug!}
            onClose={() => setMatchTrackerOpen(false)}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DUGOUT_COLORS.ui.background },
  errorText: { color: DUGOUT_COLORS.ui.textSecondary, fontSize: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: DUGOUT_COLORS.ui.text },

  mainTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.background,
  },
  mainTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 13,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  mainTabActive: { borderBottomColor: DUGOUT_COLORS.brand.green },
  mainTabText: { fontSize: 14, fontWeight: '600', color: DUGOUT_COLORS.ui.muted },
  mainTabTextActive: { color: DUGOUT_COLORS.brand.green },
  mainTabBadge: {
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
  },
  mainTabBadgeActive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  mainTabBadgeText: { fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.ui.textSecondary },
  mainTabBadgeTextActive: { color: DUGOUT_COLORS.brand.green },

  scroll: { padding: 20 },

  typeBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, marginBottom: 10,
  },
  typeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  title: { fontSize: 26, fontWeight: '800', color: DUGOUT_COLORS.ui.text, lineHeight: 32, marginBottom: 18 },

  // Meta card
  metaCard: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16, overflow: 'hidden', marginBottom: 24,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  metaIconWrap: { width: 22, alignItems: 'center', paddingTop: 1 },
  metaTextBlock: { gap: 3 },
  metaPrimary: { fontSize: 15, fontWeight: '600', color: DUGOUT_COLORS.ui.text },
  metaSecondary: { fontSize: 13, color: DUGOUT_COLORS.ui.muted },
  metaLabel: {
    fontSize: 10, fontWeight: '700', color: DUGOUT_COLORS.ui.muted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 1,
  },
  metaDivider: { height: 1, backgroundColor: DUGOUT_COLORS.ui.border, marginHorizontal: 16 },

  uniformChip: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
    paddingHorizontal: 11, paddingVertical: 4, borderRadius: 20,
    alignSelf: 'flex-start',
  },
  uniformChipText: { fontSize: 13, fontWeight: '700', color: DUGOUT_COLORS.brand.green },

  divider: { height: 1, backgroundColor: DUGOUT_COLORS.ui.border, marginVertical: 20 },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: DUGOUT_COLORS.ui.muted,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  deadlineLabel: { fontSize: 12, fontWeight: '600', color: DUGOUT_COLORS.ui.muted },
  deadlineLabelClosed: { color: DUGOUT_COLORS.status.error },

  notesBox: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 12, padding: 14,
  },
  coachNotesBox: { borderColor: 'rgba(156,163,175,0.25)', backgroundColor: 'rgba(156,163,175,0.05)' },
  coachNotesHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  coachOnlyTag: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, fontWeight: '600', fontStyle: 'italic' },
  notesText: { fontSize: 14, color: DUGOUT_COLORS.ui.text, lineHeight: 21 },

  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, marginBottom: 14,
  },
  statusChipText: { fontSize: 14, fontWeight: '600' },

  rsvpRow: { flexDirection: 'row', gap: 10 },
  rsvpBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.surface,
  },
  rsvpBtnGoing: { backgroundColor: DUGOUT_COLORS.rsvp.attending, borderColor: DUGOUT_COLORS.rsvp.attending },
  rsvpBtnNotGoing: { backgroundColor: DUGOUT_COLORS.rsvp.not_attending, borderColor: DUGOUT_COLORS.rsvp.not_attending },
  rsvpBtnText: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.textSecondary },

  noPlayerText: { color: DUGOUT_COLORS.ui.muted, fontSize: 14 },

  // Attendance summary
  progressWrap: { marginBottom: 14 },
  progressTrack: {
    height: 4, backgroundColor: DUGOUT_COLORS.ui.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6,
  },
  progressFill: { height: '100%', backgroundColor: DUGOUT_COLORS.brand.green, borderRadius: 2 },
  progressLabel: { fontSize: 12, color: DUGOUT_COLORS.ui.muted, fontWeight: '500' },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryPill: {
    flex: 1, backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  summaryNum: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, marginTop: 3 },

  viewBreakdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  viewBreakdownText: { fontSize: 13, fontWeight: '600', color: DUGOUT_COLORS.brand.green },

  // Actions
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 12, padding: 14,
  },
  actionBtnBorderTop: { marginTop: 8 },
  actionBtnIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: 'rgba(34,197,94,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: DUGOUT_COLORS.ui.text },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.07)',
  },
  deleteBtnText: { color: DUGOUT_COLORS.status.error, fontWeight: '700', fontSize: 15 },

  // Availability tab
  availHeader: {
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
    backgroundColor: DUGOUT_COLORS.ui.surface,
  },
  availStats: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  availStat: { flex: 1, alignItems: 'center', gap: 3 },
  availStatNum: { fontSize: 28, fontWeight: '800' },
  availStatLabel: { fontSize: 12, color: DUGOUT_COLORS.ui.muted },
  availStatDivider: { width: 1, height: 36, backgroundColor: DUGOUT_COLORS.ui.border },
  availProgressTrack: {
    height: 4, backgroundColor: DUGOUT_COLORS.ui.border, borderRadius: 2, overflow: 'hidden',
  },
  availProgressFill: { height: '100%', backgroundColor: DUGOUT_COLORS.brand.green, borderRadius: 2 },

  segmentedWrap: { paddingHorizontal: 20, paddingVertical: 14 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 10, overflow: 'hidden',
  },
  segment: {
    flex: 1, paddingVertical: 9, alignItems: 'center',
    borderRightWidth: 1, borderRightColor: DUGOUT_COLORS.ui.border,
  },
  segmentLast: { borderRightWidth: 0 },
  segmentActive: { backgroundColor: DUGOUT_COLORS.brand.green },
  segmentText: { fontSize: 13, fontWeight: '600', color: DUGOUT_COLORS.ui.muted },
  segmentTextActive: { color: '#000' },

  availScroll: { paddingHorizontal: 20, paddingTop: 4 },

  emptyAvailability: { alignItems: 'center', paddingVertical: 52, gap: 10 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.textSecondary },
  emptySubtitle: { fontSize: 13, color: DUGOUT_COLORS.ui.muted, textAlign: 'center', maxWidth: 260, lineHeight: 19 },

  playerCard: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 14, overflow: 'hidden',
  },
  playerDivider: { height: 1, backgroundColor: DUGOUT_COLORS.ui.border },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  jerseyBadge: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  jerseyBadgeGoing: { backgroundColor: 'rgba(34,197,94,0.12)' },
  jerseyBadgeNotGoing: { backgroundColor: 'rgba(239,68,68,0.12)' },
  jerseyNum: { fontSize: 12, fontWeight: '800', color: DUGOUT_COLORS.ui.muted },
  playerInfo: { flex: 1, gap: 2 },
  playerName: { fontSize: 15, fontWeight: '600', color: DUGOUT_COLORS.ui.text },
  playerPosition: { fontSize: 12, color: DUGOUT_COLORS.ui.muted },
  overrideBtn: { padding: 2 },
  overrideHint: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, textAlign: 'center', paddingHorizontal: 16, paddingBottom: 8 },

  // Match stats
  statsSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  coachOnlyChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: 14,
  },
  statInfo: { flex: 1, gap: 6 },
  statNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statMins: { fontSize: 14, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  statBarTrack: {
    height: 4, backgroundColor: DUGOUT_COLORS.ui.border, borderRadius: 2, overflow: 'hidden',
  },
  statBarFill: { height: '100%', borderRadius: 2 },

  // Cancelled banner
  cancelledBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
  },
  cancelledBannerText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
  titleCancelled: { textDecorationLine: 'line-through', opacity: 0.5 },

  // Danger zone section
  dangerSection: {
    marginTop: 32, marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16, overflow: 'hidden',
  },
  dangerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: DUGOUT_COLORS.ui.surface,
  },
  dangerCardBorderTop: { borderTopWidth: 1, borderTopColor: DUGOUT_COLORS.ui.border },
  dangerCardIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(249,115,22,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  dangerCardText: { flex: 1 },
  dangerCardTitle: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  dangerCardSub: { fontSize: 12, color: DUGOUT_COLORS.ui.muted, marginTop: 1 },

  // Cancellation modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalKAV: { justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, marginBottom: 4,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: DUGOUT_COLORS.ui.text },
  modalBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 60 },
  modalBackText: { fontSize: 15, color: DUGOUT_COLORS.ui.textSecondary },
  modalCloseBtn: { width: 60, alignItems: 'flex-end' },
  modalHint: { fontSize: 14, color: DUGOUT_COLORS.ui.textSecondary, marginBottom: 16, lineHeight: 20 },
  modalTextArea: {
    backgroundColor: DUGOUT_COLORS.ui.background, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 14, padding: 14, color: DUGOUT_COLORS.ui.text, fontSize: 15,
    minHeight: 110, marginBottom: 16, textAlignVertical: 'top',
  },
  modalPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  modalPrimaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Email preview card
  emailPreviewCard: {
    backgroundColor: DUGOUT_COLORS.ui.background, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 14, padding: 16, marginBottom: 16,
  },
  emailPreviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  emailPreviewTo: { fontSize: 12, color: DUGOUT_COLORS.ui.muted, fontWeight: '600' },
  emailEditLink: { fontSize: 13, color: '#f97316', fontWeight: '700' },
  emailSubjectPreview: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text, marginBottom: 10 },
  emailBodyPreview: { fontSize: 14, color: DUGOUT_COLORS.ui.textSecondary, lineHeight: 20 },
  emailSubjectInput: {
    fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
    paddingVertical: 8, marginBottom: 10,
  },
  emailBodyInput: {
    fontSize: 14, color: DUGOUT_COLORS.ui.textSecondary, lineHeight: 20,
    minHeight: 100, textAlignVertical: 'top',
  },
});
