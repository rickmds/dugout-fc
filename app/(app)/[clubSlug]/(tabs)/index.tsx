import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { uniqueChannelName } from '../../../../lib/realtime';
import { computeArriveBy } from '../../../../lib/eventTime';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { PULSE_COLORS } from '../../../../constants/colors';
import { positionColor } from '../../../../constants/positions';
import ClubBadge from '../../../../components/ui/ClubBadge';
import GameDayWidget from '../../../../components/home/GameDayWidget';
import PollCard, { type Poll } from '../../../../components/home/PollCard';
import CreatePollModal from '../../../../components/home/CreatePollModal';
import { fetchEventWeather, isWeatherForecastable, type WeatherData } from '../../../../lib/weather';
import { fetchDriveTime } from '../../../../lib/drivetime';
import { sendProfilesPush, sendTeamPush } from '../../../../lib/push';
import GalleryCard from '../../../../components/home/GalleryCard';
import * as WebBrowser from 'expo-web-browser';

const APP_BASE = process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

type NextEvent = {
  id: string;
  title: string;
  type: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  uniform: string | null;
  home_away: 'home' | 'away' | null;
  field_type: string | null;
  rsvp_lock_at: string | null;
  arrival_buffer_minutes: number | null;
};

type Headcount = { going: number; notGoing: number; tbd: number; confirmedGuests?: number };

type MyPlayer = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  photo_url: string | null;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

type Callout = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  expires_at: string | null;
  urgency: 'normal' | 'urgent';
  helper_count?: number;
  helper_names?: string[];
};

const CALLOUT_TEMPLATES = [
  { icon: '💧', label: 'Water bottles', text: 'Can someone bring extra water bottles?' },
  { icon: '🙋', label: 'Volunteers', text: 'Need parent volunteers for next session' },
  { icon: '👕', label: 'Kit wash', text: 'Can anyone wash the training kit this week?' },
  { icon: '📋', label: 'Score keeper', text: 'Need a score keeper for the game' },
  { icon: '🚗', label: 'Car pool', text: 'Anyone able to help with transport?' },
  { icon: '📸', label: 'Photographer', text: 'Can someone take photos/videos at the match?' },
];

type OutstandingFee = {
  id: string;
  team_id: string;
  description: string;
  amount_due: number;
  discount: number;
  due_date: string | null;
  status: string;
  payee_type: 'club' | 'coach';
  payment_instructions: string | null;
  payment_token: string | null;
  claim_status: 'none' | 'pending';
  claim_amount: number | null;
  claim_method: string | null;
  event_id: string | null;
  event_title: string | null;
  event_date: string | null;
};

type PendingGuestInvite = {
  id: string;
  event_id: string;
  player_id: string;
  full_name: string;
  event_title: string;
  event_date: string;
  event_time: string | null;
  event_type: string;
  team_name: string;
  team_id: string;
  club_id: string | null;
};

const DEV_ACCOUNTS = __DEV__ ? [
  { label: 'Coach', email: 'coach@test.com', password: 'test123456' },
  { label: 'Parent', email: 'parent@test.com', password: 'test123456' },
  { label: 'Admin', email: 'admin@test.com', password: 'test123456' },
] : [];

const TYPE_CONFIG: Record<string, { icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  game:     { icon: 'football-outline', color: '#F59E0B' },
  training: { icon: 'barbell-outline',  color: '#3B82F6' },
  other:    { icon: 'pin-outline',      color: '#9CA3AF' },
};


function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${time}, ${name.split(' ')[0]}` : time;
}

function formatDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCountdown(dateStr: string, timeStr: string | null): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff !== 0) return formatDate(dateStr);
  if (!timeStr) return 'Today';
  const [h, m] = timeStr.split(':').map(Number);
  const eventTime = new Date();
  eventTime.setHours(h, m, 0, 0);
  const mins = Math.round((eventTime.getTime() - Date.now()) / 60000);
  if (mins <= 0) return 'In progress';
  if (mins < 60) return `Starts in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `Starts in ${hrs}h ${rem}m` : `Starts in ${hrs}h`;
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}



