import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';
import { useMapApp } from '../../../../hooks/useMapApp';
import { MapPickerModal } from '../../../../components/ui/MapPickerModal';
import { MatchTrackerContent } from '../admin/events/[eventId]/match-tracker';
import { fetchEventWeather, isWeatherForecastable, type WeatherData } from '../../../../lib/weather';
import { fetchDriveTime } from '../../../../lib/drivetime';
import { sendProfilesPush } from '../../../../lib/push';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

function LocationMap({
  lat, lng, address, onPress, onDriveTime,
}: {
  lat: number | null;
  lng: number | null;
  address: string | null;
  onPress: () => void;
  onDriveTime?: (t: string) => void;
}) {
  const { primaryColor } = useClub();
  const [drivingTime, setDrivingTime] = useState<string | null>(null);
  const [imgError, setImgError]       = useState(false);
  const [imgLoaded, setImgLoaded]     = useState(false);

  useEffect(() => {
    if (!PLACES_KEY) return;
    const dest = lat != null && lng != null ? `${lat},${lng}` : (address ?? '');
    fetchDriveTime(dest).then(t => {
      if (t) { setDrivingTime(t); onDriveTime?.(t); }
    });
  }, []);

  if (!PLACES_KEY || imgError) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={mapStyles.fallback}>
        <Ionicons name="map-outline" size={22} color={PULSE_COLORS.ui.muted} />
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
          <ActivityIndicator color={PULSE_COLORS.ui.muted} />
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
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  skeleton: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
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
    backgroundColor: PULSE_COLORS.ui.surface,
  },
  fallbackAddress: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.brand.green },
  fallbackHint: { fontSize: 12, color: PULSE_COLORS.ui.muted },
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
  video_url: string | null;
  rsvp_lock_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  home_away: 'home' | 'away' | null;
};

type Player = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  profile_id: string | null;
};

type RsvpRow = { player_id: string; status: RsvpStatus };

type MatchStatRow = Player & { seconds: number };

type GuestEntry = {
  id: string;
  player_id: string | null;
  profile_id: string | null;
  full_name: string;
  role: 'player' | 'coach';
  status: 'pending' | 'confirmed' | 'declined';
  linked_profile_id: string | null;
  team_name: string | null;
};

type GuestPlayerResult = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  profile_id: string | null;
  team_id: string;
  team_name: string;
};

type CoachResult = { id: string; full_name: string | null };