function HomeSkeleton() {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const SKEL = PULSE_COLORS.ui.surface;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: PULSE_COLORS.ui.background }} contentContainerStyle={{ padding: 20, paddingTop: 120, paddingBottom: 48 }} scrollEnabled={false}>
      <Animated.View style={{ opacity: pulse }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
          <View style={{ flex: 1 }}>
            <View style={{ width: 80, height: 10, borderRadius: 6, backgroundColor: SKEL, marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: SKEL }} />
              <View style={{ gap: 6 }}>
                <View style={{ width: 140, height: 14, borderRadius: 6, backgroundColor: SKEL }} />
                <View style={{ width: 90, height: 10, borderRadius: 6, backgroundColor: SKEL }} />
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {[0, 1].map(i => <View key={i} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: SKEL }} />)}
          </View>
        </View>
        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 28 }}>
          {[0, 1].map(i => (
            <View key={i} style={{ flex: 1, height: 100, borderRadius: 16, backgroundColor: SKEL }} />
          ))}
        </View>
        {/* Section label */}
        <View style={{ width: 80, height: 9, borderRadius: 5, backgroundColor: SKEL, marginBottom: 10 }} />
        {/* Next event card */}
        <View style={{ height: 120, borderRadius: 16, backgroundColor: SKEL, marginBottom: 28 }} />
        {/* Announcement label */}
        <View style={{ width: 100, height: 9, borderRadius: 5, backgroundColor: SKEL, marginBottom: 10 }} />
        {/* Announcement card */}
        <View style={{ height: 76, borderRadius: 16, backgroundColor: SKEL }} />
      </Animated.View>
    </ScrollView>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile, club, refreshProfile, signOut } = useAuth();
  const { team, allTeams, loading: teamLoading, selectTeam } = useTeam();
  const { primaryColor, rgba, clubName, logoUrl, secondaryColor, homeKitColor, awayKitColor, trainingKitColor } = useClub();

  const [playerCount, setPlayerCount]       = useState(0);
  const [upcomingCount, setUpcomingCount]   = useState(0);
  const [nextGame, setNextGame]             = useState<NextEvent | null>(null);
  const [nextTraining, setNextTraining]     = useState<NextEvent | null>(null);
  const [nextGameWeather, setNextGameWeather]           = useState<WeatherData | null>(null);
  const [nextTrainingWeather, setNextTrainingWeather]   = useState<WeatherData | null>(null);
  const [nextGameDriveTime, setNextGameDriveTime]       = useState<string | null>(null);
  const [nextTrainingDriveTime, setNextTrainingDriveTime] = useState<string | null>(null);
  const [myPlayer, setMyPlayer]             = useState<MyPlayer | null>(null);
  const [myGameRsvpStatus, setMyGameRsvpStatus]         = useState<string | null>(null);
  const [myTrainingRsvpStatus, setMyTrainingRsvpStatus] = useState<string | null>(null);
  const [myRsvpCount, setMyRsvpCount]       = useState(0);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [gameRsvpLoading, setGameRsvpLoading]       = useState(false);
  const [trainingRsvpLoading, setTrainingRsvpLoading] = useState(false);
  const [gameHeadcount, setGameHeadcount]             = useState<Headcount | null>(null);
  const [trainingHeadcount, setTrainingHeadcount]     = useState<Headcount | null>(null);
  const [pulseGamePct, setPulseGamePct]               = useState<number | null>(null);
  const [pulseTrainingPct, setPulseTrainingPct]       = useState<number | null>(null);
  const [pulseGameEvents, setPulseGameEvents]         = useState(0);
  const [pulseTrainingEvents, setPulseTrainingEvents] = useState(0);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [outstandingFees, setOutstandingFees] = useState<OutstandingFee[]>([]);
  const [showFeeModal, setShowFeeModal]     = useState(false);
  const [claimingFee, setClaimingFee]       = useState<OutstandingFee | null>(null);
  const [claimAmount, setClaimAmount]       = useState('');
  const [claimMethod, setClaimMethod]       = useState<'venmo' | 'cash' | 'other'>('venmo');
  const [claimNote, setClaimNote]           = useState('');
  const [claimSaving, setClaimSaving]       = useState(false);
  const [combinedStreak, setCombinedStreak]         = useState(0);
  const [combinedAtRisk, setCombinedAtRisk]         = useState(false);
  const [trainingStreak, setTrainingStreak]         = useState(0);
  const [trainingAtRisk, setTrainingAtRisk]         = useState(false);
  const [gameStreak, setGameStreak]                 = useState(0);
  const [gameAtRisk, setGameAtRisk]                 = useState(false);
  const [gamesAttended, setGamesAttended]           = useState(0);
  const [gamesTotal, setGamesTotal]                 = useState(0);
  const [seasonTotalMarked, setSeasonTotalMarked]   = useState(0);
  const [attendanceHistory, setAttendanceHistory]   = useState<{ id: string; type: string; date: string; status: string | null; title: string | null }[]>([]);
  const [showAttendanceSheet, setShowAttendanceSheet] = useState(false);

  const [callouts, setCallouts] = useState<Callout[]>([]);
  const [calloutResponses, setCalloutResponses] = useState<Record<string, 'helping' | 'dismissed'>>({});
  const [showCalloutModal, setShowCalloutModal] = useState(false);
  const [calloutTitle, setCalloutTitle] = useState('');
  const [calloutBody, setCalloutBody] = useState('');
  const [calloutUrgency, setCalloutUrgency] = useState<'normal' | 'urgent'>('normal');
  const [calloutPosting, setCalloutPosting] = useState(false);

  const [pendingGuestInvites, setPendingGuestInvites] = useState<PendingGuestInvite[]>([]);
  const [guestRespondLoading, setGuestRespondLoading] = useState<string | null>(null);
  const [unsignedWaiverCount, setUnsignedWaiverCount] = useState(0);

  const [polls, setPolls] = useState<Poll[]>([]);
  const [showPollModal, setShowPollModal] = useState(false);
  const [myRsvpEventIds, setMyRsvpEventIds] = useState<Set<string>>(new Set());

  const isCoach = profile?.role === 'org_admin' || team?.myRole === 'coach';
  const slug = clubSlug ?? club?.slug ?? '';

  // Realtime: keep notification badge in sync without polling
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(uniqueChannelName(`notif-badge-${profile.id}`))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profile.id}`,
      }, () => {
        supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('profile_id', profile.id)
          .eq('read', false)
          .then(({ count }) => setUnreadNotifCount(count ?? 0));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  // Track current poll IDs in a ref so the vote subscription doesn't need to remount
  const pollIdsRef = useRef<string[]>([]);
  useEffect(() => {
    pollIdsRef.current = polls.map(p => p.id);
  }, [polls]);

  // Realtime: sync poll votes across all users when anyone votes
  useEffect(() => {
    if (!team?.id) return;
    const channel = supabase
      .channel(uniqueChannelName(`poll-votes-${team.id}`))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_poll_votes',
      }, async () => {
        const ids = pollIdsRef.current;
        if (ids.length === 0) return;
        const { data } = await (supabase as any)
          .from('team_poll_votes')
          .select('poll_id, option_id, profile_id')
          .in('poll_id', ids);
        if (data) {
          setPolls(prev => prev.map(p => ({
            ...p,
            votes: (data as any[]).filter((v: any) => v.poll_id === p.id),
          })));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [team?.id]);

  // Team picker
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const hasMultipleTeams = allTeams.length > 1;

  async function handleSelectTeam(teamId: string) {
    setTeamPickerOpen(false);
    const newTeam = allTeams.find((t) => t.id === teamId);
    await selectTeam(teamId);
    if (newTeam?.club?.slug && newTeam.club.slug !== slug) {
      router.replace(`/(app)/${newTeam.club.slug}/(tabs)` as never);
    }
  }

  // Dev switcher
  const [devOpen, setDevOpen]         = useState(false);
  const [devLoading, setDevLoading]   = useState<string | null>(null);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<number>(0);
  // Once we've shown real content, later refetches (regaining focus after
  // popping a screen, switching teams) shouldn't blank the screen back to
  // the skeleton — that's the flash. Only the very first load should.
  const hasLoadedOnceRef = useRef(false);
  useEffect(() => {
    if (!loading) hasLoadedOnceRef.current = true;
  }, [loading]);

  function handleGreetingTap() {
    if (process.env.EXPO_PUBLIC_APP_ENV !== 'development') return;
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 800);
    if (tapCount.current >= 5) { tapCount.current = 0; setDevOpen(true); }
  }

  async function switchTo(account: typeof DEV_ACCOUNTS[number]) {
    setDevLoading(account.email);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
    if (error) {
      setDevLoading(null);
      setDevOpen(false);
      alert(`No account for ${account.email}. Register it first.`);
      router.replace('/(auth)/login');
      return;
    }
    await refreshProfile();
    setDevLoading(null);
    setDevOpen(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: p } = await supabase.from('profiles').select('role, club_id').eq('id', session.user.id).single();
    if (p?.club_id) {
      const { data: c } = await supabase.from('clubs').select('slug').eq('id', p.club_id).single();
      if (c?.slug) { router.replace(`/(app)/${c.slug}/(tabs)` as never); return; }
    }
    router.replace('/(auth)/role-select');
  }

  useFocusEffect(
    useCallback(() => {
      if (teamLoading) return;
      if (!team) { setLoading(false); return; }
      fetchData();
      checkUnsignedWaivers();
    }, [team?.id, teamLoading, profile?.id])
  );

  async function checkUnsignedWaivers() {
    if (!profile?.id || !slug) return;
    const { data: clubRow } = await supabase.from('clubs').select('id').eq('slug', slug).single();
    if (!clubRow) return;
    const { data: memberRows } = await supabase.from('team_members').select('team_id').eq('profile_id', profile.id);
    if (!memberRows?.length) return;
    const { data: clubTeams } = await supabase.from('teams').select('id').eq('club_id', clubRow.id).in('id', memberRows.map(r => r.team_id));
    if (!clubTeams?.length) return;
    const clubTeamIds = clubTeams.map(t => t.id);
    // get_my_guarded_players() also checks player_guardians — a second
    // guardian's own kid was silently invisible to their waiver check otherwise.
    const { data: players } = await (supabase as any).rpc('get_my_guarded_players').select('id, team_id').in('team_id', clubTeamIds);
    if (!players?.length) return;
    const playerIds = players.map((p: { id: string }) => p.id);
    const { data: assignments } = await supabase.from('waiver_assignments').select('waiver_id, team_id').in('team_id', clubTeamIds);
    if (!assignments?.length) { setUnsignedWaiverCount(0); return; }
    const { data: sigs } = await supabase.from('waiver_signatures').select('waiver_id, player_id').in('player_id', playerIds);
    const signed = new Set((sigs ?? []).map(s => `${s.waiver_id}:${s.player_id}`));
    const unsignedSet = new Set<string>();
    for (const a of assignments) {
      const teamPlayers = players.filter((p: { team_id: string }) => p.team_id === a.team_id);
      const hasUnsigned = teamPlayers.some((p: { id: string }) => !signed.has(`${a.waiver_id}:${p.id}`));
      if (hasUnsigned) unsignedSet.add(a.waiver_id);
    }
    setUnsignedWaiverCount(unsignedSet.size);
  }

  // Re-fetch immediately when the user switches teams while this tab is already active.
  // useFocusEffect only fires on navigation focus events, not mid-session team changes.
  // The 30s cache inside fetchData prevents a redundant double-fetch when both fire together.
  useEffect(() => {
    if (!team?.id || teamLoading) return;
    lastFetchRef.current = 0;
    fetchData();
  }, [team?.id, teamLoading]);

  function fetchWeatherAndDrive(event: NextEvent | null, setWeather: (w: WeatherData) => void, setDrive: (t: string) => void) {
    if (!event) return;
    const loc = (event.lat != null && event.lng != null)
      ? `${event.lat},${event.lng}`
      : (event.address ?? event.location ?? '');
    if (!loc) return;
    fetchDriveTime(loc).then(t => { if (t) setDrive(t); });
    if (isWeatherForecastable(event.event_date)) {
      fetchEventWeather(loc, event.event_date, event.event_time ?? null).then(w => { if (w) setWeather(w); });
    }
  }

  async function fetchData() {
    if (!team || !profile) return;

    // Skip re-fetch if data is fresh (30s cache) — bypassed by pull-to-refresh
    const now = Date.now();
    if (lastFetchRef.current && now - lastFetchRef.current < 30_000) return;

    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const sb = supabase as any;

    try {
    // === CRITICAL PATH — unblocks skeleton as fast as possible ===
    const [
      { data: gameEvents },
      { data: trainingEvents },
      announcementRes,
      playerRes,
      { data: calloutData },
    ] = await Promise.all([
      supabase.from('events').select('id, title, type, event_date, event_time, location, address, lat, lng, uniform, home_away, field_type, rsvp_lock_at, arrival_buffer_minutes').eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null).eq('type', 'game').order('event_date').order('event_time').limit(1),
      supabase.from('events').select('id, title, type, event_date, event_time, location, address, lat, lng, uniform, home_away, field_type, rsvp_lock_at, arrival_buffer_minutes').eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null).in('type', ['training', 'other']).order('event_date').order('event_time').limit(1),
      supabase.from('announcements').select('id, title, body, created_at').eq('team_id', team.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      // get_my_guarded_players() also checks player_guardians — a second
      // guardian otherwise never saw their own kid's card/RSVP on Home at all.
      (supabase as any).rpc('get_my_guarded_players').select('id, full_name, jersey_number, position, photo_url').eq('team_id', team.id).maybeSingle(),
      sb.from('team_callouts').select('id, title, body, created_at, expires_at, urgency').eq('team_id', team.id).or('expires_at.is.null,expires_at.gt.now()').order('created_at', { ascending: false }).limit(5),
    ]);

    const nextG = (gameEvents as NextEvent[])?.[0] ?? null;
    const nextT = (trainingEvents as NextEvent[])?.[0] ?? null;
    const player = (playerRes as any).data as MyPlayer | null;
    const activeCallouts = (calloutData ?? []) as Callout[];

    setNextGame(nextG);
    setNextTraining(nextT);
    setNextGameWeather(null);
    setNextTrainingWeather(null);
    setNextGameDriveTime(null);
    setNextTrainingDriveTime(null);
    setMyPlayer(player);
    setLatestAnnouncement((announcementRes as any).data ?? null);
    setCallouts(activeCallouts);
    setCalloutResponses({});

    // Fire weather + drive time (non-blocking)
    fetchWeatherAndDrive(nextG, setNextGameWeather, setNextGameDriveTime);
    fetchWeatherAndDrive(nextT, setNextTrainingWeather, setNextTrainingDriveTime);

    // Skeleton off — user sees main content now
    setLoading(false);
    lastFetchRef.current = Date.now();

    // === BACKGROUND — fills in while the user reads ===

    const [
      { count: pc },
      { count: ec },
      { count: unreadNotifs },
      { data: upcomingEventsData },
    ] = await Promise.all([
      supabase.from('players').select('*', { count: 'exact', head: true }).eq('team_id', team.id),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('profile_id', profile.id).eq('read', false),
      supabase.from('events').select('id').eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null),
    ]);

    const upcomingEventIds = (upcomingEventsData ?? []).map((e: { id: string }) => e.id);
    setPlayerCount(pc ?? 0);
    setUpcomingCount(ec ?? 0);
    setUnreadNotifCount(unreadNotifs ?? 0);

    // Callout responses (needs callout IDs from critical batch)
    if (activeCallouts.length > 0 && profile?.id) {
      const cIds = activeCallouts.map(c => c.id);
      const [responseRes, helpCountRes] = await Promise.all([
        sb.from('team_callout_responses').select('callout_id, response').in('callout_id', cIds).eq('profile_id', profile.id),
        isCoach
          ? sb.from('team_callout_responses').select('callout_id, profiles:profile_id(full_name)').in('callout_id', cIds).eq('response', 'helping')
          : Promise.resolve({ data: null }),
      ]);

      const rMap: Record<string, 'helping' | 'dismissed'> = {};
      for (const r of (responseRes.data ?? []) as { callout_id: string; response: string }[]) {
        rMap[r.callout_id] = r.response as 'helping' | 'dismissed';
      }
      setCalloutResponses(rMap);

      if (isCoach && helpCountRes.data) {
        const helpMap: Record<string, number> = {};
        const nameMap: Record<string, string[]> = {};
        for (const r of helpCountRes.data as { callout_id: string; profiles: { full_name: string | null } | null }[]) {
          helpMap[r.callout_id] = (helpMap[r.callout_id] ?? 0) + 1;
          const name = r.profiles?.full_name;
          if (name) {
            if (!nameMap[r.callout_id]) nameMap[r.callout_id] = [];
            nameMap[r.callout_id].push(name.split(' ')[0]); // first name only
          }
        }
        setCallouts(activeCallouts.map(c => ({
          ...c,
          helper_count: helpMap[c.id] ?? 0,
          helper_names: nameMap[c.id] ?? [],
        })));
      }
    }

    if (player && !isCoach) {
      const { data: feesData } = await (supabase as any)
        .from('player_fees')
        .select('id, team_id, description, amount_due, discount, due_date, status, payee_type, payment_instructions, payment_token, claim_status, claim_amount, claim_method, event_id, events(title, event_date)')
        .eq('player_id', player.id)
        .in('status', ['outstanding', 'overdue', 'partial'])
        .order('due_date', { ascending: true, nullsFirst: false });
      setOutstandingFees((feesData ?? []).map((f: any) => ({
        ...f,
        event_title: f.events?.title ?? null,
        event_date: f.events?.event_date ?? null,
      })) as OutstandingFee[]);
    } else {
      setOutstandingFees([]);
    }

    if (!isCoach && profile?.id) {
      // get_my_guarded_players() also checks player_guardians — otherwise
      // a second guardian's guest-RSVP requests for their own kid never matched.
      const { data: allPlayerRows } = await (supabase as any).rpc('get_my_guarded_players').select('id');
      const allPlayerIds = (allPlayerRows ?? []).map((p: { id: string }) => p.id);
      if (allPlayerIds.length > 0) {
        const { data: guestRows } = await supabase
          .from('event_guests')
          .select('id, event_id, player_id, full_name')
          .in('player_id', allPlayerIds)
          .eq('status', 'pending');
        if (guestRows && guestRows.length > 0) {
          const eventIds = [...new Set(guestRows.map((g: any) => g.event_id as string))];
          const { data: evData } = await supabase
            .from('events')
            .select('id, title, type, event_date, event_time, team_id')
            .in('id', eventIds)
            .gte('event_date', today);
          const evMap: Record<string, any> = {};
          for (const e of (evData ?? [])) evMap[(e as any).id] = e;
          const teamIds = [...new Set((evData ?? []).map((e: any) => e.team_id as string))];
          const { data: teamsData } = await supabase.from('teams').select('id, name, club_id').in('id', teamIds);
          const teamMap: Record<string, string> = {};
          const teamClubMap: Record<string, string | null> = {};
          for (const t of (teamsData ?? [])) {
            teamMap[(t as any).id] = (t as any).name;
            teamClubMap[(t as any).id] = (t as any).club_id ?? null;
          }
          const invites: PendingGuestInvite[] = (guestRows as any[])
            .filter((g) => evMap[g.event_id])
            .map((g) => {
              const ev = evMap[g.event_id];
              return {
                id: g.id, event_id: g.event_id, player_id: g.player_id, full_name: g.full_name,
                event_title: ev.title, event_date: ev.event_date, event_time: ev.event_time ?? null,
                event_type: ev.type, team_name: teamMap[ev.team_id] ?? 'Guest Event',
                team_id: ev.team_id, club_id: teamClubMap[ev.team_id] ?? null,
              };
            })
            .sort((a, b) => a.event_date.localeCompare(b.event_date));
          setPendingGuestInvites(invites);
        } else {
          setPendingGuestInvites([]);
        }
      } else {
        setPendingGuestInvites([]);
      }
    } else {
      setPendingGuestInvites([]);
    }

    if (player) {
      const rsvpFetches: PromiseLike<void>[] = [];
      if (nextG) {
        rsvpFetches.push(
          supabase.from('event_rsvps').select('status').eq('event_id', nextG.id).eq('player_id', player.id).maybeSingle()
            .then(({ data }) => { setMyGameRsvpStatus((data as any)?.status ?? null); })
        );
      } else {
        setMyGameRsvpStatus(null);
      }
      if (nextT) {
        rsvpFetches.push(
          supabase.from('event_rsvps').select('status').eq('event_id', nextT.id).eq('player_id', player.id).maybeSingle()
            .then(({ data }) => { setMyTrainingRsvpStatus((data as any)?.status ?? null); })
        );
      } else {
        setMyTrainingRsvpStatus(null);
      }
      if (upcomingEventIds.length > 0) {
        rsvpFetches.push(
          supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('player_id', player.id).eq('status', 'attending').in('event_id', upcomingEventIds)
            .then(({ count: rc }) => { setMyRsvpCount(rc ?? 0); })
        );
      } else {
        setMyRsvpCount(0);
      }
      await Promise.all(rsvpFetches);

      // Attendance streak + season stats — players only
      if (!isCoach) {
        const { data: pastEvtsData } = await supabase
          .from('events')
          .select('id, type, event_date, title')
          .eq('team_id', team.id)
          .lt('event_date', today)
          .is('cancelled_at', null)
          .order('event_date', { ascending: false })
          .limit(40);
        const pastEvts = (pastEvtsData ?? []) as { id: string; type: string; event_date: string; title: string | null }[];
        const pastIds = pastEvts.map((e) => e.id);
        if (pastIds.length > 0) {
          const { data: attRows } = await supabase
            .from('event_attendance')
            .select('event_id, status')
            .eq('player_id', player.id)
            .in('event_id', pastIds);
          const attMap = new Map((attRows ?? []).map((r: any) => [r.event_id as string, r.status as string]));
          // Only coach-marked sessions, most-recent-first
          const history = pastEvts
            .filter((e) => attMap.has(e.id))
            .map((e) => ({ id: e.id, type: e.type, date: e.event_date, status: attMap.get(e.id) ?? null, title: e.title ?? null }));
          setAttendanceHistory(history);
          setSeasonTotalMarked(history.length);
          // WHOOP-style streak: one grace period allowed, but grace must be re-earned
          // with 3 consecutive clean sessions before it can be used again.
          function whoopStreak(evts: typeof history) {
            let streak = 0;
            let atRisk = false;
            let graceAvailable = true;
            let cleanAfterGrace = 0;
            for (const ev of evts) {
              if (ev.status === 'present') {
                streak++;
                if (atRisk) {
                  // Saved from at-risk — grace is now spent
                  atRisk = false;
                  graceAvailable = false;
                  cleanAfterGrace = 1;
                } else if (!graceAvailable) {
                  // Building back toward earning grace again
                  cleanAfterGrace++;
                  if (cleanAfterGrace >= 3) {
                    graceAvailable = true;
                    cleanAfterGrace = 0;
                  }
                }
              } else {
                if (graceAvailable) {
                  atRisk = true;
                  graceAvailable = false;
                } else {
                  break;
                }
              }
            }
            return { streak, atRisk };
          }
          const trainingHistory = history.filter((e) => e.type !== 'game');
          const gameHistory     = history.filter((e) => e.type === 'game');
          const cResult = whoopStreak(history);
          const tResult = whoopStreak(trainingHistory);
          const gResult = whoopStreak(gameHistory);
          setCombinedStreak(cResult.streak);
          setCombinedAtRisk(cResult.atRisk);
          setTrainingStreak(tResult.streak);
          setTrainingAtRisk(tResult.atRisk);
          setGameStreak(gResult.streak);
          setGameAtRisk(gResult.atRisk);
          setGamesTotal(gameHistory.length);
          setGamesAttended(gameHistory.filter((e) => e.status === 'present').length);
        }
      }
    } else {
      setMyGameRsvpStatus(null);
      setMyTrainingRsvpStatus(null);
      setMyRsvpCount(0);
    }

    {
      const [gameRsvps, trainingRsvps, gameGuests, trainingGuests] = await Promise.all([
        nextG ? supabase.from('event_rsvps').select('status').eq('event_id', nextG.id) : Promise.resolve({ data: null as null }),
        nextT ? supabase.from('event_rsvps').select('status').eq('event_id', nextT.id) : Promise.resolve({ data: null as null }),
        nextG ? supabase.from('event_guests').select('id', { count: 'exact', head: true }).eq('event_id', nextG.id).eq('status', 'confirmed') : Promise.resolve({ count: 0 }),
        nextT ? supabase.from('event_guests').select('id', { count: 'exact', head: true }).eq('event_id', nextT.id).eq('status', 'confirmed') : Promise.resolve({ count: 0 }),
      ]);
      if (nextG && gameRsvps.data) {
        const going = gameRsvps.data.filter((r: any) => r.status === 'attending').length;
        const notGoing = gameRsvps.data.filter((r: any) => r.status === 'not_attending').length;
        const confirmedGuests = (gameGuests as any).count ?? 0;
        setGameHeadcount({ going, notGoing, tbd: Math.max(0, (pc ?? 0) - going - notGoing), confirmedGuests });
      } else {
        setGameHeadcount(null);
      }
      if (nextT && trainingRsvps.data) {
        const going = trainingRsvps.data.filter((r: any) => r.status === 'attending').length;
        const notGoing = trainingRsvps.data.filter((r: any) => r.status === 'not_attending').length;
        const confirmedGuests = (trainingGuests as any).count ?? 0;
        setTrainingHeadcount({ going, notGoing, tbd: Math.max(0, (pc ?? 0) - going - notGoing), confirmedGuests });
      } else {
        setTrainingHeadcount(null);
      }
    }

    // Team Pulse — game vs training attendance this month (coaches only)
    if (isCoach && (pc ?? 0) > 0) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startStr = startOfMonth.toISOString().split('T')[0];
      const [{ data: gameEvts }, { data: trainingEvts }] = await Promise.all([
        supabase.from('events').select('id').eq('team_id', team.id)
          .eq('type', 'game').gte('event_date', startStr).lte('event_date', today).is('cancelled_at', null),
        supabase.from('events').select('id').eq('team_id', team.id)
          .in('type', ['training', 'other']).gte('event_date', startStr).lte('event_date', today).is('cancelled_at', null),
      ]);
      const gameIds = (gameEvts ?? []).map((e: { id: string }) => e.id);
      const trainingIds = (trainingEvts ?? []).map((e: { id: string }) => e.id);
      const [gameAtt, trainingAtt] = await Promise.all([
        gameIds.length > 0
          ? supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).in('event_id', gameIds).eq('status', 'attending')
          : Promise.resolve({ count: null }),
        trainingIds.length > 0
          ? supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).in('event_id', trainingIds).eq('status', 'attending')
          : Promise.resolve({ count: null }),
      ]);
      const playerN = pc ?? 0;
      setPulseGameEvents(gameIds.length);
      setPulseGamePct(gameIds.length > 0 && playerN > 0 ? Math.round(((gameAtt.count ?? 0) / (gameIds.length * playerN)) * 100) : null);
      setPulseTrainingEvents(trainingIds.length);
      setPulseTrainingPct(trainingIds.length > 0 && playerN > 0 ? Math.round(((trainingAtt.count ?? 0) / (trainingIds.length * playerN)) * 100) : null);
    }

    // Polls
    const { data: pollRows } = await sb
      .from('team_polls')
      .select('id, question, closes_at, is_anonymous, is_multiple_choice, result_visibility, rsvp_gated, event_id, created_by')
      .eq('team_id', team.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (pollRows?.length > 0) {
      const pollIds = (pollRows as any[]).map((p: any) => p.id as string);
      const [optionsRes, votesRes] = await Promise.all([
        sb.from('team_poll_options').select('id, poll_id, label, sort_order').in('poll_id', pollIds),
        sb.from('team_poll_votes').select('poll_id, option_id, profile_id').in('poll_id', pollIds),
      ]);

      // Track which events the current user RSVPed attending (for RSVP-gated polls)
      const gatedEventIds = [...new Set((pollRows as any[])
        .filter((p: any) => p.rsvp_gated && p.event_id)
        .map((p: any) => p.event_id as string))];
      if (gatedEventIds.length > 0 && player) {
        const { data: rsvpRows } = await supabase
          .from('event_rsvps')
          .select('event_id')
          .in('event_id', gatedEventIds)
          .eq('player_id', player.id)
          .eq('status', 'attending');
        setMyRsvpEventIds(new Set((rsvpRows ?? []).map((r: any) => r.event_id as string)));
      }

      const teamMemberCount = pc ?? 0;
      const builtPolls: Poll[] = (pollRows as any[]).map((p: any) => ({
        id: p.id,
        question: p.question,
        closes_at: p.closes_at,
        is_anonymous: p.is_anonymous,
        is_multiple_choice: p.is_multiple_choice,
        result_visibility: p.result_visibility,
        rsvp_gated: p.rsvp_gated,
        event_id: p.event_id,
        created_by: p.created_by,
        options: (optionsRes.data ?? []).filter((o: any) => o.poll_id === p.id),
        votes: (votesRes.data ?? []).filter((v: any) => v.poll_id === p.id),
        totalParticipants: teamMemberCount,
      }));
      setPolls(builtPolls);
    } else {
      setPolls([]);
    }

    } catch (e) {
      console.error('fetchData error', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    lastFetchRef.current = 0; // bypass 30s cache
    await fetchData();
    setRefreshing(false);
  }

  async function postCallout() {
    if (!team || !profile || !calloutTitle.trim()) return;
    setCalloutPosting(true);
    await (supabase as any).from('team_callouts').insert({
      team_id: team.id,
      title: calloutTitle.trim(),
      body: calloutBody.trim() || null,
      urgency: calloutUrgency,
      created_by: profile.id,
    });
    // Notify parents
    const pushTitle = calloutUrgency === 'urgent' ? `🚨 Urgent: ${calloutTitle.trim()}` : `📢 ${calloutTitle.trim()}`;
    sendTeamPush({
      teamId: team.id,
      title: pushTitle,
      body: calloutBody.trim() || 'Tap to respond',
      excludeProfileId: profile.id,
      data: { type: 'callout', team_id: team.id },
    });
    setCalloutTitle('');
    setCalloutBody('');
    setCalloutUrgency('normal');
    setShowCalloutModal(false);
    setCalloutPosting(false);
    await fetchData();
  }

  async function deleteCallout(calloutId: string) {
    Alert.alert('Delete callout?', 'This will remove the callout for all parents.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const snapshot = callouts;
          setCallouts(prev => prev.filter(c => c.id !== calloutId));
          const { error } = await (supabase as any).from('team_callouts').delete().eq('id', calloutId);
          if (error) {
            setCallouts(snapshot);
            Alert.alert('Error', 'Could not delete callout. Please try again.');
          }
        },
      },
    ]);
  }

  async function respondToCallout(calloutId: string, response: 'helping' | 'dismissed') {
    if (!profile?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCalloutResponses(prev => ({ ...prev, [calloutId]: response }));
    if (response === 'dismissed') {
      setCallouts(prev => prev.filter(c => c.id !== calloutId));
    }
    await (supabase as any).from('team_callout_responses').upsert(
      { callout_id: calloutId, profile_id: profile.id, response },
      { onConflict: 'callout_id,profile_id' }
    );
  }

  const handleDeletePoll = useCallback(async (pollId: string) => {
    const snapshot = polls;
    setPolls(prev => prev.filter(p => p.id !== pollId));
    const { error } = await (supabase as any).from('team_polls').delete().eq('id', pollId);
    if (error) { setPolls(snapshot); Alert.alert('Error', 'Could not delete poll.'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polls]);

  const handleVoteChange = useCallback((pollId: string, optionIds: string[]) => {
    if (!profile) return;
    setPolls(prev => prev.map(p => {
      if (p.id !== pollId) return p;
      const otherVotes = p.votes.filter(v => v.profile_id !== profile.id);
      const myNewVotes = optionIds.map(oid => ({ poll_id: pollId, option_id: oid, profile_id: profile.id }));
      return { ...p, votes: [...otherVotes, ...myNewVotes] };
    }));
  }, [profile?.id]);

  const handleGameDayPress = useCallback(() => {
    router.push(`/(app)/${slug}/game-day` as any);
  }, [slug]);

  async function handleGuestRespond(invite: PendingGuestInvite, status: 'confirmed' | 'declined') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGuestRespondLoading(invite.id);
    const snapshot = pendingGuestInvites;
    setPendingGuestInvites(prev => prev.filter(g => g.id !== invite.id));
    try {
      const { error } = await (supabase as any).from('event_guests').update({ status }).eq('id', invite.id);
      if (error) {
        setPendingGuestInvites(snapshot);
        Alert.alert('Error', 'Could not respond to invite. Please try again.');
        return;
      }
      // Notify coaches and org admins — the invite's own event/team club, not
      // the responding parent's home club (they may belong to several).
      const clubId = invite.club_id;
      const [{ data: coachRows }, { data: adminRows }] = await Promise.all([
        supabase.from('team_members').select('profile_id').eq('team_id', invite.team_id).eq('role', 'coach'),
        clubId
          ? supabase.from('profiles').select('id').eq('club_id', clubId).in('role', ['org_admin', 'app_admin'])
          : Promise.resolve({ data: [] as { id: string }[] }),
      ]);
      const recipientIds = [
        ...((coachRows ?? []) as any[]).map(r => r.profile_id as string),
        ...((adminRows ?? []) as any[]).map(r => r.id as string),
      ].filter((id, i, arr) => !!id && arr.indexOf(id) === i);
      if (recipientIds.length > 0) {
        await sendProfilesPush({
          profileIds: recipientIds,
          title: status === 'confirmed' ? 'Guest confirmed ✓' : 'Guest declined',
          body: status === 'confirmed'
            ? `${invite.full_name} confirmed as guest player — ${invite.event_title}.`
            : `${invite.full_name} declined the guest invitation for ${invite.event_title}.`,
          data: { type: status === 'confirmed' ? 'guest_accepted' : 'guest_response', event_id: invite.event_id, club_slug: slug },
        });
      }
    } catch (e) {
      setPendingGuestInvites(snapshot);
      Alert.alert('Error', 'Could not respond to invite. Please try again.');
    } finally {
      setGuestRespondLoading(null);
    }
  }

  async function payNow(fee: OutstandingFee) {
    if (!fee.payment_token) return;
    await WebBrowser.openBrowserAsync(`${APP_BASE}/pay/${fee.payment_token}`, {
      controlsColor: primaryColor,
      dismissButtonStyle: 'close',
    });
    fetchData();
  }

  function openClaim(fee: OutstandingFee) {
    const net = Math.max(0, fee.amount_due - (fee.discount ?? 0));
    setShowFeeModal(false);
    setClaimingFee(fee);
    setClaimAmount(net.toFixed(2));
    setClaimMethod('venmo');
    setClaimNote('');
  }

  async function submitClaim() {
    if (!claimingFee || !slug) return;
    const amount = parseFloat(claimAmount);
    if (!amount || amount <= 0) return;
    setClaimSaving(true);
    try {
      const { error } = await supabase.rpc('claim_fee_payment', {
        p_fee_id: claimingFee.id,
        p_amount: amount,
        p_method: claimMethod,
        p_note: claimNote.trim() || undefined,
      });
      if (error) {
        Alert.alert('Error', error.message ?? 'Could not submit — please try again.');
        return;
      }
      setOutstandingFees(prev => prev.map(f => f.id === claimingFee.id
        ? { ...f, claim_status: 'pending', claim_amount: amount, claim_method: claimMethod }
        : f));

      const { data: coachRows } = await supabase.from('team_members').select('profile_id').eq('team_id', claimingFee.team_id).eq('role', 'coach');
      const recipientIds = ((coachRows ?? []) as { profile_id: string }[]).map(r => r.profile_id).filter(Boolean);
      if (recipientIds.length > 0) {
        await sendProfilesPush({
          profileIds: recipientIds,
          title: '💳 Payment claimed',
          body: `${profile?.full_name ?? 'A parent'} says they paid $${amount.toFixed(2)} via ${claimMethod} for ${claimingFee.description}.`,
          data: { type: 'fee_payment_claimed', player_fee_id: claimingFee.id, club_slug: slug },
        });
      }
      setClaimingFee(null);
    } catch {
      Alert.alert('Error', 'Could not submit — please try again.');
    } finally {
      setClaimSaving(false);
    }
  }

  async function handleRsvp(
    event: NextEvent,
    status: 'attending' | 'not_attending',
    currentStatus: string | null,
    setStatus: (s: string | null) => void,
    setLoading: (b: boolean) => void,
  ) {
    if (!myPlayer) return;
    if (event.rsvp_lock_at && new Date(event.rsvp_lock_at) <= new Date()) {
      Alert.alert('RSVP closed', 'The RSVP window for this event has closed. Contact your coach if you need to make a change.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      if (currentStatus === status) {
        const { error } = await supabase.from('event_rsvps').delete().eq('event_id', event.id).eq('player_id', myPlayer.id);
        if (!error) {
          setStatus(null);
          if (status === 'attending') setMyRsvpCount((c) => Math.max(0, c - 1));
        }
      } else {
        const { error } = await supabase.from('event_rsvps').upsert(
          { event_id: event.id, player_id: myPlayer.id, responded_by: profile?.id, status },
          { onConflict: 'event_id,player_id' }
        );
        if (!error) {
          if (status === 'attending') setMyRsvpCount((c) => c + 1);
          else if (currentStatus === 'attending') setMyRsvpCount((c) => Math.max(0, c - 1));
          setStatus(status);
        }
      }
    } catch (e) {
      console.error('handleRsvp error', e);
    } finally {
      setLoading(false);
    }
  }

  if ((teamLoading || loading) && !hasLoadedOnceRef.current) {
    return <HomeSkeleton />;
  }

  const teamName = team?.name ?? club?.name ?? 'Your Team';

  // Team-switcher grouping — only show club section headers once a second
  // club's teams actually show up (e.g. a guest-coach assignment), so the
  // common single-club case looks exactly as it always has.
  const teamsByClub: { clubId: string; clubName: string; teams: typeof allTeams }[] = [];
  for (const t of allTeams) {
    const clubId = t.club?.id ?? 'unknown';
    let group = teamsByClub.find((g) => g.clubId === clubId);
    if (!group) { group = { clubId, clubName: t.club?.name ?? 'Other', teams: [] }; teamsByClub.push(group); }
    group.teams.push(t);
  }
  const multiClub = teamsByClub.length > 1;

  const playerColor = positionColor(myPlayer?.position ?? null);
  const playerInitials = myPlayer?.full_name
    ? myPlayer.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const playerAvatarUrl = myPlayer?.photo_url ?? null;

  function renderNextCard(
    label: string,
    event: NextEvent | null,
    weather: WeatherData | null,
    driveTime: string | null,
    headcount: Headcount | null,
    rsvpStatus: string | null,
    rsvpLoading: boolean,
    onRsvp: (s: 'attending' | 'not_attending') => void,
    topMargin = 0,
  ) {
    const cfg = event ? (TYPE_CONFIG[event.type] ?? TYPE_CONFIG.other) : null;
    const accentColor = cfg?.color ?? primaryColor;
    const kitColor = event?.uniform === 'home' ? homeKitColor
      : event?.uniform === 'away' ? awayKitColor
      : event?.uniform === 'training' ? trainingKitColor
      : null;
    const uniformLabel = event?.type === 'game'
      ? (event?.home_away === 'away' ? 'AWAY' : 'HOME')
      : null;

    return (
      <View key={label}>
        <View style={[styles.sectionTitleRow, { marginTop: topMargin }]}>
          <View style={[styles.sectionTitleDot, { backgroundColor: accentColor }]} />
          <Text style={styles.sectionTitle}>{label}</Text>
        </View>
        {event && cfg ? (
          <TouchableOpacity
            style={[styles.nextEventCard, { marginBottom: 28, borderLeftWidth: 3, borderLeftColor: accentColor }]}
            onPress={() => router.push(`/(app)/${slug}/event/${event.id}` as never)}
            activeOpacity={0.85}
          >
            {/* Title block left · solid badge + drive time right */}
            <View style={styles.nextCardHeader}>
              <View style={styles.nextCardTitleBlock}>
                {uniformLabel ? (
                  <View style={[styles.nextCardUniformBadge,
                    event.home_away === 'home'
                      ? { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }
                      : { backgroundColor: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.3)' },
                  ]}>
                    <Text style={[styles.nextCardUniformBadgeText,
                      { color: event.home_away === 'home' ? '#22C55E' : '#60A5FA' },
                    ]}>{uniformLabel}</Text>
                  </View>
                ) : null}
                <Text style={styles.nextCardTitle} numberOfLines={1}>{event.title}</Text>
              </View>
              <View style={styles.nextCardTopRight}>
                <View style={[styles.nextCardBadge, { backgroundColor: accentColor }]}>
                  <Text style={styles.nextCardBadgeText}>
                    {formatDate(event.event_date).toUpperCase()}
                  </Text>
                </View>
                {driveTime ? (
                  <View style={styles.nextCardDrivePill}>
                    <Ionicons name="car-outline" size={11} color={PULSE_COLORS.ui.muted} />
                    <Text style={styles.nextCardDrivePillText}>{driveTime}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Date/time + location */}
            <View style={styles.nextCardMeta}>
              <View style={styles.nextCardMetaRow}>
                <Ionicons name="time-outline" size={12} color={PULSE_COLORS.ui.muted} />
                <Text style={styles.nextCardMetaText}>
                  {new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {event.event_time ? `  ·  ${formatTime(event.event_time)}` : ''}
                  {event.event_time && event.arrival_buffer_minutes != null
                    ? `  ·  Arrive ${computeArriveBy(event.event_time, event.arrival_buffer_minutes)}`
                    : ''}
                </Text>
              </View>
              {event.location ? (
                <View style={styles.nextCardMetaRow}>
                  <Ionicons name="location-outline" size={12} color={PULSE_COLORS.ui.muted} />
                  <Text style={styles.nextCardMetaText} numberOfLines={1}>{event.location}</Text>
                </View>
              ) : null}
            </View>

            {/* Context chips: weather + surface + kit — unified row */}
            {(weather || event.field_type || kitColor) ? (
              <View style={styles.nextCardChipRow}>
                {weather ? (
                  <View style={[styles.nextCardChip, styles.nextCardChipWeather]}>
                    <Text style={styles.nextCardChipEmoji}>{weather.icon}</Text>
                    <Text style={[styles.nextCardChipText, { color: PULSE_COLORS.ui.textSecondary }]}>
                      {weather.temp_f}°F{weather.precip_chance >= 20 ? `  💧${weather.precip_chance}%` : ''}
                    </Text>
                  </View>
                ) : null}
                {event.field_type === 'grass' ? (
                  <View style={[styles.nextCardChip, { borderColor: 'rgba(34,197,94,0.25)', backgroundColor: 'rgba(34,197,94,0.08)' }]}>
                    <Text style={[styles.nextCardChipText, { color: '#22C55E' }]}>Grass</Text>
                  </View>
                ) : event.field_type === 'turf' ? (
                  <View style={[styles.nextCardChip, { borderColor: 'rgba(59,130,246,0.25)', backgroundColor: 'rgba(59,130,246,0.08)' }]}>
                    <Text style={[styles.nextCardChipText, { color: '#3B82F6' }]}>Turf</Text>
                  </View>
                ) : event.field_type === 'indoor' ? (
                  <View style={[styles.nextCardChip, { borderColor: 'rgba(156,163,175,0.25)', backgroundColor: 'rgba(156,163,175,0.08)' }]}>
                    <Ionicons name="business-outline" size={11} color="#9CA3AF" />
                    <Text style={[styles.nextCardChipText, { color: '#9CA3AF' }]}>Indoor</Text>
                  </View>
                ) : null}
                {kitColor ? (
                  <View style={[styles.nextCardChip, { borderColor: `${kitColor}35`, backgroundColor: `${kitColor}12` }]}>
                    <Ionicons name="shirt" size={11} color={kitColor} />
                    <Text style={[styles.nextCardChipText, { color: kitColor, fontWeight: '700' }]}>
                      {event.uniform === 'home' ? 'Home' : event.uniform === 'away' ? 'Away' : 'Training'} Kit
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Attendance bar — visible to all when headcount available */}
            {headcount && (headcount.going + headcount.notGoing + headcount.tbd) > 0 ? (() => {
              const guests   = headcount.confirmedGuests ?? 0;
              const going    = headcount.going + guests;
              const cantGo   = headcount.notGoing;
              const pending  = headcount.tbd;
              const total    = going + cantGo + pending;
              const goingPct   = Math.round((going   / total) * 100);
              const cantPct    = Math.min(100 - goingPct, Math.round((cantGo  / total) * 100));
              const pendingPct = 100 - goingPct - cantPct;
              const inner = (
                <>
                  <View style={styles.attendanceBarTrack}>
                    {goingPct   > 0 && <View style={[styles.attendanceBarSeg, { flex: goingPct,   backgroundColor: '#22C55E' }]} />}
                    {cantPct    > 0 && <View style={[styles.attendanceBarSeg, { flex: cantPct,    backgroundColor: '#EF4444' }]} />}
                    {pendingPct > 0 && <View style={[styles.attendanceBarSeg, { flex: pendingPct, backgroundColor: PULSE_COLORS.ui.border }]} />}
                  </View>
                  <View style={styles.attendanceBarLegend}>
                    <View style={styles.attendanceBarLegendItem}>
                      <View style={[styles.attendanceBarDot, { backgroundColor: '#22C55E' }]} />
                      <Text style={styles.attendanceBarLegendText}>{going} going{guests > 0 ? ` (+${guests}G)` : ''}</Text>
                    </View>
                    <View style={styles.attendanceBarLegendItem}>
                      <View style={[styles.attendanceBarDot, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.attendanceBarLegendText}>{cantGo} can't</Text>
                    </View>
                    <View style={styles.attendanceBarLegendItem}>
                      <View style={[styles.attendanceBarDot, { backgroundColor: PULSE_COLORS.ui.border }]} />
                      <Text style={styles.attendanceBarLegendText}>{pending} pending</Text>
                    </View>
                    {isCoach && (
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Ionicons name="chevron-forward" size={12} color={PULSE_COLORS.ui.muted} />
                      </View>
                    )}
                  </View>
                </>
              );
              return isCoach ? (
                <TouchableOpacity
                  style={styles.attendanceBarWrap}
                  onPress={() => router.push({ pathname: `/(app)/${slug}/event/${event.id}`, params: { section: 'attendance' } } as never)}
                  activeOpacity={0.7}
                >
                  {inner}
                </TouchableOpacity>
              ) : (
                <View style={styles.attendanceBarWrap}>{inner}</View>
              );
            })() : null}

            {/* RSVP — parents with a linked player */}
            {!isCoach && myPlayer ? (
              <View style={styles.nextEventRsvpRow}>
                <TouchableOpacity
                  style={[styles.rsvpBtn,
                    rsvpStatus === 'attending'
                      ? { backgroundColor: rgba(0.14), borderColor: rgba(0.35) }
                      : { backgroundColor: 'transparent', borderColor: PULSE_COLORS.ui.border },
                  ]}
                  onPress={() => onRsvp('attending')}
                  disabled={rsvpLoading}
                  activeOpacity={rsvpStatus === 'attending' ? 1 : 0.75}
                >
                  <Ionicons
                    name={rsvpStatus === 'attending' ? 'checkmark-circle' : 'checkmark-circle-outline'}
                    size={15}
                    color={rsvpStatus === 'attending' ? primaryColor : PULSE_COLORS.ui.muted}
                  />
                  <Text style={[styles.rsvpBtnText,
                    { color: rsvpStatus === 'attending' ? primaryColor : PULSE_COLORS.ui.muted },
                  ]}>Going</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rsvpBtn,
                    rsvpStatus === 'not_attending'
                      ? { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }
                      : { backgroundColor: 'transparent', borderColor: PULSE_COLORS.ui.border },
                  ]}
                  onPress={() => onRsvp('not_attending')}
                  disabled={rsvpLoading}
                  activeOpacity={rsvpStatus === 'not_attending' ? 1 : 0.75}
                >
                  <Ionicons
                    name={rsvpStatus === 'not_attending' ? 'close-circle' : 'close-circle-outline'}
                    size={15}
                    color={rsvpStatus === 'not_attending' ? PULSE_COLORS.rsvp.not_attending : PULSE_COLORS.ui.muted}
                  />
                  <Text style={[styles.rsvpBtnText,
                    { color: rsvpStatus === 'not_attending' ? PULSE_COLORS.rsvp.not_attending : PULSE_COLORS.ui.muted },
                  ]}>Can't go</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.noEvent, { marginBottom: 28 }]}
            onPress={isCoach ? () => router.push(`/(app)/${slug}/create-event` as never) : undefined}
            activeOpacity={isCoach ? 0.75 : 1}
          >
            <Text style={styles.noEventText}>
              {label === 'NEXT GAME' ? 'No upcoming games' : 'No upcoming training'}
            </Text>
            {isCoach ? (
              <Text style={[styles.noEventText, { color: primaryColor, fontSize: 12, marginTop: 4 }]}>
                Tap to create one →
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: 0 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
      >

        {/* ── Club Hero Banner ── */}
        <View style={[styles.heroBanner, { paddingTop: insets.top + 12, backgroundColor: primaryColor }]}>
          {/* Dark tint keeps white text readable across any club color */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} pointerEvents="none" />
          {/* Icon buttons top-right */}
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.heroIconBtn} onPress={() => router.push(`/(app)/${slug}/notifications` as never)}>
              <View>
                <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.9)" />
                {unreadNotifCount > 0 && <View style={styles.notifBadge} />}
              </View>
            </TouchableOpacity>
            {isCoach && (
              <TouchableOpacity style={styles.heroIconBtn} onPress={() => router.push(`/(app)/${slug}/admin` as never)}>
                <Ionicons name="grid-outline" size={20} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.heroIconBtn} onPress={() => router.push(`/(app)/${slug}/settings` as never)}>
              <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>

          {/* Logo + club name centred */}
          <TouchableOpacity
            style={styles.heroBrand}
            onPress={() => hasMultipleTeams && setTeamPickerOpen(true)}
            activeOpacity={hasMultipleTeams ? 0.75 : 1}
            onLongPress={handleGreetingTap}
          >
            {/* Badge */}
            <View style={styles.heroBadgeGlow}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={{ width: 88, height: 88 }} contentFit="contain" />
              ) : (
                <View style={[styles.heroBadgeRing, { borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <Text style={[styles.heroBadgeLetters, { color: secondaryColor || '#fff' }]}>
                    {clubName.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'FC'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.heroClubName}>{clubName}</Text>
            <View style={styles.heroTeamRow}>
              <Text style={styles.heroTeamName}>{teamName}</Text>
              {hasMultipleTeams && (
                <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.6)" style={{ marginTop: 1 }} />
              )}
            </View>
          </TouchableOpacity>

          {/* Greeting */}
          <Text style={styles.heroGreeting}>{greeting(profile?.full_name)}</Text>
          {!isCoach && myPlayer && (
            <Text style={styles.heroPlayerName}>
              {myPlayer.full_name}{myPlayer.jersey_number != null ? ` · #${myPlayer.jersey_number}` : ''}
            </Text>
          )}
        </View>


        {/* Outstanding fees — parents only, shown first so it's impossible to miss */}
        {!isCoach && outstandingFees.length > 0 && (() => {
          const hasOverdue = outstandingFees.some(f => f.status === 'overdue' || (f.due_date && new Date(f.due_date) < new Date()));
          const accentColor = hasOverdue ? PULSE_COLORS.status.error : PULSE_COLORS.status.warning;
          const totalOwed = outstandingFees.reduce((s, f) => s + Math.max(0, f.amount_due - (f.discount ?? 0)), 0);
          const single = outstandingFees.length === 1 ? outstandingFees[0] : null;
          const fmtDue = (due: string | null) => {
            if (!due) return null;
            const d = new Date(due + 'T00:00:00');
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          };
          return (
            <>
              <View style={[styles.sectionTitleRow, { marginTop: 20 }]}>
                <View style={[styles.sectionTitleDot, { backgroundColor: accentColor }]} />
                <Text style={[styles.sectionTitle, { color: accentColor }]}>OUTSTANDING FEES</Text>
              </View>
              <TouchableOpacity
                style={[styles.feeCard, { borderColor: `${accentColor}40` }]}
                onPress={() => setShowFeeModal(true)}
                activeOpacity={0.85}
              >
                <View style={[styles.feeAccent, { backgroundColor: accentColor }]} />
                <View style={styles.feeBody}>
                  <View style={styles.feeTop}>
                    <View style={[styles.feeIconWrap, { backgroundColor: `${accentColor}18` }]}>
                      <Ionicons name="card-outline" size={20} color={accentColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      {single ? (
                        <>
                          <Text style={styles.feeTitle}>{single.description}</Text>
                          <Text style={[styles.feeAmount, { color: accentColor }]}>
                            ${Math.max(0, single.amount_due - (single.discount ?? 0)).toFixed(2)}
                            {fmtDue(single.due_date) ? `  ·  Due ${fmtDue(single.due_date)}` : ''}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.feeTitle}>{outstandingFees.length} fees outstanding</Text>
                          <Text style={[styles.feeAmount, { color: accentColor }]}>${totalOwed.toFixed(2)} total</Text>
                        </>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
                  </View>
                  {hasOverdue && (
                    <View style={styles.feeOverdueBadge}>
                      <Ionicons name="alert-circle-outline" size={12} color={PULSE_COLORS.status.error} />
                      <Text style={styles.feeOverdueText}>Payment overdue — tap to view</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </>
          );
        })()}

        {/* ── Pending guest invites — players only ── */}
        {!isCoach && pendingGuestInvites.length > 0 && (
          <>
            <View style={[styles.sectionTitleRow, { marginTop: 20 }]}>
              <View style={[styles.sectionTitleDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.sectionTitle}>GUEST INVITES</Text>
              <View style={styles.guestInviteBadge}>
                <Text style={styles.guestInviteBadgeText}>{pendingGuestInvites.length}</Text>
              </View>
            </View>
            {pendingGuestInvites.map(invite => {
              const cfg = TYPE_CONFIG[invite.event_type] ?? TYPE_CONFIG.other;
              return (
                <View key={invite.id} style={styles.guestInviteCard}>
                  <View style={[styles.guestInviteAccent, { backgroundColor: cfg.color }]} />
                  <View style={styles.guestInviteBody}>
                    <View style={styles.guestInviteTopRow}>
                      <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                      <Text style={[styles.guestInviteTag, { color: cfg.color }]}>{invite.event_type.toUpperCase()}</Text>
                      <Text style={styles.guestInviteTeam}>{invite.team_name}</Text>
                    </View>
                    <Text style={styles.guestInviteTitle}>{invite.event_title}</Text>
                    <Text style={styles.guestInviteDate}>
                      {formatDate(invite.event_date)}{invite.event_time ? `  ·  ${formatTime(invite.event_time)}` : ''}
                    </Text>
                    <Text style={styles.guestInviteSubtext}>
                      You've been invited to play as a guest — {invite.full_name}
                    </Text>
                    <View style={styles.guestInviteActions}>
                      <TouchableOpacity
                        style={[styles.guestInviteBtn, { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}
                        onPress={() => handleGuestRespond(invite, 'confirmed')}
                        activeOpacity={0.75}
                        disabled={guestRespondLoading === invite.id}
                      >
                        <Ionicons name="checkmark" size={14} color="#22C55E" />
                        <Text style={[styles.guestInviteBtnText, { color: '#22C55E' }]}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.guestInviteBtn, { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}
                        onPress={() => handleGuestRespond(invite, 'declined')}
                        activeOpacity={0.75}
                        disabled={guestRespondLoading === invite.id}
                      >
                        <Ionicons name="close" size={14} color="#EF4444" />
                        <Text style={[styles.guestInviteBtnText, { color: '#EF4444' }]}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Unsigned waiver banner */}
        {unsignedWaiverCount > 0 && (
          <TouchableOpacity
            onPress={() => router.push(`/(app)/${slug}/sign-waivers` as never)}
            activeOpacity={0.85}
            style={styles.waiverBanner}
          >
            <View style={styles.waiverBannerIcon}>
              <Ionicons name="document-text" size={16} color="#92400E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.waiverBannerTitle}>
                {unsignedWaiverCount === 1 ? '1 waiver needs your signature' : `${unsignedWaiverCount} waivers need your signature`}
              </Text>
              <Text style={styles.waiverBannerSub}>Tap to review and sign</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#92400E" />
          </TouchableOpacity>
        )}

        {/* Game Day Outlook — coaches only */}
        {isCoach && (
          <GameDayWidget onPress={handleGameDayPress} />
        )}

        {/* Team Pulse — coaches only */}
        {isCoach && (
          <>
            <View style={[styles.sectionTitleRow, { marginTop: 20 }]}>
              <View style={[styles.sectionTitleDot, { backgroundColor: primaryColor }]} />
              <Text style={styles.sectionTitle}>TEAM PULSE</Text>
            </View>
            <View style={[styles.pulseCard, { borderLeftWidth: 3, borderLeftColor: primaryColor }]}>
              <Text style={styles.pulseCardHeader}>RSVP ATTENDANCE · THIS MONTH</Text>
              <View style={styles.pulseMetricRow}>
                {/* Game attendance % this month */}
                {(() => {
                  const pct = pulseGamePct;
                  const color = pct == null ? PULSE_COLORS.ui.muted
                    : pct >= 75 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444';
                  return (
                    <View style={styles.pulseMetric}>
                      <Text style={[styles.pulseMetricNum, { color }]}>
                        {pct != null ? `${pct}%` : '—'}
                      </Text>
                      <Text style={styles.pulseMetricLabel}>
                        {`Games\n${pulseGameEvents > 0 ? `${pulseGameEvents} played` : 'none yet'}`}
                      </Text>
                      {pct != null && (
                        <View style={styles.pulseBar}>
                          <View style={[styles.pulseBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                        </View>
                      )}
                    </View>
                  );
                })()}

                <View style={styles.pulseDivider} />

                {/* Training attendance % this month */}
                {(() => {
                  const pct = pulseTrainingPct;
                  const color = pct == null ? PULSE_COLORS.ui.muted
                    : pct >= 75 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444';
                  return (
                    <View style={styles.pulseMetric}>
                      <Text style={[styles.pulseMetricNum, { color }]}>
                        {pct != null ? `${pct}%` : '—'}
                      </Text>
                      <Text style={styles.pulseMetricLabel}>
                        {`Training\n${pulseTrainingEvents > 0 ? `${pulseTrainingEvents} session${pulseTrainingEvents !== 1 ? 's' : ''} held` : 'none yet'}`}
                      </Text>
                      {pct != null && (
                        <View style={styles.pulseBar}>
                          <View style={[styles.pulseBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            </View>
          </>
        )}

        {/* MY SEASON — players with coach-marked attendance */}
        {!isCoach && myPlayer && seasonTotalMarked > 0 && (() => {
          const superStreak = combinedStreak >= 10 && (gamesTotal === 0 || gamesAttended === gamesTotal);
          // Flame tier — WHOOP-style color progression
          const flameTier = combinedAtRisk
            ? { color: '#60A5FA', glow: '#60A5FA', label: '⚡ At risk' }
            : combinedStreak >= 10
              ? { color: '#A855F7', glow: '#A855F7', label: '⭐ Legendary' }
              : combinedStreak >= 6
                ? { color: '#EF4444', glow: '#EF4444', label: '🔥 On fire' }
                : combinedStreak >= 3
                  ? { color: '#F97316', glow: '#F97316', label: 'Building' }
                  : combinedStreak >= 1
                    ? { color: '#EAB308', glow: '#EAB308', label: 'Getting started' }
                    : { color: PULSE_COLORS.ui.muted, glow: 'transparent', label: 'No streak yet' };
          const gPerfect = gamesTotal > 0 && gamesAttended === gamesTotal;
          return (
            <>
              <View style={[styles.sectionTitleRow, { marginTop: 16 }]}>
                <View style={[styles.sectionTitleDot, { backgroundColor: superStreak ? '#F59E0B' : primaryColor }]} />
                <Text style={styles.sectionTitle}>{(myPlayer?.full_name?.split(' ')[0] ?? 'MY').toUpperCase()}'S SEASON</Text>
                {superStreak && <Text style={styles.superStreakChip}>⭐ SUPER STREAK</Text>}
              </View>
              <TouchableOpacity
                style={[styles.seasonCard, { borderLeftWidth: 3, borderLeftColor: superStreak ? '#F59E0B' : flameTier.color }]}
                onPress={() => setShowAttendanceSheet(true)}
                activeOpacity={0.85}
              >
                {/* Streak — bare emoji with glow, no container */}
                <View style={styles.seasonStat}>
                  <Text style={[styles.seasonFlameEmoji, {
                    textShadowColor: flameTier.glow,
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: combinedStreak >= 1 ? 12 : 0,
                  }]}>🔥</Text>
                  <Text style={[styles.seasonStatNum, { color: flameTier.color }]}>{combinedStreak}</Text>
                  <Text style={styles.seasonStatLabel}>{flameTier.label}</Text>
                </View>

                {/* Game sub-stat */}
                {gamesTotal > 0 && (
                  <>
                    <View style={styles.seasonDivider} />
                    <View style={[styles.seasonStat, { flex: 0.85 }]}>
                      <Text style={[styles.seasonFlameEmoji, gPerfect ? {
                        textShadowColor: '#22C55E',
                        textShadowOffset: { width: 0, height: 0 },
                        textShadowRadius: 10,
                      } : {}]}>{gPerfect ? '🥇' : '⚽'}</Text>
                      <Text style={[styles.seasonStatNum, { color: gPerfect ? '#22C55E' : PULSE_COLORS.ui.muted, fontSize: 28, paddingTop: 6 }]}>
                        {gamesAttended}/{gamesTotal}
                      </Text>
                      <Text style={styles.seasonStatLabel}>{gPerfect ? 'Perfect!' : 'Games'}</Text>
                    </View>
                  </>
                )}

                <View style={styles.seasonTapHint}>
                  <Ionicons name="chevron-forward" size={13} color={PULSE_COLORS.ui.muted} />
                </View>
              </TouchableOpacity>
            </>
          );
        })()}

        {/* ── Callouts ── */}
        {(callouts.length > 0 || isCoach) && (
          <>
            <View style={[styles.sectionTitleRow, { marginTop: isCoach ? 0 : 8 }]}>
              <View style={[styles.sectionTitleDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.sectionTitle}>TEAM CALLOUT</Text>
              {isCoach && callouts.length > 0 && (
                <TouchableOpacity
                  style={styles.calloutAddBtn}
                  onPress={() => setShowCalloutModal(true)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="add" size={13} color="#F59E0B" />
                  <Text style={styles.calloutAddBtnText}>New</Text>
                </TouchableOpacity>
              )}
            </View>
            {callouts.filter(c => calloutResponses[c.id] !== 'dismissed').map(callout => {
              const myResponse = calloutResponses[callout.id];
              const isHelping = myResponse === 'helping';
              const isUrgent = callout.urgency === 'urgent';
              const accentColor = isUrgent ? '#EF4444' : '#F59E0B';
              return (
                <View key={callout.id} style={[styles.calloutCard, isUrgent && { borderColor: 'rgba(239,68,68,0.25)' }]}>
                  <View style={[styles.calloutAccent, { backgroundColor: accentColor }]} />
                  <View style={styles.calloutBody}>
                    <View style={styles.calloutHeader}>
                      {isUrgent
                        ? <Ionicons name="warning-outline" size={14} color={accentColor} />
                        : <Ionicons name="hand-right-outline" size={14} color={accentColor} />}
                      <View style={{ flex: 1 }}>
                        {isUrgent && (
                          <Text style={[styles.calloutUrgencyBadge, { color: accentColor }]}>URGENT</Text>
                        )}
                        <Text style={styles.calloutTitle}>{callout.title}</Text>
                      </View>
                      {isCoach ? (
                        <TouchableOpacity onPress={() => deleteCallout(callout.id)} style={styles.calloutDeleteBtn} activeOpacity={0.7}>
                          <Ionicons name="trash-outline" size={14} color={PULSE_COLORS.ui.muted} />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => respondToCallout(callout.id, 'dismissed')} style={styles.calloutDeleteBtn} activeOpacity={0.7}>
                          <Ionicons name="close" size={15} color={PULSE_COLORS.ui.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                    {callout.body ? <Text style={styles.calloutBodyText}>{callout.body}</Text> : null}
                    {isCoach ? (
                      <View style={styles.calloutCoachFooter}>
                        <Ionicons name="people-outline" size={12} color={(callout.helper_count ?? 0) > 0 ? accentColor : PULSE_COLORS.ui.muted} />
                        {(callout.helper_count ?? 0) === 0 ? (
                          <Text style={styles.calloutHelperCount}>No responses yet</Text>
                        ) : (
                          <Text style={[styles.calloutHelperCount, { color: accentColor }]}>
                            {callout.helper_names && callout.helper_names.length > 0
                              ? callout.helper_names.slice(0, 3).join(', ') + (callout.helper_names.length > 3 ? ` +${callout.helper_names.length - 3} more` : '')
                              : `${callout.helper_count} helping`}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.calloutHelpBtn,
                          isHelping ? styles.calloutHelpBtnActive : isUrgent && { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' },
                        ]}
                        onPress={() => !isHelping && respondToCallout(callout.id, 'helping')}
                        activeOpacity={isHelping ? 1 : 0.75}
                      >
                        <Ionicons
                          name={isHelping ? 'checkmark-circle' : 'hand-right-outline'}
                          size={15}
                          color={isHelping ? '#22C55E' : accentColor}
                        />
                        <Text style={[styles.calloutHelpBtnText, { color: isHelping ? '#22C55E' : accentColor }]}>
                          {isHelping ? "You're helping  ✓" : isUrgent ? 'I can help — count me in' : 'I can help'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}
        {isCoach && callouts.length === 0 && (
          <SectionEmptyCTA
            icon="hand-right-outline"
            color="#F59E0B"
            label="Post a callout to parents"
            onPress={() => setShowCalloutModal(true)}
          />
        )}

        {/* ── Polls ── */}
        {(polls.length > 0 || isCoach) && (
          <>
            <View style={[styles.sectionTitleRow, { marginTop: 8 }]}>
              <View style={[styles.sectionTitleDot, { backgroundColor: '#818CF8' }]} />
              <Text style={styles.sectionTitle}>POLLS</Text>
              {isCoach && polls.length > 0 && (
                <TouchableOpacity
                  style={styles.calloutAddBtn}
                  onPress={() => setShowPollModal(true)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="add" size={13} color="#818CF8" />
                  <Text style={[styles.calloutAddBtnText, { color: '#818CF8' }]}>New</Text>
                </TouchableOpacity>
              )}
            </View>
            {polls.length > 0 ? polls.map(poll => (
              <PollCard
                key={poll.id}
                poll={poll}
                myProfileId={profile?.id ?? ''}
                isCoach={isCoach}
                myRsvpEventIds={myRsvpEventIds}
                primaryColor={primaryColor}
                rgba={rgba}
                onDelete={handleDeletePoll}
                onVoteChange={handleVoteChange}
              />
            )) : isCoach ? (
              <SectionEmptyCTA
                icon="bar-chart-outline"
                color="#818CF8"
                label="Ask your team a question"
                onPress={() => setShowPollModal(true)}
              />
            ) : null}
          </>
        )}

        {/* Next Game + Next Training — soonest event first */}
        {(() => {
          const eventDateTime = (e: NextEvent) => `${e.event_date}T${e.event_time ?? '00:00'}`;
          const gameFirst = !nextGame ? false
            : !nextTraining ? true
            : eventDateTime(nextGame) <= eventDateTime(nextTraining);
          const firstMargin = isCoach ? 20 : (myPlayer && seasonTotalMarked > 0 ? 20 : 28);
          const gameCard = renderNextCard(
            'NEXT GAME',
            nextGame,
            nextGameWeather,
            nextGameDriveTime,
            gameHeadcount,
            myGameRsvpStatus,
            gameRsvpLoading,
            (s) => nextGame && handleRsvp(nextGame, s, myGameRsvpStatus, setMyGameRsvpStatus, setGameRsvpLoading),
            gameFirst ? firstMargin : 0,
          );
          const trainingCard = renderNextCard(
            'NEXT TRAINING',
            nextTraining,
            nextTrainingWeather,
            nextTrainingDriveTime,
            trainingHeadcount,
            myTrainingRsvpStatus,
            trainingRsvpLoading,
            (s) => nextTraining && handleRsvp(nextTraining, s, myTrainingRsvpStatus, setMyTrainingRsvpStatus, setTrainingRsvpLoading),
            gameFirst ? 0 : firstMargin,
          );
          return gameFirst ? <>{gameCard}{trainingCard}</> : <>{trainingCard}{gameCard}</>;
        })()}


        {/* My Player — parents only */}
        {!isCoach && myPlayer && (
          <>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionTitleDot, { backgroundColor: primaryColor }]} />
              <Text style={styles.sectionTitle}>MY PLAYER</Text>
            </View>
            <TouchableOpacity
              style={styles.myPlayerCard}
              onPress={() => router.push(`/(app)/${slug}/player/${myPlayer.id}` as never)}
              activeOpacity={0.8}
            >
              {/* Avatar */}
              <View style={[styles.playerAvatarRing, { borderColor: playerColor }]}>
                {playerAvatarUrl ? (
                  <Image source={{ uri: playerAvatarUrl }} style={styles.playerAvatarPhoto} />
                ) : (
                  <View style={[styles.playerAvatarFill, { backgroundColor: `${playerColor}20` }]}>
                    <Text style={[styles.playerAvatarText, { color: playerColor }]}>{playerInitials}</Text>
                  </View>
                )}
              </View>

              {/* Info */}
              <View style={styles.myPlayerBody}>
                <Text style={styles.myPlayerName}>{myPlayer.full_name}</Text>
                <View style={styles.myPlayerBadges}>
                  {myPlayer.jersey_number != null && (
                    <View style={[styles.jerseyBadge, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
                      <Text style={[styles.jerseyBadgeText, { color: primaryColor }]}>#{myPlayer.jersey_number}</Text>
                    </View>
                  )}
                  {myPlayer.position && (
                    <View style={[styles.posBadge, { backgroundColor: `${playerColor}18`, borderColor: `${playerColor}35` }]}>
                      <Text style={[styles.posBadgeText, { color: playerColor }]}>{myPlayer.position.toUpperCase()}</Text>
                    </View>
                  )}
                </View>
              </View>

              <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* Latest announcement */}
        {latestAnnouncement && (
          <>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionTitleDot, { backgroundColor: primaryColor }]} />
              <Text style={styles.sectionTitle}>FROM THE COACH</Text>
            </View>
            <TouchableOpacity
              style={[styles.announcementCard, { borderLeftWidth: 3, borderLeftColor: rgba(0.4) }]}
              onPress={() => router.push(`/(app)/${slug}/(tabs)/chat` as never)}
              activeOpacity={0.8}
            >
              <View style={[styles.announcementIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
                <Ionicons name="megaphone-outline" size={18} color={primaryColor} />
              </View>
              <View style={styles.announcementBody}>
                <Text style={styles.announcementTitle} numberOfLines={1}>{latestAnnouncement.title}</Text>
                <Text style={styles.announcementPreview} numberOfLines={2}>{latestAnnouncement.body}</Text>
                <Text style={styles.announcementTime}>{timeAgo(latestAnnouncement.created_at)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
            </TouchableOpacity>
          </>
        )}

        <GalleryCard onPress={() => router.push(`/(app)/${slug}/gallery` as never)} />

        <View style={{ height: 32 }} />

      </ScrollView>

      {/* Team picker */}
      <Modal visible={teamPickerOpen} transparent animationType="slide" onRequestClose={() => setTeamPickerOpen(false)}>
        <TouchableOpacity style={styles.devOverlay} activeOpacity={1} onPress={() => setTeamPickerOpen(false)} />
        <View style={styles.devSheet}>
          <View style={styles.devHandle} />
          <Text style={styles.devTitle}>Switch Team</Text>
          <Text style={styles.devSub}>Select which team to view</Text>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} bounces={false}>
            {teamsByClub.map((group) => (
              <View key={group.clubId}>
                {multiClub && (
                  <Text style={styles.teamPickerClubHeader}>{group.clubName}</Text>
                )}
                {group.teams.map((t) => {
                  const isActive = t.id === team?.id;
                  const teamColor = t.club?.primary_color ?? primaryColor;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.teamPickerRow, isActive && styles.teamPickerRowActive]}
                      onPress={() => handleSelectTeam(t.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.teamPickerIcon, { backgroundColor: rgba(isActive ? 0.18 : 0.08), borderColor: rgba(isActive ? 0.35 : 0.15) }]}>
                        <Ionicons name="football-outline" size={18} color={teamColor} />
                      </View>
                      <View style={styles.teamPickerBody}>
                        <Text style={[styles.teamPickerName, isActive && { color: teamColor }]}>{t.name}</Text>
                        {(t.age_group || t.season) ? (
                          <Text style={styles.teamPickerMeta}>{[t.age_group, t.season].filter(Boolean).join('  ·  ')}</Text>
                        ) : null}
                      </View>
                      {isActive && <Ionicons name="checkmark-circle" size={20} color={teamColor} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Fee detail modal */}
      <Modal visible={showFeeModal} transparent animationType="slide" onRequestClose={() => setShowFeeModal(false)}>
        <TouchableOpacity style={styles.devOverlay} activeOpacity={1} onPress={() => setShowFeeModal(false)} />
        <View style={[styles.devSheet, { maxHeight: '82%' }]}>
          <View style={styles.devHandle} />
          <Text style={styles.devTitle}>Outstanding Fees</Text>
          <Text style={styles.devSub}>Pay online, or pay your coach directly where noted</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {outstandingFees.map((fee) => {
              const net = Math.max(0, fee.amount_due - (fee.discount ?? 0));
              const isOverdue = fee.status === 'overdue' || (fee.due_date ? new Date(fee.due_date) < new Date() : false);
              const statusColor = isOverdue ? PULSE_COLORS.status.error : fee.status === 'partial' ? PULSE_COLORS.status.info : PULSE_COLORS.status.warning;
              const statusLabel = isOverdue ? 'Overdue' : fee.status === 'partial' ? 'Partial' : 'Outstanding';
              const fmtDue = fee.due_date
                ? new Date(fee.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : null;
              const fmtEventDate = fee.event_date
                ? new Date(fee.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : null;
              return (
                <View key={fee.id} style={styles.feeModalRow}>
                  <View style={styles.feeModalRowTop}>
                    <View style={[styles.feeModalIconWrap, { backgroundColor: `${statusColor}18` }]}>
                      <Ionicons name={isOverdue ? 'alert-circle-outline' : 'card-outline'} size={17} color={statusColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.feeModalTitle} numberOfLines={1}>{fee.description}</Text>
                      <View style={styles.feeModalMetaRow}>
                        <View style={[styles.feeStatusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.feeStatusText, { color: statusColor }]}>{statusLabel}</Text>
                        {fmtDue && <Text style={styles.feeModalDue}>·  Due {fmtDue}</Text>}
                      </View>
                    </View>
                    <Text style={[styles.feeModalAmount, { color: statusColor }]}>${net.toFixed(2)}</Text>
                  </View>

                  {fee.event_title && (
                    <View style={styles.feeEventTag}>
                      <Ionicons name="calendar-outline" size={11} color={PULSE_COLORS.ui.muted} />
                      <Text style={styles.feeEventTagText} numberOfLines={1}>
                        {fee.event_title}{fmtEventDate ? `  ·  ${fmtEventDate}` : ''}
                      </Text>
                    </View>
                  )}

                  {fee.payee_type === 'coach' && (
                    fee.claim_status === 'pending' ? (
                      <View style={styles.claimPendingPill}>
                        <Ionicons name="time-outline" size={12} color={PULSE_COLORS.status.info} />
                        <Text style={styles.claimPendingText}>
                          Marked paid{fee.claim_amount ? ` — $${Number(fee.claim_amount).toFixed(2)}` : ''}{fee.claim_method ? ` via ${fee.claim_method}` : ''} — awaiting coach confirmation
                        </Text>
                      </View>
                    ) : (
                      <>
                        {fee.payment_instructions && (
                          <Text style={styles.feePayInstructions}>Pay your coach: {fee.payment_instructions}</Text>
                        )}
                        <TouchableOpacity style={styles.claimBtn} onPress={() => openClaim(fee)} activeOpacity={0.8}>
                          <Text style={styles.claimBtnText}>I&apos;ve paid</Text>
                        </TouchableOpacity>
                      </>
                    )
                  )}
                  {fee.payee_type === 'club' && fee.payment_token && (
                    <TouchableOpacity
                      style={[styles.payNowBtn, { backgroundColor: primaryColor }]}
                      onPress={() => payNow(fee)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="card-outline" size={14} color="#fff" />
                      <Text style={styles.payNowBtnText}>Pay now</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Claim payment modal — "I've paid" for coach-collected fees */}
      <Modal visible={!!claimingFee} transparent animationType="slide" onRequestClose={() => setClaimingFee(null)}>
        <TouchableOpacity style={styles.devOverlay} activeOpacity={1} onPress={() => setClaimingFee(null)} />
        <View style={styles.devSheet}>
          <View style={styles.devHandle} />
          <Text style={styles.devTitle}>Mark as paid</Text>
          <Text style={styles.devSub}>
            {claimingFee?.description} — your coach will be asked to confirm before this clears
          </Text>

          <Text style={styles.claimLabel}>Amount</Text>
          <TextInput
            value={claimAmount}
            onChangeText={setClaimAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={PULSE_COLORS.ui.muted}
            style={styles.claimInput}
          />

          <Text style={styles.claimLabel}>How did you pay?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['venmo', 'cash', 'other'] as const).map(m => {
              const sel = claimMethod === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setClaimMethod(m)}
                  style={[styles.claimMethodChip, sel && { borderColor: primaryColor, backgroundColor: `${primaryColor}18` }]}
                >
                  <Text style={[styles.claimMethodText, sel && { color: primaryColor }]}>{m === 'venmo' ? 'Venmo' : m === 'cash' ? 'Cash' : 'Other'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.claimLabel}>Note (optional)</Text>
          <TextInput
            value={claimNote}
            onChangeText={setClaimNote}
            placeholder="e.g. Sent last night"
            placeholderTextColor={PULSE_COLORS.ui.muted}
            style={styles.claimInput}
          />

          <TouchableOpacity
            style={[styles.claimSubmitBtn, { backgroundColor: primaryColor }, claimSaving && { opacity: 0.6 }]}
            onPress={submitClaim}
            disabled={claimSaving || !claimAmount}
            activeOpacity={0.85}
          >
            <Text style={styles.claimSubmitText}>{claimSaving ? 'Submitting…' : 'Submit'}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Callout creation modal */}
      <Modal visible={showCalloutModal} transparent animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCalloutModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.calloutSheet}>
            <View style={styles.devHandle} />
            {/* Header */}
            <View style={styles.calloutSheetHeader}>
              <TouchableOpacity onPress={() => setShowCalloutModal(false)}>
                <Text style={styles.calloutSheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.calloutSheetTitle}>Post Callout</Text>
              <TouchableOpacity
                onPress={postCallout}
                disabled={!calloutTitle.trim() || calloutPosting}
              >
                {calloutPosting
                  ? <ActivityIndicator size="small" color="#F59E0B" />
                  : <Text style={[styles.calloutSheetPost, { opacity: calloutTitle.trim() ? 1 : 0.4 }]}>Post</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18 }}>
              {/* Quick templates */}
              <View style={{ gap: 8 }}>
                <Text style={styles.calloutSectionLabel}>QUICK TEMPLATES</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {CALLOUT_TEMPLATES.map(t => (
                    <TouchableOpacity
                      key={t.label}
                      style={[styles.calloutChip, calloutTitle === t.text && { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.1)' }]}
                      onPress={() => setCalloutTitle(t.text)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.calloutChipIcon}>{t.icon}</Text>
                      <Text style={styles.calloutChipText}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Message input */}
              <View style={{ gap: 8 }}>
                <Text style={styles.calloutSectionLabel}>MESSAGE</Text>
                <TextInput
                  style={styles.calloutInput}
                  placeholder="What do you need from parents?"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  value={calloutTitle}
                  onChangeText={setCalloutTitle}
                  maxLength={120}
                  returnKeyType="next"
                  autoFocus
                />
                <TextInput
                  style={[styles.calloutInput, styles.calloutInputMulti]}
                  placeholder="More detail (optional)"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  value={calloutBody}
                  onChangeText={setCalloutBody}
                  multiline
                  numberOfLines={3}
                  maxLength={400}
                />
              </View>

              {/* Urgency toggle */}
              <View style={{ gap: 8 }}>
                <Text style={styles.calloutSectionLabel}>URGENCY</Text>
                <View style={styles.calloutUrgencyRow}>
                  <TouchableOpacity
                    style={[styles.calloutUrgencyBtn, calloutUrgency === 'normal' && { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.1)' }]}
                    onPress={() => setCalloutUrgency('normal')}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="hand-right-outline" size={15} color={calloutUrgency === 'normal' ? '#F59E0B' : PULSE_COLORS.ui.muted} />
                    <Text style={[styles.calloutUrgencyBtnText, calloutUrgency === 'normal' && { color: '#F59E0B' }]}>Normal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.calloutUrgencyBtn, calloutUrgency === 'urgent' && { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)' }]}
                    onPress={() => setCalloutUrgency('urgent')}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="warning-outline" size={15} color={calloutUrgency === 'urgent' ? '#EF4444' : PULSE_COLORS.ui.muted} />
                    <Text style={[styles.calloutUrgencyBtnText, calloutUrgency === 'urgent' && { color: '#EF4444' }]}>Urgent</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.calloutUrgencyHint}>
                  {calloutUrgency === 'urgent'
                    ? 'Parents see a red alert — use for time-sensitive requests'
                    : 'Parents see a standard callout card'}
                </Text>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Dev switcher */}
      <Modal visible={devOpen} transparent animationType="slide" onRequestClose={() => setDevOpen(false)}>
        <TouchableOpacity style={styles.devOverlay} activeOpacity={1} onPress={() => setDevOpen(false)} />
        <View style={styles.devSheet}>
          <View style={styles.devHandle} />
          <Text style={styles.devTitle}>Dev Switcher</Text>
          <Text style={styles.devSub}>Switch accounts without signing out manually</Text>
          {DEV_ACCOUNTS.map((a) => (
            <TouchableOpacity
              key={a.email}
              style={[styles.devRow, devLoading === a.email && styles.devRowLoading]}
              onPress={() => switchTo(a)}
              disabled={!!devLoading}
            >
              <View style={[styles.devAvatar, { backgroundColor: rgba(0.15) }]}>
                <Text style={[styles.devAvatarText, { color: primaryColor }]}>{a.label[0]}</Text>
              </View>
              <View style={styles.devRowBody}>
                <Text style={styles.devRowLabel}>{a.label}</Text>
                <Text style={styles.devRowEmail}>{a.email}</Text>
              </View>
              {devLoading === a.email
                ? <ActivityIndicator size="small" color={primaryColor} />
                : <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
              }
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.devSignOut} onPress={async () => { setDevOpen(false); await signOut(); router.replace('/(auth)/login'); }}>
            <Text style={styles.devSignOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Attendance detail sheet */}
      <Modal visible={showAttendanceSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAttendanceSheet(false)}>
        <View style={styles.attSheet}>
          {/* Header */}
          <View style={styles.attSheetHeader}>
            <Text style={styles.attSheetTitle}>{myPlayer?.full_name?.split(' ')[0]}'s Season</Text>
            <TouchableOpacity onPress={() => setShowAttendanceSheet(false)} style={styles.attSheetClose}>
              <Ionicons name="close" size={20} color={PULSE_COLORS.ui.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Streak hero */}
            {(() => {
              const superStreak = combinedStreak >= 10 && (gamesTotal === 0 || gamesAttended === gamesTotal);
              const trainingsTotal = attendanceHistory.filter(e => e.type !== 'game').length;
              const trainingsAttended = attendanceHistory.filter(e => e.type !== 'game' && e.status === 'present').length;
              const tPerfect = trainingsTotal > 0 && trainingsAttended === trainingsTotal;
              const tier = combinedAtRisk
                ? { color: '#60A5FA', glow: '#60A5FA', label: 'At risk' }
                : combinedStreak >= 10
                  ? { color: '#A855F7', glow: '#A855F7', label: '⭐ Legendary' }
                  : combinedStreak >= 6
                    ? { color: '#EF4444', glow: '#EF4444', label: 'On fire' }
                    : combinedStreak >= 3
                      ? { color: '#F97316', glow: '#F97316', label: 'Building momentum' }
                      : combinedStreak >= 1
                        ? { color: '#EAB308', glow: '#EAB308', label: 'Getting started' }
                        : { color: PULSE_COLORS.ui.muted, glow: 'transparent', label: 'No streak yet' };
              const gPerfect = gamesTotal > 0 && gamesAttended === gamesTotal;
              return (
                <>
                  {/* Hero — big flame + number */}
                  <View style={styles.attSheetHero}>
                    <Text style={[styles.attSheetHeroEmoji, {
                      textShadowColor: tier.glow,
                      textShadowOffset: { width: 0, height: 0 },
                      textShadowRadius: combinedStreak >= 1 ? 14 : 0,
                    }]}>🔥</Text>
                    <Text style={[styles.attSheetHeroNum, { color: tier.color }]}>{combinedStreak}</Text>
                    <Text style={styles.attSheetHeroLabel}>{tier.label}</Text>
                    {combinedAtRisk && (
                      <Text style={styles.attSheetHeroSub}>Attend your next session to save your streak</Text>
                    )}
                    {superStreak && !combinedAtRisk && (
                      <View style={styles.attSheetSuperChip}>
                        <Text style={styles.attSheetSuperChipText}>⭐ SUPER STREAK</Text>
                      </View>
                    )}
                  </View>

                  {/* Game attendance */}
                  {gamesTotal > 0 && (
                    <View style={styles.attSheetGameRow}>
                      <Text style={[styles.attSheetGameEmoji, gPerfect ? {
                        textShadowColor: '#22C55E',
                        textShadowOffset: { width: 0, height: 0 },
                        textShadowRadius: 14,
                      } : {}]}>{gPerfect ? '🥇' : '⚽'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.attSheetGameNum, { color: gPerfect ? '#22C55E' : PULSE_COLORS.ui.textSecondary }]}>
                          {gamesAttended}/{gamesTotal} games this season
                        </Text>
                        {gPerfect && (
                          <Text style={styles.attSheetGameSub}>Perfect game attendance</Text>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Training attendance */}
                  {trainingsTotal > 0 && (
                    <View style={styles.attSheetGameRow}>
                      <Text style={styles.attSheetGameEmoji}>⚡</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.attSheetGameNum, { color: tPerfect ? primaryColor : PULSE_COLORS.ui.textSecondary }]}>
                          {trainingsAttended}/{trainingsTotal} training sessions
                        </Text>
                        {tPerfect && (
                          <Text style={styles.attSheetGameSub}>Perfect training attendance</Text>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Mechanic note */}
                  <Text style={styles.attSheetInfoInline}>
                    Miss one → at risk. Attend next → saved. Need 3 clean sessions to earn another chance.
                  </Text>
                </>
              );
            })()}

            {/* Session history */}
            {attendanceHistory.length > 0 && (
              <>
                <View style={[styles.sectionTitleRow, { marginTop: 24, marginHorizontal: 20 }]}>
                  <View style={[styles.sectionTitleDot, { backgroundColor: primaryColor }]} />
                  <Text style={styles.sectionTitle}>RECENT SESSIONS</Text>
                </View>
                <View style={styles.attSheetList}>
                  {attendanceHistory.map((entry) => {
                    const isGame = entry.type === 'game';
                    const present = entry.status === 'present';
                    const d = new Date(entry.date + 'T00:00:00');
                    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <View key={entry.id} style={styles.attSheetRow}>
                        <View style={[styles.attSheetTypeBadge,
                          isGame
                            ? { backgroundColor: 'rgba(249,115,22,0.12)', borderColor: 'rgba(249,115,22,0.25)' }
                            : { backgroundColor: rgba(0.08), borderColor: rgba(0.2) },
                        ]}>
                          <Text style={[styles.attSheetTypeBadgeText,
                            { color: isGame ? '#F97316' : primaryColor },
                          ]}>{isGame ? 'GAME' : 'TRAINING'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.attSheetRowDate}>{dateStr}</Text>
                          {isGame && entry.title ? (
                            <Text style={styles.attSheetRowTitle} numberOfLines={1}>{entry.title}</Text>
                          ) : null}
                        </View>
                        <View style={[styles.attSheetStatusDot, {
                          backgroundColor: present ? '#22C55E' : '#EF4444',
                        }]}>
                          <Ionicons name={present ? 'checkmark' : 'close'} size={11} color="#fff" />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {isCoach && team && profile && (
        <CreatePollModal
          visible={showPollModal}
          teamId={team.id}
          profileId={profile.id}
          primaryColor={primaryColor}
          rgba={rgba}
          onClose={() => setShowPollModal(false)}
          onCreated={() => { setShowPollModal(false); fetchData(); }}
        />
      )}
    </>
  );
}

// Shared empty-state row for a section that has nothing yet but a coach can
// create — one card that's both the explanation and the only way to act,
// instead of a header "+ New" pill duplicating a second CTA underneath it.
function SectionEmptyCTA({ icon, color, label, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.sectionEmptyCta} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.sectionEmptyIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.sectionEmptyText}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  content: { padding: 20, paddingTop: 0, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PULSE_COLORS.ui.background },

  // Hero banner
  heroBanner: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingBottom: 44,
    marginBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  heroActions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 16,
  },
  heroIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBrand: { alignItems: 'center', gap: 8, paddingBottom: 4 },
  heroBadgeGlow: {
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 12,
    borderRadius: 20,
  },
  heroBadgeRing: {
    width: 80, height: 80, borderRadius: 20, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  heroBadgeLetters: { fontSize: 28, fontWeight: '900' },
  heroClubName: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.5, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  heroTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroTeamName: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  heroGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500', textAlign: 'center', marginTop: 10, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  heroPlayerName: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', textAlign: 'center', marginTop: 4, letterSpacing: 0.3 },

  notifBadge: {
    position: 'absolute', top: -1, right: -1,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5, borderColor: PULSE_COLORS.ui.background,
  },

  // Section title with dot accent
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitleDot: { width: 6, height: 6, borderRadius: 3 },

  // Stats (parents only)
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: {
    flex: 1, backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 16, alignItems: 'center', gap: 4,
  },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statNumber: { fontSize: 36, fontWeight: '900', lineHeight: 40, letterSpacing: -1 },
  statLabel: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, fontWeight: '600', letterSpacing: 0.3 },

  // Team Pulse
  pulseCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 20, marginBottom: 28,
  },
  pulseCardHeader: {
    fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14,
  },
  pulseMetricRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pulseMetric: { flex: 1, alignItems: 'center', gap: 4 },
  pulseMetricNum: { fontSize: 32, fontWeight: '900', lineHeight: 36, letterSpacing: -1 },
  pulseMetricLabel: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600', textAlign: 'center', lineHeight: 15 },
  pulseBar: {
    height: 4, width: '80%', borderRadius: 2,
    backgroundColor: PULSE_COLORS.ui.border, marginTop: 6, overflow: 'hidden',
  },
  pulseBarFill: { height: '100%', borderRadius: 2 },
  pulseDivider: { width: 1, backgroundColor: PULSE_COLORS.ui.border, alignSelf: 'stretch', marginHorizontal: 4 },
  pulseChase: { marginTop: 6 },
  pulseChaseText: { fontSize: 11, fontWeight: '700' },

  // Section title
  sectionTitle: { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.textSecondary, letterSpacing: 1.5 },

  // Next Event card
  nextEventCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 18,
  },

  // Header: title block left, badge+drive right
  nextCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  nextCardTitleBlock: { flex: 1, gap: 4 },
  nextCardUniformPrefix: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  nextCardUniformBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, marginBottom: 5,
  },
  nextCardUniformBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  nextCardTitle: { fontSize: 20, fontWeight: '900', color: PULSE_COLORS.ui.text, letterSpacing: -0.5, lineHeight: 24 },
  nextCardTopRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  nextCardBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  nextCardBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: '#fff' },
  nextCardDrivePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  nextCardDrivePillText: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  // Meta rows (time + location)
  nextCardMeta: { gap: 5, marginBottom: 12 },
  nextCardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextCardMetaText: { fontSize: 12.5, color: PULSE_COLORS.ui.muted, fontWeight: '500', flex: 1 },

  // Unified context chip row (weather + surface + kit)
  nextCardChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  nextCardChipWeather: { borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surfaceAlt },
  nextCardChipEmoji: { fontSize: 12 },
  nextCardChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  nextCardChipText: { fontSize: 11, fontWeight: '700' },

  // Attendance bar
  attendanceBarWrap: {
    marginTop: 6, borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border, paddingTop: 12, gap: 7,
  },
  attendanceBarTrack: {
    height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row',
    backgroundColor: PULSE_COLORS.ui.border,
  },
  attendanceBarSeg: { height: '100%' },
  attendanceBarLegend: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  attendanceBarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  attendanceBarDot: { width: 6, height: 6, borderRadius: 3 },
  attendanceBarLegendText: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  // Inline RSVP
  nextEventRsvpRow: {
    flexDirection: 'row', gap: 10,
    borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border,
    paddingTop: 12, marginTop: 10,
  },
  rsvpBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  rsvpBtnNo: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.2)',
  },
  rsvpBtnText: { fontSize: 13, fontWeight: '700' },
  rsvpConfirmed: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  rsvpConfirmedText: { fontSize: 13, fontWeight: '700' },
  rsvpTapToChange: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  noEvent: {
    alignItems: 'center',
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, paddingVertical: 24,
  },
  noEventText: { color: PULSE_COLORS.ui.muted, fontSize: 14, fontWeight: '600' },

  // My Player card
  myPlayerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 16, marginBottom: 28,
  },
  playerAvatarRing: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2.5,
    overflow: 'hidden', flexShrink: 0,
  },
  playerAvatarPhoto: { width: '100%', height: '100%' },
  playerAvatarFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  playerAvatarText: { fontSize: 18, fontWeight: '800' },
  myPlayerBody: { flex: 1, gap: 6 },
  myPlayerName: { fontSize: 16, fontWeight: '800', color: PULSE_COLORS.ui.text },
  myPlayerBadges: { flexDirection: 'row', gap: 8 },
  jerseyBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
  },
  jerseyBadgeText: { fontSize: 11, fontWeight: '800' },
  posBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
  },
  posBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  // Announcement card
  announcementCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 16, marginBottom: 28,
  },
  announcementIcon: {
    width: 44, height: 44, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  announcementBody: { flex: 1, gap: 3 },
  announcementTitle: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  announcementPreview: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, lineHeight: 17 },
  announcementTime: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500', marginTop: 2 },


  // Team picker
  teamPickerClubHeader: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 14, marginBottom: 8,
  },
  teamPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.background, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  teamPickerRowActive: { backgroundColor: PULSE_COLORS.ui.surfaceAlt },
  teamPickerIcon: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  teamPickerBody: { flex: 1 },
  teamPickerName: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  teamPickerMeta: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },

  // Fee card
  feeCard: {
    flexDirection: 'row',
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 28,
  },
  feeAccent: { width: 4, flexShrink: 0 },
  feeBody: { flex: 1, padding: 16, gap: 10 },
  feeTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  feeIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feeTitle: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  feeAmount: { fontSize: 13, fontWeight: '600' },
  feeOverdueBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  feeOverdueText: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.status.error },

  // Fee modal rows
  feeModalRow: {
    backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderRadius: 16,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    padding: 14, marginBottom: 12,
  },
  feeModalRowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  feeModalIconWrap: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  feeModalTitle: { fontSize: 14.5, fontWeight: '700', color: PULSE_COLORS.ui.text },
  feeModalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  feeStatusDot: { width: 6, height: 6, borderRadius: 3 },
  feeModalAmount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  feeModalDue: { fontSize: 11.5, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
  feeStatusText: { fontSize: 11.5, fontWeight: '700' },
  feeEventTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border,
  },
  feeEventTagText: { fontSize: 11.5, color: PULSE_COLORS.ui.muted, fontWeight: '500', flexShrink: 1 },
  feePayInstructions: { fontSize: 11.5, color: PULSE_COLORS.ui.muted, fontWeight: '500', marginTop: 10 },

  // Fee payment claims
  claimPendingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: `${PULSE_COLORS.status.info}18`, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginTop: 10,
  },
  claimPendingText: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.status.info, flex: 1 },
  claimBtn: {
    alignSelf: 'flex-start', marginTop: 10,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  claimBtnText: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.text },
  claimLabel: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  claimInput: {
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: PULSE_COLORS.ui.text,
    backgroundColor: PULSE_COLORS.ui.surface,
  },
  claimMethodChip: {
    flex: 1, alignItems: 'center', borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 10, paddingVertical: 10, backgroundColor: PULSE_COLORS.ui.surface,
  },
  claimMethodText: { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
  claimSubmitBtn: { marginTop: 20, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  claimSubmitText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  payNowBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'flex-start', marginTop: 10,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  payNowBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },

  // Callouts
  calloutCard: {
    flexDirection: 'row', backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, marginBottom: 10, overflow: 'hidden',
  },
  calloutAccent: { width: 3 },
  calloutBody: { flex: 1, paddingHorizontal: 13, paddingVertical: 12, gap: 8 },
  calloutHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  calloutUrgencyBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 2 },
  calloutTitle: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  calloutDeleteBtn: { padding: 4, marginLeft: 4 },
  calloutBodyText: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, lineHeight: 18 },
  calloutCoachFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  calloutHelperCount: { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
  calloutHelpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  calloutHelpBtnActive: { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)' },
  calloutHelpBtnText: { fontSize: 13, fontWeight: '700' },
  calloutAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginLeft: 'auto',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
  },
  calloutAddBtnText: { fontSize: 11, fontWeight: '700', color: '#F59E0B' },
  sectionEmptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 20,
  },
  sectionEmptyIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionEmptyText: { flex: 1, fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text },
  // Modal
  calloutSheet: {
    flex: 1, marginTop: 60,
    backgroundColor: PULSE_COLORS.ui.background,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  calloutSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  calloutSheetCancel: { fontSize: 15, color: PULSE_COLORS.ui.muted },
  calloutSheetTitle: { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text },
  calloutSheetPost: { fontSize: 15, fontWeight: '700', color: '#F59E0B' },
  calloutSectionLabel: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.6 },
  calloutChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  calloutChipIcon: { fontSize: 14 },
  calloutChipText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  calloutInput: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: PULSE_COLORS.ui.text,
  },
  calloutInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  calloutUrgencyRow: { flexDirection: 'row', gap: 10 },
  calloutUrgencyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  calloutUrgencyBtnText: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  calloutUrgencyHint: { fontSize: 12, color: PULSE_COLORS.ui.muted, lineHeight: 17 },
  // keep these unused stubs to avoid ref errors
  calloutPostBtn: { display: 'none' },
  calloutPostBtnText: { display: 'none' },

  // Dev switcher / shared sheet styles
  devOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  devSheet: {
    backgroundColor: PULSE_COLORS.ui.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 48,
  },
  devHandle: { width: 40, height: 4, backgroundColor: PULSE_COLORS.ui.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  devTitle: { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  devSub: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, marginBottom: 20 },
  devRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.background, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  devRowLoading: { opacity: 0.6 },
  devAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  devAvatarText: { fontSize: 16, fontWeight: '800' },
  devRowBody: { flex: 1 },
  devRowLabel: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  devRowEmail: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },
  devSignOut: { marginTop: 8, padding: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  devSignOutText: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.status.error },

  // MY SEASON card
  seasonCard: {
    backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 16,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 14, paddingBottom: 16, marginBottom: 20,
  },
  seasonStat: { flex: 1, alignItems: 'center', gap: 2 },
  seasonFlameEmoji: { fontSize: 34, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 8 },
  seasonStatNum: { fontSize: 56, fontWeight: '900', letterSpacing: -3, paddingTop: 8, paddingHorizontal: 4 },
  seasonStatLabel: { fontSize: 11, color: PULSE_COLORS.ui.textSecondary, fontWeight: '600', textAlign: 'center', lineHeight: 16 },
  seasonDivider: { width: 1, height: 68, backgroundColor: PULSE_COLORS.ui.border, marginHorizontal: 8 },
  seasonTapHint: { width: 24, alignItems: 'center' },
  superStreakChip: {
    fontSize: 9, fontWeight: '900', letterSpacing: 1,
    color: '#F59E0B', marginLeft: 6,
  },

  // Attendance detail sheet
  attSheet: {
    flex: 1, backgroundColor: PULSE_COLORS.ui.background,
  },
  attSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  attSheetTitle: { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text },
  attSheetClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  attSheetHero: {
    alignItems: 'center', paddingTop: 36, paddingBottom: 24, paddingHorizontal: 20,
  },
  attSheetHeroEmoji: { fontSize: 52, padding: 16 },
  attSheetHeroNum: { fontSize: 80, fontWeight: '900', letterSpacing: -4, paddingTop: 14, paddingHorizontal: 8, marginTop: 0 },
  attSheetHeroLabel: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary, marginTop: 4 },
  attSheetHeroSub: { fontSize: 13, color: '#60A5FA', fontWeight: '600', marginTop: 8, textAlign: 'center' },
  attSheetSuperChip: {
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 20,
  },
  attSheetSuperChipText: { fontSize: 11, fontWeight: '900', color: '#F59E0B', letterSpacing: 0.5 },
  attSheetGameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 14,
  },
  attSheetGameEmoji: { fontSize: 28, padding: 10 },
  attSheetGameNum: { fontSize: 17, fontWeight: '800' },
  attSheetGameSub: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },
  attSheetInfoInline: {
    fontSize: 12, color: PULSE_COLORS.ui.muted, lineHeight: 17,
    marginHorizontal: 20, marginBottom: 16, textAlign: 'center',
  },
  attSheetList: { marginHorizontal: 20, marginTop: 8, gap: 2 },
  attSheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  attSheetTypeBadge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  attSheetTypeBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  attSheetRowDate: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500' },
  attSheetRowTitle: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500', marginTop: 1 },
  attSheetStatusDot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  // Guest invite cards
  guestInviteCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1,
    borderColor: '#F59E0B22',
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  guestInviteAccent: {
    width: 3,
    alignSelf: 'stretch',
  },
  guestInviteBody: {
    flex: 1,
    padding: 14,
    gap: 3,
  },
  guestInviteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  guestInviteTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  guestInviteTeam: {
    fontSize: 10,
    color: PULSE_COLORS.ui.muted,
    fontWeight: '500',
    marginLeft: 4,
  },
  guestInviteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PULSE_COLORS.ui.text,
  },
  guestInviteDate: {
    fontSize: 12,
    color: PULSE_COLORS.ui.textSecondary,
    fontWeight: '500',
  },
  guestInviteSubtext: {
    fontSize: 12,
    color: PULSE_COLORS.ui.muted,
    marginTop: 2,
  },
  guestInviteActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  waiverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  waiverBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waiverBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  waiverBannerSub: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 1,
  },
  guestInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  guestInviteBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  guestInviteBadge: {
    marginLeft: 8,
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  guestInviteBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000',
  },
});