function guestStatusColor(status: GuestEntry['status']): string {
  if (status === 'confirmed') return '#22c55e';
  if (status === 'declined') return '#ef4444';
  return '#F59E0B';
}

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
  const { primaryColor, rgba, homeKitColor, awayKitColor, trainingKitColor } = useClub();
  const { eventId, clubSlug, section } = useLocalSearchParams<{ eventId: string; clubSlug: string; section?: string }>();
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
  const [nudging, setNudging] = useState(false);
  const [guests, setGuests] = useState<GuestEntry[]>([]);
  const [guestSheet, setGuestSheet] = useState<'player' | 'coach' | null>(null);
  const [guestQuery, setGuestQuery] = useState('');
  const [guestPlayerResults, setGuestPlayerResults] = useState<GuestPlayerResult[]>([]);
  const [guestCoachResults, setGuestCoachResults] = useState<CoachResult[]>([]);
  const [guestSearching, setGuestSearching] = useState(false);
  const [addingGuest, setAddingGuest] = useState<string | null>(null);
  type ClubTeamBrowse = { id: string; name: string; players: GuestPlayerResult[] };
  const [clubBrowse,       setClubBrowse]       = useState<ClubTeamBrowse[]>([]);
  const [browseLoading,    setBrowseLoading]    = useState(false);
  const [requestSheet,        setRequestSheet]        = useState(false);
  const [requestTeams,        setRequestTeams]        = useState<{ id: string; name: string; age_group: string | null }[]>([]);
  const [requestTargetId,     setRequestTargetId]     = useState('');
  const [requestTargetPlayers,setRequestTargetPlayers]= useState<GuestPlayerResult[]>([]);
  const [requestSelectedIds,  setRequestSelectedIds]  = useState<Set<string>>(new Set());
  const [requestLoadingPl,    setRequestLoadingPl]    = useState(false);
  const [requestSpots,        setRequestSpots]        = useState(1);
  const [requestNote,         setRequestNote]         = useState('');
  const [requestSending,      setRequestSending]      = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'details' | 'availability' | 'attendance'>(section === 'attendance' ? 'attendance' : 'details');
  const [attendanceMap, setAttendanceMap] = useState<Map<string, 'present' | 'absent' | 'late'>>(new Map());
  const [savingAttendance, setSavingAttendance] = useState<string | null>(null);
  const [activeRsvpTab, setActiveRsvpTab] = useState<'attending' | 'not_attending' | 'none'>('attending');
  const [deleting, setDeleting] = useState(false);
  const [matchStats, setMatchStats] = useState<MatchStatRow[] | null>(null);
  const [matchTrackerOpen, setMatchTrackerOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [driveTime, setDriveTime] = useState<string | null>(null);

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

    const [eventRes, playersRes, rsvpsRes, playerRes, sessionRes, guestsRes, attendanceRes] = await Promise.all([
      supabase.from('events')
        .select('id,title,type,event_date,event_time,location,address,lat,lng,duration_minutes,arrival_buffer_minutes,field_type,field_notes,uniform,notes,coach_notes,video_url,rsvp_lock_at,cancelled_at,cancellation_reason,home_away')
        .eq('id', eventId).single(),
      supabase.from('players').select('id,full_name,jersey_number,position,profile_id')
        .eq('team_id', team.id).order('jersey_number'),
      supabase.from('event_rsvps').select('player_id,status').eq('event_id', eventId),
      supabase.from('players').select('id').eq('team_id', team.id)
        .eq('profile_id', profile.id).maybeSingle(),
      supabase.from('game_sessions').select('id')
        .eq('event_id', eventId).eq('status', 'full_time').maybeSingle(),
      supabase.from('event_guests').select('id,player_id,profile_id,full_name,role,status').eq('event_id', eventId),
      supabase.from('event_attendance').select('player_id,status').eq('event_id', eventId),
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

    // Process guests — resolve player profile_id and team name
    await resolveAndSetGuests((guestsRes.data ?? []) as any[]);

    // Attendance records
    const attMap = new Map(
      (attendanceRes.data ?? []).map((r: any) => [r.player_id as string, r.status as 'present' | 'absent' | 'late'])
    );
    setAttendanceMap(attMap);

    // Fetch weather — pass lat/lng or address; WeatherAPI handles both
    const ev = eventRes.data as unknown as EventDetail;
    if (ev?.event_date && isWeatherForecastable(ev.event_date)) {
      const location = (ev.lat != null && ev.lng != null)
        ? `${ev.lat},${ev.lng}`
        : (ev.address ?? ev.location ?? '');
      if (location) {
        fetchEventWeather(location, ev.event_date, ev.event_time ?? null)
          .then(w => { if (w) setWeather(w); });
      }
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

  async function resolveAndSetGuests(raw: any[]) {
    const playerGuestIds = raw.filter(g => g.role === 'player' && g.player_id).map(g => g.player_id as string);
    const playerInfoMap = new Map<string, { profile_id: string | null; team_name: string | null }>();
    if (playerGuestIds.length > 0) {
      const { data: pData } = await (supabase as any)
        .from('players').select('id,profile_id,teams(name)').in('id', playerGuestIds);
      for (const p of pData ?? []) {
        playerInfoMap.set(p.id, { profile_id: p.profile_id ?? null, team_name: p.teams?.name ?? null });
      }
    }
    setGuests(raw.map(g => {
      const pInfo = g.player_id ? playerInfoMap.get(g.player_id) : null;
      return {
        id: g.id, player_id: g.player_id, profile_id: g.profile_id,
        full_name: g.full_name, role: g.role, status: g.status,
        linked_profile_id: g.role === 'player' ? (pInfo?.profile_id ?? null) : g.profile_id,
        team_name: pInfo?.team_name ?? null,
      } as GuestEntry;
    }));
  }

  useEffect(() => {
    if (guestSheet === 'player') {
      setGuestQuery(''); setGuestPlayerResults([]); setClubBrowse([]);
      loadClubBrowse();
    } else if (guestSheet === 'coach') {
      setGuestQuery(''); setGuestCoachResults([]);
    }
  }, [guestSheet]);

  async function loadClubBrowse() {
    if (!profile?.club_id || !team?.id) return;
    setBrowseLoading(true);
    const { data: teams } = await supabase.from('teams').select('id,name,age_group')
      .eq('club_id', profile.club_id).neq('id', team.id).order('name');
    const myAge = parseAge((team as any).age_group);
    const eligible = ((teams ?? []) as any[]).filter(t => parseAge(t.age_group) <= myAge);
    const otherIds = eligible.map((t: any) => t.id as string);
    if (!otherIds.length) { setClubBrowse([]); setBrowseLoading(false); return; }
    const nameMap = new Map(eligible.map((t: any) => [t.id as string, t.name as string]));
    const { data: pData } = await supabase.from('players')
      .select('id,full_name,jersey_number,position,profile_id,team_id')
      .in('team_id', otherIds).order('jersey_number');
    const grouped = new Map<string, GuestPlayerResult[]>();
    for (const p of (pData ?? []) as any[]) {
      const tid = p.team_id as string;
      if (!grouped.has(tid)) grouped.set(tid, []);
      grouped.get(tid)!.push({ ...p, team_name: nameMap.get(tid) ?? '' } as GuestPlayerResult);
    }
    setClubBrowse(
      (teams ?? []).map((t: any) => ({ id: t.id, name: t.name, players: grouped.get(t.id) ?? [] }))
        .filter((t: ClubTeamBrowse) => t.players.length > 0)
    );
    setBrowseLoading(false);
  }

  async function searchGuests(query: string) {
    if (!profile?.club_id || !team?.id || query.length < 2) {
      setGuestPlayerResults([]); setGuestCoachResults([]); return;
    }
    setGuestSearching(true);
    if (guestSheet === 'player') {
      const { data: teams } = await supabase.from('teams').select('id,name,age_group')
        .eq('club_id', profile.club_id).neq('id', team.id);
      const myAge = parseAge((team as any).age_group);
      const eligible = ((teams ?? []) as any[]).filter(t => parseAge(t.age_group) <= myAge);
      const otherIds = eligible.map((t: any) => t.id as string);
      if (!otherIds.length) { setGuestPlayerResults([]); setGuestSearching(false); return; }
      const nameMap = new Map(eligible.map((t: any) => [t.id as string, t.name as string]));
      const { data: pData } = await supabase.from('players')
        .select('id,full_name,jersey_number,position,profile_id,team_id')
        .in('team_id', otherIds).ilike('full_name', `%${query}%`).limit(20);
      setGuestPlayerResults((pData ?? []).map(p => ({ ...(p as any), team_name: nameMap.get((p as any).team_id) ?? 'Other Team' })));
    } else {
      const { data: cData } = await supabase.from('profiles')
        .select('id,full_name').eq('club_id', profile.club_id)
        .eq('role', 'coach').ilike('full_name', `%${query}%`)
        .neq('id', profile.id).limit(20);
      setGuestCoachResults((cData ?? []) as CoachResult[]);
    }
    setGuestSearching(false);
  }

  async function handleAddGuestPlayer(p: GuestPlayerResult) {
    if (!eventId || !profile || !team || !event) return;
    if (guests.some(g => g.player_id === p.id)) {
      Alert.alert('Already invited', `${p.full_name} has already been invited.`); return;
    }
    setAddingGuest(p.id);
    const { error } = await supabase.from('event_guests').insert({
      event_id: eventId, player_id: p.id, full_name: p.full_name,
      role: 'player', status: 'pending', added_by: profile.id,
    });
    if (error) { Alert.alert('Error', 'Could not add guest player.'); setAddingGuest(null); return; }
    if (p.profile_id) {
      await sendProfilesPush({
        profileIds: [p.profile_id],
        title: 'Guest invitation',
        body: `${profile.full_name ?? 'Coach'} invited ${p.full_name} to guest play for ${team.name} — ${event.title}.`,
        data: { type: 'guest_invite', event_id: eventId, club_slug: clubSlug },
      });
    }
    const { data: fresh } = await supabase.from('event_guests').select('id,player_id,profile_id,full_name,role,status').eq('event_id', eventId);
    await resolveAndSetGuests((fresh ?? []) as any[]);
    setAddingGuest(null);
    setGuestSheet(null);
  }

  async function handleAddGuestCoach(c: CoachResult) {
    if (!eventId || !profile || !team || !event) return;
    if (guests.some(g => g.profile_id === c.id)) {
      Alert.alert('Already invited', `${c.full_name} has already been invited.`); return;
    }
    setAddingGuest(c.id);
    const { error } = await supabase.from('event_guests').insert({
      event_id: eventId, profile_id: c.id, full_name: c.full_name ?? 'Coach',
      role: 'coach', status: 'pending', added_by: profile.id,
    });
    if (error) { Alert.alert('Error', 'Could not add guest coach.'); setAddingGuest(null); return; }
    if (c.id) {
      await sendProfilesPush({
        profileIds: [c.id],
        title: 'Guest coaching invitation',
        body: `You've been invited to guest coach ${team.name} — ${event.title}.`,
        data: { type: 'guest_coach_invite', event_id: eventId, club_slug: clubSlug },
      });
    }
    const { data: fresh } = await supabase.from('event_guests').select('id,player_id,profile_id,full_name,role,status').eq('event_id', eventId);
    await resolveAndSetGuests((fresh ?? []) as any[]);
    setAddingGuest(null);
    setGuestSheet(null);
  }

  async function handleGuestRespond(guestId: string, newStatus: 'confirmed' | 'declined') {
    const { error } = await supabase.from('event_guests')
      .update({ status: newStatus, responded_at: new Date().toISOString() }).eq('id', guestId);
    if (error) { Alert.alert('Error', 'Could not update your response.'); return; }
    if (newStatus === 'confirmed') {
      const g = guests.find(x => x.id === guestId);
      if (g?.player_id) {
        await supabase.from('event_rsvps').upsert(
          { event_id: eventId, player_id: g.player_id, responded_by: profile?.id, status: 'attending' },
          { onConflict: 'event_id,player_id' }
        );
      }
    }
    setGuests(prev => prev.map(g => g.id === guestId ? { ...g, status: newStatus } : g));
  }

  function handleRemoveGuest(guestId: string, name: string) {
    Alert.alert('Remove Guest', `Remove ${name} from this event?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('event_guests').delete().eq('id', guestId);
        setGuests(prev => prev.filter(g => g.id !== guestId));
      }},
    ]);
  }

  function parseAge(ag: string | null | undefined): number {
    if (!ag) return 999;
    const m = ag.match(/\d+/);
    return m ? parseInt(m[0]) : 999;
  }

  async function openRequestSheet() {
    if (!profile?.club_id || !team?.id) return;
    const { data: teams } = await supabase.from('teams').select('id,name,age_group')
      .eq('club_id', profile.club_id).neq('id', team.id).order('name');
    const myAge = parseAge((team as any).age_group);
    // Only offer teams where age ≤ current team's age (younger players can play up, not down)
    const eligible = ((teams ?? []) as { id: string; name: string; age_group: string | null }[])
      .filter(t => parseAge(t.age_group) <= myAge);
    setRequestTeams(eligible);
    setRequestTargetId(''); setRequestSelectedIds(new Set()); setRequestTargetPlayers([]);
    setRequestSpots(1); setRequestNote('');
    setRequestSheet(true);
  }

  async function loadRequestTeamPlayers(teamId: string) {
    setRequestLoadingPl(true); setRequestSelectedIds(new Set());
    const { data } = await supabase.from('players')
      .select('id,full_name,jersey_number,position,profile_id,team_id')
      .eq('team_id', teamId).order('jersey_number');
    const already = new Set(guests.map(g => g.player_id).filter(Boolean) as string[]);
    setRequestTargetPlayers(
      ((data ?? []) as any[])
        .filter(p => !already.has(p.id))
        .map(p => ({ ...p, team_name: requestTeams.find(t => t.id === teamId)?.name ?? '' }))
    );
    setRequestLoadingPl(false);
  }

  async function sendRequest() {
    if (!profile || !team || !event || !requestTargetId) return;
    setRequestSending(true);
    const targetTeam = requestTeams.find(t => t.id === requestTargetId);
    const specificPlayers = requestTargetPlayers.filter(p => requestSelectedIds.has(p.id));
    const isSpecific = specificPlayers.length > 0;

    if (isSpecific) {
      // Invite each selected player directly (same as the Add flow)
      await Promise.all(specificPlayers.map(async p => {
        const { error } = await supabase.from('event_guests').insert({
          event_id: event.id, player_id: p.id, full_name: p.full_name,
          role: 'player', status: 'pending', added_by: profile.id,
        });
        if (!error && p.profile_id) {
          await sendProfilesPush({
            profileIds: [p.profile_id],
            title: 'Guest invitation',
            body: `${profile.full_name ?? 'Coach'} invited ${p.full_name} to guest play for ${team.name} — ${event.title}.`,
            data: { type: 'guest_invite', event_id: event.id, club_slug: clubSlug },
          });
        }
      }));
      const { data: fresh } = await supabase.from('event_guests').select('id,player_id,profile_id,full_name,role,status').eq('event_id', event.id);
      await resolveAndSetGuests((fresh ?? []) as any[]);
      setRequestSending(false); setRequestSheet(false);
      Alert.alert('Invites sent!', `${specificPlayers.length} player${specificPlayers.length !== 1 ? 's' : ''} have been invited directly.`);
    } else {
      // Blanket request — notify whole team
      const { data: newReq, error } = await (supabase as any).from('guest_requests').insert({
        event_id:           event.id,
        requesting_team_id: team.id,
        target_team_id:     requestTargetId,
        note:               requestNote.trim() || null,
        spots_needed:       requestSpots,
        status:             'open',
        created_by:         profile.id,
      }).select('id').single();
      if (error || !newReq) {
        Alert.alert('Error', 'Could not send request. Try again.'); setRequestSending(false); return;
      }
      const { data: players } = await supabase.from('players').select('profile_id').eq('team_id', requestTargetId);
      const profileIds = ((players ?? []) as any[]).map(p => p.profile_id).filter(Boolean) as string[];
      if (profileIds.length > 0) {
        await sendProfilesPush({
          profileIds,
          title: `${team.name} needs guest players`,
          body: `${profile.full_name ?? 'A coach'} is looking for ${requestSpots} player${requestSpots !== 1 ? 's' : ''} for ${event.title}${requestNote.trim() ? ` — ${requestNote.trim()}` : ''}. Tap to volunteer.`,
          data: { type: 'guest_request', request_id: newReq.id, club_slug: clubSlug },
        });
      }
      setRequestSending(false); setRequestSheet(false);
      Alert.alert('Request sent!', `${targetTeam?.name ?? 'The team'}'s parents have been notified and can volunteer their child.`);
    }
  }

  async function markAttendance(playerId: string, newStatus: 'present' | 'absent' | 'late') {
    if (!eventId) return;
    setSavingAttendance(playerId);
    const current = attendanceMap.get(playerId);
    if (current === newStatus) {
      await supabase.from('event_attendance').delete()
        .eq('event_id', eventId).eq('player_id', playerId);
      setAttendanceMap(prev => { const next = new Map(prev); next.delete(playerId); return next; });
    } else {
      await supabase.from('event_attendance').upsert(
        { event_id: eventId, player_id: playerId, status: newStatus, marked_by: profile?.id },
        { onConflict: 'event_id,player_id' }
      );
      setAttendanceMap(prev => new Map([...prev, [playerId, newStatus]]));
      if (newStatus === 'absent') {
        const p = players.find((pl) => pl.id === playerId);
        if (p?.profile_id) {
          Alert.alert('Notify parent?', `Let ${p.full_name}'s parent know they didn't show up?`, [
            { text: 'Skip', style: 'cancel' },
            { text: 'Send notification', onPress: async () => {
              await sendProfilesPush({
                profileIds: [p.profile_id!],
                title: 'Absence noted',
                body: `${p.full_name} was marked absent at ${event?.title ?? 'today\'s event'}.`,
                data: { type: 'attendance_absent', event_id: eventId },
              });
            }},
          ]);
        }
      }
    }
    setSavingAttendance(null);
  }

  async function handleNudge() {
    if (!event || !team) return;
    const nonResponders = players.filter((p) => !rsvpMap.has(p.id));
    if (!nonResponders.length) {
      Alert.alert('All caught up', 'Everyone has already responded.');
      return;
    }
    const profileIds = nonResponders.map((p) => p.profile_id).filter(Boolean) as string[];
    if (!profileIds.length) {
      Alert.alert('No linked accounts', `${nonResponders.length} player${nonResponders.length !== 1 ? 's' : ''} haven't responded, but their parents haven't linked accounts yet. Reach out directly.`);
      return;
    }
    setNudging(true);
    await sendProfilesPush({
      profileIds,
      title: 'RSVP needed',
      body: `Please respond to ${event.title} — your coach needs a headcount.`,
      data: { type: 'rsvp_reminder', event_id: event.id },
    });
    setNudging(false);
    Alert.alert('Nudge sent', `Reminded ${profileIds.length} parent${profileIds.length !== 1 ? 's' : ''} to RSVP.`);
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

  const guestPlayers = guests.filter(g => g.role === 'player');
  const guestCoaches = guests.filter(g => g.role === 'coach');
  const myGuestInvite = guests.find(g => g.linked_profile_id === profile?.id);
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

      <ClubHeader
        title="Event Details"
        onBack={() => router.back()}
        right={isCoach ? (
          <TouchableOpacity
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' }}
            onPress={openEdit}
            disabled={deleting}
          >
            <Ionicons name="pencil-outline" size={20} color="#fff" />
          </TouchableOpacity>
        ) : undefined}
      />

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
          <TouchableOpacity
            style={[styles.mainTab, activeMainTab === 'attendance' && [styles.mainTabActive, { borderBottomColor: primaryColor }]]}
            onPress={() => setActiveMainTab('attendance')}
          >
            <Text style={[styles.mainTabText, activeMainTab === 'attendance' && [styles.mainTabTextActive, { color: primaryColor }]]}>
              Attendance
            </Text>
            {attendanceMap.size > 0 && (
              <View style={[
                styles.mainTabBadge,
                activeMainTab === 'attendance' && [styles.mainTabBadgeActive, { backgroundColor: rgba(0.15) }],
              ]}>
                <Text style={[
                  styles.mainTabBadgeText,
                  activeMainTab === 'attendance' && [styles.mainTabBadgeTextActive, { color: primaryColor }],
                ]}>
                  {attendanceMap.size}/{players.length}
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
              <View style={{ flex: 1 }}>
                <Text style={styles.cancelledBannerText}>This event has been cancelled</Text>
                {event.cancellation_reason ? (
                  <Text style={{ color: 'rgba(239,68,68,0.7)', fontSize: 13, marginTop: 2, lineHeight: 18 }}>
                    {event.cancellation_reason}
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Guest invite banner — shown to the invited person (games only) */}
          {myGuestInvite && event.type === 'game' && (
            <View style={[styles.guestInviteBanner, { borderColor: guestStatusColor(myGuestInvite.status) + '40' }]}>
              <View style={styles.guestInviteBannerTop}>
                <View style={[styles.guestInviteIcon, { backgroundColor: guestStatusColor(myGuestInvite.status) + '18' }]}>
                  <Ionicons name="person-outline" size={16} color={guestStatusColor(myGuestInvite.status)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guestInviteTitle}>
                    Guest {myGuestInvite.role === 'player' ? 'player' : 'coach'} invitation
                  </Text>
                  <Text style={styles.guestInviteSub}>
                    {myGuestInvite.status === 'pending'
                      ? `You've been invited to guest ${myGuestInvite.role === 'player' ? 'play' : 'coach'} at this event.`
                      : myGuestInvite.status === 'confirmed' ? "You've confirmed this invitation." : "You declined this invitation."}
                  </Text>
                </View>
              </View>
              {myGuestInvite.status === 'pending' && (
                <View style={styles.guestInviteActions}>
                  <TouchableOpacity
                    style={styles.guestAcceptBtn}
                    onPress={() => handleGuestRespond(myGuestInvite.id, 'confirmed')}
                  >
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={styles.guestAcceptText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.guestDeclineBtn}
                    onPress={() => handleGuestRespond(myGuestInvite.id, 'declined')}
                  >
                    <Text style={styles.guestDeclineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Type badge + home/away + title */}
          <View style={styles.typeBadgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.typeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            {event.type === 'game' && event.home_away && (
              <View style={[
                styles.homeAwayBadge,
                event.home_away === 'home'
                  ? { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.25)' }
                  : { backgroundColor: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.25)' },
              ]}>
                <Text style={[
                  styles.homeAwayText,
                  { color: event.home_away === 'home' ? '#22C55E' : '#60A5FA' },
                ]}>
                  {event.home_away === 'home' ? 'Home' : 'Away'}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.title, event.cancelled_at ? styles.titleCancelled : null]}>{event.title}</Text>

          {/* ── Event meta card ── */}
          <View style={styles.metaCard}>

            {/* Date + time */}
            <View style={styles.metaRow}>
              <View style={styles.metaIconWrap}>
                <Ionicons name="calendar-outline" size={17} color={PULSE_COLORS.ui.muted} />
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
                    <Ionicons name="walk-outline" size={17} color={PULSE_COLORS.ui.muted} />
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
                    <Ionicons name="location-outline" size={17} color={PULSE_COLORS.ui.muted} />
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
                onDriveTime={setDriveTime}
              />
            )}

            {/* Weather + drive time panel — below map */}
            {(weather || driveTime) && (
              <>
                <View style={styles.metaDivider} />
                <View style={styles.weatherDriveBlock}>
                  {/* Weather */}
                  {weather && (
                    <View style={styles.weatherPanel}>
                      <Text style={styles.weatherPanelEmoji}>{weather.icon}</Text>
                      <View style={styles.weatherPanelCenter}>
                        <Text style={styles.weatherPanelTemp}>{weather.temp_f}°<Text style={styles.weatherPanelTempUnit}>F</Text></Text>
                        <Text style={styles.weatherPanelTempAlt}>{weather.temp_c}°C</Text>
                      </View>
                      <View style={styles.weatherPanelRight}>
                        <Text style={styles.weatherPanelCond}>{weather.condition}</Text>
                        <View style={styles.weatherPanelStats}>
                          {weather.precip_chance >= 20 && (
                            <View style={styles.weatherStatPill}>
                              <Text style={styles.weatherStatPillText}>💧 {weather.precip_chance}%</Text>
                            </View>
                          )}
                          <View style={[styles.weatherStatPill, { backgroundColor: 'rgba(100,116,139,0.12)' }]}>
                            <Text style={[styles.weatherStatPillText, { color: PULSE_COLORS.ui.textSecondary }]}>💨 {weather.wind_mph}mph</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Drive time */}
                  {driveTime && (
                    <>
                      {weather && <View style={styles.weatherDriveDivider} />}
                      <View style={styles.driveRow}>
                        <View style={styles.driveIconWrap}>
                          <Ionicons name="car-outline" size={15} color={PULSE_COLORS.ui.muted} />
                        </View>
                        <Text style={styles.driveText}>{driveTime}</Text>
                        <Text style={styles.driveLabel}>from your location</Text>
                      </View>
                    </>
                  )}
                </View>
              </>
            )}

            {/* Field info */}
            {hasFieldInfo && (
              <>
                {!hasMap && <View style={styles.metaDivider} />}
                <View style={styles.metaRow}>
                  <View style={styles.metaIconWrap}>
                    <Ionicons name="layers-outline" size={17} color={PULSE_COLORS.ui.muted} />
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
                    <Ionicons name="shirt-outline" size={17} color={PULSE_COLORS.ui.muted} />
                  </View>
                  {(() => {
                    const kitColor = event.uniform === 'home' ? homeKitColor
                      : event.uniform === 'away' ? awayKitColor
                      : trainingKitColor;
                    const kitLabel = event.uniform === 'home' ? 'Home Kit'
                      : event.uniform === 'away' ? 'Away Kit'
                      : 'Training Kit';
                    return (
                      <View style={[styles.uniformChip, { backgroundColor: `${kitColor}18`, borderColor: `${kitColor}30` }]}>
                        <Ionicons name="shirt" size={13} color={kitColor} />
                        <Text style={[styles.uniformChipText, { color: kitColor }]}>{kitLabel}</Text>
                      </View>
                    );
                  })()}
                </View>
              </>
            )}

            {/* Surface */}
            {event.field_type && (
              <>
                <View style={styles.metaDivider} />
                <View style={styles.metaRow}>
                  <View style={styles.metaIconWrap}>
                    <Ionicons name="football-outline" size={17} color={PULSE_COLORS.ui.muted} />
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

            {/* ── RSVP inside card — parents only ── */}
            {!isCoach && myPlayerId && (
              <>
                <View style={styles.metaDivider} />
                <View style={[styles.metaRow, { alignItems: 'flex-start', paddingVertical: 14 }]}>
                  <View style={styles.metaIconWrap}>
                    <Ionicons
                      name={
                        myStatus === 'attending' ? 'checkmark-circle'
                        : myStatus === 'not_attending' ? 'close-circle'
                        : 'radio-button-off-outline'
                      }
                      size={18}
                      color={
                        myStatus === 'attending' ? PULSE_COLORS.rsvp.attending
                        : myStatus === 'not_attending' ? PULSE_COLORS.rsvp.not_attending
                        : PULSE_COLORS.ui.muted
                      }
                    />
                  </View>
                  <View style={[styles.metaTextBlock, { flex: 1 }]}>
                    <Text style={[
                      styles.metaPrimary,
                      myStatus === 'attending' && { color: PULSE_COLORS.rsvp.attending },
                      myStatus === 'not_attending' && { color: PULSE_COLORS.rsvp.not_attending },
                    ]}>
                      {myStatus === 'attending' ? "You're going"
                       : myStatus === 'not_attending' ? "Can't make it"
                       : 'Your RSVP'}
                    </Text>
                    {deadlineLabel && (
                      <Text style={[styles.metaSecondary, rsvpClosed && { color: PULSE_COLORS.status.error }]}>
                        {deadlineLabel}
                      </Text>
                    )}
                    {!rsvpClosed && upcoming && (
                      <View style={[styles.rsvpInlineRow, { marginTop: 10 }]}>
                        <TouchableOpacity
                          style={[styles.rsvpInlineBtn, myStatus === 'attending' && styles.rsvpInlineBtnGoing]}
                          onPress={() => handleRsvp('attending')}
                          disabled={rsvpSaving}
                          activeOpacity={0.8}
                        >
                          {rsvpSaving && myStatus !== 'attending'
                            ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />
                            : <><Ionicons name="checkmark" size={14} color={myStatus === 'attending' ? '#000' : PULSE_COLORS.ui.muted} />
                               <Text style={[styles.rsvpInlineBtnText, myStatus === 'attending' && { color: '#000' }]}>Going</Text></>}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.rsvpInlineBtn, myStatus === 'not_attending' && styles.rsvpInlineBtnNotGoing]}
                          onPress={() => handleRsvp('not_attending')}
                          disabled={rsvpSaving}
                          activeOpacity={0.8}
                        >
                          {rsvpSaving && myStatus !== 'not_attending'
                            ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />
                            : <><Ionicons name="close" size={14} color={myStatus === 'not_attending' ? '#fff' : PULSE_COLORS.ui.muted} />
                               <Text style={[styles.rsvpInlineBtnText, myStatus === 'not_attending' && { color: '#fff' }]}>Can't go</Text></>}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Recording */}
          {event.video_url && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.recordingBtn}
                onPress={() => Linking.openURL(event.video_url!)}
                activeOpacity={0.75}
              >
                <View style={styles.recordingIconWrap}>
                  <Ionicons name="play-circle" size={22} color={primaryColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recordingLabel, { color: primaryColor }]}>Watch Recording</Text>
                  <Text style={styles.recordingUrl} numberOfLines={1}>{event.video_url}</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={primaryColor} />
              </TouchableOpacity>
            </View>
          )}

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
                  <Ionicons name="lock-closed-outline" size={13} color={PULSE_COLORS.ui.muted} />
                  <Text style={styles.coachOnlyTag}>Coach only</Text>
                </View>
                <Text style={styles.notesText}>{event.coach_notes}</Text>
              </View>
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
                  <Text style={[styles.summaryNum, { color: PULSE_COLORS.rsvp.attending }]}>{attending.length}</Text>
                  <Text style={styles.summaryLabel}>Going</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.summaryPill} onPress={() => switchToAvailability('not_attending')} activeOpacity={0.7}>
                  <Text style={[styles.summaryNum, { color: PULSE_COLORS.rsvp.not_attending }]}>{notAttending.length}</Text>
                  <Text style={styles.summaryLabel}>Can't go</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.summaryPill} onPress={() => switchToAvailability('none')} activeOpacity={0.7}>
                  <Text style={[styles.summaryNum, { color: PULSE_COLORS.ui.muted }]}>{noResponse.length}</Text>
                  <Text style={styles.summaryLabel}>No reply</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.attendanceFooter}>
                <TouchableOpacity style={styles.viewBreakdownBtn} onPress={() => setActiveMainTab('availability')}>
                  <Text style={[styles.viewBreakdownText, { color: primaryColor }]}>Full breakdown</Text>
                  <Ionicons name="chevron-forward" size={13} color={primaryColor} />
                </TouchableOpacity>
                {noResponse.length > 0 && upcoming && (
                  <TouchableOpacity style={styles.nudgeQuickBtn} onPress={handleNudge} activeOpacity={0.7}>
                    <Ionicons name="notifications-outline" size={13} color={PULSE_COLORS.ui.muted} />
                    <Text style={styles.nudgeQuickBtnText}>Nudge {noResponse.length}</Text>
                  </TouchableOpacity>
                )}
              </View>
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
                <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.border} />
              </TouchableOpacity>
              {event.type === 'game' && (
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnBorderTop]} onPress={openMatchTracker} activeOpacity={0.7}>
                  <View style={[styles.actionBtnIcon, { backgroundColor: rgba(0.1) }]}>
                    <Ionicons name="timer-outline" size={17} color={primaryColor} />
                  </View>
                  <Text style={styles.actionBtnText}>Match Tracker</Text>
                  <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.border} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Match Stats — coach only, games only, after full_time */}
          {isCoach && matchStats && event.type === 'game' && (
            <View style={styles.section}>
              <View style={styles.statsSectionHeader}>
                <Text style={styles.sectionTitle}>Match Stats</Text>
                <View style={styles.coachOnlyChip}>
                  <Ionicons name="lock-closed-outline" size={11} color={PULSE_COLORS.ui.muted} />
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
                  <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.border} />
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
                  <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.border} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.dangerCard, !event.cancelled_at && styles.dangerCardBorderTop]}
                onPress={confirmDelete}
                disabled={deleting}
                activeOpacity={0.7}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={PULSE_COLORS.status.error} style={{ marginRight: 12 }} />
                ) : (
                  <View style={[styles.dangerCardIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Ionicons name="trash-outline" size={20} color={PULSE_COLORS.status.error} />
                  </View>
                )}
                <View style={styles.dangerCardText}>
                  <Text style={[styles.dangerCardTitle, { color: PULSE_COLORS.status.error }]}>Delete Event</Text>
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
                    <Ionicons name="chevron-back" size={20} color={PULSE_COLORS.ui.textSecondary} />
                    <Text style={styles.modalBackText}>Back</Text>
                  </TouchableOpacity>
                ) : <View style={{ width: 60 }} />}
                <Text style={styles.modalTitle}>
                  {isUncancel
                    ? (cancelStep === 'reason' ? 'Reinstate Event' : 'Review Email')
                    : (cancelStep === 'reason' ? 'Cancel Event' : 'Review Email')}
                </Text>
                <TouchableOpacity onPress={() => setCancelVisible(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={PULSE_COLORS.ui.textSecondary} />
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
                    placeholderTextColor={PULSE_COLORS.ui.muted}
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
                          placeholderTextColor={PULSE_COLORS.ui.muted}
                        />
                        <TextInput
                          style={styles.emailBodyInput}
                          value={cancelBody}
                          onChangeText={setCancelBody}
                          multiline
                          textAlignVertical="top"
                          placeholderTextColor={PULSE_COLORS.ui.muted}
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

      {/* ── Attendance tab (coaches only) ── */}
      {activeMainTab === 'attendance' && isCoach && (
        <ScrollView contentContainerStyle={styles.availScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.attendanceHeader}>
            <Text style={styles.attendanceHint}>
              Mark who actually showed up. Tap a status to set, tap again to clear.
            </Text>
            <View style={styles.attendanceLegend}>
              {[['#22c55e', 'Present'], ['#F59E0B', 'Late'], ['#ef4444', 'Absent']].map(([color, label]) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={styles.legendLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
          {players.length === 0 ? (
            <View style={styles.emptyAvailability}>
              <Text style={styles.emptyTitle}>No players on roster</Text>
            </View>
          ) : (
            <View style={styles.playerCard}>
              {players.map((p, i) => {
                const attStatus = attendanceMap.get(p.id);
                const isSaving = savingAttendance === p.id;
                return (
                  <View key={p.id}>
                    {i > 0 && <View style={styles.playerDivider} />}
                    <View style={styles.playerRow}>
                      <View style={[
                        styles.jerseyBadge,
                        attStatus === 'present' && { backgroundColor: 'rgba(34,197,94,0.12)',  borderColor: 'rgba(34,197,94,0.3)' },
                        attStatus === 'late'    && { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)' },
                        attStatus === 'absent'  && { backgroundColor: 'rgba(239,68,68,0.12)',  borderColor: 'rgba(239,68,68,0.3)' },
                      ]}>
                        <Text style={[
                          styles.jerseyNum,
                          attStatus === 'present' && { color: '#22c55e' },
                          attStatus === 'late'    && { color: '#F59E0B' },
                          attStatus === 'absent'  && { color: '#ef4444' },
                        ]}>
                          {p.jersey_number ?? '—'}
                        </Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={styles.playerName}>{p.full_name}</Text>
                        {p.position && <Text style={styles.playerPosition}>{p.position}</Text>}
                      </View>
                      <View style={styles.attendanceBtns}>
                        {isSaving ? (
                          <ActivityIndicator size="small" color={primaryColor} />
                        ) : (
                          <>
                            {(['present', 'late', 'absent'] as const).map((s) => {
                              const clr = s === 'present' ? '#22c55e' : s === 'late' ? '#F59E0B' : '#ef4444';
                              const icon: React.ComponentProps<typeof Ionicons>['name'] = s === 'present' ? 'checkmark' : s === 'late' ? 'time-outline' : 'close';
                              return (
                                <TouchableOpacity
                                  key={s}
                                  style={[styles.attBtn, attStatus === s && { backgroundColor: `${clr}18`, borderColor: clr }]}
                                  onPress={() => markAttendance(p.id, s)}
                                  hitSlop={4}
                                >
                                  <Ionicons name={icon} size={14} color={attStatus === s ? clr : PULSE_COLORS.ui.muted} />
                                </TouchableOpacity>
                              );
                            })}
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── Availability tab (coaches only) ── */}
      {activeMainTab === 'availability' && isCoach && (
        <View style={{ flex: 1 }}>

          {/* Stats header — tap a card to filter */}
          <View style={styles.availHeader}>
            <View style={styles.availStats}>
              <TouchableOpacity style={styles.availStat} onPress={() => setActiveRsvpTab('attending')} activeOpacity={0.7}>
                <Text style={[styles.availStatNum, { color: PULSE_COLORS.rsvp.attending }]}>{attending.length}</Text>
                <Text style={[styles.availStatLabel, activeRsvpTab === 'attending' && { color: PULSE_COLORS.rsvp.attending, fontWeight: '700' }]}>Going</Text>
                <View style={[styles.availStatIndicator, activeRsvpTab === 'attending' && { backgroundColor: PULSE_COLORS.rsvp.attending }]} />
              </TouchableOpacity>
              <View style={styles.availStatDivider} />
              <TouchableOpacity style={styles.availStat} onPress={() => setActiveRsvpTab('not_attending')} activeOpacity={0.7}>
                <Text style={[styles.availStatNum, { color: PULSE_COLORS.rsvp.not_attending }]}>{notAttending.length}</Text>
                <Text style={[styles.availStatLabel, activeRsvpTab === 'not_attending' && { color: PULSE_COLORS.rsvp.not_attending, fontWeight: '700' }]}>Can't go</Text>
                <View style={[styles.availStatIndicator, activeRsvpTab === 'not_attending' && { backgroundColor: PULSE_COLORS.rsvp.not_attending }]} />
              </TouchableOpacity>
              <View style={styles.availStatDivider} />
              <TouchableOpacity style={styles.availStat} onPress={() => setActiveRsvpTab('none')} activeOpacity={0.7}>
                <Text style={[styles.availStatNum, { color: PULSE_COLORS.ui.muted }]}>{noResponse.length}</Text>
                <Text style={[styles.availStatLabel, activeRsvpTab === 'none' && { color: PULSE_COLORS.ui.text, fontWeight: '700' }]}>Pending</Text>
                <View style={[styles.availStatIndicator, activeRsvpTab === 'none' && { backgroundColor: PULSE_COLORS.ui.muted }]} />
              </TouchableOpacity>
            </View>
            {players.length > 0 && (
              <View style={styles.availProgressTrack}>
                <View style={[styles.availProgressFill, { width: `${Math.round(confirmedPct * 100)}%`, backgroundColor: primaryColor }]} />
              </View>
            )}
          </View>

          {/* Nudge non-responders */}
          {upcoming && !event.cancelled_at && noResponse.length > 0 && (
            <View style={styles.nudgeRow}>
              <TouchableOpacity
                style={styles.nudgeBtn}
                onPress={handleNudge}
                disabled={nudging}
                activeOpacity={0.75}
              >
                {nudging
                  ? <ActivityIndicator size="small" color={primaryColor} />
                  : <Ionicons name="notifications-outline" size={15} color={primaryColor} />
                }
                <Text style={[styles.nudgeBtnText, { color: primaryColor }]}>
                  Nudge {noResponse.length} non-responder{noResponse.length !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          )}

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
                    color={PULSE_COLORS.ui.muted}
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
                          activeRsvpTab === 'attending' && { color: PULSE_COLORS.rsvp.attending },
                          activeRsvpTab === 'not_attending' && { color: PULSE_COLORS.rsvp.not_attending },
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
                          <Ionicons name="checkmark-circle" size={20} color={PULSE_COLORS.rsvp.attending} />
                        )}
                        {activeRsvpTab === 'not_attending' && (
                          <Ionicons name="close-circle" size={20} color={PULSE_COLORS.rsvp.not_attending} />
                        )}
                        {activeRsvpTab === 'none' && (
                          <Ionicons name="ellipse-outline" size={20} color={PULSE_COLORS.ui.muted} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {/* Guest Players section */}
            {isCoach && event.type === 'game' && (
              <View style={styles.guestSection}>
                <View style={styles.guestSectionRow}>
                  <Text style={styles.guestSectionTitle}>GUEST PLAYERS</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={[styles.addGuestBtn, { backgroundColor: 'rgba(249,115,22,0.1)' }]} onPress={openRequestSheet}>
                      <Ionicons name="megaphone-outline" size={13} color="#f97316" />
                      <Text style={[styles.addGuestBtnText, { color: '#f97316' }]}>Request</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.addGuestBtn, { backgroundColor: rgba(0.1) }]} onPress={() => { setGuestQuery(''); setGuestPlayerResults([]); setGuestSheet('player'); }}>
                      <Ionicons name="person-add-outline" size={13} color={primaryColor} />
                      <Text style={[styles.addGuestBtnText, { color: primaryColor }]}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {guestPlayers.length > 0 ? (
                  <View style={styles.playerCard}>
                    {guestPlayers.map((g, i) => (
                      <View key={g.id}>
                        {i > 0 && <View style={styles.playerDivider} />}
                        <View style={styles.playerRow}>
                          <View style={[styles.jerseyBadge, { backgroundColor: 'rgba(249,115,22,0.15)' }]}>
                            <Text style={[styles.jerseyNum, { color: '#f97316' }]}>G</Text>
                          </View>
                          <View style={styles.playerInfo}>
                            <Text style={styles.playerName}>{g.full_name}</Text>
                            {g.team_name && <Text style={styles.playerPosition}>{g.team_name}</Text>}
                          </View>
                          <View style={[styles.guestStatusChip, { backgroundColor: guestStatusColor(g.status) + '18' }]}>
                            <Text style={[styles.guestStatusText, { color: guestStatusColor(g.status) }]}>
                              {g.status.charAt(0).toUpperCase() + g.status.slice(1)}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => handleRemoveGuest(g.id, g.full_name)} hitSlop={8} style={{ marginLeft: 8 }}>
                            <Ionicons name="close-circle-outline" size={18} color={PULSE_COLORS.ui.muted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.guestEmpty}>No guest players invited yet.</Text>
                )}
              </View>
            )}

            {/* Guest Coaches section — all coaches */}
            {isCoach && event.type === 'game' && (
              <View style={styles.guestSection}>
                <View style={styles.guestSectionRow}>
                  <Text style={styles.guestSectionTitle}>GUEST COACHES</Text>
                  <TouchableOpacity style={[styles.addGuestBtn, { backgroundColor: rgba(0.1) }]} onPress={() => { setGuestQuery(''); setGuestCoachResults([]); setGuestSheet('coach'); }}>
                    <Ionicons name="person-add-outline" size={13} color={primaryColor} />
                    <Text style={[styles.addGuestBtnText, { color: primaryColor }]}>Add</Text>
                  </TouchableOpacity>
                </View>
                {guestCoaches.length > 0 ? (
                  <View style={styles.playerCard}>
                    {guestCoaches.map((g, i) => (
                      <View key={g.id}>
                        {i > 0 && <View style={styles.playerDivider} />}
                        <View style={styles.playerRow}>
                          <View style={[styles.jerseyBadge, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                            <Ionicons name="people-outline" size={14} color="#3B82F6" />
                          </View>
                          <View style={styles.playerInfo}>
                            <Text style={styles.playerName}>{g.full_name}</Text>
                          </View>
                          <View style={[styles.guestStatusChip, { backgroundColor: guestStatusColor(g.status) + '18' }]}>
                            <Text style={[styles.guestStatusText, { color: guestStatusColor(g.status) }]}>
                              {g.status.charAt(0).toUpperCase() + g.status.slice(1)}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => handleRemoveGuest(g.id, g.full_name)} hitSlop={8} style={{ marginLeft: 8 }}>
                            <Ionicons name="close-circle-outline" size={18} color={PULSE_COLORS.ui.muted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.guestEmpty}>No guest coaches invited yet.</Text>
                )}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}

      {/* Guest search sheet */}
      <Modal
        visible={guestSheet !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setGuestSheet(null)}
      >
        <KeyboardAvoidingView style={styles.guestSheetKAV} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.guestSheetOverlay} activeOpacity={1} onPress={() => setGuestSheet(null)} />
          <View style={styles.guestSheetPanel}>
            <View style={styles.guestSheetHandle} />
            <Text style={styles.guestSheetTitle}>
              {guestSheet === 'player' ? 'Add Guest Player' : 'Add Guest Coach'}
            </Text>
            <Text style={styles.guestSheetSub}>
              {guestSheet === 'player'
                ? 'Browse or search players from other teams in your club.'
                : 'Search for a coach in your club.'}
            </Text>
            <View style={styles.guestSearchRow}>
              <Ionicons name="search-outline" size={16} color={PULSE_COLORS.ui.muted} />
              <TextInput
                style={styles.guestSearchInput}
                placeholder="Search by name…"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                value={guestQuery}
                onChangeText={q => { setGuestQuery(q); searchGuests(q); }}
                autoFocus
                returnKeyType="search"
              />
              {(guestSearching || browseLoading) && <ActivityIndicator size="small" color={primaryColor} />}
            </View>
            <ScrollView style={styles.guestResultsList} keyboardShouldPersistTaps="handled">
              {/* Search results */}
              {guestSheet === 'player' && guestQuery.length >= 2 && guestPlayerResults.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.guestResultRow}
                  onPress={() => handleAddGuestPlayer(p)}
                  disabled={!!addingGuest}
                >
                  <View style={[styles.jerseyBadge, { backgroundColor: 'rgba(249,115,22,0.12)', marginRight: 12 }]}>
                    <Text style={[styles.jerseyNum, { color: '#f97316' }]}>{p.jersey_number ?? 'G'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.guestResultName}>{p.full_name}</Text>
                    <Text style={styles.guestResultSub}>{p.team_name}{p.position ? ` · ${p.position}` : ''}</Text>
                  </View>
                  {addingGuest === p.id
                    ? <ActivityIndicator size="small" color={primaryColor} />
                    : <Ionicons name="add-circle-outline" size={20} color={primaryColor} />}
                </TouchableOpacity>
              ))}
              {guestSheet === 'coach' && guestCoachResults.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.guestResultRow}
                  onPress={() => handleAddGuestCoach(c)}
                  disabled={!!addingGuest}
                >
                  <View style={[styles.jerseyBadge, { backgroundColor: 'rgba(59,130,246,0.12)', marginRight: 12 }]}>
                    <Ionicons name="people-outline" size={14} color="#3B82F6" />
                  </View>
                  <Text style={[styles.guestResultName, { flex: 1 }]}>{c.full_name}</Text>
                  {addingGuest === c.id
                    ? <ActivityIndicator size="small" color={primaryColor} />
                    : <Ionicons name="add-circle-outline" size={20} color={primaryColor} />}
                </TouchableOpacity>
              ))}
              {guestQuery.length >= 2 && !guestSearching && guestPlayerResults.length === 0 && guestCoachResults.length === 0 && (
                <Text style={styles.guestNoResults}>No results for "{guestQuery}"</Text>
              )}
              {/* Browse by team — shown before any search query */}
              {guestSheet === 'player' && guestQuery.length < 2 && !browseLoading && clubBrowse.map(team => (
                <View key={team.id}>
                  <View style={styles.guestTeamHeader}>
                    <Ionicons name="shield-outline" size={12} color={primaryColor} />
                    <Text style={[styles.guestTeamLabel, { color: primaryColor }]}>{team.name}</Text>
                  </View>
                  {team.players.map(p => {
                    const alreadyAdded = guests.some(g => g.player_id === p.id);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.guestResultRow, alreadyAdded && { opacity: 0.4 }]}
                        onPress={() => !alreadyAdded && handleAddGuestPlayer(p)}
                        disabled={!!addingGuest || alreadyAdded}
                      >
                        <View style={[styles.jerseyBadge, { backgroundColor: 'rgba(249,115,22,0.12)', marginRight: 12 }]}>
                          <Text style={[styles.jerseyNum, { color: '#f97316' }]}>{p.jersey_number ?? 'G'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.guestResultName}>{p.full_name}</Text>
                          {p.position ? <Text style={styles.guestResultSub}>{p.position}</Text> : null}
                        </View>
                        {alreadyAdded
                          ? <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                          : addingGuest === p.id
                            ? <ActivityIndicator size="small" color={primaryColor} />
                            : <Ionicons name="add-circle-outline" size={20} color={primaryColor} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
              {guestSheet === 'player' && guestQuery.length < 2 && !browseLoading && clubBrowse.length === 0 && !browseLoading && (
                <Text style={styles.guestNoResults}>No other teams in your club yet.</Text>
              )}
              {guestSheet === 'coach' && guestQuery.length < 2 && (
                <Text style={styles.guestNoResults}>Type to search coaches in your club.</Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Request players from a team — bottom sheet */}
      <Modal visible={requestSheet} animationType="slide" transparent onRequestClose={() => setRequestSheet(false)}>
        <KeyboardAvoidingView style={styles.guestSheetKAV} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.guestSheetOverlay} activeOpacity={1} onPress={() => setRequestSheet(false)} />
          <View style={styles.requestSheetPanel}>
            {/* Fixed header */}
            <View style={styles.guestSheetHandle} />
            <Text style={[styles.guestSheetTitle, { marginBottom: 2 }]}>Request guest players</Text>
            <Text style={[styles.guestSheetSub, { marginBottom: 16 }]}>
              Pick a team, then select specific players or send to the whole team.
            </Text>

            {/* Scrollable content */}
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Team picker — wrapping chips */}
              <Text style={styles.requestSectionLabel}>WHICH TEAM?</Text>
              {requestTeams.length === 0 ? (
                <Text style={{ fontSize: 13, color: PULSE_COLORS.ui.muted, marginBottom: 16 }}>No age-eligible teams in your club.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {requestTeams.map(t => {
                    const sel = requestTargetId === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => { setRequestTargetId(t.id); loadRequestTeamPlayers(t.id); }}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                          backgroundColor: sel ? primaryColor : PULSE_COLORS.ui.surfaceAlt,
                          borderWidth: 1.5, borderColor: sel ? primaryColor : PULSE_COLORS.ui.border,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? '#fff' : PULSE_COLORS.ui.text }}>
                          {t.name}{t.age_group ? ` · ${t.age_group}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Player list — shown after a team is picked */}
              {requestTargetId !== '' && (
                <>
                  <Text style={styles.requestSectionLabel}>
                    {requestSelectedIds.size > 0 ? `PLAYERS — ${requestSelectedIds.size} SELECTED` : 'PICK PLAYERS (OPTIONAL)'}
                  </Text>
                  {requestLoadingPl ? (
                    <ActivityIndicator color={primaryColor} style={{ marginVertical: 12 }} />
                  ) : requestTargetPlayers.length === 0 ? (
                    <Text style={{ fontSize: 13, color: PULSE_COLORS.ui.muted, marginBottom: 16 }}>No available players on this team.</Text>
                  ) : (
                    <View style={{ borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
                      {requestTargetPlayers.map((p, i) => {
                        const sel = requestSelectedIds.has(p.id);
                        return (
                          <TouchableOpacity
                            key={p.id}
                            onPress={() => setRequestSelectedIds(prev => {
                              const next = new Set(prev);
                              sel ? next.delete(p.id) : next.add(p.id);
                              return next;
                            })}
                            style={{
                              flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, gap: 12,
                              backgroundColor: sel ? rgba(0.12) : PULSE_COLORS.ui.surface,
                              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: PULSE_COLORS.ui.border,
                            }}
                          >
                            <View style={[styles.jerseyBadge, { backgroundColor: sel ? rgba(0.2) : PULSE_COLORS.ui.surfaceAlt, marginRight: 0, flexShrink: 0 }]}>
                              <Text style={[styles.jerseyNum, { color: sel ? primaryColor : PULSE_COLORS.ui.textSecondary }]}>{p.jersey_number ?? '—'}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text }}>{p.full_name}</Text>
                              {p.position ? <Text style={{ fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 1 }}>{p.position}</Text> : null}
                            </View>
                            <View style={{
                              width: 24, height: 24, borderRadius: 12, borderWidth: 2, flexShrink: 0,
                              borderColor: sel ? primaryColor : PULSE_COLORS.ui.border,
                              backgroundColor: sel ? primaryColor : 'transparent',
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                              {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* Spots picker — only for blanket requests */}
                  {requestSelectedIds.size === 0 && (
                    <>
                      <Text style={styles.requestSectionLabel}>HOW MANY SPOTS?</Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                        {[1, 2, 3, 4, 5].map(n => {
                          const sel = requestSpots === n;
                          return (
                            <TouchableOpacity
                              key={n}
                              onPress={() => setRequestSpots(n)}
                              style={{
                                width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                                backgroundColor: sel ? primaryColor : PULSE_COLORS.ui.surfaceAlt,
                                borderWidth: 1.5, borderColor: sel ? primaryColor : PULSE_COLORS.ui.border,
                              }}
                            >
                              <Text style={{ fontSize: 16, fontWeight: '800', color: sel ? '#fff' : PULSE_COLORS.ui.text }}>{n}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}
                </>
              )}

              {/* Note */}
              <Text style={styles.requestSectionLabel}>NOTE (OPTIONAL)</Text>
              <TextInput
                value={requestNote}
                onChangeText={setRequestNote}
                placeholder="e.g. Need a striker for Saturday"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                style={{
                  borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 10,
                  padding: 12, fontSize: 14, color: PULSE_COLORS.ui.text, marginBottom: 8,
                  fontFamily: 'System',
                }}
                maxLength={120}
              />
              <View style={{ height: 8 }} />
            </ScrollView>

            {/* Pinned send button */}
            <View style={{ paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: PULSE_COLORS.ui.border }}>
              <TouchableOpacity
                onPress={sendRequest}
                disabled={!requestTargetId || requestSending}
                activeOpacity={0.85}
                style={{
                  backgroundColor: !requestTargetId || requestSending ? '#E2E8F0' : primaryColor,
                  borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 8,
                }}
              >
                {requestSending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name="megaphone-outline" size={16} color={!requestTargetId ? '#94A3B8' : '#fff'} />}
                <Text style={{ fontSize: 15, fontWeight: '800', color: !requestTargetId || requestSending ? '#94A3B8' : '#fff' }}>
                  {requestSending ? 'Sending…' : requestSelectedIds.size > 0
                    ? `Invite ${requestSelectedIds.size} Player${requestSelectedIds.size !== 1 ? 's' : ''}`
                    : 'Request from Team'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PULSE_COLORS.ui.background },
  errorText: { color: PULSE_COLORS.ui.textSecondary, fontSize: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text },

  mainTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.background,
  },
  mainTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 13,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  mainTabActive: { borderBottomColor: PULSE_COLORS.brand.green },
  mainTabText: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  mainTabTextActive: { color: PULSE_COLORS.brand.green },
  mainTabBadge: {
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
  },
  mainTabBadgeActive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  mainTabBadgeText: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
  mainTabBadgeTextActive: { color: PULSE_COLORS.brand.green },

  scroll: { padding: 20 },

  typeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  homeAwayBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1,
  },
  homeAwayText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  typeBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8,
  },
  typeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  title: { fontSize: 26, fontWeight: '800', color: PULSE_COLORS.ui.text, lineHeight: 32, marginBottom: 18 },

  // Meta card
  metaCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, overflow: 'hidden', marginBottom: 24,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  metaIconWrap: { width: 22, alignItems: 'center', paddingTop: 1 },
  metaTextBlock: { gap: 3 },
  metaPrimary: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },
  metaSecondary: { fontSize: 13, color: PULSE_COLORS.ui.muted },
  metaLabel: {
    fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 1,
  },
  metaDivider: { height: 1, backgroundColor: PULSE_COLORS.ui.border, marginHorizontal: 16 },

  weatherPill: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },

  // Premium weather + drive block
  weatherDriveBlock: {
    paddingHorizontal: 16, paddingVertical: 14, gap: 0,
  },
  weatherPanel: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  weatherPanelEmoji: { fontSize: 34 },
  weatherPanelCenter: { alignItems: 'flex-end', marginRight: 4 },
  weatherPanelTemp: { fontSize: 28, fontWeight: '800', color: PULSE_COLORS.ui.text, lineHeight: 30 },
  weatherPanelTempUnit: { fontSize: 16, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  weatherPanelTempAlt: { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
  weatherPanelRight: { flex: 1, gap: 6 },
  weatherPanelCond: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  weatherPanelStats: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  weatherStatPill: {
    backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  weatherStatPillText: { fontSize: 12, fontWeight: '600', color: '#60A5FA' },
  weatherDriveDivider: {
    height: 1, backgroundColor: PULSE_COLORS.ui.border, marginVertical: 12,
  },
  driveRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  driveIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  driveText: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  driveLabel: { fontSize: 13, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  uniformChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1,
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
    alignSelf: 'flex-start',
  },
  uniformChipText: { fontSize: 13, fontWeight: '700' },

  divider: { height: 1, backgroundColor: PULSE_COLORS.ui.border, marginVertical: 20 },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  deadlineLabel: { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  deadlineLabelClosed: { color: PULSE_COLORS.status.error },

  notesBox: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12, padding: 14,
  },
  coachNotesBox: { borderColor: 'rgba(156,163,175,0.25)', backgroundColor: 'rgba(156,163,175,0.05)' },
  coachNotesHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  coachOnlyTag: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600', fontStyle: 'italic' },
  notesText: { fontSize: 14, color: PULSE_COLORS.ui.text, lineHeight: 21 },

  recordingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12, padding: 14,
  },
  recordingIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  recordingLabel: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  recordingUrl: { fontSize: 12, color: PULSE_COLORS.ui.muted },

  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, marginBottom: 14,
  },
  statusChipText: { fontSize: 14, fontWeight: '600' },

  rsvpInlineRow: { flexDirection: 'row', gap: 8 },
  rsvpInlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.surface,
  },
  rsvpInlineBtnGoing: { backgroundColor: PULSE_COLORS.rsvp.attending, borderColor: PULSE_COLORS.rsvp.attending },
  rsvpInlineBtnNotGoing: { backgroundColor: PULSE_COLORS.rsvp.not_attending, borderColor: PULSE_COLORS.rsvp.not_attending },
  rsvpInlineBtnText: { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },

  noPlayerText: { color: PULSE_COLORS.ui.muted, fontSize: 14 },

  // Attendance summary
  progressWrap: { marginBottom: 14 },
  progressTrack: {
    height: 4, backgroundColor: PULSE_COLORS.ui.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6,
  },
  progressFill: { height: '100%', backgroundColor: PULSE_COLORS.brand.green, borderRadius: 2 },
  progressLabel: { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryPill: {
    flex: 1, backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  summaryNum: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 3 },

  attendanceFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  viewBreakdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewBreakdownText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.brand.green },
  nudgeQuickBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  nudgeQuickBtnText: { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },

  // Actions
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12, padding: 14,
  },
  actionBtnBorderTop: { marginTop: 8 },
  actionBtnIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: 'rgba(34,197,94,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.07)',
  },
  deleteBtnText: { color: PULSE_COLORS.status.error, fontWeight: '700', fontSize: 15 },

  // Availability tab
  availHeader: {
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.surface,
  },
  availStats: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  availStat: { flex: 1, alignItems: 'center', gap: 3 },
  availStatNum: { fontSize: 28, fontWeight: '800' },
  availStatLabel: { fontSize: 12, color: PULSE_COLORS.ui.muted },
  availStatIndicator: { height: 3, width: 28, borderRadius: 2, marginTop: 6, backgroundColor: 'transparent' },
  availStatDivider: { width: 1, height: 36, backgroundColor: PULSE_COLORS.ui.border },
  availProgressTrack: {
    height: 4, backgroundColor: PULSE_COLORS.ui.border, borderRadius: 2, overflow: 'hidden',
  },
  availProgressFill: { height: '100%', backgroundColor: PULSE_COLORS.brand.green, borderRadius: 2 },

  nudgeRow: { paddingHorizontal: 20, paddingBottom: 4 },
  nudgeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    backgroundColor: PULSE_COLORS.ui.surface,
    alignSelf: 'flex-start',
  },
  nudgeBtnText: { fontSize: 13, fontWeight: '700' },

  segmentedWrap: { paddingHorizontal: 20, paddingVertical: 14 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 10, overflow: 'hidden',
  },
  segment: {
    flex: 1, paddingVertical: 9, alignItems: 'center',
    borderRightWidth: 1, borderRightColor: PULSE_COLORS.ui.border,
  },
  segmentLast: { borderRightWidth: 0 },
  segmentActive: { backgroundColor: PULSE_COLORS.brand.green },
  segmentText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  segmentTextActive: { color: '#000' },

  availScroll: { paddingHorizontal: 20, paddingTop: 4 },

  emptyAvailability: { alignItems: 'center', paddingVertical: 52, gap: 10 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
  emptySubtitle: { fontSize: 13, color: PULSE_COLORS.ui.muted, textAlign: 'center', maxWidth: 260, lineHeight: 19 },

  playerCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, overflow: 'hidden',
  },
  playerDivider: { height: 1, backgroundColor: PULSE_COLORS.ui.border },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  jerseyBadge: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  jerseyBadgeGoing: { backgroundColor: 'rgba(34,197,94,0.12)' },
  jerseyBadgeNotGoing: { backgroundColor: 'rgba(239,68,68,0.12)' },
  jerseyNum: { fontSize: 12, fontWeight: '800', color: PULSE_COLORS.ui.muted },
  playerInfo: { flex: 1, gap: 2 },
  playerName: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },
  playerPosition: { fontSize: 12, color: PULSE_COLORS.ui.muted },
  overrideBtn: { padding: 2 },
  overrideHint: { fontSize: 11, color: PULSE_COLORS.ui.muted, textAlign: 'center', paddingHorizontal: 16, paddingBottom: 8 },

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
  statMins: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  statBarTrack: {
    height: 4, backgroundColor: PULSE_COLORS.ui.border, borderRadius: 2, overflow: 'hidden',
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
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, overflow: 'hidden',
  },
  dangerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: PULSE_COLORS.ui.surface,
  },
  dangerCardBorderTop: { borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border },
  dangerCardIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(249,115,22,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  dangerCardText: { flex: 1 },
  dangerCardTitle: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  dangerCardSub: { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 1 },

  // Cancellation modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalKAV: { justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, marginBottom: 4,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: PULSE_COLORS.ui.text },
  modalBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 60 },
  modalBackText: { fontSize: 15, color: PULSE_COLORS.ui.textSecondary },
  modalCloseBtn: { width: 60, alignItems: 'flex-end' },
  modalHint: { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, marginBottom: 16, lineHeight: 20 },
  modalTextArea: {
    backgroundColor: PULSE_COLORS.ui.background, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 14, color: PULSE_COLORS.ui.text, fontSize: 15,
    minHeight: 110, marginBottom: 16, textAlignVertical: 'top',
  },
  modalPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  modalPrimaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Email preview card
  emailPreviewCard: {
    backgroundColor: PULSE_COLORS.ui.background, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 16, marginBottom: 16,
  },
  emailPreviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  emailPreviewTo: { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
  emailEditLink: { fontSize: 13, color: '#f97316', fontWeight: '700' },
  emailSubjectPreview: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 10 },
  emailBodyPreview: { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, lineHeight: 20 },
  emailSubjectInput: {
    fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
    paddingVertical: 8, marginBottom: 10,
  },
  emailBodyInput: {
    fontSize: 14, color: PULSE_COLORS.ui.textSecondary, lineHeight: 20,
    minHeight: 100, textAlignVertical: 'top',
  },

  // Guest invite banner (shown to the invited person in Details tab)
  guestInviteBanner: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderRadius: 14, padding: 14, gap: 12,
  },
  guestInviteBannerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  guestInviteIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  guestInviteTitle: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  guestInviteSub: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, marginTop: 2, lineHeight: 18 },
  guestInviteActions: { flexDirection: 'row', gap: 10 },
  guestAcceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 10,
  },
  guestAcceptText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  guestDeclineBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  guestDeclineText: { color: PULSE_COLORS.ui.textSecondary, fontWeight: '600', fontSize: 14 },

  // Guest sections in Availability tab
  guestSection: { marginHorizontal: 16, marginTop: 20 },
  guestSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  guestSectionTitle: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1.2 },
  addGuestBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  addGuestBtnText: { fontSize: 12, fontWeight: '700' },
  guestStatusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  guestStatusText: { fontSize: 11, fontWeight: '700' },
  guestEmpty: { fontSize: 13, color: PULSE_COLORS.ui.muted, marginTop: 4 },

  // Guest search sheet
  guestTeamHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingTop: 14, paddingBottom: 6 },
  guestTeamLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  requestSheetPanel: {
    backgroundColor: PULSE_COLORS.ui.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 20, paddingBottom: 36,
    height: '80%', flexDirection: 'column',
  },
  requestSectionLabel: {
    fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.muted,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10,
  },
  guestSheetKAV: { flex: 1, justifyContent: 'flex-end' },
  guestSheetOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  guestSheetPanel: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingHorizontal: 16, paddingBottom: 32,
    maxHeight: '80%',
  },
  guestSheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: PULSE_COLORS.ui.border, alignSelf: 'center', marginBottom: 16 },
  guestSheetTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  guestSheetSub: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, marginBottom: 14, lineHeight: 18 },
  guestSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4,
  },
  guestSearchInput: { flex: 1, fontSize: 15, color: PULSE_COLORS.ui.text },
  guestResultsList: { marginTop: 8 },
  guestResultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  guestResultName: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text },
  guestResultSub: { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 2 },
  guestNoResults: { fontSize: 13, color: PULSE_COLORS.ui.muted, textAlign: 'center', paddingVertical: 24 },

  // Attendance tab
  attendanceHeader: { padding: 16, paddingBottom: 8 },
  attendanceHint: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, marginBottom: 12, lineHeight: 18 },
  attendanceLegend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, fontWeight: '600' },
  attendanceBtns: { flexDirection: 'row', gap: 6 },
  attBtn: {
    width: 30, height: 30, borderRadius: 8,
    borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
});
